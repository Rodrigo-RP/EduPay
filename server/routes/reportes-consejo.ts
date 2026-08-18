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
import { generateNarrativeInsights } from "../lib/narrative-insights";

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

// ─── helper: mes anterior ─────────────────────────────────────────────────────

/**
 * Devuelve el primer y último día del mes anterior a fecha_desde
 * (o al mes actual si no se proporciona fecha_desde).
 *
 * Ejemplo: fecha_desde="2026-08-01" → { start:"2026-07-01", end:"2026-07-31" }
 */
function prevMonthRange(fechaDesde?: string): { start: string; end: string } {
  const ref = fechaDesde
    ? new Date(fechaDesde + "T12:00:00Z")
    : new Date();
  // Date.UTC(year, month, 0) = último día del mes anterior (month es 0-indexed)
  const prevLast  = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 0));
  const prevFirst = new Date(Date.UTC(prevLast.getUTCFullYear(), prevLast.getUTCMonth(), 1));
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(prevFirst), end: fmt(prevLast) };
}

// ─── núcleo de datos ──────────────────────────────────────────────────────────

// ─── tendencias: últimos 12 meses ─────────────────────────────────────────────

/**
 * Devuelve un array de 12 entradas (mes más antiguo → mes actual) con
 * ingresos cobrados, tasa_cobro y mora para el campus indicado.
 * Siempre cubre los últimos 12 meses calendario desde NOW().
 */
async function fetchTendencias(campusId: number) {
  const { rows } = await pool.query(`
    WITH mes_range AS (
      SELECT generate_series(
        date_trunc('month', NOW() - INTERVAL '11 months'),
        date_trunc('month', NOW()),
        '1 month'::interval
      ) AS mes_inicio
    ),
    ing AS (
      SELECT date_trunc('month', p.created_at) AS mes_inicio,
             SUM(p.monto_centavos)              AS total
      FROM   payments p
      JOIN   charges  c ON c.id = p.charge_id
      JOIN   students s ON s.id = c.student_id
      WHERE  s.campus_id = $1
        AND  p.created_at >= date_trunc('month', NOW() - INTERVAL '11 months')
      GROUP  BY 1
    ),
    fac AS (
      SELECT date_trunc('month', c.created_at) AS mes_inicio,
             SUM(c.monto_base_centavos)         AS total
      FROM   charges  c
      JOIN   students s ON s.id = c.student_id
      WHERE  s.campus_id = $1
        AND  c.created_at >= date_trunc('month', NOW() - INTERVAL '11 months')
      GROUP  BY 1
    )
    SELECT
      to_char(m.mes_inicio, 'YYYY-MM')  AS mes,
      COALESCE(ing.total, 0)::bigint    AS ingresos_centavos,
      COALESCE(fac.total, 0)::bigint    AS facturado_centavos
    FROM   mes_range m
    LEFT JOIN ing ON ing.mes_inicio = m.mes_inicio
    LEFT JOIN fac ON fac.mes_inicio = m.mes_inicio
    ORDER  BY m.mes_inicio ASC
  `, [campusId]);

  return (rows as any[]).map(r => {
    const ingresos_centavos  = Number(r.ingresos_centavos);
    const facturado_centavos = Number(r.facturado_centavos);
    const tasa_cobro = facturado_centavos > 0
      ? Math.round((ingresos_centavos / facturado_centavos) * 100)
      : 0;
    const mora = facturado_centavos > 0 ? 100 - tasa_cobro : 0;
    return { mes: r.mes as string, ingresos_centavos, tasa_cobro, mora };
  });
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

  // ── mes anterior (para KPIs comparativos + NI-04) ─────────────────────────
  const prev = prevMonthRange(p.fecha_desde);

  // ── consultas paralelas ─────────────────────────────────────────────────────
  const [ingRows, estudRows, facRows, becasRows, conveniosRows, prevIngRows, prevFacRows, tendenciasData] =
    await Promise.all([
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
      // Ingresos del mes anterior (pagos registrados en ese período)
      pool.query(
        `SELECT COALESCE(SUM(p.monto_centavos), 0) AS total
         FROM   payments p
         JOIN   charges  c ON c.id = p.charge_id
         JOIN   students s ON s.id = c.student_id
         WHERE  s.campus_id = $1
           AND  p.created_at::date >= $2
           AND  p.created_at::date <= $3`,
        [campusId, prev.start, prev.end],
      ).catch(() => ({ rows: [{ total: 0 }] })),
      // Facturado del mes anterior (cargos creados en ese período)
      pool.query(
        `SELECT COALESCE(SUM(c.monto_base_centavos), 0) AS total
         FROM   charges  c
         JOIN   students s ON s.id = c.student_id
         WHERE  s.campus_id = $1
           AND  c.created_at::date >= $2
           AND  c.created_at::date <= $3`,
        [campusId, prev.start, prev.end],
      ).catch(() => ({ rows: [{ total: 0 }] })),
      // Tendencias: últimos 12 meses (sin filtros de período — siempre desde NOW())
      fetchTendencias(campusId).catch((): Awaited<ReturnType<typeof fetchTendencias>> => []),
    ]);

  const ingresos  = Number((ingRows.rows[0]  as any)?.total || 0);
  const facturado = Number((facRows.rows[0]  as any)?.total || 0);
  const pendiente = Math.max(0, facturado - ingresos);
  const tasaCobro = facturado > 0 ? Math.round((ingresos / facturado) * 100) : 0;

  // Mes anterior — cálculo real (elimina los valores hardcodeados anteriores)
  const prevIngresos  = Number((prevIngRows.rows[0] as any)?.total || 0);
  const prevFacturado = Number((prevFacRows.rows[0] as any)?.total || 0);
  const tasa_cobro_anterior: number | null =
    prevFacturado > 0 ? Math.round((prevIngresos / prevFacturado) * 100) : null;
  const mora_ant =
    tasa_cobro_anterior !== null ? 100 - tasa_cobro_anterior : 100 - tasaCobro;

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
      ingresos_mes_anterior: prevIngresos,      // real — antes: Math.round(ingresos * 0.92)
      total_facturado:       facturado,
      pendiente,
      vencido:               Math.round(pendiente * 0.4),
      tasa_cobro:            tasaCobro,
      meta_cobro:            85,
      mora:                  100 - tasaCobro,
      mora_anterior:         mora_ant,          // real — antes: Math.max(0, 100 - tasaCobro + 3)
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
    tendencias:          tendenciasData as Awaited<ReturnType<typeof fetchTendencias>>,
    filters:             p,
    tasa_cobro_anterior,  // interno — el GET handler lo extrae antes de responder
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
      // Extraer tasa_cobro_anterior (interno) antes de responder
      const { tasa_cobro_anterior, ...responseData } = data;
      const insights = await generateNarrativeInsights(
        campusId,
        { tasa_cobro: responseData.kpis.tasa_cobro },
        tasa_cobro_anterior,
      );
      res.json({ ...responseData, insights });
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
      const { formato = "excel", ciclo, fecha_desde, fecha_hasta } = req.body as any;
      if (formato !== "excel" && formato !== "pdf") {
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
        format:         formato as "excel" | "pdf",
        filename:       filenameFor("reporte-consejo", formato as "excel" | "pdf"),
        generatedBy:    (user as any)?.name || (user as any)?.email || "Sistema",
        additionalSheets: [
          {
            name: "Tendencias 12 meses",
            columns: [
              { key: "mes",                header: "Mes",            format: "string",     width: 12 },
              { key: "ingresos_centavos",  header: "Ingresos",       format: "currency_mxn", width: 16, align: "right" },
              { key: "tasa_cobro",         header: "Tasa cobro (%)", format: "integer",    width: 16, align: "right" },
              { key: "mora",               header: "Mora (%)",       format: "integer",    width: 12, align: "right" },
            ],
            rows: data.tendencias as Record<string, unknown>[],
          },
        ],
      };

      const buffer = await exportReport(exportReq);
      res.setHeader("Content-Type",        contentTypeFor(formato as "excel" | "pdf"));
      res.setHeader("Content-Disposition", `attachment; filename="${exportReq.filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error("[RPT-05] POST /api/reportes/consejo/exportar:", error.message);
      res.status(500).json({ message: "Error exportando reporte del consejo" });
    }
  });
}
