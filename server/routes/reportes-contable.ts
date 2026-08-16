/**
 * RPT-06 — Reporte Contable / Fiscal
 *
 * GET  /api/reportes/contable          — FISCAL.READ
 *   Reemplaza R9 (/api/fiscal/reportes-contables).
 *   Bug corregido: el parámetro `periodo` se recibía pero se ignoraba en SQL;
 *   la query siempre devolvía los últimos 12 meses sin importar el valor.
 *   Fix: cuando `periodo` está presente (formato YYYY-MM), agrega
 *     WHERE DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', $N::date)
 *   y elimina el LIMIT 12 para ese caso.
 *
 * POST /api/reportes/contable/exportar — REPORTS.EXPORT
 *   Genera Excel o PDF via exportReport().
 *
 * Filtros soportados:
 *   ciclo   — charges.ciclo_escolar = $ciclo
 *   periodo — YYYY-MM → DATE_TRUNC('month', p.created_at) = periodo
 */

import { Express } from "express";
import { pool }    from "../db";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "../../shared/permissions";
import {
  exportReport,
  contentTypeFor,
  filenameFor,
} from "../lib/report-exporter";

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface ContableFilters {
  ciclo?:   string;   // e.g. "2025-2026"
  periodo?: string;   // e.g. "2025-06" (YYYY-MM)
}

interface ContableRow {
  mes:              Date | string;
  total_pagos:      number;
  ingreso_centavos: number;
  total_cfdis:      number;
}

// ── Query compartida ───────────────────────────────────────────────────────────

async function fetchContableData(
  campusId: number,
  filters: ContableFilters,
): Promise<ContableRow[]> {
  const params: (string | number)[] = [campusId];
  const where: string[] = ["s.campus_id=$1"];

  // Filtro ciclo escolar (sobre charges)
  if (filters.ciclo) {
    params.push(filters.ciclo);
    where.push(`c.ciclo_escolar = $${params.length}`);
  }

  // Filtro periodo YYYY-MM (sobre payments.created_at)
  // Bug histórico: la versión R9 recibía este parámetro pero no lo usaba en SQL.
  let limitClause = "LIMIT 12"; // comportamiento por defecto sin filtro de periodo
  if (filters.periodo) {
    params.push(`${filters.periodo}-01`);
    where.push(
      `DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', $${params.length}::date)`,
    );
    limitClause = ""; // con filtro de mes no se aplica el LIMIT
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const result = await pool.query(
    `SELECT DATE_TRUNC('month', p.created_at)  AS mes,
            COUNT(*)                            AS total_pagos,
            COALESCE(SUM(p.monto_centavos), 0) AS ingreso_centavos,
            COUNT(i.id)                         AS total_cfdis
     FROM   payments p
     JOIN   charges  c ON c.id  = p.charge_id
     JOIN   students s ON s.id  = c.student_id
     LEFT JOIN invoices i ON i.payment_id = p.id
     ${whereClause}
     GROUP BY DATE_TRUNC('month', p.created_at)
     ORDER BY mes DESC
     ${limitClause}`,
    params,
  );

  return result.rows.map((r: any) => ({
    mes:              r.mes,
    total_pagos:      Number(r.total_pagos),
    ingreso_centavos: Number(r.ingreso_centavos),
    total_cfdis:      Number(r.total_cfdis),
  }));
}

// ── Registro de rutas ──────────────────────────────────────────────────────────

export function registerReportesContableRoutes(app: Express): void {

  // ── GET /api/reportes/contable ─────────────────────────────────────────────
  app.get("/api/reportes/contable", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.FISCAL, ACTIONS.READ)) {
        return res
          .status(403)
          .json({ message: "Sin permisos para acceder a información fiscal" });
      }

      const campusId = user.campus_id as number;
      const { ciclo, periodo } = req.query as {
        ciclo?:   string;
        periodo?: string;
      };

      const reportes = await fetchContableData(campusId, { ciclo, periodo });

      return res.json({
        reportes,
        filters: {
          ciclo:   ciclo   ?? null,
          periodo: periodo ?? null,
        },
      });
    } catch (err: any) {
      console.error("[RPT-06 GET /api/reportes/contable]", err.message);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/reportes/contable/exportar ───────────────────────────────────
  app.post("/api/reportes/contable/exportar", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.EXPORT)) {
        return res
          .status(403)
          .json({ message: "Sin permisos para exportar reportes" });
      }

      const campusId = user.campus_id as number;
      const { format = "excel", ciclo, periodo } = req.body as {
        format?:  "excel" | "pdf";
        ciclo?:   string;
        periodo?: string;
      };

      if (format !== "excel" && format !== "pdf") {
        return res
          .status(400)
          .json({ message: "Formato inválido. Use 'excel' o 'pdf'" });
      }

      const reportes = await fetchContableData(campusId, { ciclo, periodo });

      const appliedFilters: Record<string, string> = {};
      if (ciclo)   appliedFilters["Ciclo"]   = ciclo;
      if (periodo) appliedFilters["Periodo"] = periodo;

      const subtitle =
        ciclo   ? `Ciclo ${ciclo}` :
        periodo ? `Periodo ${periodo}` :
                  "Últimos 12 meses";

      const buf = await exportReport({
        title:    "Reporte Contable / Fiscal",
        subtitle,
        columns: [
          { key: "mes",              header: "Mes",         format: "date",         width: 16 },
          { key: "total_pagos",      header: "Pagos",       format: "integer",      width: 12, align: "right" },
          { key: "ingreso_centavos", header: "Ingreso",     format: "currency_mxn", width: 18, align: "right" },
          { key: "total_cfdis",      header: "CFDIs",       format: "integer",      width: 12, align: "right" },
        ],
        rows:           reportes,
        appliedFilters,
        format,
        filename:       filenameFor("reporte-contable", format),
        generatedBy:    user.email,
      });

      const fname = filenameFor("reporte-contable", format);
      res.setHeader("Content-Type",        contentTypeFor(format));
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      return res.send(buf);
    } catch (err: any) {
      console.error("[RPT-06 POST /api/reportes/contable/exportar]", err.message);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
