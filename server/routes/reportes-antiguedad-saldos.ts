/**
 * RPT-07 — Antigüedad de Saldos
 *
 * GET  /api/reportes/antiguedad-saldos          — REPORTS.READ
 * POST /api/reportes/antiguedad-saldos/exportar — REPORTS.EXPORT
 *
 * Clasificación de cartera pendiente en 6 buckets por días vencido:
 *
 *   dias_vencido = GREATEST(0, CURRENT_DATE - charges.fecha_vencimiento)
 *
 *   Bucket        Rango (ambos extremos inclusivos)
 *   ────────────  ──────────────────────────────────
 *   al_corriente  dias_vencido = 0   (no vencido aún)
 *   1_30          1  ≤ d ≤  30
 *   31_60         31 ≤ d ≤  60
 *   61_90         61 ≤ d ≤  90
 *   91_120        91 ≤ d ≤ 120
 *   mas_120       d > 120  (≥ 121)
 *
 * Solo se incluyen cargos con estado NOT IN ('pagado', 'cancelado').
 * Saldo pendiente: total neto − pagos aplicados vía payment_applications.
 *
 * Filtros:
 *   ciclo    — charges.ciclo_escolar
 *   nivel    — students.nivel_escolar
 *   concepto — charges.concept_id (entero)
 *
 * Nota: no se aplica filtro de fecha porque los buckets reflejan el
 * estado actual de la cartera, no un rango histórico.
 */

import type { Express } from "express";
import { pool }    from "../db";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import {
  exportReport,
  contentTypeFor,
  filenameFor,
} from "../lib/report-exporter";

// ── Tipos internos ─────────────────────────────────────────────────────────────

type BucketKey =
  | "al_corriente"
  | "1_30"
  | "31_60"
  | "61_90"
  | "91_120"
  | "mas_120";

const BUCKET_LABELS: Record<BucketKey, string> = {
  al_corriente: "Al corriente",
  "1_30":       "1-30 días",
  "31_60":      "31-60 días",
  "61_90":      "61-90 días",
  "91_120":     "91-120 días",
  mas_120:      "Más de 120 días",
};

// Orden canónico de presentación
const BUCKET_ORDER: BucketKey[] = [
  "al_corriente",
  "1_30",
  "31_60",
  "61_90",
  "91_120",
  "mas_120",
];

interface AntiguedadFilters {
  ciclo?:    string;
  nivel?:    string;
  concepto?: string; // concept_id como string, se convierte a número
}

interface DetalleRow {
  charge_id:         number;
  student_id:        number;
  alumno:            string;
  nivel:             string;
  ciclo:             string | null;
  concepto:          string;
  fecha_vencimiento: unknown;
  dias_vencido:      number;
  saldo_centavos:    number;
  bucket:            BucketKey;
}

interface BucketSummary {
  key:            BucketKey;
  label:          string;
  count_cargos:   number;
  count_alumnos:  number;
  monto_centavos: number;
  porcentaje:     number; // porcentaje del total de cartera, redondeado 2 decimales
}

// ── Query compartida ───────────────────────────────────────────────────────────

async function fetchAntiguedadData(
  campusId: number,
  filters: AntiguedadFilters,
): Promise<{ detalle: DetalleRow[]; total_cartera_centavos: number }> {
  const values: (string | number)[] = [campusId];
  const extra: string[] = [];
  let i = 2;

  if (filters.ciclo) {
    extra.push(`c.ciclo_escolar = $${i++}`);
    values.push(filters.ciclo);
  }
  if (filters.nivel) {
    extra.push(`s.nivel_escolar = $${i++}`);
    values.push(filters.nivel);
  }
  if (filters.concepto) {
    const conceptoNum = parseInt(filters.concepto, 10);
    if (!isNaN(conceptoNum)) {
      extra.push(`c.concept_id = $${i++}`);
      values.push(conceptoNum);
    }
  }

  const extraWhere = extra.length ? "AND " + extra.join(" AND ") : "";

  const sql = `
    SELECT
      c.id                                                                    AS charge_id,
      s.id                                                                    AS student_id,
      s.nombre_completo                                                       AS alumno,
      COALESCE(s.nivel_escolar, '')                                           AS nivel,
      c.ciclo_escolar                                                         AS ciclo,
      con.nombre                                                              AS concepto,
      c.fecha_vencimiento,
      GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date)::int             AS dias_vencido,
      -- saldo pendiente = total neto − pagos aplicados confirmados
      GREATEST(0,
        (ROUND(c.monto_base_centavos
               * (1 - COALESCE(c.beca_aplicada::numeric, 0) / 100.0))
         + COALESCE(c.recargo_aplicado_centavos, 0))::bigint
        - COALESCE(pagado.monto_pagado, 0)
      )::bigint                                                               AS saldo_centavos,
      -- Clasificación en bucket (días vencido, ambos extremos inclusivos)
      CASE
        WHEN GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date) = 0   THEN 'al_corriente'
        WHEN GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date) <= 30  THEN '1_30'
        WHEN GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date) <= 60  THEN '31_60'
        WHEN GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date) <= 90  THEN '61_90'
        WHEN GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date) <= 120 THEN '91_120'
        ELSE 'mas_120'
      END                                                                     AS bucket
    FROM charges c
    JOIN   students  s   ON s.id = c.student_id
    JOIN   concepts  con ON con.id = c.concept_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pa.amount_centavos), 0) AS monto_pagado
      FROM payment_applications pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.charge_id = c.id
        AND p.estado = 'exitoso'
    ) pagado ON true
    WHERE s.campus_id = $1
      AND c.estado NOT IN ('pagado', 'cancelado')
      ${extraWhere}
    ORDER BY dias_vencido DESC, s.nombre_completo
    LIMIT 5000
  `;

  const result = await pool.query(sql, values);

  const detalle: DetalleRow[] = result.rows.map((r: any) => ({
    charge_id:         Number(r.charge_id),
    student_id:        Number(r.student_id),
    alumno:            String(r.alumno ?? ""),
    nivel:             String(r.nivel  ?? ""),
    ciclo:             r.ciclo != null ? String(r.ciclo) : null,
    concepto:          String(r.concepto ?? ""),
    fecha_vencimiento: r.fecha_vencimiento ?? null,
    dias_vencido:      Number(r.dias_vencido),
    saldo_centavos:    Number(r.saldo_centavos),
    bucket:            r.bucket as BucketKey,
  }));

  const total_cartera_centavos = detalle.reduce(
    (acc, r) => acc + r.saldo_centavos,
    0,
  );

  return { detalle, total_cartera_centavos };
}

// ── Agrega detalle en resumen por bucket ───────────────────────────────────────

function buildBuckets(
  detalle: DetalleRow[],
  total_cartera_centavos: number,
): BucketSummary[] {
  const map = new Map<BucketKey, { cargos: number; alumnos: Set<number>; monto: number }>();

  for (const key of BUCKET_ORDER) {
    map.set(key, { cargos: 0, alumnos: new Set(), monto: 0 });
  }

  for (const row of detalle) {
    const b = map.get(row.bucket)!;
    b.cargos   += 1;
    b.alumnos.add(row.student_id);
    b.monto    += row.saldo_centavos;
  }

  return BUCKET_ORDER.map((key) => {
    const b = map.get(key)!;
    const pct =
      total_cartera_centavos > 0
        ? Math.round((b.monto / total_cartera_centavos) * 10000) / 100 // 2 decimales
        : 0;
    return {
      key,
      label:          BUCKET_LABELS[key],
      count_cargos:   b.cargos,
      count_alumnos:  b.alumnos.size,
      monto_centavos: b.monto,
      porcentaje:     pct,
    };
  });
}

// ── Registro de rutas ──────────────────────────────────────────────────────────

export function registerReportesAntiguedadSaldosRoutes(app: Express): void {

  // ── GET /api/reportes/antiguedad-saldos ────────────────────────────────────
  app.get("/api/reportes/antiguedad-saldos", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "No tienes permisos para ver este reporte" });
      }

      const campusId = user.campus_id as number;
      const { ciclo, nivel, concepto } = req.query as AntiguedadFilters;

      const { detalle, total_cartera_centavos } =
        await fetchAntiguedadData(campusId, { ciclo, nivel, concepto });

      const buckets = buildBuckets(detalle, total_cartera_centavos);

      return res.json({
        buckets,
        total_cartera_centavos,
        detalle,
        filters: {
          ciclo:    ciclo    ?? null,
          nivel:    nivel    ?? null,
          concepto: concepto ?? null,
        },
      });
    } catch (err: any) {
      console.error("[RPT-07 GET /api/reportes/antiguedad-saldos]", err.message);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/reportes/antiguedad-saldos/exportar ─────────────────────────
  app.post("/api/reportes/antiguedad-saldos/exportar", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.EXPORT)) {
        return res.status(403).json({ message: "Sin permisos para exportar reportes" });
      }

      const campusId = user.campus_id as number;
      const { format = "excel", ciclo, nivel, concepto } = req.body as {
        format?:   "excel" | "pdf";
        ciclo?:    string;
        nivel?:    string;
        concepto?: string;
      };

      if (format !== "excel" && format !== "pdf") {
        return res.status(400).json({ message: "Formato inválido. Use 'excel' o 'pdf'" });
      }

      const { detalle, total_cartera_centavos } =
        await fetchAntiguedadData(campusId, { ciclo, nivel, concepto });

      const appliedFilters: Record<string, string> = {};
      if (ciclo)    appliedFilters["Ciclo"]    = ciclo;
      if (nivel)    appliedFilters["Nivel"]    = nivel;
      if (concepto) appliedFilters["Concepto"] = concepto;

      // Para el export se incluye el detalle + columna de bucket
      const exportRows = detalle.map((r) => ({
        ...r,
        bucket_label: BUCKET_LABELS[r.bucket],
      }));

      const buf = await exportReport({
        title:    "Reporte de Antigüedad de Saldos",
        subtitle: `Total cartera: ${(total_cartera_centavos / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}`,
        columns: [
          { key: "alumno",            header: "Alumno",            format: "string",       width: 30 },
          { key: "nivel",             header: "Nivel",             format: "string",       width: 14 },
          { key: "ciclo",             header: "Ciclo",             format: "string",       width: 14 },
          { key: "concepto",          header: "Concepto",          format: "string",       width: 24 },
          { key: "fecha_vencimiento", header: "Vcto.",             format: "date",         width: 14 },
          { key: "dias_vencido",      header: "Días vencido",      format: "integer",      width: 14, align: "right" },
          { key: "saldo_centavos",    header: "Saldo pendiente",   format: "currency_mxn", width: 18, align: "right" },
          { key: "bucket_label",      header: "Bucket",            format: "string",       width: 18 },
        ],
        rows:           exportRows,
        appliedFilters,
        format,
        filename:       filenameFor("antiguedad-saldos", format),
        generatedBy:    user.email,
      });

      const fname = filenameFor("antiguedad-saldos", format);
      res.setHeader("Content-Type",        contentTypeFor(format));
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      return res.send(buf);
    } catch (err: any) {
      console.error("[RPT-07 POST /api/reportes/antiguedad-saldos/exportar]", err.message);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
