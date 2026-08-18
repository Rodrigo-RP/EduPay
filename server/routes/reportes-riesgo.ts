/**
 * RPT-08 — Reporte de Riesgo de Cobranza
 *
 * GET  /api/reportes/riesgo          — RECEIVABLES.READ
 *   Resumen por semáforo (rojo/amarillo/verde) + detalle por alumno.
 *   Reutiliza computeRiesgoScore() de conciliacion.ts — misma fórmula que el
 *   dashboard Semáforo de Riesgo (/api/riesgo/semaforo/:campusId).
 *
 * POST /api/reportes/riesgo/exportar — REPORTS.EXPORT
 *   Genera Excel o PDF via exportReport().
 *
 * Guard: RECEIVABLES.READ (consistencia con /api/riesgo/semaforo/:campusId).
 *        REPORTS.EXPORT para exportación (igual que otros reportes del catálogo).
 *
 * Diferencia con el Semáforo operativo:
 *   - Semáforo: dashboard en tiempo real, filtrado client-side, CSV.
 *   - RPT-08:   reporte formal, filtros server-side, Excel/PDF exportables.
 *   Ambos coexisten: consumos distintos, guards distintos.
 *
 * Filtros soportados:
 *   ciclo    — solo alumnos con al menos un cargo en ese ciclo_escolar
 *   nivel    — students.nivel_escolar
 *   grado    — students.grado
 *   grupo    — students.grupo
 *   semaforo — "rojo" | "amarillo" | "verde" (aplicado en JS tras computar score)
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
import { computeRiesgoScore } from "./conciliacion";

// ── Tipos internos ─────────────────────────────────────────────────────────────

type SemaforoColor = "rojo" | "amarillo" | "verde";

interface RiesgoFilters {
  ciclo?:    string;
  nivel?:    string;
  grado?:    string;
  grupo?:    string;
  semaforo?: SemaforoColor | string;
}

interface DetalleRow {
  student_id:           number;
  estudiante:           string;
  nombre_familia:       string;
  nivel:                string;
  grado:                string;
  grupo:                string;
  adeudo_centavos:      number;
  dias_vencido:         number;
  tasa_pago_historica:  number;
  score:                number;
  semaforo:             SemaforoColor;
  historial_descripcion: string;
}

interface ResumenItem {
  semaforo:       SemaforoColor;
  count_alumnos:  number;
  monto_centavos: number;
}

// ── Query compartida ───────────────────────────────────────────────────────────

async function fetchRiesgoData(
  campusId: number,
  filters: RiesgoFilters,
): Promise<{ detalle: DetalleRow[] }> {
  const values: (string | number)[] = [campusId];
  const extra:  string[] = [];
  let   i = 2;

  // Filtros directos sobre students
  if (filters.nivel) {
    extra.push(`s.nivel_escolar = $${i++}`);
    values.push(filters.nivel);
  }
  if (filters.grado) {
    extra.push(`s.grado = $${i++}`);
    values.push(filters.grado);
  }
  if (filters.grupo) {
    extra.push(`s.grupo = $${i++}`);
    values.push(filters.grupo);
  }
  // Filtro de ciclo: solo alumnos con al menos un cargo en ese ciclo
  if (filters.ciclo) {
    extra.push(
      `EXISTS (
         SELECT 1 FROM charges cf
         WHERE cf.student_id = s.id AND cf.ciclo_escolar = $${i++}
       )`,
    );
    values.push(filters.ciclo);
  }

  const extraWhere = extra.length ? "AND " + extra.join(" AND ") : "";

  const sql = `
    SELECT
      s.id                                                                    AS student_id,
      s.nombre_completo                                                       AS estudiante,
      COALESCE((
        SELECT CONCAT(g.nombres, ' ', g.apellido_paterno)
        FROM   student_guardian sg
        JOIN   guardians g ON g.id = sg.guardian_id
        WHERE  sg.student_id = s.id
        ORDER  BY sg.guardian_id LIMIT 1
      ), '')                                                                  AS nombre_familia,
      COALESCE(s.nivel_escolar, '')                                           AS nivel,
      COALESCE(s.grado,         '')                                           AS grado,
      COALESCE(s.grupo,         '')                                           AS grupo,
      -- adeudo = suma de cargos pendientes
      COALESCE(
        SUM(CASE WHEN c.estado = 'pendiente' THEN c.monto_base_centavos ELSE 0 END),
        0
      )                                                                       AS adeudo_centavos,
      -- dias_vencido = max días vencidos entre cargos pendientes vencidos
      COALESCE(
        MAX(GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date)::int)
        FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento::date < CURRENT_DATE),
        0
      )                                                                       AS dias_vencido,
      -- tasa_pago_historica = pagos / cargos en últimos 6 meses (%)
      COALESCE(
        ROUND(
          (COUNT(p.id)  FILTER (WHERE p.created_at  > NOW() - INTERVAL '6 months'))::numeric /
          NULLIF(
            COUNT(c2.id) FILTER (WHERE c2.created_at > NOW() - INTERVAL '6 months'),
            0
          ) * 100
        ),
        0
      )                                                                       AS tasa_pago_historica
    FROM   students s
    LEFT JOIN charges  c  ON c.student_id  = s.id
    LEFT JOIN payments p  ON p.charge_id  IN (SELECT id FROM charges WHERE student_id = s.id)
    LEFT JOIN charges  c2 ON c2.student_id = s.id
    WHERE  s.campus_id = $1
      ${extraWhere}
    GROUP  BY s.id, s.nombre_completo, s.nivel_escolar, s.grado, s.grupo
    HAVING COUNT(c2.id) > 0
    ORDER  BY adeudo_centavos DESC, s.nombre_completo
    LIMIT  500
  `;

  const result = await pool.query(sql, values);

  // Computar score con la fórmula canónica exportada desde conciliacion.ts
  const detalle: DetalleRow[] = result.rows.map((r: any) => {
    const diasVencido    = Number(r.dias_vencido        || 0);
    const adeudoCentavos = Number(r.adeudo_centavos     || 0);
    const tasaPago       = Number(r.tasa_pago_historica || 0);

    const { score, semaforo, historial_descripcion } = computeRiesgoScore({
      diasVencido,
      adeudoCentavos,
      tasaPago,
    });

    return {
      student_id:           Number(r.student_id),
      estudiante:           String(r.estudiante       ?? ""),
      nombre_familia:       String(r.nombre_familia   ?? ""),
      nivel:                String(r.nivel            ?? ""),
      grado:                String(r.grado            ?? ""),
      grupo:                String(r.grupo            ?? ""),
      adeudo_centavos:      adeudoCentavos,
      dias_vencido:         diasVencido,
      tasa_pago_historica:  tasaPago,
      score,
      semaforo,
      historial_descripcion,
    };
  });

  return { detalle };
}

// ── Resumen por color ──────────────────────────────────────────────────────────

function buildResumen(detalle: DetalleRow[]): ResumenItem[] {
  const map: Record<SemaforoColor, { count: number; monto: number }> = {
    rojo:     { count: 0, monto: 0 },
    amarillo: { count: 0, monto: 0 },
    verde:    { count: 0, monto: 0 },
  };
  for (const r of detalle) {
    map[r.semaforo].count  += 1;
    map[r.semaforo].monto  += r.adeudo_centavos;
  }
  return (["rojo", "amarillo", "verde"] as SemaforoColor[]).map((s) => ({
    semaforo:       s,
    count_alumnos:  map[s].count,
    monto_centavos: map[s].monto,
  }));
}

// ── Registro de rutas ──────────────────────────────────────────────────────────

export function registerReportesRiesgoRoutes(app: Express): void {

  // ── GET /api/reportes/riesgo ───────────────────────────────────────────────
  app.get("/api/reportes/riesgo", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.RECEIVABLES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver el reporte de riesgo" });
      }

      const campusId = user.campus_id as number;
      const { ciclo, nivel, grado, grupo, semaforo } = req.query as RiesgoFilters;

      const { detalle: todosDetalle } = await fetchRiesgoData(campusId, {
        ciclo, nivel, grado, grupo,
      });

      // Filtro de semáforo: aplicado en JS (requiere haber computado el score)
      const detalle = semaforo && ["rojo", "amarillo", "verde"].includes(semaforo)
        ? todosDetalle.filter((r) => r.semaforo === semaforo)
        : todosDetalle;

      const resumen = buildResumen(detalle);

      return res.json({
        resumen,
        total_adeudo_centavos: detalle.reduce((acc, r) => acc + r.adeudo_centavos, 0),
        detalle,
        filters: {
          ciclo:    ciclo    ?? null,
          nivel:    nivel    ?? null,
          grado:    grado    ?? null,
          grupo:    grupo    ?? null,
          semaforo: semaforo ?? null,
        },
      });
    } catch (err: any) {
      console.error("[RPT-08 GET /api/reportes/riesgo]", err.message);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/reportes/riesgo/exportar ────────────────────────────────────
  app.post("/api/reportes/riesgo/exportar", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.EXPORT)) {
        return res.status(403).json({ message: "Sin permisos para exportar reportes" });
      }

      const campusId = user.campus_id as number;
      const { formato = "excel", ciclo, nivel, grado, grupo, semaforo } = req.body as {
        formato?:  "excel" | "pdf";
        ciclo?:    string;
        nivel?:    string;
        grado?:    string;
        grupo?:    string;
        semaforo?: string;
      };

      if (formato !== "excel" && formato !== "pdf") {
        return res.status(400).json({ message: "Formato inválido. Use 'excel' o 'pdf'" });
      }

      const { detalle: todosDetalle } = await fetchRiesgoData(campusId, {
        ciclo, nivel, grado, grupo,
      });

      const detalle = semaforo && ["rojo", "amarillo", "verde"].includes(semaforo)
        ? todosDetalle.filter((r) => r.semaforo === semaforo)
        : todosDetalle;

      const appliedFilters: Record<string, string> = {};
      if (ciclo)    appliedFilters["Ciclo"]    = ciclo;
      if (nivel)    appliedFilters["Nivel"]    = nivel;
      if (grado)    appliedFilters["Grado"]    = grado;
      if (grupo)    appliedFilters["Grupo"]    = grupo;
      if (semaforo) appliedFilters["Semáforo"] = semaforo;

      const totalAdeudo = detalle.reduce((acc, r) => acc + r.adeudo_centavos, 0);

      const buf = await exportReport({
        title:    "Reporte de Riesgo de Cobranza",
        subtitle: `Total adeudo: ${(totalAdeudo / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}`,
        columns: [
          { key: "semaforo",            header: "Semáforo",         format: "string",       width: 12 },
          { key: "score",               header: "Score",            format: "integer",      width: 8,  align: "right" },
          { key: "estudiante",          header: "Alumno",           format: "string",       width: 28 },
          { key: "nombre_familia",      header: "Familia",          format: "string",       width: 24 },
          { key: "nivel",               header: "Nivel",            format: "string",       width: 14 },
          { key: "grado",               header: "Grado",            format: "string",       width: 8  },
          { key: "grupo",               header: "Grupo",            format: "string",       width: 8  },
          { key: "adeudo_centavos",     header: "Adeudo",           format: "currency_mxn", width: 18, align: "right" },
          { key: "dias_vencido",        header: "Días vencido",     format: "integer",      width: 14, align: "right" },
          { key: "tasa_pago_historica", header: "Tasa pago 6m %",   format: "integer",      width: 16, align: "right" },
          { key: "historial_descripcion", header: "Historial",      format: "string",       width: 20 },
        ],
        rows:           detalle,
        appliedFilters,
        format:         formato,
        filename:       filenameFor("reporte-riesgo", formato),
        generatedBy:    user.email,
      });

      const fname = filenameFor("reporte-riesgo", formato);
      res.setHeader("Content-Type",        contentTypeFor(formato));
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      return res.send(buf);
    } catch (err: any) {
      console.error("[RPT-08 POST /api/reportes/riesgo/exportar]", err.message);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
