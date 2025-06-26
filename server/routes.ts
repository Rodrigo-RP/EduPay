import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertGuardianSchema, insertChargeSchema, insertPaymentSchema, students, guardians, student_guardian } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { getAcademicLevel } from "@shared/academic-levels";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)'));
    }
  }
});

// Authentication middleware
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.sendStatus(403);
  }
};

// Guardian authentication middleware
const authenticateGuardian = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== 'guardian') {
      return res.sendStatus(403);
    }
    req.guardian = decoded;
    next();
  } catch (error) {
    return res.sendStatus(403);
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // AUTHENTICATION ROUTES
  
  // Admin/Staff login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !await bcrypt.compare(password, user.password_hash)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, campus_id: user.campus_id, type: 'user' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
    } catch (error: any) {
      res.status(500).json({ message: "Login failed: " + error.message });
    }
  });

  // Guardian login
  app.post("/api/auth/guardian-login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const guardian = await storage.getGuardianByEmail(email);
      if (!guardian || !guardian.password_hash || !await bcrypt.compare(password, guardian.password_hash)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: guardian.id, email: guardian.email, type: 'guardian' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ token, guardian: { id: guardian.id, email: guardian.email, nombre_completo: guardian.nombre_completo } });
    } catch (error: any) {
      res.status(500).json({ message: "Login failed: " + error.message });
    }
  });

  // GUARDIAN PORTAL ROUTES

  // Get guardian's students and their pending charges
  app.get("/api/guardian/dashboard", authenticateGuardian, async (req, res) => {
    try {
      const guardianId = (req as any).guardian?.id;
      
      const students = await storage.getStudentsByGuardian(guardianId);
      const pendingCharges = await storage.getPendingChargesByGuardian(guardianId);
      const paymentHistory = await storage.getPaymentsByGuardian(guardianId);
      const paymentMethods = await storage.getPaymentMethodsByGuardian(guardianId);

      // Calculate total pending balance
      const totalPending = pendingCharges.reduce((sum, charge) => {
        const baseAmount = charge.monto_base_centavos;
        const discount = baseAmount * (Number(charge.beca_aplicada) / 100);
        const finalAmount = baseAmount - discount + (charge.recargo_aplicado_centavos || 0);
        return sum + finalAmount;
      }, 0);

      res.json({
        students,
        pendingCharges: pendingCharges.map(charge => ({
          ...charge,
          total_amount_centavos: charge.monto_base_centavos - (charge.monto_base_centavos * Number(charge.beca_aplicada) / 100) + (charge.recargo_aplicado_centavos || 0),
        })),
        totalPendingBalance: totalPending / 100, // Convert to pesos
        paymentHistory,
        paymentMethods,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching dashboard: " + error.message });
    }
  });

  // ADMIN PORTAL ROUTES

  // Get dashboard KPIs
  app.get("/api/admin/dashboard/:campusId", async (req, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      
      // Mock KPI data para demo
      const kpis = {
        totalBilled: 2850000, // $28,500 MXN facturado
        paymentRate: 75, // 75% tasa de pago
        overdueRate: 25, // 25% morosidad
        activeStudents: 4
      };
      
      res.json(kpis);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching KPIs: " + error.message });
    }
  });

  // Get students by campus
  app.get("/api/admin/students/:campusId", async (req, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      
      // Mock students data para demo
      const students = [
        {
          id: 1,
          nombre_completo: "Carlos Pérez Méndez",
          grado: "3ro",
          grupo: "A",
          status: "activo",
          pendingBalance: 500000
        },
        {
          id: 2,
          nombre_completo: "Andrea García Luna",
          grado: "2do", 
          grupo: "B",
          status: "activo",
          pendingBalance: 535000
        },
        {
          id: 3,
          nombre_completo: "Luis Martínez Gil",
          grado: "1ro",
          grupo: "A", 
          status: "activo",
          pendingBalance: 550000
        },
        {
          id: 4,
          nombre_completo: "Diego Martínez Gil",
          grado: "Kinder",
          grupo: "C",
          status: "activo",
          pendingBalance: 425000
        }
      ];
      
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students: " + error.message });
    }
  });

  // Create new student
  app.post("/api/admin/students", authenticateToken, async (req, res) => {
    try {
      const studentData = req.body;
      const student = await storage.createStudent(studentData);
      
      res.status(201).json(student);
    } catch (error: any) {
      res.status(500).json({ message: "Error creating student: " + error.message });
    }
  });

  // Get concepts by campus
  app.get("/api/admin/concepts/:campusId", authenticateToken, async (req, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      const concepts = await storage.getConceptsByCampus(campusId);
      
      res.json(concepts);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching concepts: " + error.message });
    }
  });

  // Create new concept
  app.post("/api/admin/concepts", authenticateToken, async (req, res) => {
    try {
      const conceptData = req.body;
      const concept = await storage.createConcept(conceptData);
      
      res.status(201).json(concept);
    } catch (error: any) {
      res.status(500).json({ message: "Error creating concept: " + error.message });
    }
  });

  // Bulk create charges
  app.post("/api/admin/charges/bulk", authenticateToken, async (req, res) => {
    try {
      const { campus_id, concept_id, ciclo_escolar, fecha_vencimiento } = req.body;
      
      const students = await storage.getStudentsByCampus(campus_id);
      const concepts = await storage.getConceptsByCampus(campus_id);
      const concept = concepts.find(c => c.id === concept_id);
      
      if (!concept) {
        return res.status(404).json({ message: "Concept not found" });
      }

      const charges = [];
      for (const student of students) {
        if (student.status === 'activo') {
          const charge = await storage.createCharge({
            student_id: student.id,
            concept_id: concept.id,
            ciclo_escolar,
            fecha_emision: new Date().toISOString().split('T')[0],
            fecha_vencimiento,
            monto_base_centavos: concept.monto_centavos,
            beca_aplicada: "0.00",
            recargo_aplicado_centavos: 0,
            estado: "pendiente",
          });
          charges.push(charge);
        }
      }

      res.status(201).json({ 
        message: `Created ${charges.length} charges successfully`,
        charges: charges.length 
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating charges: " + error.message });
    }
  });

  // Apply charges from catalog with automatic academic level pricing
  app.post("/api/admin/cargos/desde-catalogo", authenticateToken, async (req: any, res: any) => {
    try {
      const { producto_id, fecha_vencimiento } = req.body;
      const userCampusId = req.user.campus_id; // Use authenticated user's campus
      
      // Debug logging
      console.log("Request from user:", req.user.email, "Campus ID:", userCampusId);

      
      // Catalog products with differentiated pricing
      const catalogProducts = {
        "1": { 
          nombre: "Colegiatura Mensual", 
          categoria: "COLEGIATURAS",
          precios_por_nivel: { KINDER: 350000, PRIMARIA: 450000, SECUNDARIA: 550000, BACHILLERATO: 650000 }
        },
        "2": { 
          nombre: "Inscripción Anual", 
          categoria: "INSCRIPCIONES",
          precios_por_nivel: { KINDER: 250000, PRIMARIA: 300000, SECUNDARIA: 350000, BACHILLERATO: 400000 }
        },
        "3": { 
          nombre: "Reinscripción", 
          categoria: "REINSCRIPCIONES",
          precios_por_nivel: { KINDER: 150000, PRIMARIA: 180000, SECUNDARIA: 220000, BACHILLERATO: 280000 }
        },
        "4": { 
          nombre: "Seguro Escolar", 
          categoria: "SEGURO_ESCOLAR",
          precios_por_nivel: { KINDER: 60000, PRIMARIA: 70000, SECUNDARIA: 80000, BACHILLERATO: 90000 }
        },
        "5": { 
          nombre: "Paquete de Libros", 
          categoria: "LIBROS",
          precios_por_nivel: { KINDER: 80000, PRIMARIA: 120000, SECUNDARIA: 180000, BACHILLERATO: 250000 }
        },
        "6": { 
          nombre: "Uniforme Escolar", 
          categoria: "OTROS",
          precios_por_nivel: { KINDER: 95000, PRIMARIA: 110000, SECUNDARIA: 125000, BACHILLERATO: 140000 }
        }
      };

      const product = catalogProducts[producto_id as keyof typeof catalogProducts];
      if (!product) {
        return res.status(404).json({ message: "Product not found in catalog" });
      }

      // Get students from campus
      const students = await storage.getStudentsByCampus(userCampusId);
      
      // Create or get concept for this product
      let concept;
      try {
        const concepts = await storage.getConceptsByCampus(userCampusId);
        concept = concepts.find(c => c.nombre === product.nombre);
        
        if (!concept) {
          concept = await storage.createConcept({
            campus_id: userCampusId,
            nombre: product.nombre,
            tipo: product.categoria.toLowerCase(),
            periodicidad: "unica",
            monto_centavos: 100000 // Default, will be overridden by academic level
          });
        }
      } catch (error) {
        console.error("Error managing concept:", error);
        return res.status(500).json({ message: "Error managing concept" });
      }

      const charges = [];
      const chargesSummary = [];

      for (const student of students) {
        if (student.status === 'activo') {
          // Determine academic level from student grade
          const academicLevel = getAcademicLevel(student.grado);
          const specificPrice = product.precios_por_nivel[academicLevel];

          // Create charge with academic level-specific pricing
          const charge = await storage.createCharge({
            student_id: student.id,
            concept_id: concept.id,
            ciclo_escolar: "2024-2025",
            fecha_emision: new Date().toISOString().split('T')[0],
            fecha_vencimiento: fecha_vencimiento || "2025-02-15",
            monto_base_centavos: specificPrice,
            beca_aplicada: "0.00",
            recargo_aplicado_centavos: 0,
            estado: "pendiente"
          });

          charges.push(charge);
          chargesSummary.push({
            student_name: student.nombre_completo,
            grade: student.grado,
            academic_level: academicLevel,
            amount: specificPrice
          });
        }
      }

      res.status(201).json({ 
        message: `Applied ${charges.length} charges with automatic academic level pricing`,
        charges_created: charges.length,
        product_name: product.nombre,
        summary: chargesSummary
      });
    } catch (error: any) {
      console.error("Error applying catalog charges:", error);
      res.status(500).json({ message: "Error applying charges: " + error.message });
    }
  });

  // PAYMENT PROCESSING

  // Create payment intent (for Stripe integration)
  app.post("/api/payments/create-intent", authenticateGuardian, async (req, res) => {
    try {
      const { charge_id, amount } = req.body;
      
      // In a real implementation, this would create a Stripe payment intent
      // For now, we'll return a mock client secret
      const clientSecret = `pi_mock_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`;
      
      res.json({ 
        clientSecret,
        amount: amount * 100, // Convert to centavos for Stripe
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Process payment
  app.post("/api/payments/process", authenticateGuardian, async (req, res) => {
    try {
      const { charge_id, payment_method, amount_centavos } = req.body;
      const guardianId = (req as any).guardian?.id;

      // Create payment record
      const payment = await storage.createPayment({
        charge_id,
        guardian_id: guardianId,
        metodo: payment_method,
        referencia_pasarela: `ref_${Date.now()}`,
        monto_centavos: amount_centavos,
        estado: "exitoso",
      });

      // Update charge status
      await storage.updateChargeStatus(charge_id, "pagado");

      res.json({ 
        success: true,
        payment,
        message: "Payment processed successfully"
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error processing payment: " + error.message });
    }
  });

  // DATA IMPORT/EXPORT ROUTES

  // Download template files
  app.get("/api/import/template/:category/:templateId", authenticateToken, async (req, res) => {
    try {
      const { category, templateId } = req.params;

      // Define templates structure
      const templates: any = {
        estudiantes: {
          estudiantes: {
            name: "Registro de Estudiantes",
            columns: ["nombre_completo", "curp", "fecha_nacimiento", "grado", "grupo", "nivel_academico", "status", "fecha_ingreso", "observaciones"],
            sampleData: [{
              nombre_completo: "María González López",
              curp: "GOLM051215MDFNPR03",
              fecha_nacimiento: "2005-12-15",
              grado: "3ro Secundaria",
              grupo: "A",
              nivel_academico: "SECUNDARIA",
              status: "Activo",
              fecha_ingreso: "2023-08-15",
              observaciones: "Estudiante regular"
            }]
          },
          tutores: {
            name: "Tutores y Responsables",
            columns: ["nombre_completo", "email", "telefono", "telefono_emergencia", "relacion", "direccion", "ocupacion", "empresa"],
            sampleData: [{
              nombre_completo: "Roberto González Martínez",
              email: "roberto@email.com",
              telefono: "5551234567",
              telefono_emergencia: "5559876543",
              relacion: "Padre",
              direccion: "Av. Principal 123, Col. Centro",
              ocupacion: "Ingeniero",
              empresa: "Tech Solutions SA"
            }]
          },
          relaciones: {
            name: "Relaciones Estudiante-Tutor",
            columns: ["curp_estudiante", "email_tutor", "tipo_relacion", "es_responsable_pago", "autorizacion_recoger", "contacto_emergencia"],
            sampleData: [{
              curp_estudiante: "GOLM051215MDFNPR03",
              email_tutor: "roberto@email.com",
              tipo_relacion: "Padre",
              es_responsable_pago: "Sí",
              autorizacion_recoger: "Sí",
              contacto_emergencia: "No"
            }]
          }
        },
        financiero: {
          conceptos: {
            name: "Catálogo de Conceptos",
            columns: ["nombre", "categoria", "descripcion", "precio_kinder", "precio_primaria", "precio_secundaria", "precio_bachillerato", "tipo_cargo", "periodicidad"],
            sampleData: [{
              nombre: "Colegiatura Mensual",
              categoria: "Colegiatura",
              descripcion: "Pago mensual de colegiatura",
              precio_kinder: "2500.00",
              precio_primaria: "3000.00",
              precio_secundaria: "3500.00",
              precio_bachillerato: "4000.00",
              tipo_cargo: "Recurrente",
              periodicidad: "Mensual"
            }]
          },
          calendario: {
            name: "Calendario de Vencimientos",
            columns: ["concepto", "mes", "fecha_aplicacion", "fecha_vencimiento", "recargo_porcentaje", "dias_gracia", "activo"],
            sampleData: [{
              concepto: "Colegiatura Mensual",
              mes: "Septiembre 2024",
              fecha_aplicacion: "2024-08-25",
              fecha_vencimiento: "2024-09-05",
              recargo_porcentaje: "5.0",
              dias_gracia: "5",
              activo: "Sí"
            }]
          },
          cargos_extraordinarios: {
            name: "Cargos Extraordinarios",
            columns: ["estudiante_curp", "concepto", "monto", "fecha_aplicacion", "descripcion", "autorizado_por", "fecha_vencimiento"],
            sampleData: [{
              estudiante_curp: "GOLM051215MDFNPR03",
              concepto: "Examen Extraordinario Matemáticas",
              monto: "500.00",
              fecha_aplicacion: "2024-09-15",
              descripcion: "Examen extraordinario primer parcial",
              autorizado_por: "Coordinación Académica",
              fecha_vencimiento: "2024-09-20"
            }]
          }
        },
        becas: {
          tipos_becas: {
            name: "Tipos de Becas",
            columns: ["nombre", "categoria", "tipo_descuento", "porcentaje_max", "monto_fijo", "criterios", "vigencia_inicio", "vigencia_fin", "activa"],
            sampleData: [{
              nombre: "Beca Excelencia Académica",
              categoria: "academica",
              tipo_descuento: "porcentaje",
              porcentaje_max: "50",
              monto_fijo: "",
              criterios: "Promedio mayor a 9.0",
              vigencia_inicio: "2024-08-01",
              vigencia_fin: "2025-07-31",
              activa: "Sí"
            }]
          },
          asignaciones_becas: {
            name: "Asignaciones de Becas",
            columns: ["estudiante_curp", "tipo_beca", "porcentaje_asignado", "monto_fijo_asignado", "fecha_inicio", "fecha_fin", "autorizado_por", "observaciones", "activa"],
            sampleData: [{
              estudiante_curp: "GOLM051215MDFNPR03",
              tipo_beca: "Beca Excelencia Académica",
              porcentaje_asignado: "30",
              monto_fijo_asignado: "",
              fecha_inicio: "2024-09-01",
              fecha_fin: "2025-07-31",
              autorizado_por: "Dirección Académica",
              observaciones: "Promedio 9.2 primer parcial",
              activa: "Sí"
            }]
          },
          descuentos_hermanos: {
            name: "Descuentos por Hermanos",
            columns: ["numero_hermanos", "porcentaje_descuento", "aplica_a", "maximo_beneficiarios", "vigencia", "activo"],
            sampleData: [{
              numero_hermanos: "2",
              porcentaje_descuento: "20",
              aplica_a: "Segundo hermano",
              maximo_beneficiarios: "1",
              vigencia: "2024-2025",
              activo: "Sí"
            }]
          }
        }
      };

      const template = templates[category]?.[templateId];
      if (!template) {
        return res.status(404).json({ message: "Template no encontrado" });
      }

      // Create Excel workbook with enhanced formatting
      const wb = XLSX.utils.book_new();
      
      // Prepare data with headers and sample rows
      const wsData = [
        template.columns, 
        ...template.sampleData.map((row: any) => 
          template.columns.map((col: string) => row[col] || '')
        )
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Add formatting to headers
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "2563EB" } },
            alignment: { horizontal: "center" }
          };
        }
      }
      
      // Auto-size columns
      const colWidths = template.columns.map((header: string) => ({ 
        wch: Math.max(header.length + 2, 15) 
      }));
      ws['!cols'] = colWidths;
      
      // Add data validation notes for important fields
      if (category === 'estudiantes' && templateId === 'relaciones') {
        // Add note for CURP validation
        const curpCell = 'A2';
        if (!ws[curpCell]) ws[curpCell] = { t: 's', v: '' };
        ws[curpCell].c = [{
          a: 'Sistema',
          t: 'Debe coincidir exactamente con CURP del archivo de estudiantes'
        }];
        
        // Add note for email validation  
        const emailCell = 'C2';
        if (!ws[emailCell]) ws[emailCell] = { t: 's', v: '' };
        ws[emailCell].c = [{
          a: 'Sistema',
          t: 'Debe coincidir exactamente con email del archivo de tutores'
        }];
      }
      
      XLSX.utils.book_append_sheet(wb, ws, template.name);

      // Generate Excel buffer
      const excelBuffer = XLSX.write(wb, { 
        type: 'buffer', 
        bookType: 'xlsx',
        cellStyles: true
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="template_${category}_${templateId}.xlsx"`);
      res.send(excelBuffer);

    } catch (error: any) {
      res.status(500).json({ message: "Error generando template: " + error.message });
    }
  });

  // Import data from Excel/CSV file
  app.post("/api/import/data/:category/:templateId", authenticateToken, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se encontró archivo para importar" });
      }

      const { category, templateId } = req.params;
      const campusId = (req as any).user?.campus_id;

      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      // Parse Excel/CSV file
      let workbook: XLSX.WorkBook;
      if (req.file.mimetype === 'text/csv') {
        const csvData = req.file.buffer.toString();
        workbook = XLSX.read(csvData, { type: 'string' });
      } else {
        workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Validate and process data based on template
      const results = {
        successful: 0,
        errors: [] as any[],
        preview: jsonData.slice(0, 5),
        total: jsonData.length
      };

      // Process based on category and template
      if (category === 'estudiantes') {
        if (templateId === 'estudiantes') {
          // Process students
          for (let index = 0; index < jsonData.length; index++) {
            try {
              const studentData = jsonData[index] as any;
              
              // Basic validation
              if (!studentData.nombre_completo || !studentData.curp) {
                results.errors.push({
                  row: index + 2,
                  error: "Nombre completo y CURP son requeridos",
                  data: studentData
                });
                continue;
              }

              // Create student
              await storage.createStudent({
                campus_id: campusId,
                nombre_completo: studentData.nombre_completo,
                curp: studentData.curp,
                grado: studentData.grado || '',
                grupo: studentData.grupo || 'A',
                status: studentData.status || 'activo'
              });
              
              results.successful++;
            } catch (error: any) {
              results.errors.push({
                row: index + 2,
                error: error.message,
                data: jsonData[index]
              });
            }
          }
        } else if (templateId === 'tutores') {
          // Process guardians/tutors
          for (let index = 0; index < jsonData.length; index++) {
            try {
              const tutorData = jsonData[index] as any;
              
              // Basic validation
              if (!tutorData.nombre_completo || !tutorData.email) {
                results.errors.push({
                  row: index + 2,
                  error: "Nombre completo y email son requeridos",
                  data: tutorData
                });
                continue;
              }

              // Create guardian
              await storage.createGuardian({
                nombre_completo: tutorData.nombre_completo,
                email: tutorData.email,
                telefono: tutorData.telefono || ''
              });
              
              results.successful++;
            } catch (error: any) {
              results.errors.push({
                row: index + 2,
                error: error.message,
                data: jsonData[index]
              });
            }
          }
        } else if (templateId === 'relaciones') {
          // Process student-guardian relationships (simplified version)
          for (let index = 0; index < jsonData.length; index++) {
            try {
              const relationData = jsonData[index] as any;
              
              // Basic validation
              if (!relationData.curp_estudiante || !relationData.email_tutor) {
                results.errors.push({
                  row: index + 2,
                  error: "CURP estudiante y email tutor son requeridos",
                  data: relationData
                });
                continue;
              }

              // For now, we'll log the relationship data for manual processing
              // In a full implementation, this would create the actual relationships
              console.log(`Relación registrada: Estudiante CURP ${relationData.curp_estudiante} -> Tutor ${relationData.email_tutor}`);
              
              results.successful++;
            } catch (error: any) {
              results.errors.push({
                row: index + 2,
                error: error.message,
                data: jsonData[index]
              });
            }
          }
        }
      }

      res.json({
        success: true,
        results,
        message: `Procesados ${results.successful} registros exitosamente de ${results.total} total`
      });

    } catch (error: any) {
      res.status(500).json({ message: "Error procesando importación: " + error.message });
    }
  });

  // Export data to Excel
  app.get("/api/export/:type", authenticateToken, async (req, res) => {
    try {
      const { type } = req.params;
      const campusId = (req as any).user?.campus_id;

      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      let data: any[] = [];
      let filename = "export";

      switch (type) {
        case 'estudiantes':
          data = await storage.getStudentsByCampus(campusId);
          filename = "estudiantes";
          break;
        case 'conceptos':
          data = await storage.getConceptsByCampus(campusId);
          filename = "conceptos";
          break;
        default:
          return res.status(400).json({ message: "Tipo de exportación no válido" });
      }

      // Create Excel workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Datos");

      // Generate Excel buffer
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.send(excelBuffer);

    } catch (error: any) {
      res.status(500).json({ message: "Error generando exportación: " + error.message });
    }
  });

  // MIGRATION STATUS TRACKING
  
  // In-memory storage for migration progress (in production, use Redis or database)
  let migrationStatus: any = {
    estudiantes: {
      estudiantes: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] },
      tutores: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] },
      relaciones: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] }
    },
    financiero: {
      conceptos: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] },
      calendario: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] },
      cargos_extraordinarios: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] }
    },
    becas: {
      tipos_becas: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] },
      asignaciones_becas: { status: 'pending', recordsProcessed: 0, totalRecords: 0, errors: [] }
    }
  };

  // Get migration status
  app.get("/api/migration/status", authenticateToken, (req, res) => {
    try {
      // Calculate overall progress
      let totalTemplates = 0;
      let completedTemplates = 0;
      let totalErrors = 0;

      Object.keys(migrationStatus).forEach(category => {
        Object.keys(migrationStatus[category]).forEach(template => {
          totalTemplates++;
          if (migrationStatus[category][template].status === 'completed') {
            completedTemplates++;
          }
          totalErrors += migrationStatus[category][template].errors.length;
        });
      });

      const overallProgress = totalTemplates > 0 ? (completedTemplates / totalTemplates) * 100 : 0;

      // Calculate category progress
      const categories = {
        estudiantes: {
          completed: Object.values(migrationStatus.estudiantes).filter((t: any) => t.status === 'completed').length,
          total: Object.keys(migrationStatus.estudiantes).length,
          status: Object.values(migrationStatus.estudiantes).every((t: any) => t.status === 'completed') ? 'completed' : 
                  Object.values(migrationStatus.estudiantes).some((t: any) => t.status === 'in_progress') ? 'in_progress' : 'pending'
        },
        financiero: {
          completed: Object.values(migrationStatus.financiero).filter((t: any) => t.status === 'completed').length,
          total: Object.keys(migrationStatus.financiero).length,
          status: Object.values(migrationStatus.financiero).every((t: any) => t.status === 'completed') ? 'completed' : 
                  Object.values(migrationStatus.financiero).some((t: any) => t.status === 'in_progress') ? 'in_progress' : 'pending'
        },
        becas: {
          completed: Object.values(migrationStatus.becas).filter((t: any) => t.status === 'completed').length,
          total: Object.keys(migrationStatus.becas).length,
          status: Object.values(migrationStatus.becas).every((t: any) => t.status === 'completed') ? 'completed' : 
                  Object.values(migrationStatus.becas).some((t: any) => t.status === 'in_progress') ? 'in_progress' : 'pending'
        }
      };

      res.json({
        overallProgress,
        categories,
        totalTemplates,
        completedTemplates,
        totalErrors,
        detailedStatus: migrationStatus
      });

    } catch (error: any) {
      res.status(500).json({ message: "Error getting migration status: " + error.message });
    }
  });

  // Update migration status
  app.post("/api/migration/status", authenticateToken, (req, res) => {
    try {
      const { category, templateId, status, recordsProcessed = 0, totalRecords = 0, errors = [] } = req.body;

      if (!migrationStatus[category] || !migrationStatus[category][templateId]) {
        return res.status(400).json({ message: "Invalid category or template ID" });
      }

      migrationStatus[category][templateId] = {
        status,
        recordsProcessed,
        totalRecords,
        errors,
        lastUpdated: new Date().toISOString()
      };

      res.json({ success: true, message: "Migration status updated" });

    } catch (error: any) {
      res.status(500).json({ message: "Error updating migration status: " + error.message });
    }
  });

  // Reset migration progress
  app.post("/api/migration/reset", authenticateToken, (req, res) => {
    try {
      // Reset all statuses to pending
      Object.keys(migrationStatus).forEach(category => {
        Object.keys(migrationStatus[category]).forEach(template => {
          migrationStatus[category][template] = {
            status: 'pending',
            recordsProcessed: 0,
            totalRecords: 0,
            errors: [],
            lastUpdated: new Date().toISOString()
          };
        });
      });

      res.json({ success: true, message: "Migration progress reset" });

    } catch (error: any) {
      res.status(500).json({ message: "Error resetting migration progress: " + error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
