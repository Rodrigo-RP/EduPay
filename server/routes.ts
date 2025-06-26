import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertGuardianSchema, insertChargeSchema, insertPaymentSchema } from "@shared/schema";
import { getAcademicLevel } from "@shared/academic-levels";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

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
      
      // Verify campus exists in the campuses table
      const campuses = await storage.getCampusesByTenant(16); // Get any available campus
      const allCampuses = await db.select().from(schema.campuses);
      const campusExists = allCampuses.find(c => c.id === userCampusId);
      
      if (!campusExists) {
        console.log("Available campuses:", allCampuses.map(c => ({ id: c.id, name: c.nombre })));
        return res.status(400).json({ 
          message: `Campus ${userCampusId} does not exist. Available campuses: ${allCampuses.map(c => c.id).join(', ')}` 
        });
      }

      
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

  const httpServer = createServer(app);
  return httpServer;
}
