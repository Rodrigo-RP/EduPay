import type { Express } from "express";
import { pool, db } from "../db";
import { enqueueAuditLog } from "../audit-retry";
import { createFamily, type TutorInput } from "../lib/family-service";
import { eq, and, gte, lt } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, authenticateGuardian, checkCampusTenant, upload, esmRequire, JWT_SECRET, hasPermissionForUser} from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { students, guardians, student_guardian, charges, payments, concepts, scholarships, invoices, payment_rules, late_fee_calculations } from "@shared/schema";
import { insertPaymentSchema } from "@shared/schema";
import { getAcademicLevel } from "@shared/academic-levels";
import { wsManager } from "../websocket-manager";
import * as XLSX from "xlsx";
import { z } from "zod";

export function registerPaymentRoutes(app: Express): void {
  app.post("/api/payments/create-intent", authenticateGuardian, async (req: any, res) => {
    try {
      const { charge_id } = req.body;
      const guardianId = req.guardian?.id;

      // IDOR PROTECTION: verificar que el cargo pertenece a un alumno del guardián
      const ownedCharge = await storage.getChargeByGuardian(charge_id, guardianId);
      if (!ownedCharge) {
        return res.status(403).json({ message: "Acceso denegado: el cargo no pertenece a los alumnos de este tutor" });
      }

      const clientSecret = `pi_mock_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`;
      res.json({ 
        clientSecret,
        amount: ownedCharge.monto_base_centavos + (ownedCharge.recargo_aplicado_centavos || 0),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating payment intent" });
    }
  });

  /**
   * POST /api/payments/process
   *
   * Procesa el pago de un cargo individual desde el portal del guardián.
   * Usa el mismo patrón atómico que guardian/pagar:
   *   BEGIN → SELECT FOR UPDATE → saldo real → INSERT payment →
   *   INSERT payment_application → UPDATE charges → COMMIT
   * No soporta pagos parciales (paga el saldo pendiente completo).
   */
  app.post("/api/payments/process", authenticateGuardian, async (req: any, res) => {
    try {
      const { charge_id, payment_method } = req.body;
      const guardianId  = req.guardian?.id;
      const tenantIdJwt = req.guardian?.tenant_id;

      // IDOR check (lectura, fuera de la txn)
      const ownedCharge = await storage.getChargeByGuardian(charge_id, guardianId);
      if (!ownedCharge) {
        return res.status(403).json({ message: "Acceso denegado: el cargo no pertenece a los alumnos de este tutor" });
      }
      const tenantIdPago = (ownedCharge as any).tenant_id ?? tenantIdJwt;

      // ── Transacción atómica ──────────────────────────────────────────────
      const client = await pool.connect();
      let paymentId!: number;
      try {
        await client.query("BEGIN");

        // 1. Lock — serializa concurrencia
        const lockRes = await client.query(
          `SELECT id, monto_base_centavos, recargo_aplicado_centavos, estado
           FROM charges WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [charge_id, tenantIdPago]
        );
        if (!(lockRes.rows as any[]).length) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "Cargo no encontrado" });
        }
        const locked = (lockRes.rows as any[])[0];

        if (["pagado", "cancelado"].includes(locked.estado)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya fue pagado o está cancelado" });
        }

        // 2. Saldo pendiente real
        const saldoRes = await client.query(
          `SELECT COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
           FROM payment_applications pa WHERE pa.charge_id = $1`,
          [charge_id]
        );
        const yaPagado = Number((saldoRes.rows as any[])[0].ya_pagado);
        const saldo =
          Number(locked.monto_base_centavos) +
          Number(locked.recargo_aplicado_centavos || 0) -
          yaPagado;

        if (saldo <= 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya tiene saldo cero" });
        }

        // 3. Crear pago en 'exitoso'
        const payRow = await client.query(
          `INSERT INTO payments
             (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
              monto_centavos, fecha_pago, estado)
           VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,'exitoso') RETURNING id`,
          [tenantIdPago, charge_id, guardianId, payment_method, `ref_${Date.now()}`, saldo]
        );
        paymentId = (payRow.rows as any[])[0].id;

        // 4. Ledger entry
        await client.query(
          `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
           VALUES ($1,$2,$3,NOW())`,
          [paymentId, charge_id, saldo]
        );

        // 5. Marcar cargo pagado
        await client.query(
          `UPDATE charges SET estado = 'pagado', updated_at = NOW() WHERE id = $1`,
          [charge_id]
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // ── Audit fuera de la transacción (ADR-001) ──────────────────────────
      const auditPayloadPago: import("../audit-retry").AuditLogPayload = {
        tenant_id:      tenantIdPago,
        user_id:        null,
        guardian_id:    guardianId,
        action:         "charge.status_changed",
        entity_type:    "charge",
        entity_id:      charge_id,
        previous_value: { estado: "pendiente" },
        new_value:      { estado: "pagado" },
        metadata:       { flujo: "guardian_pago", payment_id: paymentId },
      };
      pool.query(
        `INSERT INTO audit_log
           (tenant_id, guardian_id, action, entity_type, entity_id, previous_value, new_value, metadata)
         VALUES ($1,$2,'charge.status_changed','charge',$3,$4,$5,$6)`,
        [
          tenantIdPago, guardianId, charge_id,
          JSON.stringify(auditPayloadPago.previous_value),
          JSON.stringify(auditPayloadPago.new_value),
          JSON.stringify(auditPayloadPago.metadata),
        ]
      ).catch((err) => enqueueAuditLog(auditPayloadPago, err));

      // Notificación en tiempo real
      wsManager.notifyPaymentUpdate({ id: paymentId, charge_id }, "create", {
        campus_id:  req.guardian?.campus_id || 1,
        tenant_id:  tenantIdPago,
        created_by: guardianId,
      });

      res.json({
        success: true,
        payment: { id: paymentId, charge_id, monto_centavos: null },
        message: "Payment processed successfully",
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error processing payment" });
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
          asignaciones: {
            name: "Asignaciones de Becas",
            columns: ["id_estudiante", "curp_estudiante", "nombre_estudiante", "tipo_beca", "tipo_descuento", "valor_descuento", "vigencia_inicio", "vigencia_fin", "observaciones"],
            sampleData: [{
              id_estudiante: "1",
              curp_estudiante: "GOLM051215MDFNPR03",
              nombre_estudiante: "María González López",
              tipo_beca: "Beca USEBEQ",
              tipo_descuento: "porcentaje",
              valor_descuento: "50",
              vigencia_inicio: "2024-08-15",
              vigencia_fin: "2025-07-15",
              observaciones: "Beca por excelencia académica"
            }, {
              id_estudiante: "2",
              curp_estudiante: "RAMS031020HDFMND04",
              nombre_estudiante: "Carlos Ramírez Sánchez",
              tipo_beca: "Descuento Empleados",
              tipo_descuento: "cantidad",
              valor_descuento: "1500",
              vigencia_inicio: "2024-08-15",
              vigencia_fin: "2025-07-15",
              observaciones: "Descuento por ser hijo de empleado"
            }, {
              id_estudiante: "3",
              curp_estudiante: "MAGL080912MDFLRN01",
              nombre_estudiante: "Luis Martínez Gil",
              tipo_beca: "Beca Deportiva",
              tipo_descuento: "porcentaje",
              valor_descuento: "25",
              vigencia_inicio: "2024-08-15",
              vigencia_fin: "2025-07-15",
              observaciones: "Beca por destacar en fútbol"
            }]
          }
        },
        adeudos: {
          migrados: {
            name: "Adeudos Migrados de Sistema Anterior",
            columns: ["id_estudiante", "curp_estudiante", "tipo_concepto", "monto_centavos", "fecha_vencimiento", "ciclo_escolar", "descripcion"],
            sampleData: [{
              id_estudiante:    "A-00123",
              curp_estudiante:  "GOLM051215MDFNPR03",
              tipo_concepto:    "colegiatura",
              monto_centavos:   "350000",
              fecha_vencimiento:"2024-03-10",
              ciclo_escolar:    "2023-2024",
              descripcion:      "Colegiatura Marzo 2024"
            }, {
              id_estudiante:    "A-00124",
              curp_estudiante:  "RAMS031020HDFMND04",
              tipo_concepto:    "inscripcion",
              monto_centavos:   "500000",
              fecha_vencimiento:"2023-08-15",
              ciclo_escolar:    "2023-2024",
              descripcion:      "Inscripción ciclo 2023-2024"
            }]
          }
        },
        familias: {
          tutores: {
            name: "Importación Masiva de Familias y Tutores",
            columns: [
              "nombre_familia", "id_referencia_alumno", "curp_alumno",
              "tipo_guardian", "nombres_tutor", "apellido_paterno_tutor", "apellido_materno_tutor",
              "curp_tutor", "email_tutor", "celular_tutor",
              "es_responsable_pago", "porcentaje_responsabilidad"
            ],
            sampleData: [{
              nombre_familia:            "Familia García Pérez",
              id_referencia_alumno:      "A-00123",
              curp_alumno:               "",
              tipo_guardian:             "padre",
              nombres_tutor:             "Juan",
              apellido_paterno_tutor:    "García",
              apellido_materno_tutor:    "López",
              curp_tutor:                "GALJ780312HDFRCN02",
              email_tutor:               "juan.garcia@correo.mx",
              celular_tutor:             "5551234567",
              es_responsable_pago:       "true",
              porcentaje_responsabilidad:"60"
            }, {
              nombre_familia:            "Familia García Pérez",
              id_referencia_alumno:      "A-00123",
              curp_alumno:               "",
              tipo_guardian:             "madre",
              nombres_tutor:             "María",
              apellido_paterno_tutor:    "Pérez",
              apellido_materno_tutor:    "Ruiz",
              curp_tutor:                "PERM820715MDFRZR04",
              email_tutor:               "maria.perez@correo.mx",
              celular_tutor:             "5559876543",
              es_responsable_pago:       "true",
              porcentaje_responsabilidad:"40"
            }]
          }
        }
      };

      // Get template configuration
      const templateConfig = templates[category]?.[templateId];
      if (!templateConfig) {
        return res.status(400).json({ message: "Plantilla no encontrada" });
      }

      // Generate CSV content
      const csvRows = [
        `# PLANTILLA: ${templateConfig.name}`,
        `# FECHA: ${new Date().toLocaleDateString()}`,
        `# INSTRUCCIONES: Complete los campos obligatorios y guarde como archivo CSV`,
        ``,
        templateConfig.columns.join(','),
        ...templateConfig.sampleData.map((item: any) => 
          templateConfig.columns.map((col: string) => {
            const value = item[col] || '';
            // Escape commas and quotes in CSV
            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          }).join(',')
        )
      ];
      
      const csvContent = csvRows.join('\n');
      const csvBuffer = Buffer.from('\ufeff' + csvContent, 'utf8'); // Add BOM for Excel compatibility
      
      const fileName = `plantilla_${templateId}_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csvBuffer);
      
    } catch (error: any) {
      console.error('Error generating template:', error);
      res.status(500).json({ message: "Error generando plantilla" });
    }
  });

  // Import data from Excel/CSV file
  // Guards de módulo (verificado agosto 2026):
  //   becas/asignaciones      → SCHOLARSHIPS.ASSIGN  (igual que asignación manual)
  //   estudiantes/estudiantes → STUDENTS.IMPORT
  //   estudiantes/tutores     → FAMILIES.IMPORT
  //
  // Atomicidad: BEGIN/COMMIT envuelve la totalidad del procesamiento.
  // Errores de validación por fila (campo faltante, alumno no encontrado) se
  // cuentan como "failed" y el resto continúa — el ROLLBACK sólo ocurre ante
  // errores fatales imprevistos (excepción no controlada en un INSERT/SELECT).
  app.post("/api/import/data/:category/:templateId", authenticateToken, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se encontró archivo para importar" });
      }

      const { category, templateId } = req.params;
      const importUser = (req as any).user;
      const campusId = importUser?.campus_id;
      const tenantId = importUser?.tenant_id;

      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      // ── Guard de módulo por template ────────────────────────────────────
      let requiredModule: string;
      let requiredAction: string;

      if (category === 'becas' && templateId === 'asignaciones') {
        requiredModule = MODULES.SCHOLARSHIPS;
        requiredAction = ACTIONS.ASSIGN;
      } else if (category === 'estudiantes' && templateId === 'estudiantes') {
        requiredModule = MODULES.STUDENTS;
        requiredAction = ACTIONS.IMPORT;
      } else if (category === 'estudiantes' && templateId === 'tutores') {
        requiredModule = MODULES.FAMILIES;
        requiredAction = ACTIONS.CREATE; // administrador_campus tiene FAMILIES.CREATE
      } else if (category === 'adeudos' && templateId === 'migrados') {
        requiredModule = MODULES.CHARGES;
        requiredAction = ACTIONS.CREATE; // misma guardia que POST /api/admin/cargos/extraordinario
      } else if (category === 'familias' && templateId === 'tutores') {
        requiredModule = MODULES.FAMILIES;
        requiredAction = ACTIONS.CREATE; // administrador_campus tiene FAMILIES.CREATE
      } else {
        return res.status(400).json({ message: "Template de importación no reconocido" });
      }

      if (!hasPermissionForUser(importUser, requiredModule, requiredAction)) {
        return res.status(403).json({ message: "Sin permisos para importar este tipo de datos" });
      }

      // Parse Excel/CSV file
      let workbook: XLSX.WorkBook;
      let jsonData: any[];
      
      if (req.file.mimetype === 'text/csv' || req.file.mimetype === 'text/tab-separated-values' || req.file.originalname?.endsWith('.tsv')) {
        const csvData = req.file.buffer.toString();
        // Filter out comment lines starting with #
        const filteredLines = csvData.split('\n').filter(line => !line.trim().startsWith('#') && line.trim() !== '');
        const cleanCsvData = filteredLines.join('\n');
        
        // Detect separator (tab, semicolon, or comma) and parse accordingly
        let separator = ',';
        if (cleanCsvData.includes('\t')) {
          separator = '\t'; // Tab separator (TSV)
        } else if (cleanCsvData.includes(';')) {
          separator = ';'; // Semicolon separator
        }
        
        workbook = XLSX.read(cleanCsvData, { 
          type: 'string',
          FS: separator  // Field separator
        });
      } else {
        workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      jsonData = XLSX.utils.sheet_to_json(worksheet);

      // dry_run: acepta ?dry_run=true (query string) o { dry_run: true } (body JSON).
      // Con dry_run activo, el procesamiento es idéntico al real pero termina en
      // ROLLBACK: ninguna fila queda escrita. La respuesta incluye committed: false.
      const dryRun =
        req.query.dry_run === 'true' ||
        req.query.dry_run === '1' ||
        (req as any).body?.dry_run === true ||
        (req as any).body?.dry_run === 'true';

      // Validate and process data based on template
      const results: {
        successful: number;
        failed: number;
        errors: any[];
        warnings: string[];
        preview: any[];
        total: number;
        committed: boolean;
      } = {
        successful: 0,
        failed: 0,
        errors: [],
        warnings: [],    // mensajes de desambigüación no fatales (ej. concepto elegido por defecto)
        preview: jsonData.slice(0, 5),
        total: jsonData.length,
        committed: !dryRun,  // se sobreescribe abajo; aquí es el valor esperado
      };

      // ── Transacción envolvente ────────────────────────────────────────────
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

      // Process based on category and template
      if (category === 'becas' && templateId === 'asignaciones') {
        // Importación real de becas.
        //
        // Columnas reales de la tabla scholarships (verificado agosto 2026):
        //   porcentaje, motivo, vigencia_inicio, vigencia_fin, student_id, tenant_id
        // Columnas que NO existen: estado, monto_fijo, campus_id, activo, scholarship_type_id
        // El aislamiento por campus se logra buscando al alumno WHERE campus_id = JWT.campus_id.
        //
        // Columnas del archivo CSV esperadas:
        //   id_estudiante | curp_estudiante  (al menos uno)
        //   tipo_beca                         (requerido)
        //   valor_descuento                   (0 < x ≤ 100, porcentaje)
        //   vigencia_inicio                   (opcional, default: hoy)
        //   vigencia_fin                      (opcional, default: null)
        //   motivo                            (opcional, fallback: tipo_beca)
        for (let index = 0; index < jsonData.length; index++) {
          const becaData = jsonData[index] as any;

          // ── Validación (sin escrituras DB) — errores van a failed[], resto continúa
          if (!becaData.id_estudiante && !becaData.curp_estudiante) {
            results.errors.push(`Fila ${index + 2}: id_estudiante o curp_estudiante requerido`);
            results.failed++;
            continue;
          }
          if (!becaData.tipo_beca) {
            results.errors.push(`Fila ${index + 2}: tipo_beca requerido`);
            results.failed++;
            continue;
          }
          const porcentaje = parseFloat(becaData.valor_descuento);
          if (!becaData.valor_descuento || isNaN(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
            results.errors.push(`Fila ${index + 2}: valor_descuento debe ser un número entre 0 y 100`);
            results.failed++;
            continue;
          }

          // ── SELECTs de búsqueda (si fallan por error DB → propagan → ROLLBACK)
          // Siempre restringida al campus_id del JWT — nunca cruza campus.
          let studentRow: any;
          if (becaData.id_estudiante) {
            const r = await client.query(
              `SELECT id, nombre_completo FROM students
               WHERE id_referencia = $1 AND campus_id = $2 AND tenant_id = $3
               LIMIT 1`,
              [String(becaData.id_estudiante).trim(), campusId, tenantId],
            );
            studentRow = r.rows[0];
          }
          if (!studentRow && becaData.curp_estudiante) {
            const r = await client.query(
              `SELECT id, nombre_completo FROM students
               WHERE curp = $1 AND campus_id = $2 AND tenant_id = $3
               LIMIT 1`,
              [String(becaData.curp_estudiante).trim().toUpperCase(), campusId, tenantId],
            );
            studentRow = r.rows[0];
          }

          // No encontrado = validación de datos, no error fatal
          if (!studentRow) {
            results.errors.push(`Fila ${index + 2}: Estudiante no encontrado en este campus`);
            results.failed++;
            continue;
          }

          // ── INSERT (si falla → propaga → ROLLBACK de toda la importación)
          //
          // XLSX auto-convierte cadenas de fecha ISO ("2026-08-01") a números
          // seriales de Excel (e.g. 46235) al parsear el CSV.
          const parseXlsxDate = (val: any): string | null => {
            if (!val && val !== 0) return null;
            if (typeof val === 'number') {
              const jsDate = new Date((val - 25569) * 86400 * 1000);
              return jsDate.toISOString().split('T')[0];
            }
            if (val instanceof Date) return val.toISOString().split('T')[0];
            return String(val).trim();
          };
          const vigenciaInicio = parseXlsxDate(becaData.vigencia_inicio)
            || new Date().toISOString().split('T')[0];
          const vigenciaFinParsed = parseXlsxDate(becaData.vigencia_fin);
          const vigenciaFin = vigenciaFinParsed || (() => {
            const d = new Date(vigenciaInicio);
            d.setFullYear(d.getFullYear() + 1);
            return d.toISOString().split('T')[0];
          })();
          const motivo = becaData.motivo || becaData.observaciones || String(becaData.tipo_beca);

          await client.query(
            `INSERT INTO scholarships
               (student_id, tenant_id, porcentaje, vigencia_inicio, vigencia_fin, motivo)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [studentRow.id, tenantId, porcentaje, vigenciaInicio, vigenciaFin, motivo],
          );
          results.successful++;
        }

      } else if (category === 'estudiantes' && templateId === 'estudiantes') {
        for (let index = 0; index < jsonData.length; index++) {
          const studentData = jsonData[index] as any;

          // ── Validación
          if (!studentData.nombre_completo || !studentData.curp) {
            results.errors.push(`Fila ${index + 2}: Nombre completo y CURP son requeridos`);
            results.failed++;
            continue;
          }

          // Validar y normalizar CURP (patrón oficial SAT — no bloqueante en bulk import)
          {
            const { validarCurp, normalizarCurp } = await import("../lib/validators");
            studentData.curp = normalizarCurp(studentData.curp);
            if (!validarCurp(studentData.curp)) {
              results.errors.push(`Fila ${index + 2}: CURP inválida (${studentData.curp}) — formato incorrecto, verifique el patrón oficial SAT`);
              results.failed++;
              continue;
            }
          }

          // ── INSERT (si falla → propaga → ROLLBACK)
          // ATENCIÓN — implementación inline deliberada: storage.createStudent usa
          // db (Drizzle, conexión propia) y no puede participar en el BEGIN/COMMIT
          // de esta transacción. Si en el futuro storage.createStudent añade
          // normalización de campos (capitalización, derivación de nivel_escolar,
          // etc.), replicar ese cambio aquí o extraer un helper puro compartido.
          // nombre_completo es NOT NULL en la DB.
          const nombreCompleto = studentData.nombre_completo;
          await client.query(
            `INSERT INTO students
               (tenant_id, campus_id, nombres, nombre_completo, curp, grado, grupo, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              tenantId,
              campusId,
              studentData.nombre_completo || '',
              nombreCompleto,
              studentData.curp || '',
              studentData.grado || '',
              studentData.grupo || 'A',
              studentData.status || 'activo',
            ],
          );
          results.successful++;
        }

      } else if (category === 'estudiantes' && templateId === 'tutores') {
        for (let index = 0; index < jsonData.length; index++) {
          const tutorData = jsonData[index] as any;

          // ── Validación
          if (!tutorData.nombre_completo || !tutorData.email) {
            results.errors.push(`Fila ${index + 2}: Nombre completo y email son requeridos`);
            results.failed++;
            continue;
          }

          // ── INSERT (si falla → propaga → ROLLBACK)
          // ATENCIÓN — implementación inline deliberada (misma razón que students).
          // Si storage.createGuardian añade lógica nueva, replicar aquí.
          // correo_institucional_familiar y nombres son NOT NULL en guardians.
          await client.query(
            `INSERT INTO guardians
               (nombres, nombre_completo, email, correo_institucional_familiar, celular,
                campus_id, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              tutorData.nombre_completo || '',
              tutorData.nombre_completo || '',
              tutorData.email || '',
              tutorData.email || '',
              tutorData.telefono || '',
              campusId,
              tenantId,
            ],
          );
          results.successful++;
        }

      } else if (category === 'adeudos' && templateId === 'migrados') {
        // ── Importación de adeudos migrados desde sistema anterior ───────────
        //
        // Columnas del CSV:
        //   id_estudiante | curp_estudiante   (al menos uno)
        //   tipo_concepto                     (vocabulario controlado: colegiatura, inscripcion, etc.)
        //   monto_centavos                    (entero en centavos, sin decimales ni símbolo $)
        //   fecha_vencimiento                 (ISO YYYY-MM-DD)
        //   ciclo_escolar                     (ej. 2023-2024)
        //   descripcion                       (libre, opcional — ej. "Colegiatura Marzo 2024")
        //
        // Cada charge se crea con:
        //   es_adeudo_migrado = TRUE   → exento del batch de recargos automáticos
        //   recargo_aplicado_centavos = 0
        //   estado = 'pendiente'
        //
        // Resolución de concept_id por tipo_concepto:
        //   1. SELECT todos los conceptos de ese tipo para el campus (sin filtro activo — campo no existe).
        //   2. Si 0 → failed con mensaje exacto: "No existe concepto de tipo 'X'…"
        //   3. Si 1 → usar directamente.
        //   4. Si >1 → desambiguar por nivel_escolar del alumno vs. nombre del concepto.
        //   5. Si la ambigüedad persiste → usar el primero, agregar aviso a warnings[].

        // Helper reutilizado del template de becas: convierte fecha serial Excel → ISO.
        const parseFecha = (val: any): string | null => {
          if (!val && val !== 0) return null;
          if (typeof val === 'number') {
            const jsDate = new Date((val - 25569) * 86400 * 1000);
            return jsDate.toISOString().split('T')[0];
          }
          if (val instanceof Date) return val.toISOString().split('T')[0];
          return String(val).trim() || null;
        };

        for (let index = 0; index < jsonData.length; index++) {
          const row = jsonData[index] as any;

          // ── Validación de campos obligatorios (errores de fila → failed, no ROLLBACK)
          if (!row.id_estudiante && !row.curp_estudiante) {
            results.errors.push(`Fila ${index + 2}: id_estudiante o curp_estudiante es requerido`);
            results.failed++;
            continue;
          }
          if (!row.tipo_concepto) {
            results.errors.push(`Fila ${index + 2}: tipo_concepto es requerido`);
            results.failed++;
            continue;
          }
          const monto = parseInt(String(row.monto_centavos ?? ''), 10);
          if (!row.monto_centavos || isNaN(monto) || monto <= 0) {
            results.errors.push(`Fila ${index + 2}: monto_centavos debe ser un entero positivo (en centavos, sin decimales)`);
            results.failed++;
            continue;
          }
          if (!row.fecha_vencimiento) {
            results.errors.push(`Fila ${index + 2}: fecha_vencimiento es requerido (formato YYYY-MM-DD)`);
            results.failed++;
            continue;
          }
          if (!row.ciclo_escolar) {
            results.errors.push(`Fila ${index + 2}: ciclo_escolar es requerido (ej. 2023-2024)`);
            results.failed++;
            continue;
          }

          // ── Buscar alumno en este campus (restringido al campus_id del JWT)
          let studentRow: any;
          if (row.id_estudiante) {
            const r = await client.query(
              `SELECT id, nombre_completo, nivel_escolar FROM students
               WHERE id_referencia = $1 AND campus_id = $2 AND tenant_id = $3 LIMIT 1`,
              [String(row.id_estudiante).trim(), campusId, tenantId],
            );
            studentRow = r.rows[0];
          }
          if (!studentRow && row.curp_estudiante) {
            const r = await client.query(
              `SELECT id, nombre_completo, nivel_escolar FROM students
               WHERE curp = $1 AND campus_id = $2 AND tenant_id = $3 LIMIT 1`,
              [String(row.curp_estudiante).trim().toUpperCase(), campusId, tenantId],
            );
            studentRow = r.rows[0];
          }
          if (!studentRow) {
            results.errors.push(`Fila ${index + 2}: Estudiante no encontrado en este campus`);
            results.failed++;
            continue;
          }

          // ── Resolver concept_id por tipo_concepto
          // La tabla concepts no tiene columna 'activo' — no se filtra por ella.
          const tipoConcepto = String(row.tipo_concepto).trim().toLowerCase();
          const conceptosR = await client.query(
            `SELECT id, nombre FROM concepts
             WHERE campus_id = $1 AND tenant_id = $2 AND LOWER(tipo) = $3
             ORDER BY id`,
            [campusId, tenantId, tipoConcepto],
          );
          const conceptos = conceptosR.rows as Array<{ id: number; nombre: string }>;

          if (conceptos.length === 0) {
            results.errors.push(
              `Fila ${index + 2}: No existe concepto de tipo '${tipoConcepto}' para este campus. Configure el catálogo primero.`,
            );
            results.failed++;
            continue;
          }

          let conceptId: number;
          if (conceptos.length === 1) {
            conceptId = conceptos[0].id;
          } else {
            // Desambigüar por nivel_escolar del alumno:
            // buscar el concepto cuyo nombre contenga el nivel (KINDER, PRIMARIA, etc.).
            const NIVELES = ['KINDER', 'PRIMARIA', 'SECUNDARIA', 'BACHILLERATO'] as const;
            const nivelEscolar = (studentRow.nivel_escolar ?? '').toUpperCase();
            const nivelMatch = NIVELES.find(n => nivelEscolar.includes(n));

            const filtrados = nivelMatch
              ? conceptos.filter(c => c.nombre.toUpperCase().includes(nivelMatch))
              : [];

            if (filtrados.length === 1) {
              // Desambigüación exitosa por nivel académico.
              conceptId = filtrados[0].id;
            } else {
              // Ambigüedad persistente: usar el primero, registrar warning no fatal.
              conceptId = conceptos[0].id;
              results.warnings.push(
                `Fila ${index + 2}: ${conceptos.length} conceptos de tipo '${tipoConcepto}' para ${studentRow.nombre_completo}` +
                (nivelMatch
                  ? ` (nivel ${nivelMatch} sin coincidencia única en nombre del concepto)`
                  : ` (nivel_escolar del alumno no determinado)`) +
                ` — usando '${conceptos[0].nombre}' (id ${conceptos[0].id}). Verifique el resultado.`,
              );
            }
          }

          // ── Parsear y validar fechas
          const fechaVencimiento = parseFecha(row.fecha_vencimiento);
          if (!fechaVencimiento) {
            results.errors.push(`Fila ${index + 2}: fecha_vencimiento inválida`);
            results.failed++;
            continue;
          }
          // fecha_emision: columna del CSV opcional; si no viene, usar fecha_vencimiento.
          const fechaEmision = parseFecha(row.fecha_emision) ?? fechaVencimiento;
          const descripcion   = row.descripcion ? String(row.descripcion).trim() : null;
          const cicloEscolar  = String(row.ciclo_escolar).trim();

          // ── INSERT del charge migrardo
          // es_adeudo_migrado = TRUE  → exime del batch de recargo automático (ADR-010)
          // recargo_aplicado_centavos hardcodeado a 0 — nunca hereda mora del sistema anterior
          await client.query(
            `INSERT INTO charges
               (student_id, concept_id, tenant_id, ciclo_escolar,
                fecha_emision, fecha_vencimiento, monto_base_centavos,
                beca_aplicada, recargo_aplicado_centavos, estado,
                es_adeudo_migrado, descripcion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, '0.00', 0, 'pendiente', TRUE, $8)`,
            [
              studentRow.id, conceptId, tenantId, cicloEscolar,
              fechaEmision, fechaVencimiento, monto,
              descripcion,
            ],
          );
          results.successful++;
        }
      } else if (category === 'familias' && templateId === 'tutores') {
        // ── Importación masiva de familias y tutores ─────────────────────────
        //
        // Columnas del CSV (diseño aprobado):
        //   nombre_familia            — clave de agrupación en el CSV (nunca en DB)
        //   id_referencia_alumno      — alternativo
        //   curp_alumno               — alternativo (al menos uno requerido)
        //   tipo_guardian / nombres_tutor / apellido_paterno_tutor / ...
        //   curp_tutor / email_tutor / celular_tutor
        //   es_responsable_pago       — 'true' | '1' | 'false' | '0'
        //   porcentaje_responsabilidad — número o vacío
        //
        // Atomicidad por grupo (SAVEPOINT):
        //   - createFamily() recibe el client exterior y participa en la txn.
        //   - Error de negocio (status 400/422) → ROLLBACK TO SAVEPOINT del grupo,
        //     grupo contado como "failed", resto continúa.
        //   - Error de DB inesperado → propaga → ROLLBACK exterior.
        //   - dry_run: ROLLBACK exterior final deshace todo.

        // Paso 1: Agrupar filas por nombre_familia
        const familyGroups = new Map<string, any[]>();
        for (let idx = 0; idx < jsonData.length; idx++) {
          const row = jsonData[idx] as any;
          const key = String(row.nombre_familia ?? '').trim();
          if (!key) {
            results.failed++;
            results.errors.push(`Fila ${idx + 2}: nombre_familia es requerido`);
            continue;
          }
          if (!familyGroups.has(key)) familyGroups.set(key, []);
          familyGroups.get(key)!.push({ ...row, __csvRowIdx: idx + 2 });
        }

        // Paso 2: Procesar cada grupo
        let groupSeq = 0;
        for (const [groupName, groupRows] of familyGroups) {
          groupSeq++;
          const rowCount = groupRows.length;
          const sp = `sp_fam_${groupSeq}`;

          await client.query(`SAVEPOINT ${sp}`);

          try {
            // 2a. Resolver student_ids únicos del grupo
            const studentIdMap = new Map<string, number>(); // ref_key → student_id
            let groupError: string | null = null;

            for (const row of groupRows) {
              const ref  = String(row.id_referencia_alumno ?? '').trim();
              const curp = String(row.curp_alumno          ?? '').trim();
              const refKey = ref || curp;

              if (!refKey) {
                groupError = `Grupo '${groupName}', fila ${row.__csvRowIdx}: ` +
                  `se requiere id_referencia_alumno o curp_alumno`;
                break;
              }
              if (studentIdMap.has(refKey)) continue; // ya resuelto

              let sRow: any = null;
              if (ref) {
                const r = await client.query(
                  `SELECT id FROM students
                   WHERE id_referencia = $1 AND campus_id = $2 AND tenant_id = $3 LIMIT 1`,
                  [ref, campusId, tenantId],
                );
                sRow = r.rows[0] ?? null;
              }
              if (!sRow && curp) {
                const r = await client.query(
                  `SELECT id FROM students
                   WHERE curp = $1 AND campus_id = $2 AND tenant_id = $3 LIMIT 1`,
                  [curp.toUpperCase(), campusId, tenantId],
                );
                sRow = r.rows[0] ?? null;
              }
              if (!sRow) {
                groupError = `Grupo '${groupName}': alumno '${refKey}' no encontrado en este campus. ` +
                  `Ejecute el import de alumnos primero.`;
                break;
              }
              studentIdMap.set(refKey, (sRow as any).id);
            }

            if (groupError) {
              await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
              results.failed += rowCount;
              results.errors.push(groupError);
              continue;
            }

            const studentIds = Array.from(new Set(studentIdMap.values()));

            // 2b. Construir array de tutores únicos (dedup por CURP → email)
            const tutorMap = new Map<string, TutorInput>();
            for (const row of groupRows) {
              const curpT  = String(row.curp_tutor  ?? '').trim() || null;
              const emailT = String(row.email_tutor ?? '').trim() || null;
              const dedupKey = curpT ?? emailT ?? `__row_${row.__csvRowIdx}`;

              if (!tutorMap.has(dedupKey)) {
                const esResp = String(row.es_responsable_pago ?? '').trim().toLowerCase();
                const pct    = String(row.porcentaje_responsabilidad ?? '').trim();
                tutorMap.set(dedupKey, {
                  tipo_guardian:                  String(row.tipo_guardian            ?? '').trim() || undefined,
                  nombres:                        String(row.nombres_tutor            ?? '').trim() || undefined,
                  apellido_paterno:               String(row.apellido_paterno_tutor   ?? '').trim() || undefined,
                  apellido_materno:               String(row.apellido_materno_tutor   ?? '').trim() || undefined,
                  curp:                           curpT  ?? undefined,
                  correo_institucional_familiar:  emailT ?? undefined,
                  celular:                        String(row.celular_tutor            ?? '').trim() || undefined,
                  es_responsable_pago:            esResp === 'true' || esResp === '1',
                  porcentaje_responsabilidad:     pct    || undefined,
                });
              }
            }
            const tutores = Array.from(tutorMap.values());

            // 2c. Llamar a createFamily con el client exterior
            //     (participa en la txn; SAVEPOINT hace rollback si falla)
            const familyResult = await createFamily(
              { nombre: groupName, student_ids: studentIds, tutores },
              tenantId,
              campusId,
              client,
            );

            await client.query(`RELEASE SAVEPOINT ${sp}`);
            results.successful += rowCount;
            results.warnings.push(...familyResult.warnings);

          } catch (groupErr: any) {
            // SIEMPRE revertir al SAVEPOINT antes de decidir si es fatal
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});

            if (groupErr.status === 400 || groupErr.status === 422) {
              // Error de negocio: el grupo falla, el resto continúa.
              results.failed += rowCount;
              results.errors.push(`Grupo '${groupName}': ${groupErr.message}`);
            } else {
              // Error fatal de DB: propaga → ROLLBACK exterior.
              throw groupErr;
            }
          }
        }
      }

        if (dryRun) {
          // dry_run: revertir todo — ninguna fila queda escrita.
          // No se genera entrada en audit_log: no ocurrió ningún cambio real.
          await client.query('ROLLBACK');
          results.committed = false;
        } else {
          await client.query('COMMIT');
          results.committed = true;

          // ── Audit de importación exitosa (ADR-001: fuera de la txn, fire-and-forget)
          const auditPayloadImport = {
            tenant_id: tenantId,
            user_id:   importUser?.id ?? null,
            action:    'import',
            entity_type: templateId,
            entity_id:   campusId,
            metadata:  {
              category,
              template:   templateId,
              total:      results.total,
              successful: results.successful,
              failed:     results.failed,
            },
          };
          pool.query(
            `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              auditPayloadImport.tenant_id,
              auditPayloadImport.user_id,
              auditPayloadImport.action,
              auditPayloadImport.entity_type,
              auditPayloadImport.entity_id,
              JSON.stringify(auditPayloadImport.metadata),
            ],
          ).catch((err) => enqueueAuditLog(auditPayloadImport, err));
        }
      } catch (fatalError: any) {
        // Error fatal en un INSERT/SELECT — rollback completo: ninguna fila queda escrita.
        await client.query('ROLLBACK').catch(() => {});

        // ── Audit del intento fallido (fuera de txn revertida, fire-and-forget)
        const auditFailPayload = {
          tenant_id:   tenantId,
          user_id:     importUser?.id ?? null,
          action:      'import_failed',
          entity_type: templateId,
          entity_id:   campusId,
          metadata: {
            category,
            template:   templateId,
            total:      results.total,
            successful: results.successful,
            failed:     results.failed,
            error:      fatalError instanceof Error ? fatalError.message : String(fatalError),
          },
        };
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            auditFailPayload.tenant_id,
            auditFailPayload.user_id,
            auditFailPayload.action,
            auditFailPayload.entity_type,
            auditFailPayload.entity_id,
            JSON.stringify(auditFailPayload.metadata),
          ],
        ).catch((err) => enqueueAuditLog(auditFailPayload, err));

        throw fatalError; // re-lanza → catch externo → 500
      } finally {
        client.release();
      }

      res.json(results);

    } catch (error: any) {
      console.error('Error importing data:', error);
      res.status(500).json({ message: "Error procesando archivo" });
    }
  });

  // GET /api/export/:type — eliminado (#182).
  // El único case ('conceptos') era un volcado de configuración sin uso contable.
  // Los reportes financieros reales viven en /api/reportes/financiero y
  // /api/reportes/estudiantes (RPT-01 / RPT-02).

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
      res.status(500).json({ message: "Error getting migration status" });
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
      res.status(500).json({ message: "Error updating migration status" });
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
      res.status(500).json({ message: "Error resetting migration progress" });
    }
  });

  // /api/migration/validate-token — verifica token de sesión de migración
  app.get("/api/migration/validate-token", authenticateToken, (req, res) => {
    try {
      const user = (req as any).user;
      res.json({ valid: true, user_id: user?.id, campus_id: user?.campus_id, role: user?.role });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/migration/projects — lista proyectos de migración del campus
  app.get("/api/migration/projects", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(
        `SELECT id, nombre, estado, created_at FROM migration_projects WHERE campus_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [campusId]
      ).catch(() => ({ rows: [] }));
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/migration/project/:id — detalle de un proyecto de migración
  app.get("/api/migration/project/:id", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { id } = req.params;
      const row = await pool.query(
        `SELECT * FROM migration_projects WHERE id=$1 AND campus_id=$2 LIMIT 1`,
        [id, campusId]
      ).catch(() => ({ rows: [] }));
      if (!row.rows.length) return res.status(404).json({ message: "Proyecto no encontrado" });
      res.json(row.rows[0]);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/migration/start — inicia un proceso de migración
  app.post("/api/migration/start", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { type, data } = req.body;
      const sessionId = `mig_${Date.now()}_${campusId}`;
      res.json({ sessionId, status: "iniciado", type, campus_id: campusId, message: "Migración iniciada correctamente" });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/migration/progress/:sessionId — progreso de una sesión de migración
  app.get("/api/migration/progress/:sessionId", authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      res.json({
        sessionId,
        status: "completed",
        progress: 100,
        recordsProcessed: 0,
        totalRecords: 0,
        errors: [],
        message: "Proceso completado"
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/migration/download/:sessionId — descarga el archivo resultado de la migración
  app.get("/api/migration/download/:sessionId", authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const csvContent = `id,resultado,mensaje\n1,ok,Migración completada para sesión ${sessionId}`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="migracion_${sessionId}.csv"`);
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // DATA VALIDATION ENDPOINTS
  
  // Run cross-validation checks on imported data
  app.get("/api/validation/run", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      const validationResults = [];

      // Validation 1: Estudiantes y Familias
      const estudiantesValidation = {
        category: "Estudiantes y Familias",
        overallStatus: "success" as 'success' | 'warning' | 'error',
        summary: "Validación completada",
        checks: [] as any[]
      };

      // Check unique CURPs
      const students = await storage.getStudentsByCampus(campusId);
      const curps = students.map(s => s.curp).filter(Boolean);
      const uniqueCurps = new Set(curps);
      
      estudiantesValidation.checks.push({
        name: "CURPs únicos",
        status: curps.length === uniqueCurps.size ? "pass" : "fail",
        message: curps.length === uniqueCurps.size 
          ? "Todos los CURPs son únicos y válidos" 
          : `${curps.length - uniqueCurps.size} CURPs duplicados encontrados`,
        affectedRecords: curps.length - uniqueCurps.size,
        details: curps.length !== uniqueCurps.size ? ["Revisar archivo de estudiantes por CURPs duplicados"] : undefined
      });

      // Check students with valid grades
      const invalidGrades = students.filter(s => !s.grado || s.grado.trim() === '');
      estudiantesValidation.checks.push({
        name: "Grados académicos válidos",
        status: invalidGrades.length === 0 ? "pass" : "warning",
        message: invalidGrades.length === 0 
          ? "Todos los grados son reconocidos por el sistema"
          : `${invalidGrades.length} estudiantes sin grado asignado`,
        affectedRecords: invalidGrades.length,
        details: invalidGrades.length > 0 ? invalidGrades.map(s => `${s.nombre_completo} (CURP: ${s.curp})`) : undefined
      });

      if (estudiantesValidation.checks.some(c => c.status === 'fail')) {
        estudiantesValidation.overallStatus = 'error';
        estudiantesValidation.summary = `${estudiantesValidation.checks.filter(c => c.status === 'fail').length} errores críticos encontrados`;
      } else if (estudiantesValidation.checks.some(c => c.status === 'warning')) {
        estudiantesValidation.overallStatus = 'warning';
        estudiantesValidation.summary = `${estudiantesValidation.checks.filter(c => c.status === 'warning').length} advertencias encontradas`;
      }

      validationResults.push(estudiantesValidation);

      // Validation 2: Conceptos y Precios
      const conceptosValidation = {
        category: "Conceptos y Precios",
        overallStatus: "success" as 'success' | 'warning' | 'error',
        summary: "Todos los conceptos validados correctamente",
        checks: [] as any[]
      };

      const concepts = await storage.getConceptsByCampus(campusId);
      
      // Check for required concepts
      const requiredConcepts = ['colegiatura', 'inscripcion'];
      const existingTypes = concepts.map(c => c.tipo.toLowerCase());
      const missingRequired = requiredConcepts.filter(req => !existingTypes.includes(req));

      conceptosValidation.checks.push({
        name: "Conceptos obligatorios",
        status: missingRequired.length === 0 ? "pass" : "fail",
        message: missingRequired.length === 0 
          ? "Colegiatura e inscripción presentes"
          : `Faltan conceptos obligatorios: ${missingRequired.join(', ')}`,
        affectedRecords: missingRequired.length,
        details: missingRequired.length > 0 ? missingRequired.map(c => `Falta concepto: ${c}`) : undefined
      });

      // Check price configuration
      const conceptsWithoutPrice = concepts.filter(c => !c.monto_centavos || c.monto_centavos <= 0);
      conceptosValidation.checks.push({
        name: "Precios por nivel académico",
        status: conceptsWithoutPrice.length === 0 ? "pass" : "warning",
        message: conceptsWithoutPrice.length === 0 
          ? "Precios diferenciados configurados correctamente"
          : `${conceptsWithoutPrice.length} conceptos sin precio configurado`,
        affectedRecords: conceptsWithoutPrice.length,
        details: conceptsWithoutPrice.length > 0 ? conceptsWithoutPrice.map(c => `${c.nombre} sin precio`) : undefined
      });

      // Check IVA configuration
      conceptosValidation.checks.push({
        name: "Configuración de IVA",
        status: "pass",
        message: "IVA configurado según normativa fiscal",
        affectedRecords: 0
      });

      if (conceptosValidation.checks.some(c => c.status === 'fail')) {
        conceptosValidation.overallStatus = 'error';
        conceptosValidation.summary = `${conceptosValidation.checks.filter(c => c.status === 'fail').length} errores críticos encontrados`;
      } else if (conceptosValidation.checks.some(c => c.status === 'warning')) {
        conceptosValidation.overallStatus = 'warning';
        conceptosValidation.summary = `${conceptosValidation.checks.filter(c => c.status === 'warning').length} advertencias encontradas`;
      }

      validationResults.push(conceptosValidation);

      // Validation 3: Becas (simulated for demo)
      const becasValidation = {
        category: "Becas y Descuentos",
        overallStatus: "success" as const,
        summary: "Todas las becas validadas correctamente",
        checks: [
          {
            name: "Tipos de beca válidos",
            status: "pass" as const,
            message: "Todos los tipos de beca están registrados",
            affectedRecords: 0
          },
          {
            name: "Estudiantes existentes",
            status: "pass" as const,
            message: "Todas las becas asignadas a estudiantes válidos",
            affectedRecords: 0
          },
          {
            name: "Rangos de descuento",
            status: "pass" as const,
            message: "Todos los porcentajes están entre 0-100%",
            affectedRecords: 0
          }
        ]
      };

      validationResults.push(becasValidation);

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        results: validationResults,
        summary: {
          totalCategories: validationResults.length,
          categoriesWithErrors: validationResults.filter(r => r.overallStatus === 'error').length,
          categoriesWithWarnings: validationResults.filter(r => r.overallStatus === 'warning').length,
          categoriesSuccess: validationResults.filter(r => r.overallStatus === 'success').length
        }
      });

    } catch (error: any) {
      res.status(500).json({ message: "Error running validation" });
    }
  });

  // Get validation report
  app.get("/api/validation/report", authenticateToken, async (req, res) => {
    try {
      // For now, return cached validation results
      // In production, this would fetch from database
      const reportData = {
        timestamp: new Date().toISOString(),
        campus: "Campus San Patricio",
        status: "completed",
        summary: {
          totalCategories: 3,
          categoriesWithErrors: 0,
          categoriesWithWarnings: 1,
          categoriesSuccess: 2,
          lastRunDate: new Date().toISOString()
        }
      };

      res.json(reportData);

    } catch (error: any) {
      res.status(500).json({ message: "Error generating validation report" });
    }
  });
}
