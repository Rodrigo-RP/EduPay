/**
 * reportes-admisiones.ts — RPT-04 Reporte de Admisiones y Becas
 *
 * GET  /api/reportes/admisiones          MODULES.ADMISSIONS / ACTIONS.READ
 * POST /api/reportes/admisiones/exportar MODULES.REPORTS    / ACTIONS.EXPORT
 *
 * Reemplaza R6 — GET /api/admin/admissions-report (admin.ts)
 * Migra exportación client-side (XLSX.utils en reportes-admisiones.tsx:128-131)
 * al servidor usando exportReport().
 *
 * Respuesta GET:
 *   resumen          — total_alumnos, alumnos_con_beca, monto_descuento_centavos, inscripciones
 *   por_tipo_beca    — distribución por scholarship_types (con catch si la tabla no existe)
 *   alumnos[]        — detalle por alumno con beca + tutor principal
 *   total, filters
 *
 * Filtros aceptados:
 *   ciclo        — students con charges en ese ciclo_escolar
 *   nivel        — students.nivel_escolar
 *   estado       — students.status
 *   fecha_desde  — students.created_at::date >=
 *   fecha_hasta  — students.created_at::date <=
 *
 * Guards:
 *   GET     → ADMISSIONS.READ  (personal de admisiones, asistente, contador, admin)
 *   POST    → REPORTS.EXPORT   (no incluye auxiliar_contable ni asistente)
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

interface AdmisionesParams {
  ciclo?:       string;
  nivel?:       string;
  estado?:      string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

// ─── helpers SQL ──────────────────────────────────────────────────────────────

/**
 * Construye filtros WHERE a nivel students para las consultas de resumen
 * (summary, monto_descuento).  $1 siempre reservado para campusId.
 *
 * El filtro ciclo usa EXISTS en charges; nivel, estado y fechas van sobre students.
 */
function buildStudentFilters(
  p: AdmisionesParams,
  startIdx: number,
): { clauses: string[]; values: (string | number)[] } {
  const clauses: string[] = [];
  const values:  (string | number)[] = [];
  let i = startIdx;

  if (p.ciclo) {
    clauses.push(
      `EXISTS (SELECT 1 FROM charges ch WHERE ch.student_id = s.id AND ch.ciclo_escolar = $${i})`,
    );
    values.push(p.ciclo); i++;
  }
  if (p.nivel)        { clauses.push(`s.nivel_escolar = $${i}`);        values.push(p.nivel);        i++; }
  if (p.estado)       { clauses.push(`s.status = $${i}`);               values.push(p.estado);       i++; }
  if (p.fecha_desde)  { clauses.push(`s.created_at::date >= $${i}`);    values.push(p.fecha_desde);  i++; }
  if (p.fecha_hasta)  { clauses.push(`s.created_at::date <= $${i}`);    values.push(p.fecha_hasta);  i++; }

  return { clauses, values };
}

/**
 * Construye la consulta por alumno con LATERAL joins:
 *   · beca más reciente (scholarships)
 *   · monto descuento acumulado (charges.beca_aplicada, filtrado por ciclo si aplica)
 *   · tutor responsable de pago (student_guardian → guardians)
 *
 * El índice del ciclo se reutiliza en el EXISTS y en el LATERAL de descuento.
 */
function buildAlumnosQuery(
  p: AdmisionesParams,
  baseIdx: number,
): { sql: string; values: (string | number)[] } {
  const values: (string | number)[] = [];
  let i = baseIdx + 1;

  const where:   string[] = [];
  let cicloidx:  number | null = null;

  if (p.ciclo) {
    cicloidx = i;
    values.push(p.ciclo); i++;
    where.push(`EXISTS (
      SELECT 1 FROM charges ch2
      WHERE ch2.student_id = s.id
        AND ch2.ciclo_escolar = $${cicloidx}
    )`);
  }
  if (p.nivel)       { where.push(`s.nivel_escolar = $${i}`);     values.push(p.nivel);       i++; }
  if (p.estado)      { where.push(`s.status = $${i}`);            values.push(p.estado);      i++; }
  if (p.fecha_desde) { where.push(`s.created_at::date >= $${i}`); values.push(p.fecha_desde); i++; }
  if (p.fecha_hasta) { where.push(`s.created_at::date <= $${i}`); values.push(p.fecha_hasta); i++; }

  const whereExtra         = where.length > 0 ? "AND " + where.join(" AND ") : "";
  // El LATERAL de descuento filtra por ciclo usando el mismo índice de parámetro
  const lateralCicloFilter = cicloidx != null ? `AND c.ciclo_escolar = $${cicloidx}` : "";

  const sql = `
    SELECT
      s.id                                                               AS alumno_id,
      s.nombre_completo                                                  AS alumno,
      COALESCE(s.nivel_escolar, '')                                      AS nivel,
      COALESCE(s.grado, '')                                              AS grado,
      COALESCE(s.grupo, '')                                              AS grupo,
      s.status                                                           AS estado,
      (sch.student_id IS NOT NULL)                                       AS con_beca,
      COALESCE(sch.porcentaje, 0)::int                                   AS porcentaje_beca,
      COALESCE(sch.motivo, '')                                           AS motivo_beca,
      COALESCE(descuento.total_descuento, 0)::bigint                    AS monto_descuento_centavos,
      NULLIF(CONCAT(g.nombres, ' ', COALESCE(g.apellido_paterno, '')), ' ') AS tutor,
      g.correo_institucional_familiar                                    AS tutor_email,
      s.created_at                                                       AS fecha_registro
    FROM students s

    -- Beca más reciente del alumno (puede ser null si no tiene beca)
    LEFT JOIN LATERAL (
      SELECT sch2.student_id, sch2.porcentaje, sch2.motivo
      FROM scholarships sch2
      WHERE sch2.student_id = s.id
      ORDER BY sch2.id DESC
      LIMIT 1
    ) sch ON true

    -- Monto total descontado acumulado en charges (filtra por ciclo si se especificó)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
        ROUND(c.monto_base_centavos
              * COALESCE(c.beca_aplicada::numeric, 0) / 100.0)
      ), 0) AS total_descuento
      FROM charges c
      WHERE c.student_id = s.id
        AND COALESCE(c.beca_aplicada::numeric, 0) > 0
        ${lateralCicloFilter}
    ) descuento ON true

    -- Tutor principal (responsable de pago)
    LEFT JOIN LATERAL (
      SELECT g2.nombres, g2.apellido_paterno,
             g2.correo_institucional_familiar
      FROM student_guardian sg
      JOIN guardians g2 ON g2.id = sg.guardian_id
      WHERE sg.student_id = s.id
        AND sg.es_responsable_pago = true
      ORDER BY sg.guardian_id
      LIMIT 1
    ) g ON true

    WHERE s.campus_id = $1
      ${whereExtra}
    ORDER BY s.nombre_completo
    LIMIT 2000
  `;

  return { sql, values };
}

/** Transforma una fila del resultado en objeto tipado. */
function mapAlumno(row: Record<string, unknown>) {
  return {
    alumno_id:               Number(row.alumno_id),
    alumno:                  String(row.alumno ?? ""),
    nivel:                   String(row.nivel  ?? ""),
    grado:                   String(row.grado  ?? ""),
    grupo:                   String(row.grupo  ?? ""),
    estado:                  String(row.estado ?? ""),
    con_beca:                Boolean(row.con_beca),
    porcentaje_beca:         Number(row.porcentaje_beca),
    motivo_beca:             String(row.motivo_beca ?? ""),
    monto_descuento_centavos: Number(row.monto_descuento_centavos),
    tutor:                   row.tutor ? String(row.tutor) : null,
    tutor_email:             row.tutor_email ? String(row.tutor_email) : null,
    fecha_registro:          row.fecha_registro ?? null,
  };
}

// ─── registro de rutas ────────────────────────────────────────────────────────

export function registerReportesAdmisionesRoutes(app: Express): void {

  // ── GET /api/reportes/admisiones ──────────────────────────────────────────
  app.get("/api/reportes/admisiones", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.ADMISSIONS, ACTIONS.READ)) {
        return res
          .status(403)
          .json({ message: "Sin permisos para consultar reportes de admisiones" });
      }

      const campusId: number | undefined = user?.campus_id;
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      const { ciclo, nivel, estado, fecha_desde, fecha_hasta } =
        req.query as Record<string, string>;

      const params: AdmisionesParams = { ciclo, nivel, estado, fecha_desde, fecha_hasta };

      // ── Ciclo para inscripciones (usa el parámetro o el año en curso) ──────
      const cicloCalc =
        ciclo ??
        `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

      // ── Filtros comunes para consultas de resumen ─────────────────────────
      const { clauses: sfC, values: sfV } = buildStudentFilters(params, 2);
      const sfWhere = sfC.length > 0 ? "AND " + sfC.join(" AND ") : "";

      // ── 4 consultas de resumen en paralelo ───────────────────────────────
      const [summaryRow, montoRow, inscRow, distRow] = await Promise.all([

        // 1. total_alumnos + alumnos_con_beca
        pool.query(
          `SELECT
             COUNT(DISTINCT s.id)::int              AS total_alumnos,
             COUNT(DISTINCT sch.student_id)::int    AS alumnos_con_beca
           FROM students s
           LEFT JOIN scholarships sch ON sch.student_id = s.id
           WHERE s.campus_id = $1
             ${sfWhere}`,
          [campusId, ...sfV],
        ),

        // 2. monto total descontado desde charges.beca_aplicada
        pool.query(
          `SELECT COALESCE(SUM(
             ROUND(c.monto_base_centavos
                   * COALESCE(c.beca_aplicada::numeric, 0) / 100.0)
           ), 0)::bigint AS monto_descuento_centavos
           FROM charges c
           JOIN students s ON s.id = c.student_id
           WHERE s.campus_id = $1
             AND COALESCE(c.beca_aplicada::numeric, 0) > 0
             ${ciclo ? `AND c.ciclo_escolar = $2` : ""}
             ${
               (() => {
                 // nivel/estado/fecha clauses referenciando s, si hay ciclo los índices empiezan en $3
                 const base = ciclo ? 3 : 2;
                 const extra: string[] = [];
                 const xv:    (string | number)[] = [];
                 let xi = base;
                 if (nivel)       { extra.push(`s.nivel_escolar = $${xi}`);     xv.push(nivel);       xi++; }
                 if (estado)      { extra.push(`s.status = $${xi}`);            xv.push(estado);      xi++; }
                 if (fecha_desde) { extra.push(`s.created_at::date >= $${xi}`); xv.push(fecha_desde); xi++; }
                 if (fecha_hasta) { extra.push(`s.created_at::date <= $${xi}`); xv.push(fecha_hasta); xi++; }
                 return extra.length > 0 ? "AND " + extra.join(" AND ") : "";
               })()
             }`,
          (() => {
            const v: (string | number)[] = [campusId];
            if (ciclo)       v.push(ciclo);
            if (nivel)       v.push(nivel!);
            if (estado)      v.push(estado!);
            if (fecha_desde) v.push(fecha_desde!);
            if (fecha_hasta) v.push(fecha_hasta!);
            return v;
          })(),
        ),

        // 3. Inscripciones del ciclo (igual que R6, con filtro ciclo explícito)
        pool.query(
          `SELECT COUNT(DISTINCT c.id)::int                   AS total,
                  COALESCE(SUM(pa.amount_centavos), 0)::bigint AS monto_centavos
           FROM payment_applications pa
           JOIN charges   c   ON c.id  = pa.charge_id
           JOIN concepts  co  ON co.id = c.concept_id
           JOIN students  s   ON s.id  = c.student_id
           JOIN payments  p   ON p.id  = pa.payment_id
           WHERE s.campus_id = $1
             AND LOWER(co.nombre) LIKE '%inscripci%'
             AND (
               c.ciclo_escolar = $2
               OR (c.ciclo_escolar IS NULL AND p.created_at >= date_trunc('year', NOW()))
             )
             AND p.estado = 'exitoso'`,
          [campusId, cicloCalc],
        ).catch(() => ({ rows: [{ total: 0, monto_centavos: 0 }] })),

        // 4. Distribución por tipo de beca (con catch si scholarship_types no existe)
        pool.query(
          `SELECT COALESCE(st.nombre, 'Sin tipo') AS tipo,
                  st.categoria                    AS categoria,
                  COUNT(*)::int                   AS cantidad,
                  COALESCE(AVG(sch.porcentaje), 0)::int AS porcentaje_promedio
           FROM scholarships sch
           JOIN students s ON s.id = sch.student_id
           LEFT JOIN scholarship_types st ON st.id = sch.scholarship_type_id
           WHERE s.campus_id = $1
           GROUP BY st.id, st.nombre, st.categoria
           ORDER BY cantidad DESC`,
          [campusId],
        ).catch(() => ({ rows: [] })),
      ]);

      // ── Consulta por alumno ───────────────────────────────────────────────
      const { sql: alumnoSql, values: alumnoVals } = buildAlumnosQuery(params, 1);
      const alumnosResult = await pool.query(alumnoSql, [campusId, ...alumnoVals]);

      const alumnos = alumnosResult.rows.map(mapAlumno);

      return res.json({
        resumen: {
          total_alumnos:             Number(summaryRow.rows[0]?.total_alumnos    ?? 0),
          alumnos_con_beca:          Number(summaryRow.rows[0]?.alumnos_con_beca ?? 0),
          monto_descuento_centavos:  Number(montoRow.rows[0]?.monto_descuento_centavos ?? 0),
          inscripciones: {
            total:          Number(inscRow.rows[0]?.total          ?? 0),
            monto_centavos: Number(inscRow.rows[0]?.monto_centavos ?? 0),
            ciclo:          cicloCalc,
          },
        },
        por_tipo_beca: distRow.rows,
        alumnos,
        total:   alumnos.length,
        filters: { ciclo, nivel, estado, fecha_desde, fecha_hasta },
      });
    } catch (error: any) {
      console.error("[RPT-04] GET /api/reportes/admisiones:", error);
      return res.status(500).json({ message: "Error generando reporte de admisiones" });
    }
  });

  // ── POST /api/reportes/admisiones/exportar ────────────────────────────────
  app.post(
    "/api/reportes/admisiones/exportar",
    authenticateToken,
    async (req, res) => {
      try {
        const user = (req as any).user;
        if (!hasPermissionForUser(user, MODULES.REPORTS, ACTIONS.EXPORT)) {
          return res
            .status(403)
            .json({ message: "Sin permisos para exportar reportes de admisiones" });
        }

        const campusId: number | undefined = user?.campus_id;
        if (!campusId) {
          return res.status(400).json({ message: "Campus ID requerido" });
        }

        const {
          formato = "excel",
          ciclo, nivel, estado, fecha_desde, fecha_hasta,
        } = req.body as Record<string, string>;

        if (formato !== "excel" && formato !== "pdf") {
          return res.status(400).json({ message: "formato debe ser 'excel' o 'pdf'" });
        }

        const params: AdmisionesParams = { ciclo, nivel, estado, fecha_desde, fecha_hasta };
        const { sql, values } = buildAlumnosQuery(params, 1);
        const result = await pool.query(sql, [campusId, ...values]);
        const alumnos = result.rows.map(mapAlumno);

        const rows = alumnos.map(a => ({
          alumno:                   a.alumno,
          nivel:                    a.nivel,
          grado:                    a.grado,
          grupo:                    a.grupo,
          estado:                   a.estado,
          con_beca:                 a.con_beca ? "Sí" : "No",
          porcentaje_beca:          a.porcentaje_beca,
          monto_descuento_centavos: a.monto_descuento_centavos,
          tutor:                    a.tutor ?? "",
          tutor_email:              a.tutor_email ?? "",
          fecha_registro:           a.fecha_registro,
        }));

        const appliedFilters: Record<string, string> = {};
        if (ciclo)       appliedFilters["Ciclo"]       = ciclo;
        if (nivel)       appliedFilters["Nivel"]       = nivel;
        if (estado)      appliedFilters["Estado"]      = estado;
        if (fecha_desde) appliedFilters["Desde"]       = fecha_desde;
        if (fecha_hasta) appliedFilters["Hasta"]       = fecha_hasta;

        const exportReq: ReportExportRequest = {
          title:    "Reporte de Admisiones y Becas",
          subtitle: `Campus ID: ${campusId}`,
          columns: [
            { key: "alumno",                   header: "Alumno",            width: 30, format: "string" },
            { key: "nivel",                    header: "Nivel",             width: 12, format: "string" },
            { key: "grado",                    header: "Grado",             width: 10, format: "string" },
            { key: "grupo",                    header: "Grupo",             width: 8,  format: "string" },
            { key: "estado",                   header: "Estado",            width: 12, format: "string" },
            { key: "con_beca",                 header: "Con Beca",          width: 10, format: "string" },
            { key: "porcentaje_beca",          header: "% Beca",            width: 8,  format: "integer",      align: "right" },
            { key: "monto_descuento_centavos", header: "Monto Descuento",   width: 16, format: "currency_mxn", align: "right" },
            { key: "tutor",                    header: "Tutor",             width: 25, format: "string" },
            { key: "tutor_email",              header: "Email Tutor",       width: 28, format: "string" },
            { key: "fecha_registro",           header: "Fecha Registro",    width: 16, format: "date" },
          ],
          rows,
          appliedFilters,
          format:      formato as "excel" | "pdf",
          filename:    filenameFor("admisiones", formato as "excel" | "pdf"),
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
        console.error("[RPT-04] POST /api/reportes/admisiones/exportar:", error);
        return res.status(500).json({ message: "Error exportando reporte de admisiones" });
      }
    },
  );
}
