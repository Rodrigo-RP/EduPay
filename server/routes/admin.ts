import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and, gte, lt } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, checkCampusTenant, serializeUser, upload, esmRequire, authenticateGuardian } from "./shared";
import { students, guardians, student_guardian, charges, payments, concepts, scholarships, invoices, institutional_info, institutional_credentials, payment_due_dates, payment_surcharge_rules } from "@shared/schema";
import { insertInstitutionalInfoSchema } from "@shared/schema";
import { getAcademicLevel } from "@shared/academic-levels";
import { seedAdmissionsData } from "../seed-admissions-data";
import * as XLSX from "xlsx";
import { z } from "zod";
import { wsManager } from "../websocket-manager";

export function registerAdminRoutes(app: Express): void {
  // GUARDIAN PORTAL ROUTES

  // Get guardian's students and their pending charges
  app.get("/api/guardian/dashboard", authenticateGuardian, async (req: any, res) => {
    try {
      const guardianId = req.guardian?.id;
      const tenantId = req.guardian?.tenant_id;

      // Verificar que el guardián pertenece al tenant del JWT antes de devolver datos
      if (tenantId) {
        const owned = await storage.getGuardianScoped(guardianId, tenantId);
        if (!owned) return res.status(403).json({ message: "Acceso denegado" });
      }
      
      const students = await storage.getStudentsByGuardian(guardianId);
      // Filtrar alumnos, cargos y pagos por tenant del JWT
      const tenantStudents = tenantId ? students.filter((s: any) => !s.tenant_id || s.tenant_id === tenantId) : students;
      const pendingCharges = (await storage.getPendingChargesByGuardian(guardianId))
        .filter((c: any) => !tenantId || !c.tenant_id || c.tenant_id === tenantId);
      const paymentHistory = (await storage.getPaymentsByGuardian(guardianId))
        .filter((p: any) => !tenantId || !p.tenant_id || p.tenant_id === tenantId);
      const paymentMethods = await storage.getPaymentMethodsByGuardian(guardianId);

      // Calculate total pending balance
      const totalPending = pendingCharges.reduce((sum, charge) => {
        const baseAmount = charge.monto_base_centavos;
        const discount = baseAmount * (Number(charge.beca_aplicada) / 100);
        const finalAmount = baseAmount - discount + (charge.recargo_aplicado_centavos || 0);
        return sum + finalAmount;
      }, 0);

      res.json({
        students: tenantStudents,
        pendingCharges: pendingCharges.map(charge => ({
          ...charge,
          total_amount_centavos: charge.monto_base_centavos - (charge.monto_base_centavos * Number(charge.beca_aplicada) / 100) + (charge.recargo_aplicado_centavos || 0),
        })),
        totalPendingBalance: totalPending / 100, // Convert to pesos
        paymentHistory,
        paymentMethods,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching dashboard" });
    }
  });

  // ADMIN PORTAL ROUTES

  // Get dashboard KPIs — 3 capas: ciclo / mes / alertas + desglose por nivel
  app.get("/api/admin/dashboard/:campusId", requireAuth, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;

      // Parámetros del header global: ciclo, nivel, periodo
      const now = new Date();
      const autoY  = now.getFullYear();
      const autoMo = now.getMonth() + 1;
      const ciclo  = (req.query.ciclo as string) ||
                     (autoMo >= 8 ? `${autoY}-${autoY + 1}` : `${autoY - 1}-${autoY}`);
      const rawNivel  = (req.query.nivel as string) ?? "all";
      const periodo   = (req.query.periodo as string) ?? "mes"; // hoy | semana | mes | ciclo

      // ── Filtro de nivel (ILIKE para ignorar mayúsculas) ─────────────────────
      let nivelClause = '';
      let baseParams: any[] = [campusId];
      if (rawNivel && rawNivel !== "all") {
        nivelClause = "AND UPPER(s.nivel_escolar) = UPPER($2)";
        baseParams  = [campusId, rawNivel];
      }

      // ── Rango de fechas según periodo ───────────────────────────────────────
      const hoy      = now.toISOString().split("T")[0];
      const en7dias  = new Date(now.getTime() + 7 * 86_400_000).toISOString().split("T")[0];
      let periodoInicio: string;
      let periodoFin: string;
      if (periodo === "hoy") {
        periodoInicio = hoy;
        periodoFin    = hoy;
      } else if (periodo === "semana") {
        const lunes = new Date(now);
        lunes.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const domingo = new Date(lunes);
        domingo.setDate(lunes.getDate() + 6);
        periodoInicio = lunes.toISOString().split("T")[0];
        periodoFin    = domingo.toISOString().split("T")[0];
      } else if (periodo === "ciclo") {
        const [startY] = ciclo.split("-").map(Number);
        periodoInicio = `${startY}-08-01`;
        periodoFin    = `${startY + 1}-07-31`;
      } else {
        // mes (default)
        periodoInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        periodoFin    = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      }

      // ── 1. Semáforo del ciclo ───────────────────────────────────────────────
      const cicloRes = await pool.query(`
        SELECT
          COALESCE(SUM(c.monto_base_centavos), 0)                                                          AS facturado,
          COALESCE(SUM(CASE WHEN c.estado = 'pagado'                 THEN c.monto_base_centavos END), 0)   AS cobrado,
          COALESCE(SUM(CASE WHEN c.estado IN ('pendiente','parcial') THEN c.monto_base_centavos END), 0)   AS por_cobrar,
          COALESCE(SUM(CASE WHEN c.estado = 'vencido'                THEN c.monto_base_centavos END), 0)   AS vencido,
          COUNT(DISTINCT s.id)                                                                              AS alumnos_activos,
          COUNT(DISTINCT CASE WHEN c.estado = 'vencido' THEN s.id END)                                     AS alumnos_con_adeudo
        FROM charges c
        JOIN students s ON c.student_id = s.id
        WHERE s.campus_id = $1 AND c.ciclo_escolar = $${baseParams.length + 1} ${nivelClause}
      `, [...baseParams, ciclo]);

      const cr            = cicloRes.rows[0] as any;
      const facturado     = Number(cr.facturado);
      const cobrado_ciclo = Number(cr.cobrado);
      const alumnos_act   = Number(cr.alumnos_activos);
      const alumnos_deb   = Number(cr.alumnos_con_adeudo);

      // ── 2. Pulso del mes ────────────────────────────────────────────────────
      const mesRes = await pool.query(`
        SELECT
          COALESCE(SUM(c.monto_base_centavos), 0)                                                        AS esperado,
          COALESCE(SUM(CASE WHEN c.estado = 'pagado' THEN c.monto_base_centavos END), 0)                 AS cobrado
        FROM charges c
        JOIN students s ON c.student_id = s.id
        WHERE s.campus_id = $1
          AND c.fecha_vencimiento BETWEEN $${baseParams.length + 1} AND $${baseParams.length + 2}
          ${nivelClause}
      `, [...baseParams, periodoInicio, periodoFin]);

      const mr           = mesRes.rows[0] as any;
      const esperado_mes = Number(mr.esperado);
      const cobrado_mes  = Number(mr.cobrado);

      // ── 3. Alertas operativas (siempre campus-wide) ─────────────────────────
      const [excRes, semRes, riesgoRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt FROM bank_transactions
           WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'`,
          [campusId]
        ).catch(() => ({ rows: [{ cnt: 0 }] })),
        pool.query(`
          SELECT COUNT(*) AS cnt
          FROM charges c JOIN students s ON c.student_id = s.id
          WHERE s.campus_id = $1
            AND c.estado IN ('pendiente','parcial')
            AND c.fecha_vencimiento BETWEEN $2 AND $3
        `, [campusId, hoy, en7dias]),
        pool.query(`
          SELECT COUNT(DISTINCT s.id) AS cnt
          FROM charges c JOIN students s ON c.student_id = s.id
          WHERE s.campus_id = $1
            AND c.estado = 'vencido'
            AND c.fecha_vencimiento <= CURRENT_DATE - INTERVAL '60 days'
        `, [campusId]),
      ]);

      // ── 4. Niveles disponibles en el campus (sin filtro de ciclo) ──────────
      const nivelesRes = await pool.query(`
        SELECT DISTINCT COALESCE(nivel_escolar, 'Sin nivel') AS nivel
        FROM students
        WHERE campus_id = $1
        ORDER BY nivel
      `, [campusId]);

      // ── 5. Desglose por nivel (métricas del ciclo, todos los niveles) ───────
      const desgloseRes = await pool.query(`
        SELECT
          COALESCE(s.nivel_escolar, 'Sin nivel')                                                         AS nivel,
          COALESCE(SUM(c.monto_base_centavos), 0)                                                        AS facturado,
          COALESCE(SUM(CASE WHEN c.estado = 'pagado'  THEN c.monto_base_centavos END), 0)                AS cobrado,
          COALESCE(SUM(CASE WHEN c.estado = 'vencido' THEN c.monto_base_centavos END), 0)                AS vencido,
          COUNT(DISTINCT s.id)                                                                            AS alumnos,
          COUNT(DISTINCT CASE WHEN c.estado = 'vencido' THEN s.id END)                                   AS alumnos_adeudo
        FROM charges c
        JOIN students s ON c.student_id = s.id
        WHERE s.campus_id = $1 AND c.ciclo_escolar = $2
        GROUP BY s.nivel_escolar
        ORDER BY s.nivel_escolar NULLS LAST
      `, [campusId, ciclo]);

      res.json({
        ciclo,
        ciclo_metrics: {
          facturado,
          cobrado:              cobrado_ciclo,
          por_cobrar:           Number(cr.por_cobrar),
          vencido:              Number(cr.vencido),
          pct_cumplimiento:     facturado > 0 ? Math.round(cobrado_ciclo / facturado * 100) : 0,
          alumnos_activos:      alumnos_act,
          alumnos_al_corriente: alumnos_act - alumnos_deb,
          alumnos_con_adeudo:   alumnos_deb,
        },
        mes_metrics: {
          mes_nombre: periodo === "hoy"    ? `hoy (${now.toLocaleDateString("es-MX", { day: "numeric", month: "short" })})` :
                      periodo === "semana" ? `esta semana (${periodoInicio.slice(5)} – ${periodoFin.slice(5)})` :
                      periodo === "ciclo"  ? `ciclo ${ciclo}` :
                      now.toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
          esperado:   esperado_mes,
          cobrado:    cobrado_mes,
          pendiente:  Math.max(0, esperado_mes - cobrado_mes),
          eficiencia: esperado_mes > 0 ? Math.round(cobrado_mes / esperado_mes * 100) : 0,
        },
        alertas: {
          excepciones_pendientes: Number((excRes.rows[0] as any)?.cnt ?? 0),
          vencen_semana:          Number((semRes.rows[0] as any)?.cnt  ?? 0),
          alumnos_riesgo:         Number((riesgoRes.rows[0] as any)?.cnt ?? 0),
        },
        niveles_disponibles: (nivelesRes.rows as any[]).map(r => r.nivel as string),
        desglose_nivel: (desgloseRes.rows as any[]).map(r => ({
          nivel:          r.nivel as string,
          facturado:      Number(r.facturado),
          cobrado:        Number(r.cobrado),
          vencido:        Number(r.vencido),
          alumnos:        Number(r.alumnos),
          alumnos_adeudo: Number(r.alumnos_adeudo),
        })),
      });
    } catch (error: any) {
      console.error("[dashboard] Error:", error);
      res.status(500).json({ message: "Error al cargar el dashboard" });
    }
  });

  // Get students for authenticated user's campus (no campusId in URL)
  app.get("/api/admin/students", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      const students = await storage.getStudentsByCampus(campusId);
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students" });
    }
  });

  // Get students by campus — requiere autenticación y campus del tenant
  app.get("/api/admin/students/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const students = await storage.getStudentsByCampus(campusId);
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students" });
    }
  });

  // Get guardians by campus — requiere autenticación y campus del tenant
  app.get("/api/admin/guardians/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const guardians = await storage.getGuardiansByCampus(campusId);
      res.json(guardians);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching guardians" });
    }
  });

  // Get students (real data from database)
  app.get("/api/students", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const students = await storage.getStudentsByCampus(campusId);
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students" });
    }
  });

  // Get payments (real data from database)
  app.get("/api/payments", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const payments = await storage.getPaymentsByCampus(campusId);
      res.json(payments);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching payments" });
    }
  });

  // Get charges (real data from database)
  app.get("/api/charges", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const charges = await storage.getChargesByCampus(campusId);
      res.json(charges);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching charges" });
    }
  });

  // Get accounts receivable with detailed student and guardian information
  app.get("/api/accounts-receivable", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const accountsReceivable = await storage.getAccountsReceivableByCampus(campusId);
      res.json(accountsReceivable);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching accounts receivable" });
    }
  });

  // Get scholarships (real data from database)
  app.get("/api/scholarships", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      // Becas reales del campus con tipo de beca incluido
      const rows = await pool.query(`
        SELECT s.id, s.student_id, s.porcentaje_aplicado, s.monto_fijo_aplicado_centavos,
               s.estado, s.vigencia_inicio, s.vigencia_fin, s.observaciones,
               st.nombre AS tipo_nombre, st.categoria AS tipo_categoria,
               stu.nombre_completo AS alumno
        FROM scholarships s
        JOIN students stu ON stu.id = s.student_id
        LEFT JOIN scholarship_types st ON st.id = s.scholarship_type_id
        WHERE stu.campus_id = $1
        ORDER BY s.estado, stu.nombre_completo
      `, [campusId]).catch(() => ({ rows: [] }));
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching scholarships" });
    }
  });

  // ── GET /api/students/:studentId/estado-cuenta ────────────────────────────
  // Estado de cuenta completo del alumno para el admin.
  // Incluye: tutores (responsable de pago vs. solo contacto), todos los cargos
  // con su historia de pagos, y un resumen numérico.
  app.get("/api/students/:studentId/estado-cuenta", authenticateToken, async (req: any, res) => {
    try {
      const studentId = parseInt(req.params.studentId);
      if (isNaN(studentId)) return res.status(400).json({ message: "ID de alumno inválido" });

      // Verificar que el alumno pertenece al campus del usuario autenticado
      const studentRow = await pool.query(
        `SELECT id, nombre_completo, id_referencia, grado, grupo, campus_id, tenant_id, status
         FROM students WHERE id = $1`, [studentId]
      ).catch((e: any) => { throw new Error("Error al buscar alumno: " + e.message); });
      if (!studentRow.rows.length) return res.status(404).json({ message: "Alumno no encontrado" });
      const student = studentRow.rows[0] as any;
      if (!await checkCampusTenant(student.campus_id, req.user?.tenant_id, res)) return;

      // Tutores con su rol de responsabilidad
      const tutoresResult = await pool.query(`
        SELECT g.id, g.nombre_completo, g.email, g.telefono, g.tipo_guardian AS parentesco,
               sg.es_responsable_pago, sg.porcentaje_responsabilidad
        FROM guardians g
        JOIN student_guardian sg ON sg.guardian_id = g.id
        WHERE sg.student_id = $1
        ORDER BY sg.es_responsable_pago DESC, g.nombre_completo
      `, [studentId]).catch((e: any) => { throw new Error("Error al buscar tutores: " + e.message); });

      // Cargos con beca, recargos y pagos aplicados
      const cargosResult = await pool.query(`
        SELECT c.id, c.ciclo_escolar, c.fecha_emision, c.fecha_vencimiento,
               c.monto_base_centavos, c.beca_aplicada, c.recargo_aplicado_centavos,
               c.estado, co.nombre AS concepto,
               COALESCE(SUM(pa.amount_centavos), 0)::bigint AS pagado_centavos,
               ROUND(c.monto_base_centavos * COALESCE(c.beca_aplicada,0) / 100)::bigint AS descuento_centavos
        FROM charges c
        JOIN concepts co ON co.id = c.concept_id
        LEFT JOIN payment_applications pa ON pa.charge_id = c.id
        WHERE c.student_id = $1
        GROUP BY c.id, co.nombre
        ORDER BY c.fecha_vencimiento DESC
      `, [studentId]).catch((e: any) => { throw new Error("Error al buscar cargos: " + e.message); });

      // Resumen financiero
      const cargos = cargosResult.rows as any[];
      const totalCargos = cargos.reduce((s, c) => s + Number(c.monto_base_centavos), 0);
      const totalDescuentos = cargos.reduce((s, c) => s + Number(c.descuento_centavos), 0);
      const totalRecargos = cargos.reduce((s, c) => s + Number(c.recargo_aplicado_centavos || 0), 0);
      const totalPagado = cargos.reduce((s, c) => s + Number(c.pagado_centavos), 0);
      const saldoPendiente = totalCargos - totalDescuentos + totalRecargos - totalPagado;

      res.json({
        alumno: student,
        tutores: (tutoresResult.rows as any[]).map(t => ({
          ...t,
          rol: t.es_responsable_pago ? "responsable_pago" : "solo_contacto",
        })),
        cargos,
        resumen: {
          total_cargos_centavos:    totalCargos,
          total_descuentos_centavos: totalDescuentos,
          total_recargos_centavos:  totalRecargos,
          total_pagado_centavos:    totalPagado,
          saldo_pendiente_centavos: Math.max(0, saldoPendiente),
        },
      });
    } catch (error: any) {
      console.error("[estado-cuenta]", error.message);
      if (!res.headersSent) res.status(500).json({ message: "Error en estado de cuenta" });
    }
  });

  // ── GET /api/admin/admissions-report ──────────────────────────────────────
  // Reporte de admisiones con sección de becas reales.
  // Devuelve: métricas de inscripción + becas activas, monto descontado y
  // distribución por tipo de beca.
  app.get("/api/admin/admissions-report", authenticateToken, async (req: any, res) => {
    try {
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus ID requerido" });

      // ── Becas activas ──────────────────────────────────────────────────
      const becasActivasResult = await pool.query(`
        SELECT COUNT(*)::int            AS total_activas,
               COUNT(DISTINCT s.student_id)::int AS alumnos_con_beca
        FROM scholarships s
        JOIN students stu ON stu.id = s.student_id
        WHERE stu.campus_id = $1 AND s.estado = 'activa'
      `, [campusId]).catch(() => ({ rows: [{ total_activas: 0, alumnos_con_beca: 0 }] }));

      // ── Monto total descontado (beca_aplicada > 0) ────────────────────
      const montoResult = await pool.query(`
        SELECT COALESCE(SUM(
          ROUND(c.monto_base_centavos * CAST(c.beca_aplicada AS NUMERIC) / 100)
        ), 0)::bigint AS monto_total_descuento_centavos
        FROM charges c
        JOIN students stu ON stu.id = c.student_id
        WHERE stu.campus_id = $1 AND CAST(c.beca_aplicada AS NUMERIC) > 0
      `, [campusId]).catch(() => ({ rows: [{ monto_total_descuento_centavos: 0 }] }));

      // ── Distribución por tipo de beca ─────────────────────────────────
      const distribucionResult = await pool.query(`
        SELECT st.nombre     AS tipo,
               st.categoria  AS categoria,
               COUNT(*)::int AS cantidad,
               COALESCE(SUM(s.porcentaje_aplicado), 0)::int AS porcentaje_total
        FROM scholarships s
        JOIN students stu ON stu.id = s.student_id
        LEFT JOIN scholarship_types st ON st.id = s.scholarship_type_id
        WHERE stu.campus_id = $1 AND s.estado = 'activa'
        GROUP BY st.id, st.nombre, st.categoria
        ORDER BY cantidad DESC
      `, [campusId]).catch(() => ({ rows: [] }));

      // ── Inscripciones del ciclo actual ────────────────────────────────
      const cicloActual = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
      const inscripcionesResult = await pool.query(`
        SELECT COUNT(DISTINCT c.id)::int       AS total,
               COALESCE(SUM(pa.amount_centavos), 0)::bigint AS monto_centavos
        FROM payment_applications pa
        JOIN charges c   ON c.id  = pa.charge_id
        JOIN concepts co ON co.id = c.concept_id
        JOIN students stu ON stu.id = c.student_id
        JOIN payments p  ON p.id  = pa.payment_id
        WHERE stu.campus_id = $1
          AND LOWER(co.nombre) LIKE '%inscripci%'
          AND (c.ciclo_escolar = $2 OR (c.ciclo_escolar IS NULL AND p.created_at >= date_trunc('year', NOW())))
          AND p.estado = 'exitoso'
      `, [campusId, cicloActual]).catch(() => ({ rows: [{ total: 0, monto_centavos: 0 }] }));

      res.json({
        becas: {
          total_activas:                 becasActivasResult.rows[0].total_activas,
          alumnos_con_beca:              becasActivasResult.rows[0].alumnos_con_beca,
          monto_total_descuento_centavos: Number(montoResult.rows[0].monto_total_descuento_centavos),
          por_tipo:                      distribucionResult.rows,
        },
        inscripciones: {
          total:          inscripcionesResult.rows[0].total,
          monto_centavos: Number(inscripcionesResult.rows[0].monto_centavos),
          ciclo:          cicloActual,
        },
      });
    } catch (error: any) {
      console.error("[admissions-report]", error.message);
      if (!res.headersSent) res.status(500).json({ message: "Error en reporte de admisiones" });
    }
  });

  // Create new student
  app.post("/api/admin/students", authenticateToken, async (req, res) => {
    try {
      const studentData = req.body;
      const user = (req as any).user;
      
      // campus_id y tenant_id SIEMPRE se derivan del JWT, nunca del body del request
      studentData.campus_id = user.campus_id;
      studentData.tenant_id = user.tenant_id;
      
      const student = await storage.createStudent(studentData);
      
      // Notify real-time update
      wsManager.notifyStudentUpdate(student, 'create', {
        campus_id: studentData.campus_id || user.campus_id,
        tenant_id: user.tenant_id,
        created_by: user.id
      });
      
      res.status(201).json(student);
    } catch (error: any) {
      res.status(500).json({ message: "Error creating student" });
    }
  });

  /**
   * GET /api/admin/students/:studentId/guardians
   * Devuelve los tutores vinculados a un alumno con su estado de responsabilidad de pago.
   * Solo accesible para administradores del mismo tenant.
   */
  app.get("/api/admin/students/:studentId/guardians", authenticateToken, async (req: any, res) => {
    try {
      const studentId = parseInt(req.params.studentId);
      const tenantId  = req.user?.tenant_id;

      // Verificar que el alumno pertenece al tenant del usuario
      const studentCheck = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND tenant_id = $2`,
        [studentId, tenantId]
      );
      if (studentCheck.rows.length === 0) {
        return res.status(404).json({ message: "Alumno no encontrado" });
      }

      const result = await pool.query(`
        SELECT
          g.id,
          g.nombres,
          g.apellido_paterno,
          g.apellido_materno,
          g.nombre_completo,
          g.tipo_guardian,
          g.es_padre,
          g.es_madre,
          g.email,
          g.correo_institucional_familiar,
          g.celular,
          g.telefono,
          g.telefono_casa_oficina,
          sg.es_responsable_pago,
          sg.porcentaje_responsabilidad
        FROM student_guardian sg
        JOIN guardians g ON g.id = sg.guardian_id
        WHERE sg.student_id = $1
        ORDER BY sg.es_responsable_pago DESC, g.apellido_paterno ASC
      `, [studentId]);

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * PATCH /api/admin/students/:studentId/guardians/:guardianId
   * Actualiza es_responsable_pago y/o porcentaje_responsabilidad en student_guardian.
   * Valida que no se deje al alumno sin ningún responsable de pago.
   */
  app.patch("/api/admin/students/:studentId/guardians/:guardianId", authenticateToken, async (req: any, res) => {
    try {
      const studentId  = parseInt(req.params.studentId);
      const guardianId = parseInt(req.params.guardianId);
      const tenantId   = req.user?.tenant_id;
      const { es_responsable_pago, porcentaje_responsabilidad } = req.body;

      // Verificar tenant
      const studentCheck = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND tenant_id = $2`,
        [studentId, tenantId]
      );
      if (studentCheck.rows.length === 0) {
        return res.status(404).json({ message: "Alumno no encontrado" });
      }

      // Si se intenta desactivar, verificar que quede al menos otro responsable
      if (es_responsable_pago === false) {
        const otrosResponsables = await pool.query(`
          SELECT COUNT(*) AS cnt
          FROM student_guardian
          WHERE student_id = $1
            AND guardian_id != $2
            AND es_responsable_pago = true
        `, [studentId, guardianId]);

        if (Number((otrosResponsables.rows[0] as any).cnt) === 0) {
          return res.status(422).json({
            message: "No se puede desactivar: el alumno quedaría sin ningún responsable de pago. Asigna primero a otro tutor como responsable."
          });
        }
      }

      // Construir campos a actualizar
      const updates: string[] = [];
      const values: any[]    = [];
      let idx = 1;

      if (es_responsable_pago !== undefined) {
        updates.push(`es_responsable_pago = $${idx++}`);
        values.push(es_responsable_pago);
      }
      if (porcentaje_responsabilidad !== undefined) {
        updates.push(`porcentaje_responsabilidad = $${idx++}`);
        values.push(porcentaje_responsabilidad);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "Sin campos para actualizar" });
      }

      values.push(studentId, guardianId);
      const result = await pool.query(`
        UPDATE student_guardian
        SET ${updates.join(", ")}
        WHERE student_id = $${idx} AND guardian_id = $${idx + 1}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Relación alumno-tutor no encontrada" });
      }

      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Export students to Excel/CSV
  app.get("/api/admin/students/:campusId/export", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const format = req.query.format as string || 'xlsx';
      
      const students = await storage.getStudentsByCampus(campusId);
      
      // Transform data for export
      const exportData = students.map(student => ({
        'ID': student.id,
        'CURP': student.curp || '',
        'Nombre Completo': student.nombre_completo,
        'Grado': student.grado || '',
        'Grupo': student.grupo || '',
        'Estatus': student.status,
        'Fecha de Registro': student.created_at ? new Date(student.created_at).toLocaleDateString('es-MX') : ''
      }));

      if (format === 'csv') {
        // CSV Export
        const csvHeader = Object.keys(exportData[0] || {}).join(',');
        const csvRows = exportData.map(row => 
          Object.values(row).map(value => `"${value}"`).join(',')
        );
        const csvContent = [csvHeader, ...csvRows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="estudiantes_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send('\uFEFF' + csvContent); // BOM for UTF-8
      } else {
        // Excel Export
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Auto-adjust column widths
        const colWidths = Object.keys(exportData[0] || {}).map(key => ({
          wch: Math.max(key.length, 15)
        }));
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes');
        
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="estudiantes_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buffer);
      }
    } catch (error: any) {
      res.status(500).json({ message: "Error exporting students" });
    }
  });

  // Import students from Excel/CSV
  app.post("/api/admin/students/import", authenticateToken, upload.single('file'), async (req, res) => {
    try {
      const user = (req as any).user;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No se proporcionó archivo" });
      }

      let jsonData: any[] = [];
      
      // Process file based on type
      if (file.mimetype === 'text/csv') {
        // Parse CSV
        const csvContent = file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // Remove BOM
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          return res.status(400).json({ message: "El archivo CSV debe tener al menos una fila de encabezados y una fila de datos" });
        }
        
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || '';
          });
          if (obj['Nombre Completo'] || obj['CURP']) { // Only add rows with essential data
            jsonData.push(obj);
          }
        }
      } else {
        // Parse Excel
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(sheet);
      }

      if (jsonData.length === 0) {
        return res.status(400).json({ message: "No se encontraron datos válidos en el archivo" });
      }

      // Transform and validate data
      const studentsToCreate = [];
      const errors = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNum = i + 2; // Account for header row
        
        try {
          // Map column names (flexible mapping)
          const studentData = {
            campus_id: user.campus_id,
            tenant_id: user.tenant_id,  // SIEMPRE del JWT
            curp: row['CURP'] || row['curp'] || '',
            nombres: row['Nombre Completo'] || row['nombre_completo'] || row['Nombre'] || '',
            grado: row['Grado'] || row['grado'] || '',
            grupo: row['Grupo'] || row['grupo'] || '',
            status: row['Estatus'] || row['status'] || row['Status'] || 'activo'
          };

          // Validate required fields
          if (!studentData.nombres.trim()) {
            errors.push(`Fila ${rowNum}: Nombre completo es requerido`);
            continue;
          }

          // Validate CURP format if provided
          if (studentData.curp && studentData.curp.length !== 18) {
            errors.push(`Fila ${rowNum}: CURP debe tener 18 caracteres`);
            continue;
          }

          studentsToCreate.push(studentData);
        } catch (error) {
          errors.push(`Fila ${rowNum}: Error procesando datos`);
        }
      }

      if (errors.length > 0 && studentsToCreate.length === 0) {
        return res.status(400).json({ 
          message: "No se pudieron procesar los datos",
          errors: errors 
        });
      }

      // Create students in batch
      const createdStudents = [];
      const creationErrors = [];

      for (const studentData of studentsToCreate) {
        try {
          const student = await storage.createStudent(studentData);
          createdStudents.push(student);
          
          // Notify real-time update
          wsManager.notifyStudentUpdate(student, 'create', {
            campus_id: user.campus_id,
            tenant_id: user.tenant_id,
            created_by: user.id
          });
        } catch (error: any) {
          creationErrors.push(`Error creando estudiante ${studentData.nombres}: ${error.message}`);
        }
      }

      res.json({
        message: `Importación completada`,
        total_processed: jsonData.length,
        successful: createdStudents.length,
        errors: [...errors, ...creationErrors],
        created_students: createdStudents
      });

    } catch (error: any) {
      res.status(500).json({ message: "Error importing students" });
    }
  });
}
