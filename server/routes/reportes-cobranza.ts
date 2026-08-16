/**
 * reportes-cobranza.ts — RPT-03 Reporte de Cargos y Cobranza
 *
 * GET  /api/reportes/cobranza          MODULES.REPORTS / ACTIONS.READ
 * POST /api/reportes/cobranza/exportar MODULES.REPORTS / ACTIONS.EXPORT
 *
 * Reemplaza R5 — GET /api/charges/export (guardian.ts)
 *
 * Columnas de salida (15):
 *   charge_id (solo en JSON, no en export),
 *   alumno, nivel, grado, concepto, ciclo,
 *   fecha_emision, fecha_vencimiento,
 *   monto_base, descuento_beca, recargo, total,
 *   monto_pagado, saldo_pendiente, estado, dias_vencido
 *
 * Filtros aceptados:
 *   ciclo        — charges.ciclo_escolar
 *   nivel        — students.nivel_escolar
 *   grado        — students.grado
 *   grupo        — students.grupo
 *   fecha_desde  — charges.fecha_emision >= (ISO date)
 *   fecha_hasta  — charges.fecha_emision <= (ISO date)
 *   concepto     — charges.concept_id (entero)
 *   estado       — charges.estado ('pendiente','parcial','vencido','pagado')
 *
 * saldo_pendiente:
 *   Calculado como total - SUM(payment_applications.amount_centavos)
 *   para payments con estado='exitoso'. Considera pagos parciales
 *   vía payment_applications, no solo el campo estado del cargo.
 *
 * dias_vencido:
 *   CURRENT_DATE - fecha_vencimiento, solo cuando estado NOT IN ('pagado','cancelado')
 *   y fecha_vencimiento < CURRENT_DATE. Cero en cualquier otro caso.
 *
 * Cargos con estado='cancelado' se excluyen siempre.
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

// ─── tipos de parámetros ──────────────────────────────────────────────────────

interface CobranzaParams {
  ciclo?:       string;
  nivel?:       string;
  grado?:       string;
  grupo?:       string;
  fecha_desde?: string;
  fecha_hasta?: string;
  concepto?:    string;
  estado?:      string;
}

// ─── query builder ────────────────────────────────────────────────────────────

/**
 * Devuelve la SQL y los valores de binding para el reporte de cobranza.
 * $1 siempre está reservado para campusId (pasado externamente).
 */
function buildCobranzaQuery(
  params: CobranzaParams,
  baseIdx: number,
): { sql: string; values: (string | number)[] } {
  const values: (string | number)[] = [];
  let i = baseIdx + 1; // $1 = campusId

  const where: string[] = [];

  if (params.ciclo) {
    where.push(`c.ciclo_escolar = $${i++}`);
    values.push(params.ciclo);
  }
  if (params.nivel) {
    where.push(`s.nivel_escolar = $${i++}`);
    values.push(params.nivel);
  }
  if (params.grado) {
    where.push(`s.grado = $${i++}`);
    values.push(params.grado);
  }
  if (params.grupo) {
    where.push(`s.grupo = $${i++}`);
    values.push(params.grupo);
  }
  if (params.fecha_desde) {
    where.push(`c.fecha_emision >= $${i++}`);
    values.push(params.fecha_desde);
  }
  if (params.fecha_hasta) {
    where.push(`c.fecha_emision <= $${i++}`);
    values.push(params.fecha_hasta);
  }
  if (params.concepto) {
    where.push(`c.concept_id = $${i++}`);
    values.push(parseInt(params.concepto, 10));
  }
  if (params.estado) {
    where.push(`c.estado = $${i++}`);
    values.push(params.estado);
  }

  const whereExtra = where.length > 0 ? "AND " + where.join(" AND ") : "";

  const sql = `
    SELECT
      c.id                                                                      AS charge_id,
      s.nombre_completo                                                         AS alumno,
      COALESCE(s.nivel_escolar, '')                                             AS nivel,
      COALESCE(s.grado, '')                                                     AS grado,
      con.nombre                                                                AS concepto,
      c.ciclo_escolar                                                           AS ciclo,
      c.fecha_emision,
      c.fecha_vencimiento,
      c.monto_base_centavos                                                     AS monto_base,
      ROUND(c.monto_base_centavos
            * COALESCE(c.beca_aplicada::numeric, 0) / 100.0)::bigint           AS descuento_beca,
      COALESCE(c.recargo_aplicado_centavos, 0)                                 AS recargo,
      (ROUND(c.monto_base_centavos
             * (1 - COALESCE(c.beca_aplicada::numeric, 0) / 100.0))
       + COALESCE(c.recargo_aplicado_centavos, 0))::bigint                     AS total,
      COALESCE(pagado.monto_pagado, 0)::bigint                                 AS monto_pagado,
      GREATEST(0,
        (ROUND(c.monto_base_centavos
               * (1 - COALESCE(c.beca_aplicada::numeric, 0) / 100.0))
         + COALESCE(c.recargo_aplicado_centavos, 0))::bigint
        - COALESCE(pagado.monto_pagado, 0)
      )::bigint                                                                 AS saldo_pendiente,
      c.estado,
      CASE
        WHEN c.fecha_vencimiento < CURRENT_DATE
         AND c.estado NOT IN ('pagado', 'cancelado')
        THEN (CURRENT_DATE - c.fecha_vencimiento::date)::int
        ELSE 0
      END                                                                       AS dias_vencido
    FROM charges c
    JOIN students s   ON s.id = c.student_id
    JOIN concepts con ON con.id = c.concept_id

    -- Suma de pagos aplicados a este cargo (payment_applications es la fuente
    -- de verdad para pagos parciales; amount_centavos es el campo real en la tabla)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pa.amount_centavos), 0) AS monto_pagado
      FROM payment_applications pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.charge_id = c.id
        AND p.estado = 'exitoso'
    ) pagado ON true

    WHERE s.campus_id = $1
      AND c.estado != 'cancelado'
      ${whereExtra}
    ORDER BY c.fecha_vencimiento ASC NULLS LAST, s.nombre_completo
    LIMIT 5000
  `;

  return { sql, values };
}

/** Convierte una fila del resultado a objeto tipado. */
function mapRow(row: Record<string, unknown>) {
  return {
    charge_id:         Number(row.charge_id),
    alumno:            String(row.alumno ?? ""),
    nivel:             String(row.nivel  ?? ""),
    grado:             String(row.grado  ?? ""),
    concepto:          String(row.concepto ?? ""),
    ciclo:             row.ciclo != null ? String(row.ciclo) : null,
    fecha_emision:     row.fecha_emision     ?? null,
    fecha_vencimiento: row.fecha_vencimiento ?? null,
    monto_base:        Number(row.monto_base),
    descuento_beca:    Number(row.descuento_beca),
    recargo:           Number(row.recargo),
    total:             Number(row.total),
    monto_pagado:      Number(row.monto_pagado),
    saldo_pendiente:   Number(row.saldo_pendiente),
    estado:            String(row.estado ?? ""),
    dias_vencido:      Number(row.dias_vencido),
  };
}

// ─── registro de rutas ────────────────────────────────────────────────────────

export function registerReportesCobranzaRoutes(app: Express): void {

  // ── GET /api/reportes/cobranza ──────────────────────────────────────────────
  app.get("/api/reportes/cobranza", authenticateToken, async (req, res) => {
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
        ciclo, nivel, grado, grupo,
        fecha_desde, fecha_hasta,
        concepto, estado,
      } = req.query as Record<string, string>;

      const { sql, values } = buildCobranzaQuery(
        { ciclo, nivel, grado, grupo, fecha_desde, fecha_hasta, concepto, estado },
        1,
      );

      const result = await pool.query(sql, [campusId, ...values]);

      const charges = result.rows.map(mapRow);

      return res.json({
        charges,
        total: charges.length,
        filters: { ciclo, nivel, grado, grupo, fecha_desde, fecha_hasta, concepto, estado },
      });
    } catch (error: any) {
      console.error("[RPT-03] GET /api/reportes/cobranza:", error);
      return res.status(500).json({ message: "Error generando reporte de cobranza" });
    }
  });

  // ── POST /api/reportes/cobranza/exportar ────────────────────────────────────
  app.post("/api/reportes/cobranza/exportar", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.EXPORT)) {
        return res
          .status(403)
          .json({ message: "No tienes permiso para exportar este reporte" });
      }

      const campusId: number | undefined = user?.campus_id;
      if (!campusId) {
        return res
          .status(400)
          .json({ message: "Usuario debe tener campus asociado" });
      }

      const {
        formato = "excel",
        ciclo, nivel, grado, grupo,
        fecha_desde, fecha_hasta,
        concepto, estado,
      } = req.body as Record<string, string>;

      if (formato !== "excel" && formato !== "pdf") {
        return res
          .status(400)
          .json({ message: "formato debe ser 'excel' o 'pdf'" });
      }

      const { sql, values } = buildCobranzaQuery(
        { ciclo, nivel, grado, grupo, fecha_desde, fecha_hasta, concepto, estado },
        1,
      );

      const result = await pool.query(sql, [campusId, ...values]);
      const rows   = result.rows.map(mapRow);

      // Filtros legibles para pie de página / metadatos del reporte
      const appliedFilters: Record<string, string> = {};
      if (ciclo)       appliedFilters["Ciclo"]        = ciclo;
      if (nivel)       appliedFilters["Nivel"]        = nivel;
      if (grado)       appliedFilters["Grado"]        = grado;
      if (grupo)       appliedFilters["Grupo"]        = grupo;
      if (fecha_desde) appliedFilters["Desde"]        = fecha_desde;
      if (fecha_hasta) appliedFilters["Hasta"]        = fecha_hasta;
      if (concepto)    appliedFilters["Concepto ID"]  = concepto;
      if (estado)      appliedFilters["Estado"]       = estado;

      const exportReq: ReportExportRequest = {
        title:    "Reporte de Cargos y Cobranza",
        subtitle: `Campus ID: ${campusId}`,
        columns: [
          { key: "alumno",            header: "Alumno",             width: 30, format: "string" },
          { key: "nivel",             header: "Nivel",              width: 12, format: "string" },
          { key: "grado",             header: "Grado",              width: 10, format: "string" },
          { key: "concepto",          header: "Concepto",           width: 22, format: "string" },
          { key: "ciclo",             header: "Ciclo",              width: 14, format: "string" },
          { key: "fecha_emision",     header: "Fecha Emisión",      width: 14, format: "date" },
          { key: "fecha_vencimiento", header: "Fecha Vencimiento",  width: 18, format: "date" },
          { key: "monto_base",        header: "Monto Base",         width: 14, format: "currency_mxn", align: "right" },
          { key: "descuento_beca",    header: "Descuento Beca",     width: 16, format: "currency_mxn", align: "right" },
          { key: "recargo",           header: "Recargo",            width: 12, format: "currency_mxn", align: "right" },
          { key: "total",             header: "Total",              width: 14, format: "currency_mxn", align: "right" },
          { key: "monto_pagado",      header: "Monto Pagado",       width: 14, format: "currency_mxn", align: "right" },
          { key: "saldo_pendiente",   header: "Saldo Pendiente",    width: 16, format: "currency_mxn", align: "right" },
          { key: "estado",            header: "Estado",             width: 12, format: "string" },
          { key: "dias_vencido",      header: "Días Vencido",       width: 13, format: "integer",      align: "right" },
        ],
        rows,
        appliedFilters,
        format:      formato as "excel" | "pdf",
        filename:    filenameFor("cobranza", formato as "excel" | "pdf"),
        generatedBy: user?.email,
      };

      const buffer = await exportReport(exportReq);

      res.setHeader("Content-Type", contentTypeFor(formato as "excel" | "pdf"));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportReq.filename}"`,
      );
      return res.send(buffer);
    } catch (error: any) {
      console.error("[RPT-03] POST /api/reportes/cobranza/exportar:", error);
      return res.status(500).json({ message: "Error exportando reporte de cobranza" });
    }
  });
}
