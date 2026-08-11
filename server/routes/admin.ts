import type { Express } from "express";
import { pool, db } from "../db";
import { enqueueAuditLog } from "../audit-retry";
import { eq, and, gte, lt } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, checkCampusTenant, serializeUser, upload, esmRequire, authenticateGuardian } from "./shared";
import { hasPermission, MODULES, ACTIONS } from "@shared/permissions";
import { students, guardians, student_guardian, charges, payments, concepts, scholarships, invoices, institutional_info, institutional_credentials, payment_due_dates, payment_surcharge_rules } from "@shared/schema";
import { insertInstitutionalInfoSchema } from "@shared/schema";
import { getAcademicLevel } from "@shared/academic-levels";
import { seedAdmissionsData } from "../seed-admissions-data";
import * as XLSX from "xlsx";
import { z } from "zod";
import jwt from "jsonwebtoken";
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
      const role = (req as any).user?.role;
      if (!hasPermission(role, MODULES.STUDENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver alumnos" });
      }
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
      if (!hasPermission(req.user?.role, MODULES.STUDENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver alumnos" });
      }
      const students = await storage.getStudentsByCampus(campusId);
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students" });
    }
  });

  // Get guardians by campus — requiere autenticación y campus del tenant
  app.get("/api/admin/guardians/:campusId", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermission(req.user?.role, MODULES.FAMILIES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver tutores" });
      }
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
      const role = (req as any).user?.role;
      if (!hasPermission(role, MODULES.STUDENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver alumnos" });
      }
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
      if (!hasPermission((req as any).user?.role, MODULES.PAYMENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver pagos" });
      }
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
      if (!hasPermission((req as any).user?.role, MODULES.CHARGES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver cargos" });
      }
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
      if (!hasPermission((req as any).user?.role, MODULES.RECEIVABLES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver cuentas por cobrar" });
      }
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
      // ── Guard de rol ──────────────────────────────────────────────────────
      // Este endpoint nunca llegó a auditarse porque estaba roto por tabla
      // inexistente (scholarship_types). Ahora que la tabla existe, se aplica
      // el guard que corresponde: SCHOLARSHIPS.READ (ver permissions.ts).
      if (!hasPermission((req as any).user?.role, MODULES.SCHOLARSHIPS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para consultar becas" });
      }

      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      // Becas reales del campus con tipo de beca incluido.
      // Columnas reales de la tabla scholarships (DB real difiere del schema Drizzle):
      //   porcentaje (no porcentaje_aplicado), motivo (no observaciones),
      //   sin estado, sin monto_fijo_aplicado_centavos.
      // Alias en el SELECT mantienen los nombres que espera el frontend.
      const rows = await pool.query(`
        SELECT s.id, s.student_id,
               s.porcentaje               AS porcentaje_aplicado,
               s.motivo                   AS observaciones,
               s.vigencia_inicio, s.vigencia_fin,
               st.nombre                  AS tipo_nombre,
               st.categoria               AS tipo_categoria,
               stu.nombre_completo        AS alumno
        FROM scholarships s
        JOIN students stu ON stu.id = s.student_id
        LEFT JOIN scholarship_types st ON st.id = s.scholarship_type_id
        WHERE stu.campus_id = $1
        ORDER BY stu.nombre_completo
      `, [campusId]).catch((err: any) => {
        // Catch visible: un error real de DB se registra en logs. El catch
        // silencioso anterior ocultó la ausencia de scholarship_types durante
        // tiempo indeterminado. Mantenemos degradación elegante (array vacío)
        // pero ahora el error es visible en los logs del servidor.
        console.error("[GET /api/scholarships] DB error:", err.message);
        return { rows: [] };
      });
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
      if (!hasPermission(req.user?.role, MODULES.CHARGES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver estado de cuenta" });
      }
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

      // Saldo a favor: solo créditos ACTIVOS (status='activo').
      // Los consumidos ya generaron una payment_application y no se cuentan dos veces.
      const creditRes = await pool.query(
        `SELECT COALESCE(SUM(fc.amount_centavos), 0)::bigint AS saldo_a_favor
         FROM family_credits fc
         WHERE fc.status = 'activo'
           AND (
             fc.student_id = $1
             OR fc.family_id IN (
               SELECT fs.family_id FROM family_students fs WHERE fs.student_id = $1
             )
           )`,
        [studentId]
      ).catch(() => ({ rows: [{ saldo_a_favor: 0 }] }));
      const saldoAFavor = Number((creditRes.rows as any[])[0]?.saldo_a_favor ?? 0);

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
          total_cargos_centavos:     totalCargos,
          total_descuentos_centavos: totalDescuentos,
          total_recargos_centavos:   totalRecargos,
          total_pagado_centavos:     totalPagado,
          saldo_a_favor_centavos:    saldoAFavor,
          saldo_pendiente_centavos:  Math.max(0, saldoPendiente),
          saldo_neto_centavos:       Math.max(0, saldoPendiente - saldoAFavor),
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
      // ── Guard de rol ──────────────────────────────────────────────────────
      // Mismo caso que /api/scholarships: nunca auditado por tabla inexistente.
      if (!hasPermission(req.user?.role, MODULES.SCHOLARSHIPS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para consultar reportes de becas" });
      }

      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus ID requerido" });

      // ── Becas activas ──────────────────────────────────────────────────
      // La tabla scholarships real no tiene columna 'estado' — se cuenta
      // el total de becas sin filtrar por estado (schema drift documentado).
      const becasActivasResult = await pool.query(`
        SELECT COUNT(*)::int                     AS total_activas,
               COUNT(DISTINCT s.student_id)::int AS alumnos_con_beca
        FROM scholarships s
        JOIN students stu ON stu.id = s.student_id
        WHERE stu.campus_id = $1
      `, [campusId]).catch((err: any) => {
        console.error("[GET /api/admin/admissions-report] becasActivas DB error:", err.message);
        return { rows: [{ total_activas: 0, alumnos_con_beca: 0 }] };
      });

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
      // Columnas reales: porcentaje (no porcentaje_aplicado), sin estado.
      const distribucionResult = await pool.query(`
        SELECT st.nombre                            AS tipo,
               st.categoria                         AS categoria,
               COUNT(*)::int                        AS cantidad,
               COALESCE(SUM(s.porcentaje), 0)::int  AS porcentaje_total
        FROM scholarships s
        JOIN students stu ON stu.id = s.student_id
        LEFT JOIN scholarship_types st ON st.id = s.scholarship_type_id
        WHERE stu.campus_id = $1
        GROUP BY st.id, st.nombre, st.categoria
        ORDER BY cantidad DESC
      `, [campusId]).catch((err: any) => {
        console.error("[GET /api/admin/admissions-report] distribucion DB error:", err.message);
        return { rows: [] };
      });

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
      const user = (req as any).user;
      if (!hasPermission(user?.role, MODULES.STUDENTS, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para crear alumnos" });
      }
      const studentData = req.body;
      
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
   * PATCH /api/admin/students/:studentId
   * Actualiza los datos propios del alumno (no tutores).
   */
  app.patch("/api/admin/students/:studentId", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermission(req.user?.role, MODULES.STUDENTS, ACTIONS.UPDATE)) {
        return res.status(403).json({ message: "Sin permisos para editar alumnos" });
      }
      const studentId = parseInt(req.params.studentId);
      const campusId  = req.user?.campus_id;
      const tenantId  = req.user?.tenant_id;

      // Verificar que el alumno pertenece al campus del token
      const check = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND campus_id = $2`,
        [studentId, campusId]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ message: "Alumno no encontrado en tu campus" });
      }

      const {
        nombres, apellido_paterno, apellido_materno, curp,
        fecha_nacimiento, correo_institucional,
        nivel_escolar, grado, grupo, turno, status,
      } = req.body;

      await pool.query(
        `UPDATE students SET
           nombres = COALESCE($1, nombres),
           apellido_paterno = COALESCE($2, apellido_paterno),
           apellido_materno = COALESCE($3, apellido_materno),
           curp = COALESCE($4, curp),
           fecha_nacimiento = COALESCE($5, fecha_nacimiento),
           correo_institucional = COALESCE($6, correo_institucional),
           nivel_escolar = COALESCE($7, nivel_escolar),
           grado = COALESCE($8, grado),
           grupo = COALESCE($9, grupo),
           turno = COALESCE($10, turno),
           status = COALESCE($11, status),
           updated_at = NOW()
         WHERE id = $12 AND campus_id = $13`,
        [
          nombres || null, apellido_paterno || null, apellido_materno || null,
          curp || null, fecha_nacimiento || null, correo_institucional || null,
          nivel_escolar || null, grado || null, grupo || null, turno || null,
          status || null,
          studentId, campusId,
        ]
      );

      const updated = await pool.query(
        `SELECT * FROM students WHERE id = $1`,
        [studentId]
      );
      res.json(updated.rows[0]);
    } catch (error: any) {
      console.error("Error updating student:", error);
      res.status(500).json({ message: "Error al actualizar alumno" });
    }
  });

  /**
   * GET /api/admin/students/:studentId/guardians
   * Devuelve los tutores vinculados a un alumno con su estado de responsabilidad de pago.
   * Solo accesible para administradores del mismo tenant.
   */
  app.get("/api/admin/students/:studentId/guardians", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermission(req.user?.role, MODULES.FAMILIES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver tutores del alumno" });
      }
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
      if (!hasPermission(req.user?.role, MODULES.FAMILIES, ACTIONS.UPDATE)) {
        return res.status(403).json({ message: "Sin permisos para editar responsabilidad de tutores" });
      }
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
      const role = req.user?.role;
      if (!hasPermission(role, MODULES.REPORTS, ACTIONS.EXPORT)) {
        return res.status(403).json({ message: "No tienes permiso para exportar datos" });
      }
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
      if (!hasPermission(user?.role, MODULES.STUDENTS, ACTIONS.IMPORT)) {
        return res.status(403).json({ message: "Sin permisos para importar alumnos" });
      }
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

  // ── POST /api/admin/family-credits/:creditId/aplicar ─────────────────────────
  /**
   * Aplica un saldo a favor (family_credits) a un cargo pendiente.
   *
   * PRINCIPIO DEL LEDGER: el crédito se consume creando una PaymentApplication
   * nueva contra el payment_id original que generó el excedente, y apuntando al
   * charge nuevo.  De esta forma el balance de la familia es 100% calculable
   * como SUM(charges) − SUM(payment_applications), sin ninguna query auxiliar.
   *
   * El registro de family_credits queda marcado como 'consumido' con referencia
   * a la PaymentApplication creada.  amount_centavos NUNCA se edita ni se borra.
   *
   * Si el crédito es mayor que el saldo pendiente del cargo (pago en exceso del
   * exceso), se crea un nuevo crédito activo por el remanente.
   *
   * Body: { charge_id: number }
   */
  app.post("/api/admin/family-credits/:creditId/aplicar", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermission(role, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
        return res.status(403).json({ message: "Sin permisos para procesar pagos" });
      }
      const tenantId  = req.user?.tenant_id;
      const campusId  = req.user?.campus_id;
      const userId    = req.user?.id;
      const creditId  = parseInt(req.params.creditId);
      const chargeId  = parseInt(req.body?.charge_id);

      if (isNaN(creditId) || isNaN(chargeId)) {
        return res.status(400).json({ message: "creditId y charge_id deben ser enteros válidos" });
      }

      const client = await pool.connect();
      let newPaId!: number;
      let montoAplicado!: number;
      let newChargeEstado!: string;
      let remanente = 0;
      let newCreditId: number | null = null;

      try {
        await client.query("BEGIN");

        // ── Bloquear el crédito y verificar que sigue activo ─────────────────
        const creditLock = await client.query(
          `SELECT id, payment_id, amount_centavos, status, student_id, family_id, tenant_id
           FROM family_credits WHERE id = $1 FOR UPDATE`,
          [creditId]
        );
        if (!creditLock.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Crédito no encontrado" });
        }
        const credit = creditLock.rows[0] as any;
        if (Number(credit.tenant_id) !== tenantId) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "El crédito no pertenece a tu institución" });
        }
        if (credit.status !== "activo") {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El crédito ya fue consumido o no está activo" });
        }

        // ── Bloquear el cargo y verificar que está pendiente ─────────────────
        const chargeLock = await client.query(
          `SELECT c.id, c.monto_base_centavos, c.estado, c.student_id, s.campus_id
           FROM charges c JOIN students s ON s.id = c.student_id
           WHERE c.id = $1 AND c.tenant_id = $2 FOR UPDATE`,
          [chargeId, tenantId]
        );
        if (!chargeLock.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Cargo no encontrado" });
        }
        const charge = chargeLock.rows[0] as any;
        if (Number(charge.campus_id) !== campusId) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "El cargo no pertenece a tu campus" });
        }
        if (["pagado", "cancelado"].includes(charge.estado)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya está pagado o cancelado" });
        }

        // ── Validar que el crédito pertenece al mismo alumno o familia que el cargo ─
        // Evita que el crédito de la familia A se aplique a un cargo de la familia B.
        const chargeStudentId = Number(charge.student_id);
        const creditStudentId = Number(credit.student_id);
        if (chargeStudentId !== creditStudentId) {
          const familyCheck = await client.query(
            `SELECT 1 FROM (
               -- Ambos alumnos comparten una familia
               SELECT fs1.family_id
               FROM family_students fs1
               JOIN family_students fs2 ON fs1.family_id = fs2.family_id
               WHERE fs1.student_id = $1 AND fs2.student_id = $2
               UNION ALL
               -- El crédito tiene family_id explícito que incluye al alumno del cargo
               SELECT family_id FROM family_students
               WHERE family_id = $3 AND student_id = $2
             ) t LIMIT 1`,
            [creditStudentId, chargeStudentId, credit.family_id]
          );
          if (!familyCheck.rows.length) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: "El crédito no corresponde al alumno o familia del cargo" });
          }
        }

        // ── Saldo pendiente real del cargo (vía payment_applications) ─────────
        const saldoRes = await client.query(
          `SELECT COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
           FROM payment_applications pa WHERE pa.charge_id = $1`,
          [chargeId]
        );
        const yaPagado = Number(saldoRes.rows[0].ya_pagado);
        const saldoPendiente = Number(charge.monto_base_centavos) - yaPagado;

        if (saldoPendiente <= 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya tiene saldo cero" });
        }

        const creditAmount = Number(credit.amount_centavos);
        montoAplicado  = Math.min(creditAmount, saldoPendiente);
        remanente      = creditAmount - montoAplicado;  // > 0 si el crédito excede el cargo
        newChargeEstado = montoAplicado >= saldoPendiente ? "pagado" : "parcial";

        // ── Crear PaymentApplication contra el payment original ───────────────
        // Principio del ledger: el balance SUM(charges)-SUM(payment_applications) es
        // la única fuente de verdad.  Esta PA cubre el nuevo cargo usando el payment
        // del excedente original, sin tocar ni crear otro Payment.
        const paRes = await client.query(
          `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
           VALUES ($1, $2, $3, NOW()) RETURNING id`,
          [credit.payment_id, chargeId, montoAplicado]
        );
        newPaId = (paRes.rows as any[])[0].id;

        // ── Actualizar estado del cargo ────────────────────────────────────────
        await client.query(
          `UPDATE charges SET estado = $1, updated_at = NOW() WHERE id = $2`,
          [newChargeEstado, chargeId]
        );

        // ── Marcar el crédito como consumido (sin editar amount_centavos) ─────
        await client.query(
          `UPDATE family_credits
           SET status = 'consumido',
               consumed_application_id = $1,
               consumed_at = NOW()
           WHERE id = $2`,
          [newPaId, creditId]
        );

        // ── Si el crédito excedía el saldo del cargo, crear nuevo crédito activo
        if (remanente > 0) {
          const remRes = await client.query(
            `INSERT INTO family_credits
               (tenant_id, campus_id, family_id, student_id, payment_id,
                amount_centavos, origen, descripcion)
             VALUES ($1, $2, $3, $4, $5, $6, 'excedente_caja',
                     'Remanente de crédito #' || $7 || ' tras aplicación parcial')
             RETURNING id`,
            [
              tenantId, campusId, credit.family_id, credit.student_id,
              credit.payment_id, remanente, creditId,
            ]
          );
          newCreditId = (remRes.rows as any[])[0].id;
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // ── Audit fuera de la transacción (ADR-001) ────────────────────────────
      const auditPayloadCredit: import("../audit-retry").AuditLogPayload = {
        tenant_id:   tenantId,
        user_id:     userId,
        action:      "credit.applied",
        entity_type: "family_credit",
        entity_id:   creditId,
        new_value:   { status: "consumido", monto_aplicado: montoAplicado },
        metadata:    {
          charge_id: chargeId, payment_application_id: newPaId,
          charge_nuevo_estado: newChargeEstado,
          remanente_centavos: remanente,
          nuevo_credit_id: newCreditId,
        },
      };
      pool.query(
        `INSERT INTO audit_log
           (tenant_id, user_id, action, entity_type, entity_id, new_value, metadata)
         VALUES ($1,$2,'credit.applied','family_credit',$3,$4,$5)`,
        [
          tenantId, userId, creditId,
          JSON.stringify(auditPayloadCredit.new_value),
          JSON.stringify(auditPayloadCredit.metadata),
        ]
      ).catch((err) => enqueueAuditLog(auditPayloadCredit, err));

      res.json({
        message: `Crédito aplicado al cargo (${newChargeEstado})${remanente > 0 ? ` — remanente de $${(remanente / 100).toFixed(2)} registrado como nuevo crédito activo` : ""}`,
        payment_application_id: newPaId,
        monto_aplicado_centavos: montoAplicado,
        charge_nuevo_estado:     newChargeEstado,
        remanente_centavos:      remanente,
        nuevo_credit_id:         newCreditId,
      });
    } catch (error: any) {
      console.error("[family-credits/aplicar]", error.message);
      if (!res.headersSent) res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/admin/alertas/condonaciones — Protocolo §8 ──────────────────
  // Devuelve alertas ALERTA_CONDONACION_REPETIDA del tenant, ordenadas por
  // fecha descendente. Solo accesible a administrador_general y super_admin.
  // (administrador_campus también tiene FINANCIAL.READ, por eso el guard es
  //  por rol explícito y no por permiso de módulo.)
  app.get("/api/admin/alertas/condonaciones", authenticateToken, async (req: any, res) => {
    try {
      const role     = req.user?.role;
      const tenantId = req.user?.tenant_id;
      if (!['administrador_general', 'super_admin'].includes(role)) {
        return res.status(403).json({ message: "Sin permisos para ver alertas de condonaciones" });
      }
      const rows = await pool.query(
        `SELECT id, user_id, entity_id AS plan_id, metadata, created_at
         FROM audit_log
         WHERE tenant_id = $1
           AND action = 'ALERTA_CONDONACION_REPETIDA'
         ORDER BY created_at DESC
         LIMIT 50`,
        [tenantId]
      );
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error al obtener alertas de condonaciones" });
    }
  });

  // ── POST /api/admin/alertas/condonaciones/:planId/override-token ──────────
  // Genera un JWT de 30 minutos que autoriza a ejecutar una condonación adicional
  // cuando ya existe una activa en los últimos 90 días para el mismo alumno o familia.
  //
  // El token incluye tenant_id y campus_id para que NO pueda usarse en otro plantel.
  // El campo 'motivo' (≥10 chars) queda grabado en audit_log: el administrador_general
  // debe dejar constancia de por qué autorizó la repetición, no solo que lo hizo.
  // El campo 'alerta_id' vincula el token a la ALERTA_CONDONACION_REPETIDA original,
  // creando la cadena: alerta → token generado → condonación ejecutada.
  //
  // Solo administrador_general y super_admin pueden emitirlo.
  app.post("/api/admin/alertas/condonaciones/:planId/override-token", authenticateToken, async (req: any, res) => {
    try {
      const role     = req.user?.role;
      const tenantId = req.user?.tenant_id;
      const userId   = req.user?.id;

      if (!['administrador_general', 'super_admin'].includes(role)) {
        return res.status(403).json({ message: "Sin permisos para emitir tokens de autorización de condonación" });
      }

      const planId              = parseInt(req.params.planId);
      const { motivo, alerta_id } = req.body;

      if (!motivo || String(motivo).trim().length < 10) {
        return res.status(400).json({
          message: "El campo 'motivo' es obligatorio y debe tener mínimo 10 caracteres para registrar la razón de la autorización",
        });
      }
      if (alerta_id === undefined || alerta_id === null || isNaN(Number(alerta_id))) {
        return res.status(400).json({
          message: "El campo 'alerta_id' es obligatorio: debe corresponder al id de la ALERTA_CONDONACION_REPETIDA que activa esta autorización",
        });
      }

      // Validar que el plan existe y pertenece al tenant
      const planRes = await pool.query(
        `SELECT id, student_id, campus_id, tenant_id FROM payment_plans WHERE id = $1`,
        [planId]
      );
      if ((planRes.rows as any[]).length === 0) {
        return res.status(404).json({ message: "Plan no encontrado" });
      }
      const plan = (planRes.rows as any[])[0];
      if (Number(plan.tenant_id) !== Number(tenantId)) {
        return res.status(403).json({ message: "El plan no pertenece a este tenant" });
      }

      // Validar que la alerta existe y pertenece al mismo tenant
      const alertaRes = await pool.query(
        `SELECT id FROM audit_log
         WHERE id = $1
           AND tenant_id = $2
           AND action = 'ALERTA_CONDONACION_REPETIDA'`,
        [Number(alerta_id), tenantId]
      );
      if ((alertaRes.rows as any[]).length === 0) {
        return res.status(404).json({ message: "Alerta no encontrada o no corresponde a este tenant" });
      }

      // Generar token con todo lo necesario para la validación exacta en el PATCH cancelar.
      // campus_id y tenant_id incluidos: un token de un plantel no puede usarse en otro.
      const JWT_SECRET_KEY = process.env.JWT_SECRET || "fallback-secret-key";
      const token = jwt.sign(
        {
          action:     'override_condonacion',
          plan_id:    planId,
          student_id: Number(plan.student_id),
          tenant_id:  Number(tenantId),
          campus_id:  Number(plan.campus_id),
          alerta_id:  Number(alerta_id),
        },
        JWT_SECRET_KEY,
        { expiresIn: '30m' }
      );

      // Registrar la autorización en audit_log con el motivo — trazabilidad completa.
      // El admin_general no puede generar un token sin dejar constancia de por qué.
      const overrideMeta = {
        plan_id:    planId,
        student_id: Number(plan.student_id),
        alerta_id:  Number(alerta_id),
        motivo:     String(motivo).trim(),
        campus_id:  Number(plan.campus_id),
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,'generacion_override_condonacion','payment_plan',$3,$4)`,
        [tenantId, userId ?? null, planId, JSON.stringify(overrideMeta)]
      ).catch((err: any) =>
        enqueueAuditLog({
          tenant_id: tenantId, user_id: userId ?? null,
          action: 'generacion_override_condonacion', entity_type: 'payment_plan',
          entity_id: planId, metadata: overrideMeta,
        }, err)
      );

      res.json({ token, expires_in: '30m', plan_id: planId, alerta_id: Number(alerta_id) });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
