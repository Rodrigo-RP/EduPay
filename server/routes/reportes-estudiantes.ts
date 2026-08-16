/**
 * reportes-estudiantes.ts — RPT-02 Reporte de Estudiantes
 *
 * GET  /api/reportes/estudiantes          MODULES.REPORTS / ACTIONS.READ
 * POST /api/reportes/estudiantes/exportar MODULES.REPORTS / ACTIONS.EXPORT
 *
 * Reemplaza:
 *   R3 — GET /api/export/:type?type=estudiantes (volcado crudo via XLSX)
 *   R4 — GET /api/admin/students/:campusId/export (7 cols sin tutor)
 *
 * Columnas de salida (7):
 *   nombre_completo, nivel, grado, grupo, estado_alumno,
 *   ciclo_escolar, tutor_principal
 *
 * Filtros aceptados:
 *   ciclo   — solo estudiantes con al menos un cargo en ese ciclo_escolar
 *   nivel   — students.nivel_escolar
 *   grado   — students.grado
 *   grupo   — students.grupo
 *   estado  — students.status  ('activo','baja','suspendido','egresado')
 *
 * tutor_principal:
 *   Primer guardián con es_responsable_pago = true (ORDER BY guardian_id).
 *   NULL cuando no existe relación o ninguno es responsable de pago.
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

// ─── SQL base ─────────────────────────────────────────────────────────────────

/**
 * Construye la query principal.
 *
 * Dos mecanismos para el filtro ciclo:
 *  1. LATERAL subquery de charges: si se pasa ciclo, restringe la selección
 *     de ciclo_escolar a ese valor (la columna siempre muestra el ciclo correcto).
 *  2. EXISTS en el WHERE principal: solo incluye alumnos que tienen al menos
 *     un cargo con ese ciclo_escolar.
 */
function buildStudentQuery(
  params: {
    ciclo?:  string;
    nivel?:  string;
    grado?:  string;
    grupo?:  string;
    estado?: string;
  },
  baseIdx: number,        // $1 = campusId
): { sql: string; values: (string | number)[] } {
  const values: (string | number)[] = [];
  let i = baseIdx + 1;    // siguiente índice disponible (el $1 ya está reservado)

  // ── Filtros en WHERE de students ─────────────────────────────────────────
  const whereClauses: string[] = [];

  if (params.estado) {
    values.push(params.estado);
    whereClauses.push(`s.status = $${i++}`);
  }
  if (params.nivel) {
    values.push(params.nivel);
    whereClauses.push(`s.nivel_escolar = $${i++}`);
  }
  if (params.grado) {
    values.push(params.grado);
    whereClauses.push(`s.grado = $${i++}`);
  }
  if (params.grupo) {
    values.push(params.grupo);
    whereClauses.push(`s.grupo = $${i++}`);
  }

  // ── Filtro ciclo: EXISTS en charges ──────────────────────────────────────
  let cicloExistsClause = "";
  let cicloLateralFilter = "";

  if (params.ciclo) {
    values.push(params.ciclo);
    const cicloIdx = i++;
    cicloExistsClause = `AND EXISTS (
        SELECT 1 FROM charges c2
        WHERE c2.student_id = s.id
          AND c2.ciclo_escolar = $${cicloIdx}
      )`;
    cicloLateralFilter = `AND c.ciclo_escolar = $${cicloIdx}`;
  }

  const whereExtra =
    whereClauses.length > 0
      ? "AND " + whereClauses.join(" AND ")
      : "";

  const sql = `
    SELECT
      s.id,
      s.nombre_completo,
      COALESCE(s.nivel_escolar, '') AS nivel,
      COALESCE(s.grado, '')         AS grado,
      COALESCE(s.grupo, '')         AS grupo,
      s.status                      AS estado_alumno,
      lc.ciclo_escolar,
      NULLIF(
        CONCAT(g.nombres, ' ', COALESCE(g.apellido_paterno, '')),
        ' '
      ) AS tutor_principal
    FROM students s

    -- Ciclo más reciente del alumno (restringido al filtro si se especificó)
    LEFT JOIN LATERAL (
      SELECT c.ciclo_escolar
      FROM charges c
      WHERE c.student_id = s.id
        AND c.ciclo_escolar IS NOT NULL
        ${cicloLateralFilter}
      ORDER BY c.created_at DESC
      LIMIT 1
    ) lc ON true

    -- Primer tutor responsable de pago
    LEFT JOIN LATERAL (
      SELECT g2.nombres, g2.apellido_paterno
      FROM student_guardian sg
      JOIN guardians g2 ON g2.id = sg.guardian_id
      WHERE sg.student_id = s.id
        AND sg.es_responsable_pago = true
      ORDER BY sg.guardian_id
      LIMIT 1
    ) g ON true

    WHERE s.campus_id = $1
      ${whereExtra}
      ${cicloExistsClause}
    ORDER BY s.nombre_completo
    LIMIT 2000
  `;

  return { sql, values };
}

// ─── registro de rutas ────────────────────────────────────────────────────────

export function registerReportesEstudiantesRoutes(app: Express): void {

  // ── GET /api/reportes/estudiantes ─────────────────────────────────────────
  app.get("/api/reportes/estudiantes", authenticateToken, async (req, res) => {
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
        nivel,
        grado,
        grupo,
        estado,
      } = req.query as Record<string, string>;

      const { sql, values } = buildStudentQuery(
        { ciclo, nivel, grado, grupo, estado },
        1,
      );

      const { rows } = await pool.query(sql, [campusId, ...values]);

      res.json({
        total: rows.length,
        students: rows.map((r: any) => ({
          id:               Number(r.id),
          nombre_completo:  r.nombre_completo,
          nivel:            r.nivel,
          grado:            r.grado,
          grupo:            r.grupo,
          estado_alumno:    r.estado_alumno,
          ciclo_escolar:    r.ciclo_escolar ?? null,
          tutor_principal:  r.tutor_principal ?? null,
        })),
        filters: {
          ciclo:  ciclo  || null,
          nivel:  nivel  || null,
          grado:  grado  || null,
          grupo:  grupo  || null,
          estado: estado || null,
        },
      });
    } catch (error: any) {
      console.error("[GET /api/reportes/estudiantes]", error);
      res.status(500).json({ message: "Error generando reporte de estudiantes" });
    }
  });

  // ── POST /api/reportes/estudiantes/exportar ───────────────────────────────
  app.post(
    "/api/reportes/estudiantes/exportar",
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
          nivel,
          grado,
          grupo,
          estado,
        } = req.body as {
          formato?: string;
          ciclo?:  string;
          nivel?:  string;
          grado?:  string;
          grupo?:  string;
          estado?: string;
        };

        if (formato !== "excel" && formato !== "pdf") {
          return res
            .status(400)
            .json({ message: "Formato inválido: use 'excel' o 'pdf'" });
        }

        const { sql, values } = buildStudentQuery(
          { ciclo, nivel, grado, grupo, estado },
          1,
        );

        const { rows } = await pool.query(sql, [campusId, ...values]);

        // Filtros legibles para el encabezado
        const appliedFilters: Record<string, string> = {};
        if (ciclo)   appliedFilters["Ciclo"]  = ciclo;
        if (nivel)   appliedFilters["Nivel"]  = nivel;
        if (grado)   appliedFilters["Grado"]  = grado;
        if (grupo)   appliedFilters["Grupo"]  = grupo;
        if (estado)  appliedFilters["Estado"] = estado;

        const exportReq: ReportExportRequest = {
          title:    "Reporte de Estudiantes",
          subtitle: Object.keys(appliedFilters).length > 0
            ? undefined
            : "Todos los alumnos del campus",
          columns: [
            { key: "nombre_completo", header: "Nombre completo",  format: "string", width: 32 },
            { key: "nivel",           header: "Nivel",            format: "string", width: 16 },
            { key: "grado",           header: "Grado",            format: "string", width: 16 },
            { key: "grupo",           header: "Grupo",            format: "string", width: 10 },
            { key: "estado_alumno",   header: "Estado",           format: "string", width: 14 },
            { key: "ciclo_escolar",   header: "Ciclo escolar",    format: "string", width: 14 },
            { key: "tutor_principal", header: "Tutor responsable",format: "string", width: 28 },
          ],
          rows: rows.map((r: any) => ({
            nombre_completo: r.nombre_completo,
            nivel:           r.nivel,
            grado:           r.grado,
            grupo:           r.grupo,
            estado_alumno:   r.estado_alumno,
            ciclo_escolar:   r.ciclo_escolar ?? "",
            tutor_principal: r.tutor_principal ?? "",
          })),
          appliedFilters,
          format:      formato as "excel" | "pdf",
          filename:    "reporte_estudiantes",
          generatedBy: user?.name || user?.email || "EduPay",
        };

        const buffer = await exportReport(exportReq);
        res.setHeader("Content-Type", contentTypeFor(formato as "excel" | "pdf"));
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filenameFor("reporte_estudiantes", formato as "excel" | "pdf")}"`,
        );
        res.send(buffer);
      } catch (error: any) {
        console.error("[POST /api/reportes/estudiantes/exportar]", error);
        res.status(500).json({ message: "Error exportando reporte de estudiantes" });
      }
    },
  );
}
