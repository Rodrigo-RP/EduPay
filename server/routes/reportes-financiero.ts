/**
 * reportes-financiero.ts — RPT-01 Reporte Financiero
 *
 * GET  /api/reportes/financiero          MODULES.REPORTS / ACTIONS.READ
 * POST /api/reportes/financiero/exportar MODULES.REPORTS / ACTIONS.EXPORT
 *
 * Reemplaza los endpoints /api/reports/financial (R1) y
 * /api/reports/financial/export (R2) que usaban Math.random() y
 * constantes hardcodeadas en guardian.ts.
 *
 * Filtros aceptados:
 *   ciclo        — ciclo_escolar en charges (ej. "2025-2026")
 *   fecha_desde  — p.fecha_pago >=  (pagos) / c.fecha_emision >= (cargos)
 *   fecha_hasta  — p.fecha_pago <=  (pagos) / c.fecha_emision <= (cargos)
 *   concepto     — concept_id en charges (entero)
 *   meses        — ventana de tendencia mensual, default 12, máx 36
 *
 * income_growth / payment_growth:
 *   - Si se especifica fecha_desde + fecha_hasta: compara el período anterior
 *     de idéntica duración inmediatamente antes de fecha_desde.
 *   - Si no hay filtro de fecha ni ciclo: compara mes calendario actual vs
 *     mes anterior.
 *   - Si solo se especifica ciclo (sin fechas): no hay período comparable →
 *     se devuelven null.
 *   - El valor es null cuando el período anterior tiene 0 ingresos.
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

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Construye un array de cláusulas SQL y valores de binding partiendo de
 * un índice inicial. Los índices resultantes son $startIdx, $startIdx+1, …
 * Solo agrega cláusulas para los filtros que están definidos.
 */
function paymentFilters(
  p: { ciclo?: string; fecha_desde?: string; fecha_hasta?: string; concepto?: string },
  startIdx: number,
): { clauses: string[]; values: (string | number)[] } {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  let i = startIdx;

  if (p.fecha_desde) {
    clauses.push(`p.fecha_pago >= $${i++}`);
    values.push(p.fecha_desde);
  }
  if (p.fecha_hasta) {
    // Incluir todo el día de fecha_hasta
    clauses.push(`p.fecha_pago <= $${i++}`);
    values.push(p.fecha_hasta + "T23:59:59");
  }
  if (p.ciclo) {
    clauses.push(`c.ciclo_escolar = $${i++}`);
    values.push(p.ciclo);
  }
  if (p.concepto) {
    clauses.push(`c.concept_id = $${i++}`);
    values.push(parseInt(p.concepto));
  }
  return { clauses, values };
}

function chargeFilters(
  p: { ciclo?: string; concepto?: string },
  startIdx: number,
): { clauses: string[]; values: (string | number)[] } {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  let i = startIdx;

  if (p.ciclo) {
    clauses.push(`c.ciclo_escolar = $${i++}`);
    values.push(p.ciclo);
  }
  if (p.concepto) {
    clauses.push(`c.concept_id = $${i++}`);
    values.push(parseInt(p.concepto));
  }
  return { clauses, values };
}

// ─── registro de rutas ────────────────────────────────────────────────────────

export function registerReportesFinancieroRoutes(app: Express): void {
  // ── GET /api/reportes/financiero ──────────────────────────────────────────
  app.get("/api/reportes/financiero", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.READ)) {
        return res
          .status(403)
          .json({ message: "No tienes permisos para ver este reporte" });
      }

      const campusId: number | undefined = user?.campus_id;
      if (!campusId) {
        return res
          .status(400)
          .json({ message: "Usuario debe tener campus asociado" });
      }

      const {
        ciclo,
        fecha_desde,
        fecha_hasta,
        concepto,
        meses: mesesParam = "12",
      } = req.query as Record<string, string>;

      const meses = Math.max(1, Math.min(36, parseInt(mesesParam) || 12));

      // ── Parámetros para queries de income (payments) ──────────────────────
      const incomeBase: (string | number)[] = [campusId];
      const { clauses: incC, values: incV } = paymentFilters(
        { ciclo, fecha_desde, fecha_hasta, concepto },
        2,
      );
      const incomeParams = [...incomeBase, ...incV];
      const incomeWhere =
        incC.length > 0 ? " AND " + incC.join(" AND ") : "";

      // ── Parámetros para queries de AR (charges) ───────────────────────────
      const arBase: (string | number)[] = [campusId];
      const { clauses: arC, values: arV } = chargeFilters(
        { ciclo, concepto },
        2,
      );
      const arParams = [...arBase, ...arV];
      const arWhere = arC.length > 0 ? " AND " + arC.join(" AND ") : "";

      // ── Summary en paralelo ───────────────────────────────────────────────
      const [summaryRow, arRow, overdueRow, facturadoRow] = await Promise.all([
        // 1. Ingresos + conteo de pagos
        pool.query(
          `SELECT
             COALESCE(SUM(p.monto_centavos), 0)::bigint AS total_income,
             COUNT(p.id)::int                           AS payments_count
           FROM payments p
           JOIN charges  c ON c.id = p.charge_id
           JOIN students s ON s.id = c.student_id
           WHERE s.campus_id = $1
             AND p.estado = 'exitoso'
             ${incomeWhere}`,
          incomeParams,
        ),

        // 2. Cuentas por cobrar (pendiente + parcial + vencido)
        pool.query(
          `SELECT
             COALESCE(SUM(
               ROUND(c.monto_base_centavos
                     * (1 - COALESCE(c.beca_aplicada::numeric, 0) / 100.0))
               + COALESCE(c.recargo_aplicado_centavos, 0)
             ), 0)::bigint AS cuentas_por_cobrar,
             COUNT(*)::int AS num_cuentas
           FROM charges  c
           JOIN students s ON s.id = c.student_id
           WHERE s.campus_id = $1
             AND c.estado IN ('pendiente', 'parcial', 'vencido')
             ${arWhere}`,
          arParams,
        ),

        // 3. Monto vencido (fecha_vencimiento ya pasó)
        pool.query(
          `SELECT
             COALESCE(SUM(
               ROUND(c.monto_base_centavos
                     * (1 - COALESCE(c.beca_aplicada::numeric, 0) / 100.0))
               + COALESCE(c.recargo_aplicado_centavos, 0)
             ), 0)::bigint AS monto_vencido,
             COUNT(*)::int AS num_vencidos
           FROM charges  c
           JOIN students s ON s.id = c.student_id
           WHERE s.campus_id = $1
             AND c.estado IN ('pendiente', 'parcial', 'vencido')
             AND c.fecha_vencimiento < CURRENT_DATE
             ${arWhere}`,
          arParams,
        ),

        // 4. Total facturado en período (base para tasa de cobranza)
        pool.query(
          `SELECT COALESCE(SUM(c.monto_base_centavos), 0)::bigint AS total_facturado
           FROM charges  c
           JOIN students s ON s.id = c.student_id
           WHERE s.campus_id = $1
             AND c.estado != 'cancelado'
             ${arWhere}`,
          arParams,
        ),
      ]);

      const total_income   = Number(summaryRow.rows[0]?.total_income   ?? 0);
      const payments_count = Number(summaryRow.rows[0]?.payments_count ?? 0);
      const cuentas_por_cobrar = Number(arRow.rows[0]?.cuentas_por_cobrar ?? 0);
      const num_cuentas        = Number(arRow.rows[0]?.num_cuentas        ?? 0);
      const monto_vencido = Number(overdueRow.rows[0]?.monto_vencido ?? 0);
      const num_vencidos  = Number(overdueRow.rows[0]?.num_vencidos  ?? 0);
      const total_facturado = Number(facturadoRow.rows[0]?.total_facturado ?? 0);

      const collection_rate =
        total_facturado > 0
          ? Math.round((total_income / total_facturado) * 1000) / 10
          : 0;

      // ── Cálculo de crecimiento (income_growth / payment_growth) ───────────
      let income_growth: number | null  = null;
      let payment_growth: number | null = null;

      if (fecha_desde && fecha_hasta && !ciclo) {
        // Período anterior de idéntica duración
        const d0 = new Date(fecha_desde);
        const d1 = new Date(fecha_hasta);
        const durationMs = d1.getTime() - d0.getTime();

        const prevHasta = new Date(d0.getTime() - 1);           // 1 ms antes de fecha_desde
        const prevDesde = new Date(d0.getTime() - durationMs - 1);

        const prevParams: (string | number)[] = [
          campusId,
          prevDesde.toISOString(),
          prevHasta.toISOString(),
        ];
        if (concepto) prevParams.push(parseInt(concepto));

        const prevRow = await pool.query(
          `SELECT
             COALESCE(SUM(p.monto_centavos), 0)::bigint AS total_income,
             COUNT(p.id)::int                           AS payments_count
           FROM payments p
           JOIN charges  c ON c.id = p.charge_id
           JOIN students s ON s.id = c.student_id
           WHERE s.campus_id = $1
             AND p.estado = 'exitoso'
             AND p.fecha_pago >= $2
             AND p.fecha_pago <= $3
             ${concepto ? `AND c.concept_id = $4` : ""}`,
          prevParams,
        );

        const prev_income = Number(prevRow.rows[0]?.total_income   ?? 0);
        const prev_count  = Number(prevRow.rows[0]?.payments_count ?? 0);

        if (prev_income > 0) {
          income_growth =
            Math.round(((total_income - prev_income) / prev_income) * 1000) / 10;
        }
        if (prev_count > 0) {
          payment_growth =
            Math.round(((payments_count - prev_count) / prev_count) * 1000) / 10;
        }
      } else if (!fecha_desde && !fecha_hasta && !ciclo) {
        // Sin filtros de fecha: mes actual vs mes anterior (calendario)
        const now   = new Date();
        const currStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const prevEnd   = new Date(
          now.getFullYear(), now.getMonth(), 0, 23, 59, 59,
        ).toISOString();

        const prevParams: (string | number)[] = [campusId, prevStart, prevEnd];
        const currParams: (string | number)[] = [campusId, currStart];
        if (concepto) {
          prevParams.push(parseInt(concepto));
          currParams.push(parseInt(concepto));
        }
        // prevParams: [campusId,$1 | prevStart,$2 | prevEnd,$3 | ?concepto,$4]
        // currParams: [campusId,$1 | currStart,$2 | ?concepto,$3]
        const concFilterPrev = concepto ? `AND c.concept_id = $4` : "";
        const concFilterCurr = concepto ? `AND c.concept_id = $3` : "";

        const [prevMonthRow, currMonthRow] = await Promise.all([
          pool.query(
            `SELECT
               COALESCE(SUM(p.monto_centavos), 0)::bigint AS total_income,
               COUNT(p.id)::int                           AS payments_count
             FROM payments p
             JOIN charges  c ON c.id = p.charge_id
             JOIN students s ON s.id = c.student_id
             WHERE s.campus_id = $1
               AND p.estado = 'exitoso'
               AND p.fecha_pago >= $2
               AND p.fecha_pago <= $3
               ${concFilterPrev}`,
            prevParams,
          ),
          pool.query(
            `SELECT
               COALESCE(SUM(p.monto_centavos), 0)::bigint AS total_income,
               COUNT(p.id)::int                           AS payments_count
             FROM payments p
             JOIN charges  c ON c.id = p.charge_id
             JOIN students s ON s.id = c.student_id
             WHERE s.campus_id = $1
               AND p.estado = 'exitoso'
               AND p.fecha_pago >= $2
               ${concFilterCurr}`,
            currParams,
          ),
        ]);

        const prev_income = Number(prevMonthRow.rows[0]?.total_income   ?? 0);
        const prev_count  = Number(prevMonthRow.rows[0]?.payments_count ?? 0);
        const curr_income = Number(currMonthRow.rows[0]?.total_income   ?? 0);
        const curr_count  = Number(currMonthRow.rows[0]?.payments_count ?? 0);

        if (prev_income > 0) {
          income_growth =
            Math.round(((curr_income - prev_income) / prev_income) * 1000) / 10;
        }
        if (prev_count > 0) {
          payment_growth =
            Math.round(((curr_count - prev_count) / prev_count) * 1000) / 10;
        }
      }
      // ciclo sin fechas → income_growth / payment_growth permanecen null

      // ── Ingresos por concepto ─────────────────────────────────────────────
      const conceptRows = await pool.query(
        `SELECT
           co.id                                              AS concept_id,
           co.nombre                                         AS concepto,
           COALESCE(SUM(p.monto_centavos), 0)::bigint        AS monto_centavos,
           COUNT(p.id)::int                                  AS num_pagos,
           ROUND(
             COALESCE(SUM(p.monto_centavos), 0) * 100.0
             / NULLIF(SUM(SUM(p.monto_centavos)) OVER (), 0)
           , 1)::float                                       AS porcentaje
         FROM payments  p
         JOIN charges   c  ON c.id  = p.charge_id
         JOIN students  s  ON s.id  = c.student_id
         JOIN concepts  co ON co.id = c.concept_id
         WHERE s.campus_id = $1
           AND p.estado = 'exitoso'
           ${incomeWhere}
         GROUP BY co.id, co.nombre
         ORDER BY monto_centavos DESC`,
        incomeParams,
      );

      // ── Métodos de pago ───────────────────────────────────────────────────
      const methodRows = await pool.query(
        `SELECT
           p.metodo,
           COALESCE(SUM(p.monto_centavos), 0)::bigint AS monto_centavos,
           COUNT(p.id)::int                           AS num_pagos
         FROM payments  p
         JOIN charges   c ON c.id = p.charge_id
         JOIN students  s ON s.id = c.student_id
         WHERE s.campus_id = $1
           AND p.estado = 'exitoso'
           ${incomeWhere}
         GROUP BY p.metodo
         ORDER BY monto_centavos DESC`,
        incomeParams,
      );

      // ── Tendencia mensual ─────────────────────────────────────────────────
      const trendBase: (string | number)[] = [campusId, meses];
      const { clauses: trendC, values: trendV } = chargeFilters(
        { ciclo, concepto },
        3,
      );
      const trendParams = [...trendBase, ...trendV];
      const trendWhere  = trendC.length > 0 ? " AND " + trendC.join(" AND ") : "";

      const trendRows = await pool.query(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', p.fecha_pago), 'YYYY-MM') AS mes,
           COALESCE(SUM(p.monto_centavos), 0)::bigint            AS monto_centavos,
           COUNT(p.id)::int                                      AS num_pagos
         FROM payments  p
         JOIN charges   c ON c.id = p.charge_id
         JOIN students  s ON s.id = c.student_id
         WHERE s.campus_id = $1
           AND p.estado = 'exitoso'
           AND p.fecha_pago >= NOW() - ($2::int || ' months')::interval
           ${trendWhere}
         GROUP BY mes
         ORDER BY mes`,
        trendParams,
      );

      res.json({
        summary: {
          total_income,
          payments_count,
          cuentas_por_cobrar,
          num_cuentas,
          monto_vencido,
          num_vencidos,
          collection_rate,
          income_growth,
          payment_growth,
        },
        income_by_concept: conceptRows.rows.map((r: any) => ({
          concept_id:     Number(r.concept_id),
          concepto:       r.concepto,
          monto_centavos: Number(r.monto_centavos ?? 0),
          num_pagos:      Number(r.num_pagos      ?? 0),
          porcentaje:     Number(r.porcentaje     ?? 0),
        })),
        payment_methods: methodRows.rows.map((r: any) => ({
          metodo:         r.metodo,
          monto_centavos: Number(r.monto_centavos ?? 0),
          num_pagos:      Number(r.num_pagos      ?? 0),
        })),
        monthly_trend: trendRows.rows.map((r: any) => ({
          mes:            r.mes,
          monto_centavos: Number(r.monto_centavos ?? 0),
          num_pagos:      Number(r.num_pagos      ?? 0),
        })),
        filters: {
          ciclo:       ciclo        || null,
          fecha_desde: fecha_desde  || null,
          fecha_hasta: fecha_hasta  || null,
          concepto:    concepto     ? parseInt(concepto) : null,
          meses,
        },
      });
    } catch (error: any) {
      console.error("[GET /api/reportes/financiero]", error);
      res.status(500).json({ message: "Error generando reporte financiero" });
    }
  });

  // ── POST /api/reportes/financiero/exportar ────────────────────────────────
  app.post(
    "/api/reportes/financiero/exportar",
    authenticateToken,
    async (req, res) => {
      try {
        const user = (req as any).user;
        if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.EXPORT)) {
          return res
            .status(403)
            .json({ message: "No tienes permisos para exportar este reporte" });
        }

        const campusId: number | undefined = user?.campus_id;
        if (!campusId) {
          return res
            .status(400)
            .json({ message: "Usuario debe tener campus asociado" });
        }

        const {
          formato = "excel",
          ciclo,
          fecha_desde,
          fecha_hasta,
          concepto,
        } = req.body as {
          formato?: string;
          ciclo?: string;
          fecha_desde?: string;
          fecha_hasta?: string;
          concepto?: string | number;
        };

        if (formato !== "excel" && formato !== "pdf") {
          return res
            .status(400)
            .json({ message: "Formato inválido: use 'excel' o 'pdf'" });
        }

        // Construir parámetros de query
        const conceptoStr = concepto !== undefined ? String(concepto) : undefined;
        const base: (string | number)[] = [campusId];
        const { clauses, values } = paymentFilters(
          { ciclo, fecha_desde, fecha_hasta, concepto: conceptoStr },
          2,
        );
        const params  = [...base, ...values];
        const where   = clauses.length > 0 ? " AND " + clauses.join(" AND ") : "";

        // Filas de detalle para el reporte
        const { rows } = await pool.query(
          `SELECT
             p.fecha_pago,
             s.nombre_completo                 AS alumno,
             co.nombre                         AS concepto_nombre,
             COALESCE(c.ciclo_escolar, '')      AS ciclo_escolar,
             p.metodo,
             p.monto_centavos
           FROM payments  p
           JOIN charges   c  ON c.id  = p.charge_id
           JOIN students  s  ON s.id  = c.student_id
           JOIN concepts  co ON co.id = c.concept_id
           WHERE s.campus_id = $1
             AND p.estado = 'exitoso'
             ${where}
           ORDER BY p.fecha_pago DESC
           LIMIT 5000`,
          params,
        );

        // Filtros legibles para el encabezado del reporte
        const appliedFilters: Record<string, string> = {};
        if (ciclo)        appliedFilters["Ciclo"]   = ciclo;
        if (fecha_desde)  appliedFilters["Desde"]   = fecha_desde;
        if (fecha_hasta)  appliedFilters["Hasta"]   = fecha_hasta;
        if (conceptoStr)  appliedFilters["Concepto"] = conceptoStr;

        const subtitle = ciclo
          ? `Ciclo ${ciclo}`
          : fecha_desde || fecha_hasta
          ? `Período: ${fecha_desde ?? "…"} – ${fecha_hasta ?? "…"}`
          : "Todos los períodos";

        const exportReq: ReportExportRequest = {
          title:    "Reporte Financiero",
          subtitle,
          columns: [
            { key: "fecha_pago",      header: "Fecha",        format: "date",         width: 12 },
            { key: "alumno",          header: "Alumno",       format: "string",       width: 30 },
            { key: "concepto_nombre", header: "Concepto",     format: "string",       width: 25 },
            { key: "ciclo_escolar",   header: "Ciclo",        format: "string",       width: 12 },
            { key: "metodo",          header: "Método",       format: "string",       width: 16 },
            { key: "monto_centavos",  header: "Monto",        format: "currency_mxn", width: 14, align: "right" },
          ],
          rows: rows.map((r: any) => ({
            fecha_pago:      r.fecha_pago,
            alumno:          r.alumno,
            concepto_nombre: r.concepto_nombre,
            ciclo_escolar:   r.ciclo_escolar,
            metodo:          r.metodo,
            monto_centavos:  Number(r.monto_centavos ?? 0),
          })),
          appliedFilters,
          format:      formato as "excel" | "pdf",
          filename:    "reporte_financiero",
          generatedBy: user?.name || user?.email || "EduPay",
        };

        const buffer = await exportReport(exportReq);
        res.setHeader("Content-Type", contentTypeFor(formato as "excel" | "pdf"));
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filenameFor("reporte_financiero", formato as "excel" | "pdf")}"`,
        );
        res.send(buffer);
      } catch (error: any) {
        console.error("[POST /api/reportes/financiero/exportar]", error);
        res.status(500).json({ message: "Error exportando reporte financiero" });
      }
    },
  );
}
