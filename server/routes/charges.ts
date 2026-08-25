import type { Express } from "express";
import { pool, db } from "../db";
import { enqueueAuditLog } from "../audit-retry";
import { eq, and, gte, lt } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, checkCampusTenant, upload, hasPermissionForUser} from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { students, guardians, student_guardian, charges, payments, concepts, scholarships, payment_due_dates, payment_surcharge_rules, invoices } from "@shared/schema";
import { insertChargeSchema } from "@shared/schema";
import { getAcademicLevel } from "@shared/academic-levels";
import { wsManager } from "../websocket-manager";
import { z } from "zod";
import { resolveEffectiveScholarship } from "../lib/scholarship-engine";

export function registerChargesRoutes(app: Express): void {
  app.get("/api/admin/concepts/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const concepts = await storage.getConceptsByCampus(campusId);
      
      res.json(concepts);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching concepts" });
    }
  });

  // Create new concept
  app.post("/api/admin/concepts", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CONCEPTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar conceptos" });
      }
      // campus_id y tenant_id SIEMPRE del JWT — nunca del body (previene cross-tenant)
      const conceptData = { ...req.body };
      conceptData.campus_id = req.user?.campus_id;
      conceptData.tenant_id = req.user?.tenant_id;

      // Verificar campus pertenece al tenant antes de crear
      if (conceptData.campus_id && conceptData.tenant_id) {
        const owned = await storage.getCampusScoped(conceptData.campus_id, conceptData.tenant_id);
        if (!owned) {
          return res.status(403).json({ message: "Acceso denegado: campus no pertenece a este tenant" });
        }
      }

      const concept = await storage.createConcept(conceptData);
      res.status(201).json(concept);
    } catch (error: any) {
      res.status(500).json({ message: "Error creating concept" });
    }
  });

  // Bulk create charges
  app.post("/api/admin/charges/bulk", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.CHARGES, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para crear cargos en masa" });
      }
      const { campus_id, concept_id, ciclo_escolar, fecha_vencimiento } = req.body;
      const user = (req as any).user;
      const tenantId = user?.tenant_id;
      const campusId = Number(user?.campus_id);

      // El campus efectivo es el de la sesión: no basta que pertenezca al mismo tenant.
      if (!Number.isSafeInteger(Number(campus_id)) || Number(campus_id) !== campusId) {
        return res.status(403).json({ message: "El campus solicitado no coincide con tu sesión" });
      }

      const students = await storage.getStudentsByCampus(campusId);
      const concepts = await storage.getConceptsByCampus(campusId);
      const concept = concepts.find(c => c.id === concept_id);
      
      if (!concept) {
        return res.status(404).json({ message: "Concept not found" });
      }

      const charges = [];
      for (const student of students) {
        if (student.status === 'activo') {
          const scholarship = await resolveEffectiveScholarship(pool, {
            studentId: Number(student.id),
            campusId,
            tenantId: Number(user.tenant_id ?? student.tenant_id),
            conceptType: concept.tipo,
          });
          const charge = await storage.createCharge({
            student_id: student.id,
            concept_id: concept.id,
            tenant_id: user.tenant_id ?? student.tenant_id,
            ciclo_escolar,
            fecha_emision: new Date().toISOString().split('T')[0],
            fecha_vencimiento,
            monto_base_centavos: concept.monto_centavos,
            beca_aplicada: scholarship.effectivePercentage.toFixed(2),
            recargo_aplicado_centavos: 0,
            estado: "pendiente",
          });
          if (scholarship.scholarshipId && scholarship.effectivePercentage > 0) {
            await pool.query(
              `INSERT INTO charge_scholarship_applications
                (charge_id, scholarship_id, tenant_id, effective_percentage, source)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (charge_id, scholarship_id) DO NOTHING`,
              [charge.id, scholarship.scholarshipId, user.tenant_id ?? student.tenant_id, scholarship.effectivePercentage, scholarship.source],
            );
          }
          charges.push(charge);
        }
      }

      // Notify real-time update for bulk charges
      if (charges.length > 0) {
        wsManager.notifyPaymentUpdate(
          { bulk_operation: true, charges_created: charges.length }, 
          'create', 
          {
            campus_id: campusId,
            tenant_id: user.tenant_id,
            created_by: user.id
          }
        );
      }

      res.status(201).json({ 
        message: `Created ${charges.length} charges successfully`,
        charges: charges.length 
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating charges" });
    }
  });

  // Get statistics for charge emission
  // /api/admin/cargos — base GET (alias de listado de cargos para cache invalidation)
  app.get("/api/admin/cargos", authenticateToken, async (req: any, res: any) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.CHARGES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver cargos" });
      }
      const campusId = req.user?.campus_id;
      const rows = await pool.query(`
        SELECT c.*,
               COALESCE(NULLIF(s.nombre_completo, ''), TRIM(CONCAT_WS(' ', s.nombres, s.apellido_paterno))) AS estudiante,
               con.nombre AS concepto_nombre,
               con.tipo AS concepto_tipo
          FROM charges c
          JOIN students s ON s.id = c.student_id
          LEFT JOIN concepts con ON con.id = c.concept_id
         WHERE s.campus_id = $1
         ORDER BY c.created_at DESC
         LIMIT 200
      `, [campusId]).catch(()=>({rows:[]}));
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.get("/api/admin/cargos/estadisticas", authenticateToken, async (req: any, res: any) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.CHARGES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver estadísticas de cargos" });
      }
      const campusId = req.user.campus_id;
      const [studentsResult, conceptsResult] = await Promise.all([
        storage.getStudentsByCampus(campusId),
        storage.getConceptsByCampus(campusId)
      ]);
      const activeStudents = studentsResult.filter((s: any) => s.status === 'activo');
      const avgAmount = conceptsResult.length > 0 ? (conceptsResult[0].monto_centavos || 450000) : 450000;
      res.json({
        alumnos_activos: activeStudents.length,
        conceptos_configurados: conceptsResult.length,
        monto_estimado: activeStudents.length * avgAmount,
        periodo: req.query.period || new Date().toISOString().slice(0, 7)
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo estadísticas" });
    }
  });

  // Generate monthly charges for all active students
  app.post("/api/admin/cargos/generar-mensual", authenticateToken, async (req: any, res: any) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.CHARGES, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para generar cargos mensuales" });
      }
      const campusId = req.user.campus_id;
      const { periodo, ciclo_escolar } = req.body;
      const students = await storage.getStudentsByCampus(campusId);
      const concepts = await storage.getConceptsByCampus(campusId);
      const activeStudents = students.filter((s: any) => s.status === 'activo');
      if (activeStudents.length === 0) return res.status(400).json({ message: "No hay alumnos activos en este campus" });
      const concept = concepts.find((c: any) => c.nombre?.toLowerCase().includes('colegiatura')) || concepts[0];
      if (!concept) return res.status(400).json({ message: "No hay conceptos configurados" });
      const fechaVencimiento = periodo ? `${periodo}-15` : new Date().toISOString().split('T')[0];
      const fechaEmision = new Date().toISOString().split('T')[0];
      let created = 0;
      const monthlyUser = (req as any).user;
      for (const student of activeStudents) {
        const scholarship = await resolveEffectiveScholarship(pool, {
          studentId: Number(student.id),
          campusId: Number(campusId),
          tenantId: Number(monthlyUser?.tenant_id ?? (student as any).tenant_id),
          chargeDate: fechaEmision,
          conceptType: concept.tipo,
        });
        await storage.createCharge({
          student_id: student.id,
          concept_id: concept.id,
          tenant_id: monthlyUser?.tenant_id ?? (student as any).tenant_id,
          ciclo_escolar: ciclo_escolar || new Date().getFullYear().toString(),
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaVencimiento,
          monto_base_centavos: concept.monto_centavos || 450000,
          beca_aplicada: scholarship.effectivePercentage.toFixed(2),
          recargo_aplicado_centavos: 0,
          estado: 'pendiente'
        });
        created++;
      }
      res.json({ message: `${created} cargos mensuales generados`, cargos_creados: created, periodo });
    } catch (error: any) {
      res.status(500).json({ message: "Error generando cargos" });
    }
  });

  // Create extraordinary charge for a specific student
  app.post("/api/admin/cargos/extraordinario", authenticateToken, async (req: any, res: any) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CHARGES, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para crear cargos" });
      }
      const campusId = req.user.campus_id;
      const tenantId = req.user.tenant_id;
      const { student_id, concept_id, monto, descripcion, fecha_vencimiento } = req.body;
      if (!student_id || !monto) return res.status(400).json({ message: "Estudiante y monto son requeridos" });

      // IDOR PROTECTION: verificar que el alumno pertenece al tenant del usuario autenticado
      if (tenantId) {
        const ownedStudent = await storage.getStudentScoped(parseInt(student_id), tenantId);
        if (!ownedStudent) {
          return res.status(403).json({ message: "Acceso denegado: el alumno no pertenece a este tenant" });
        }
      }

      let conceptId = concept_id;
      // Si se provee concept_id, validar que pertenece al tenant
      if (conceptId && tenantId) {
        const ownedConcept = await storage.getConceptScoped(parseInt(conceptId), tenantId);
        if (!ownedConcept) {
          return res.status(403).json({ message: "Acceso denegado: el concepto no pertenece a este tenant" });
        }
      }
      if (!conceptId && descripcion) {
        const concepts = await storage.getConceptsByCampus(campusId);
        let found = concepts.find((c: any) => c.nombre === descripcion);
        if (!found) {
          found = await storage.createConcept({
            campus_id: campusId,
            tenant_id: tenantId,  // tenant_id SIEMPRE del JWT
            nombre: descripcion || 'Cargo Extraordinario',
            tipo: 'extraordinario',
            periodicidad: 'unica',
            monto_centavos: Math.round(parseFloat(monto) * 100)
          });
        }
        conceptId = found.id;
      }
      const extraUser = (req as any).user;
      const charge = await storage.createCharge({
        student_id: parseInt(student_id),
        concept_id: conceptId,
        tenant_id: extraUser?.tenant_id,
        ciclo_escolar: new Date().getFullYear().toString(),
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: fecha_vencimiento || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        monto_base_centavos: Math.round(parseFloat(monto) * 100),
        beca_aplicada: '0.00',
        recargo_aplicado_centavos: 0,
        estado: 'pendiente'
      });
      res.status(201).json({ message: "Cargo extraordinario creado", charge });
    } catch (error: any) {
      res.status(500).json({ message: "Error creando cargo extraordinario" });
    }
  });

  // Get overdue students list
  app.get("/api/admin/cargos/morosos", authenticateToken, async (req: any, res: any) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.CHARGES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver morosos" });
      }
      const campusId = req.user.campus_id;
      const rows = await pool.query(`
        SELECT s.id, CONCAT(s.nombres, ' ', s.apellido_paterno) AS nombre_completo,
          s.nivel_escolar, s.grado, s.grupo,
          COALESCE(SUM(c.monto_base_centavos),0) AS adeudo_centavos,
          COUNT(c.id) AS cargos_vencidos
        FROM students s
        JOIN charges c ON c.student_id = s.id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE
        GROUP BY s.id, s.nombres, s.apellido_paterno, s.nivel_escolar, s.grado, s.grupo
        ORDER BY adeudo_centavos DESC
      `, [campusId]);
      res.json((rows.rows as any[]).map(r => ({
        ...r,
        adeudo_centavos: Number(r.adeudo_centavos || 0),
        cargos_vencidos: Number(r.cargos_vencidos || 0)
      })));
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo morosos" });
    }
  });

  // Apply late fee surcharges to overdue charges
  app.post("/api/admin/cargos/aplicar-recargos", authenticateToken, async (req: any, res: any) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
        return res.status(403).json({ message: "Sin permisos para procesar pagos" });
      }
      const campusId = req.user.campus_id;
      const rules = await storage.getSurchargeRulesByCampus(campusId);
      if (rules.length === 0) return res.json({ message: "No hay reglas de recargo configuradas", actualizados: 0 });
      const rule = rules.find((r: any) => r.activo) || rules[0];
      // date − date en PostgreSQL devuelve INTEGER (días), no interval.
      // EXTRACT(DAY FROM integer) no existe → usamos la resta directamente.
      // El LEFT JOIN a concepts ya no es necesario: la exención usa c.es_adeudo_migrado.
      const overdueCharges = await pool.query(`
        SELECT c.id, c.monto_base_centavos,
          (CURRENT_DATE - c.fecha_vencimiento::date) AS dias_vencido
        FROM charges c
        JOIN students s ON s.id = c.student_id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente' AND c.fecha_vencimiento < CURRENT_DATE
          AND (c.recargo_aplicado_centavos IS NULL OR c.recargo_aplicado_centavos = 0)
          AND NOT c.es_adeudo_migrado
      `, [campusId]);
      let actualizados = 0;
      for (const charge of (overdueCharges.rows as any[])) {
        const diasVencido = Math.max(0, Number(charge.dias_vencido) - (rule.dias_gracia || 0));
        if (diasVencido <= 0) continue;
        let recargo = 0;
        if ((rule as any).tipo === 'porcentaje' && rule.porcentaje) {
          recargo = Math.round(charge.monto_base_centavos * (Number(rule.porcentaje) / 100));
        } else if ((rule as any).tipo === 'fijo' && rule.monto_fijo_centavos) {
          recargo = rule.monto_fijo_centavos;
        }
        if (recargo > 0) {
          await pool.query(`UPDATE charges SET recargo_aplicado_centavos = $1 WHERE id = $2`, [recargo, charge.id]);
          actualizados++;
        }
      }
      res.json({ message: `Recargos aplicados a ${actualizados} cargos`, actualizados });
    } catch (error: any) {
      res.status(500).json({ message: "Error aplicando recargos" });
    }
  });

  // Apply charges from the persisted catalog with automatic academic level pricing.
  app.post("/api/admin/cargos/desde-catalogo", authenticateToken, async (req: any, res: any) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.CHARGES, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para aplicar cargos desde catálogo" });
      }

      const { producto_id, fecha_emision, fecha_vencimiento, ciclo_escolar } = req.body ?? {};
      const campusId = Number(req.user?.campus_id);
      const tenantId = Number(req.user?.tenant_id);
      const productId = Number(producto_id);
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({ message: "producto_id es obligatorio" });
      }
      if (fecha_emision && fecha_vencimiento && fecha_vencimiento < fecha_emision) {
        return res.status(400).json({ message: "La fecha de vencimiento no puede ser anterior a la fecha de emisión" });
      }

      const productResult = await pool.query(
        `SELECT id, campus_id, tenant_id, nombre, categoria, activo,
                precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato
           FROM products WHERE id = $1`,
        [productId],
      );
      if (!productResult.rows.length) {
        return res.status(404).json({ message: "Producto no encontrado en el catálogo" });
      }
      const product = productResult.rows[0] as any;
      if (Number(product.campus_id) !== campusId || Number(product.tenant_id) !== tenantId) {
        return res.status(403).json({ message: "El producto no pertenece a este campus" });
      }
      if (!product.activo) {
        return res.status(422).json({ message: "El producto está inactivo y no puede generar cargos" });
      }

      const pricesByLevel: Record<string, number> = {
        KINDER: Number(product.precio_kinder),
        PRIMARIA: Number(product.precio_primaria),
        SECUNDARIA: Number(product.precio_secundaria),
        BACHILLERATO: Number(product.precio_bachillerato),
      };
      const defaultConceptAmount = Math.max(0, ...Object.values(pricesByLevel));
      let concept = (await storage.getConceptsByCampus(campusId))
        .find((item: any) => item.nombre === product.nombre);
      if (!concept) {
        concept = await storage.createConcept({
          campus_id: campusId,
          tenant_id: tenantId,
          nombre: product.nombre,
          tipo: String(product.categoria).toLowerCase(),
          periodicidad: "unica",
          monto_centavos: defaultConceptAmount,
        });
      }

      const today = new Date().toISOString().split("T")[0];
      const dueDate = fecha_vencimiento || (() => {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date.toISOString().split("T")[0];
      })();
      const schoolYear = ciclo_escolar || (() => {
        const year = new Date().getFullYear();
        return new Date().getMonth() + 1 >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
      })();

      const students = await storage.getStudentsByCampus(campusId);
      const summary: Array<{ student_id: number; student_name: string; grade: string; academic_level: string; amount: number }> = [];
      const skippedWithoutPrice: Array<{ student_id: number; student_name: string; academic_level: string }> = [];

      for (const student of students) {
        if (student.status !== "activo") continue;
        const academicLevel = getAcademicLevel(student.grado);
        const amount = pricesByLevel[academicLevel] || 0;
        if (amount <= 0) {
          skippedWithoutPrice.push({
            student_id: student.id,
            student_name: student.nombre_completo || "Alumno sin nombre",
            academic_level: academicLevel,
          });
          continue;
        }
        const scholarship = await resolveEffectiveScholarship(pool, {
          studentId: Number(student.id),
          campusId,
          tenantId,
          chargeDate: fecha_emision || today,
          conceptType: concept.tipo,
        });
        const charge = await storage.createCharge({
          student_id: student.id,
          concept_id: concept.id,
          tenant_id: tenantId,
          ciclo_escolar: schoolYear,
          fecha_emision: fecha_emision || today,
          fecha_vencimiento: dueDate,
          monto_base_centavos: amount,
          beca_aplicada: scholarship.effectivePercentage.toFixed(2),
          recargo_aplicado_centavos: 0,
          estado: "pendiente",
        });
        if (scholarship.scholarshipId && scholarship.effectivePercentage > 0) {
          await pool.query(
            `INSERT INTO charge_scholarship_applications
              (charge_id, scholarship_id, tenant_id, effective_percentage, source)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (charge_id, scholarship_id) DO NOTHING`,
            [charge.id, scholarship.scholarshipId, tenantId, scholarship.effectivePercentage, scholarship.source],
          );
        }
        summary.push({
          student_id: student.id,
          student_name: student.nombre_completo || "Alumno sin nombre",
          grade: student.grado || "",
          academic_level: academicLevel,
          amount,
        });
      }

      res.status(201).json({
        message: `Se aplicaron ${summary.length} cargos con precios por nivel`,
        charges_created: summary.length,
        skipped_without_price: skippedWithoutPrice.length,
        product_name: product.nombre,
        summary,
        skipped: skippedWithoutPrice,
      });
    } catch (error: any) {
      console.error("Error applying catalog charges:", error);
      res.status(500).json({ message: "Error aplicando cargos desde catálogo" });
    }
  });

  // ── ADR-002: Pago manual admin de un cargo / cuota de plan ───────────────
  app.post("/api/admin/charges/:chargeId/pagar-manual", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CHARGES, ACTIONS.UPDATE)) {
        return res.status(403).json({ message: "Sin permisos para modificar cargos" });
      }
      const tenantId = req.user?.tenant_id;
      const userId   = req.user?.id;
      const campusId = req.user?.campus_id;
      const chargeId = parseInt(req.params.chargeId);
      const { metodo = "efectivo", observaciones } = req.body;

      const client = await pool.connect();
      let paymentId: number;
      let saldo = 0;
      try {
        await client.query("BEGIN");

        // El cargo y su saldo se leen bajo el mismo lock que protege la escritura.
        // Así dos pagos manuales concurrentes no pueden cobrar el mismo saldo.
        const chargeRes = await client.query(
          `SELECT c.id, c.monto_base_centavos, c.recargo_aplicado_centavos,
                  c.estado, c.student_id, c.plan_id
             FROM charges c
             JOIN students s ON s.id = c.student_id
            WHERE c.id = $1
              AND c.tenant_id = $2
              AND s.campus_id = $3
            FOR UPDATE OF c`,
          [chargeId, tenantId, campusId]
        );
        if ((chargeRes.rows as any[]).length === 0) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "Acceso denegado: cargo no encontrado o no pertenece a este campus" });
        }
        const charge = (chargeRes.rows as any[])[0];

        if (charge.estado === "pagado") {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya está pagado" });
        }
        if (charge.estado === "cancelado") {
          await client.query("ROLLBACK");
          return res.status(422).json({ message: "No se puede pagar un cargo cancelado" });
        }

        const saldoRes = await client.query(
          `SELECT COALESCE(SUM(pa.amount_centavos), 0) AS aplicado
             FROM payment_applications pa
            WHERE pa.charge_id = $1`,
          [chargeId]
        );
        const aplicado = Number((saldoRes.rows as any[])[0].aplicado);
        saldo = Number(charge.monto_base_centavos)
          + Number(charge.recargo_aplicado_centavos || 0)
          - aplicado;

        if (saldo <= 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya tiene saldo cero" });
        }

        const payRow = await client.query(
          `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado)
           VALUES ($1, $2, $3, $4, CURRENT_DATE, 'exitoso') RETURNING id`,
          [tenantId, chargeId, metodo, saldo]
        );
        paymentId = (payRow.rows as any[])[0].id;

        await client.query(
          `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
           VALUES ($1, $2, $3, NOW())`,
          [paymentId, chargeId, saldo]
        );

        await client.query(
          `UPDATE charges
              SET estado = 'pagado', updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2`,
          [chargeId, tenantId]
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // Audit FUERA de la transacción (ADR-001)
      if (tenantId && userId) {
        const auditPayloadManual: import("../audit-retry").AuditLogPayload = {
          tenant_id:   tenantId,
          user_id:     userId,
          action:      "pago_manual_admin",
          entity_type: "charge",
          entity_id:   chargeId,
          metadata:    { payment_id: paymentId!, metodo, saldo_centavos: saldo, observaciones },
        };
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1,$2,'pago_manual_admin','charge',$3,$4)`,
          [tenantId, userId, chargeId, JSON.stringify(auditPayloadManual.metadata)]
        ).catch((err) => enqueueAuditLog(auditPayloadManual, err));
      }

      // Notificar en tiempo real
      wsManager.broadcastToCampus({ type: "payment_update", data: "create" }, req.user?.campus_id);

      res.json({ message: "Cargo marcado como pagado correctamente", payment_id: paymentId!, saldo_pagado_centavos: saldo });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
