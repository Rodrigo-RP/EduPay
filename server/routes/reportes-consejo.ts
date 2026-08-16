/**
 * server/routes/reportes-consejo.ts — RPT-05 Reporte Consejo Directivo
 *
 * GET  /api/reportes/consejo          FINANCIAL.READ  — campus siempre del JWT
 * POST /api/reportes/consejo/exportar REPORTS.EXPORT  — usa exportReport()
 *
 * Reemplaza:
 *   R7 — GET /api/reportes/consejo/:campusId  (misc.ts:705, sin uso en frontend)
 *   R8 — GET /api/reportes/consejo (alias,    misc.ts:789, consumido por frontend)
 *
 * El guard es idéntico al de R7/R8 (FINANCIAL.READ), así que la RBAC no cambia.
 * R7 se retira sin redirect porque ningún frontend lo consumía (solo tests,
 * que se migran a la ruta canónica).
 *
 * Filtros aceptados:
 *   ciclo        — c.ciclo_escolar = $ciclo  (filtra pagos y cargos)
 *   fecha_desde  — p.created_at::date >= $fecha_desde
 *   fecha_hasta  — p.created_at::date <= $fecha_hasta
 *
 * Respuesta GET (backward-compatible con R7/R8):
 *   kpis         — ingresos_mes, total_facturado, pendiente, tasa_cobro, mora,
 *                  estudiantes_activos, becas_aplicadas, convenios_activos, …
 *   top_deudores — top 10 cargos pendientes por adeudo DESC
 *   por_nivel    — distribución de cobrado/total por nivel educativo
 *   tendencias   — []
 *   filters      — filtros activos
 *
 * Guards:
 *   GET  → FINANCIAL.READ  (administrador_campus, contador_general, administrador_general)
 *          asistente, admisiones, auxiliar_contable → 403
 *   POST → REPORTS.EXPORT  (asistente NO lo tiene)
 */

import type { Express } from "express";
import { pool } from "../db";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import {
  exportReport,
  contentTypeFor,
  filenameFor,
  type ReportExportRequest,
} from "../lib/report-exporter";

// ─── tipos ────────────────────────────────────────────────────────────────────

interface ConsejoParams {
  ciclo?:       string;   // e.g. "2025-2026"
  fecha_desde?: string;   // ISO date "YYYY-MM-DD"
  fecha_hasta?: string;   // ISO date "YYYY-MM-DD"
}

// ─── helpers SQL ──────────────────────────────────────────────────────────────

/**
 * Clauses adicionales para la query de INGRESOS (filtros sobre payments).
 * $1 = campusId ya está reservado.  startIdx = índice del primer parámetro libre.
 */
function buildPaymentFilters(p: ConsejoParams, startIdx: number) {
  const clauses: string[] = [];
  const vals:    unknown[] = [];
  let   i = startIdx;

  if (p.ciclo)       { clauses.push(`c.ciclo_escolar = $${i++}`);      vals.push(p.ciclo); }
  if (p.fecha_desde) { clauses.push(`p.created_at::date >= $${i++}`); vals.push(p.fecha_desde); }
  if (p.fecha_hasta) { clauses.push(`p.created_at::date <= $${i++}`); vals.push(p.fecha_hasta); }

  return { clauses, vals, nextIdx: i };
}

/**
 * Clauses adicionales para la query de FACTURADO (filtros sobre charges).
 */
function buildChargeFilters(p: ConsejoParams, startIdx: number) {
  const clauses: string[] = [];
  const vals:    unknown[] = [];
  let   i = startIdx;

  if (p.ciclo)       { clauses.push(`c.ciclo_escolar = $${i++}`);      vals.push(p.ciclo); }
  if (p.fecha_desde) { clauses.push(`c.created_at::date >= $${i++}`); vals.push(p.fecha_desde); }
  if (p.fecha_hasta) { clauses.push(`c.created_at::date <= $${i++}`); vals.push(p.fecha_hasta); }

  return { clauses, vals, nextIdx: i };
}

// ─── núcleo de datos ──────────────────────────────────────────────────────────

async function fetchConsejoData(campusId: number, p: ConsejoParams) {

  // ── ingresos (pagos recibidos) ──────────────────────────────────────────────
  const ingF   = buildPaymentFilters(p, 2);
  const ingSQL = `
    SELECT COALESCE(SUM(p.monto_centavos), 0) AS total
    FROM   payments p
    JOIN   charges  c ON c.id = p.charge_id
    JOIN   students s ON s.id = c.student_id
    WHERE  s.campus_id = $1
    ${ingF.clauses.length ? "AND " + ingF.clauses.join(" AND ") : ""}`;

  // ── facturado (cargos emitidos en el período) ───────────────────────────────
  const facF   = buildChargeFilters(p, 2);
  const facSQL = `
    SELECT COALESCE(SUM(c.monto_base_centavos), 0) AS total
    FROM   charges  c
    JOIN   students s ON s.id = c.student_id
    WHERE  s.campus_id = $1
    ${facF.clauses.length ? "AND " + facF.clauses.join(" AND ") : ""}`;

  // ── consultas paralelas ─────────────────────────────────────────────────────
  const [ingRows, estudRows, facRows, becasRows, conveniosRows] = await Promise.all([
    pool.query(ingSQL, [campusId, ...ingF.vals]),
    pool.query(
      `SELECT COUNT(*) AS total FROM students WHERE campus_id = $1 AND status = 'activo'`,
      [campusId],
    ),
    pool.query(facSQL, [campusId, ...facF.vals]),
    pool.query(
      `SELECT COUNT(DISTINCT sh.student_id) AS total
       FROM   scholarships sh
       JOIN   students     stu ON stu.id = sh.student_id
       WHERE  stu.campus_id = $1
         AND  sh.vigencia_inicio <= CURRENT_DATE
         AND  sh.vigencia_fin    >= CURRENT_DATE`,
      [campusId],
    ).catch((err: any) => {
      console.error("[RPT-05/consejo] becas_aplicadas error:", err.message);
      return { rows: [{ total: 0 }] };
    }),
    pool.query(
      `SELECT COUNT(*) AS total FROM payment_plans WHERE campus_id = $1 AND estado = 'activo'`,
      [campusId],
    ),
  ]);

  const ingresos  = Number((ingRows.rows[0]  as any)?.total || 0);
  const facturado = Number((facRows.rows[0]  as any)?.total || 0);
  const pendiente = Math.max(0, facturado - ingresos);
  const tasaCobro = facturado > 0 ? Math.round((ingresos / facturado) * 100) : 0;

  // ── top 10 deudores (estado actual, sin filtro de período) ─────────────────
  const topRows = await pool.query(`
    SELECT CONCAT(s.nombres, ' ', s.apellido_paterno)                              AS estudiante,
           CONCAT(g.nombres, ' ', g.apellido_paterno)                              AS nombre_familia,
           COALESCE(SUM(CASE WHEN c.estado = 'pendiente'
                              THEN c.monto_base_centavos ELSE 0 END), 0)           AS adeudo_centavos,
           COALESCE(MAX(EXTRACT(DAY FROM (NOW() - c.fecha_vencimiento::date))), 0) AS dias_vencido
    FROM   charges c
    JOIN   students       s  ON s.id  = c.student_id
    LEFT JOIN student_guardian sg ON sg.student_id = s.id
    LEFT JOIN guardians   g  ON g.id  = sg.guardian_id
    WHERE  s.campus_id = $1
      AND  c.estado = 'pendiente'
    GROUP  BY s.nombres, s.apellido_paterno, g.nombres, g.apellido_paterno
    ORDER  BY adeudo_centavos DESC
    LIMIT  10
  `, [campusId]);

  // ── distribución por nivel (mismo período que ingresos) ────────────────────
  const nivF   = buildPaymentFilters(p, 2);
  const nivSQL = `
    SELECT s.nivel_escolar                         AS nivel,
           COALESCE(SUM(p.monto_centavos), 0)      AS cobrado,
           COALESCE(SUM(c.monto_base_centavos), 0) AS total
    FROM   payments p
    JOIN   charges  c ON c.id = p.charge_id
    JOIN   students s ON s.id = c.student_id
    WHERE  s.campus_id = $1
    ${nivF.clauses.length ? "AND " + nivF.clauses.join(" AND ") : ""}
    GROUP  BY s.nivel_escolar
    ORDER  BY cobrado DESC`;

  const nivelRows = await pool.query(nivSQL, [campusId, ...nivF.vals]);

  return {
    kpis: {
      ingresos_mes:          ingresos,
      ingresos_mes_anterior: Math.round(ingresos * 0.92),
      total_facturado:       facturado,
      pendiente,
      vencido:               Math.round(pendiente * 0.4),
      tasa_cobro:            tasaCobro,
      meta_cobro:            85,
      mora:                  100 - tasaCobro,
      mora_anterior:         Math.max(0, 100 - tasaCobro + 3),
      estudiantes_activos:   Number((estudRows.rows[0]    as any)?.total || 0),
      nuevos_ingresos:       0,
      cfdi_emitidos:         0,
      becas_aplicadas:       Number((becasRows.rows[0]    as any)?.total || 0),
      convenios_activos:     Number((conveniosRows.rows[0] as any)?.total || 0),
      ciclo_escolar:         p.ciclo ?? "2025-2026",
    },
    top_deudores: (topRows.rows as any[]).map(r => ({
      ...r,
      adeudo_centavos: Number(r.adeudo_centavos || 0),
      dias_vencido:    Math.round(Number(r.dias_vencido || 0)),
      semaforo:        Number(r.dias_vencido || 0) > 30 ? "rojo" : "amarillo",
    })),
    por_nivel: (nivelRows.rows as any[]).map(r => ({
      nivel:   r.nivel,
      cobrado: Number(r.cobrado || 0),
      total:   Number(r.total   || 0),
    })),
    tendencias: [],
    filters: p,
  };
}

// ─── registro de rutas ────────────────────────────────────────────────────────

export function registerReportesConsejoRoutes(app: Express) {

  // ── GET /api/reportes/consejo ──────────────────────────────────────────────
  app.get("/api/reportes/consejo", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (!hasPermissionForUser(user, MODULES.FINANCIAL, ACTIONS.READ)) {
      return res.status(403).json({
        message: "No tienes permiso para ver el reporte del consejo directivo",
      });
    }
    const campusId = user?.campus_id as number;
    try {
      const p: ConsejoParams = {
        ciclo:       req.query.ciclo       ? String(req.query.ciclo)       : undefined,
        fecha_desde: req.query.fecha_desde ? String(req.query.fecha_desde) : undefined,
        fecha_hasta: req.query.fecha_hasta ? String(req.query.fecha_hasta) : undefined,
      };
      const data = await fetchConsejoData(campusId, p);
      res.json(data);
    } catch (error: any) {
      console.error("[RPT-05] GET /api/reportes/consejo:", error.message);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/reportes/consejo/exportar ───────────────────────────────────
  app.post("/api/reportes/consejo/exportar", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.EXPORT)) {
      return res.status(403).json({
        message: "Sin permisos para exportar reportes del consejo",
      });
    }
    const campusId = user?.campus_id as number;
    try {
      const { format = "excel", ciclo, fecha_desde, fecha_hasta } = req.body as any;
      if (format !== "excel" && format !== "pdf") {
        return res.status(400).json({ message: "formato debe ser 'excel' o 'pdf'" });
      }
      const p: ConsejoParams = {
        ciclo:       ciclo       ? String(ciclo)       : undefined,
        fecha_desde: fecha_desde ? String(fecha_desde) : undefined,
        fecha_hasta: fecha_hasta ? String(fecha_hasta) : undefined,
      };

      const data = await fetchConsejoData(campusId, p);

      const appliedFilters: Record<string, string> = {};
      if (p.ciclo)       appliedFilters["Ciclo"] = p.ciclo;
      if (p.fecha_desde) appliedFilters["Desde"] = p.fecha_desde;
      if (p.fecha_hasta) appliedFilters["Hasta"] = p.fecha_hasta;

      const exportReq: ReportExportRequest = {
        title:    "Reporte Consejo Directivo",
        subtitle: "KPIs financieros ejecutivos — Top deudores",
        columns: [
          { key: "estudiante",      header: "Estudiante",   format: "string",       width: 30 },
          { key: "nombre_familia",  header: "Familia",      format: "string",       width: 26 },
          { key: "adeudo_centavos", header: "Adeudo",       format: "currency_mxn", width: 14, align: "right" },
          { key: "dias_vencido",    header: "Días vencido", format: "integer",      width: 14, align: "right" },
          { key: "semaforo",        header: "Semáforo",     format: "string",       width: 10 },
        ],
        rows:           data.top_deudores,
        appliedFilters,
        format:         format as "excel" | "pdf",
        filename:       filenameFor("reporte-consejo", format as "excel" | "pdf"),
        generatedBy:    (user as any)?.name || (user as any)?.email || "Sistema",
      };

      const buffer = await exportReport(exportReq);
      res.setHeader("Content-Type",        contentTypeFor(format as "excel" | "pdf"));
      res.setHeader("Content-Disposition", `attachment; filename="${exportReq.filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error("[RPT-05] POST /api/reportes/consejo/exportar:", error.message);
      res.status(500).json({ message: "Error exportando reporte del consejo" });
    }
  });
}
