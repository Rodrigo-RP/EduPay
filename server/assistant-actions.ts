/**
 * assistant-actions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de acciones del asistente EduPay.
 * Maneja consultas de datos y acciones guiadas sin exponer SQL al cliente.
 *
 * Categorías:
 *   query:*   — solo lectura, se ejecutan al instante
 *   action:*  — escriben datos, requieren confirmación
 */

import { pool } from "./db";
import { runAllProbes } from "./assistant-validation";
import type { SuggestActionSignal, SuggestActionTrigger } from "./assistant-knowledge";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ActionResultRow {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export interface ActionResult {
  success: boolean;
  title: string;
  summary: string;
  rows?: ActionResultRow[];
  requiresConfirmation?: boolean;
  confirmPayload?: { actionId: string; params: Record<string, any>; label: string };
}

export interface ActionContext {
  campusId: number;
  tenantId: number;
  userId: number;
}

// ── §5.6 Guarda dura: acciones que NUNCA pueden ejecutarse sin confirmación ───
//
// El asistente JAMÁS crea, edita, revierte ni reprocesa por su cuenta un
// Charge, Payment, PaymentApplication, Invoice ni ningún campo relacionado
// con el saldo de una familia. Esta lista es la fuente de verdad; agregar
// cualquier acción financiera aquí la bloquea automáticamente si no llega
// con confirmación explícita del administrador.
const FINANCIAL_PROTECTED_ACTIONS = new Set([
  "action:crear_cargo",
  "action:editar_cargo",
  "action:eliminar_cargo",
  "action:revertir_pago",
  "action:reprocesar_pago",
  "action:crear_pago",
  "action:editar_pago",
  "action:crear_factura",
  "action:editar_factura",
  "action:cancelar_factura",
  "action:aplicar_pago",
  "action:revertir_aplicacion",
  "action:ajustar_saldo",
]);

// ── Utilidades ────────────────────────────────────────────────────────────────

function fmt(centavos: number | string | null): string {
  const n = typeof centavos === "string" ? parseInt(centavos, 10) : (centavos ?? 0);
  return `$${(n / 100).toLocaleString("es-MX", { minimumFractionDigits: 0 })}`;
}

// ── Handlers de consulta (query:*) ────────────────────────────────────────────

/** Investiga por qué dos cifras del sistema no coinciden */
async function queryDiscrepancia(_p: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM students WHERE campus_id = $1)                          AS alumnos_total,
         (SELECT COUNT(*) FROM students WHERE campus_id = $1 AND status = 'activo')    AS alumnos_activos,
         (SELECT COUNT(DISTINCT sh.student_id)
            FROM scholarships sh
            INNER JOIN students s ON s.id = sh.student_id
            WHERE s.campus_id = $1
              AND s.status = 'activo'
              AND sh.vigencia_inicio <= CURRENT_DATE
              AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)
         )                                                                              AS alumnos_con_beca,
         (SELECT COUNT(*)
            FROM scholarships sh
            INNER JOIN students s ON s.id = sh.student_id
            WHERE s.campus_id = $1
              AND s.status = 'activo'
              AND sh.vigencia_inicio <= CURRENT_DATE
              AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)
         )                                                                              AS becas_total,
         (SELECT COUNT(DISTINCT c.student_id)
            FROM charges c INNER JOIN students s ON c.student_id = s.id
            WHERE s.campus_id = $1)                                                    AS alumnos_con_cargo,
         (SELECT COUNT(*) FROM charges c
            INNER JOIN students s ON c.student_id = s.id WHERE s.campus_id = $1)      AS cargos_total`,
       [ctx.campusId]
    );

    const r = rows[0];
    const activos      = parseInt(r.alumnos_activos, 10);
    const total        = parseInt(r.alumnos_total, 10);
    const conBeca      = parseInt(r.alumnos_con_beca, 10);
    const becasTotal   = parseInt(r.becas_total, 10);
    const conCargo     = parseInt(r.alumnos_con_cargo, 10);

    let summary = "";
    if (conBeca > activos) {
      summary =
        `Hay **${conBeca} alumnos con beca** pero solo **${activos} alumnos activos** en este campus. ` +
        `Esto ocurre cuando las becas referencian alumnos de otros campus o alumnos dados de baja. ` +
        `El conteo de "8 alumnos" que ves en Estudiantes muestra solo los activos de este campus.`;
    } else if (becasTotal > total) {
      summary =
        `Hay más registros de becas (${becasTotal}) que alumnos registrados (${total}). ` +
        `Algunos alumnos beneficiados pueden pertenecer a otro campus dentro del mismo tenant.`;
    } else {
      summary =
        `Los registros son consistentes: ${activos} alumnos activos, ` +
        `${becasTotal} becas asignadas a ${conBeca} alumnos distintos.`;
    }

    return {
      success: true,
      title: "Diagnóstico de discrepancia",
      summary,
      rows: [
        { label: "Alumnos activos (este campus)",    value: activos,    highlight: true },
        { label: "Total alumnos (incl. inactivos)",  value: total },
        { label: "Alumnos con beca asignada",        value: conBeca,    highlight: conBeca !== activos },
        { label: "Total registros de becas",         value: becasTotal },
        { label: "Alumnos con cargos generados",     value: conCargo },
        { label: "Total cargos en sistema",          value: r.cargos_total },
      ],
    };
  } catch (e: any) {
    return { success: false, title: "Error", summary: `No pude investigar la discrepancia: ${e.message}` };
  }
}

/** Cuenta registros de una entidad del sistema */
async function queryContar(params: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  const entity = (params.entity || "").toLowerCase();

  try {
    if (entity.includes("alumno") || entity.includes("estudiante")) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER(WHERE status = 'activo') AS activos,
                COUNT(*) FILTER(WHERE status = 'inactivo') AS inactivos
         FROM students WHERE campus_id = $1`,
        [ctx.campusId]
      );
      const r = rows[0];
      return {
        success: true,
        title: "Alumnos registrados",
        summary: `Hay **${r.total} alumnos** en total en este campus.`,
        rows: [
          { label: "Total registrados",  value: r.total,    highlight: true },
          { label: "Activos",            value: r.activos },
          { label: "Inactivos",          value: r.inactivos },
        ],
      };
    }

    if (entity.includes("beca")) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(DISTINCT sh.student_id) AS alumnos_becados
         FROM scholarships sh
         INNER JOIN students s ON s.id = sh.student_id
         WHERE s.campus_id = $1
           AND s.status = 'activo'
           AND sh.vigencia_inicio <= CURRENT_DATE
           AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)`,
        [ctx.campusId]
      );
      const r = rows[0];
      return {
        success: true,
        title: "Becas vigentes",
        summary: `Hay **${r.total} asignación(es) de beca vigente(s)** para ${r.alumnos_becados} alumno(s) activo(s) distintos en este campus.`,
        rows: [
          { label: "Asignaciones vigentes",   value: r.total,          highlight: true },
          { label: "Alumnos beneficiados",    value: r.alumnos_becados },
        ],
      };
    }

    if (entity.includes("pago")) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(p.monto_centavos),0) AS suma
         FROM payments p
         INNER JOIN charges c ON p.charge_id = c.id
         INNER JOIN students s ON c.student_id = s.id
         WHERE s.campus_id = $1`,
        [ctx.campusId]
      );
      const r = rows[0];
      return {
        success: true,
        title: "Pagos registrados",
        summary: `Hay **${r.total} pagos** por un total de **${fmt(r.suma)}**.`,
        rows: [
          { label: "Total pagos",        value: r.total,     highlight: true },
          { label: "Monto total cobrado", value: fmt(r.suma) },
        ],
      };
    }

    if (entity.includes("cargo")) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER(WHERE c.estado = 'pagado')   AS pagados,
                COUNT(*) FILTER(WHERE c.estado = 'pendiente') AS pendientes,
                COUNT(*) FILTER(WHERE c.estado = 'vencido')   AS vencidos
         FROM charges c
         INNER JOIN students s ON c.student_id = s.id
         WHERE s.campus_id = $1`,
        [ctx.campusId]
      );
      const r = rows[0];
      return {
        success: true,
        title: "Cargos en sistema",
        summary: `Hay **${r.total} cargos** en total: ${r.pagados} pagados, ${r.pendientes} pendientes, ${r.vencidos} vencidos.`,
        rows: [
          { label: "Total cargos",   value: r.total,      highlight: true },
          { label: "Pagados",        value: r.pagados },
          { label: "Pendientes",     value: r.pendientes, highlight: parseInt(r.pendientes) > 0 },
          { label: "Vencidos",       value: r.vencidos,   highlight: parseInt(r.vencidos) > 0 },
        ],
      };
    }

    if (entity.includes("familia")) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS total FROM families WHERE tenant_id = $1`,
        [ctx.tenantId]
      );
      return {
        success: true,
        title: "Familias registradas",
        summary: `Hay **${rows[0].total} familias** en el sistema.`,
        rows: [{ label: "Total familias", value: rows[0].total, highlight: true }],
      };
    }

    return {
      success: false,
      title: "No entendí",
      summary: 'Puedo contar: alumnos, becas, pagos, cargos o familias. Ejemplo: _"¿cuántos alumnos tengo?"_',
    };
  } catch (e: any) {
    return { success: false, title: "Error", summary: `No pude consultar: ${e.message}` };
  }
}

/** Resumen financiero del campus */
async function queryResumenFinanciero(_p: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(c.monto_base_centavos) FILTER(WHERE c.estado = 'pagado'),   0) AS cobrado,
         COALESCE(SUM(c.monto_base_centavos) FILTER(WHERE c.estado = 'pendiente'),0) AS pendiente,
         COALESCE(SUM(c.monto_base_centavos) FILTER(WHERE c.estado = 'vencido'),  0) AS vencido,
         COUNT(*) FILTER(WHERE c.estado = 'pagado')                                  AS pagos_count,
         COUNT(*) FILTER(WHERE c.estado IN ('pendiente','vencido'))                  AS adeudos_count
       FROM charges c
       INNER JOIN students s ON c.student_id = s.id
       WHERE s.campus_id = $1`,
      [ctx.campusId]
    );
    const r = rows[0];
    const cobrado   = parseInt(r.cobrado, 10);
    const pendiente = parseInt(r.pendiente, 10);
    const vencido   = parseInt(r.vencido, 10);

    return {
      success: true,
      title: "Resumen financiero",
      summary:
        `Se han cobrado **${fmt(cobrado)}**. ` +
        `Hay **${fmt(pendiente)}** pendiente y **${fmt(vencido)}** vencido.`,
      rows: [
        { label: "✅ Cobrado",         value: fmt(cobrado),   highlight: false },
        { label: "⏳ Pendiente",        value: fmt(pendiente), highlight: pendiente > 0 },
        { label: "⚠️ Vencido",          value: fmt(vencido),   highlight: vencido > 0 },
        { label: "Pagos procesados",   value: r.pagos_count },
        { label: "Adeudos activos",    value: r.adeudos_count },
      ],
    };
  } catch (e: any) {
    return { success: false, title: "Error", summary: `No pude obtener el resumen: ${e.message}` };
  }
}

/** Busca alumnos por nombre */
async function queryBuscarAlumno(params: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  const nombre = (params.nombre || "").trim();
  if (nombre.length < 2) {
    return {
      success: false,
      title: "Búsqueda",
      summary: 'Necesito al menos 2 caracteres del nombre. Ejemplo: _"busca al alumno García"_',
    };
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.nombre_completo, s.grado, s.grupo, s.id_referencia, s.status,
              COALESCE(
                (SELECT SUM(monto_base_centavos) FILTER(WHERE estado IN ('pendiente','vencido'))
                 FROM charges WHERE student_id = s.id), 0
              ) AS saldo_pendiente
       FROM students s
       WHERE s.campus_id = $1
         AND LOWER(UNACCENT(s.nombre_completo)) LIKE LOWER(UNACCENT($2))
       ORDER BY s.nombre_completo
       LIMIT 5`,
      [ctx.campusId, `%${nombre}%`]
    );

    if (rows.length === 0) {
      return {
        success: false,
        title: "Sin resultados",
        summary: `No encontré alumnos con "${nombre}" en este campus. Verifica el nombre o revisa el módulo Estudiantes.`,
      };
    }
    if (rows.length > 1) {
      return {
        success: false,
        title: "Necesito desambiguar al alumno",
        summary:
          `Encontré ${rows.length} coincidencias para "${nombre}". ` +
          "Indica el grado, grupo o matrícula del alumno correcto.",
        rows: rows.map((r: any, i: number) => ({
          label: `${i + 1}. ${r.nombre_completo}`,
          value: `Grado: ${r.grado || "—"} · Grupo: ${r.grupo || "—"} · Matrícula: ${r.id_referencia || "—"}`,
        })),
      };
    }

    const resultRows: ActionResultRow[] = rows.flatMap((r: any, i: number) => [
      {
        label: `${i + 1}. ${r.nombre_completo}`,
        value: `${r.grado || ""} ${r.grupo || ""} · ${r.status}`.trim(),
      },
      {
        label: "   Saldo pendiente",
        value: fmt(r.saldo_pendiente),
        highlight: parseInt(r.saldo_pendiente, 10) > 0,
      },
    ]);

    return {
      success: true,
      title: `${rows.length} alumno(s) encontrado(s)`,
      summary: `Encontré **${rows.length} alumno(s)** con el nombre "${nombre}".`,
      rows: resultRows,
    };
  } catch (e: any) {
    // Fallback sin UNACCENT por si la extensión no está instalada
    try {
      const { rows } = await pool.query(
        `SELECT s.nombre_completo, s.grado, s.grupo, s.id_referencia, s.status,
                COALESCE((SELECT SUM(monto_base_centavos) FILTER(WHERE estado IN ('pendiente','vencido'))
                          FROM charges WHERE student_id = s.id), 0) AS saldo_pendiente
         FROM students s
        WHERE s.campus_id = $1
          AND LOWER(s.nombre_completo) LIKE LOWER($2)
         ORDER BY s.nombre_completo LIMIT 5`,
        [ctx.campusId, `%${nombre}%`]
      );
      if (rows.length === 0) {
        return { success: false, title: "Sin resultados", summary: `No encontré alumnos con "${nombre}".` };
      }
      if (rows.length > 1) {
        return {
          success: false,
          title: "Necesito desambiguar al alumno",
          summary:
            `Encontré ${rows.length} coincidencias para "${nombre}". ` +
            "Indica grado, grupo o matrícula.",
          rows: rows.map((r: any, i: number) => ({
            label: `${i + 1}. ${r.nombre_completo}`,
            value: `Grado: ${r.grado || "—"} · Grupo: ${r.grupo || "—"} · Matrícula: ${r.id_referencia || "—"}`,
          })),
        };
      }
      const resultRows: ActionResultRow[] = rows.flatMap((r: any, i: number) => [
        { label: `${i + 1}. ${r.nombre_completo}`, value: `${r.grado || ""} ${r.grupo || ""} · ${r.status}`.trim() },
        { label: "   Saldo pendiente", value: fmt(r.saldo_pendiente), highlight: parseInt(r.saldo_pendiente, 10) > 0 },
      ]);
      return { success: true, title: `${rows.length} alumno(s) encontrado(s)`, summary: `Encontré ${rows.length} alumno(s).`, rows: resultRows };
    } catch {
      return { success: false, title: "Error", summary: `No pude buscar al alumno: ${e.message}` };
    }
  }
}

/** Muestra saldo de un alumno específico */
async function querySaldoAlumno(params: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  return queryBuscarAlumno(params, ctx); // reutiliza búsqueda que incluye saldo
}

/** Muestra becas asignadas a un alumno */
async function queryBecasAlumno(params: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  const nombre = (params.nombre || "").trim();
  if (nombre.length < 2) {
    return {
      success: false,
      title: "Becas de alumno",
      summary: 'Indica el nombre del alumno. Ejemplo: _"qué becas tiene García"_',
    };
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.nombre_completo,
              sh.porcentaje,
              sh.vigencia_inicio,
              sh.vigencia_fin,
              sh.motivo
       FROM scholarships sh
       INNER JOIN students s ON sh.student_id = s.id
       WHERE s.campus_id = $1 AND LOWER(s.nombre_completo) LIKE LOWER($2)
       ORDER BY s.nombre_completo
       LIMIT 10`,
      [ctx.campusId, `%${nombre}%`]
    );

    if (rows.length === 0) {
      return {
        success: false,
        title: "Sin becas",
        summary: `No encontré becas para alumnos con el nombre "${nombre}".`,
      };
    }

    const resultRows: ActionResultRow[] = rows.map((r: any) => {
      const descuento = r.porcentaje != null ? `${r.porcentaje}%` : "—";
      const vigencia = r.vigencia_fin
        ? `hasta ${new Date(r.vigencia_fin).toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" })}`
        : "sin vencimiento";
      return {
        label: r.nombre_completo,
        value: `${descuento} · ${vigencia}${r.motivo ? ` · ${r.motivo}` : ""}`,
        highlight: true,
      };
    });

    return {
      success: true,
      title: "Becas asignadas",
      summary: `Encontré **${rows.length} beca(s)** para "${nombre}".`,
      rows: resultRows,
    };
  } catch (e: any) {
    return { success: false, title: "Error en becas", summary: `No pude consultar becas: ${e.message}` };
  }
}

/** Lista alumnos con beca activa filtrados por nivel escolar */
async function queryBecasNivel(params: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  const nivel = (params.nivel || "").trim();
  try {
    const { rows } = await pool.query(
      `SELECT s.nombre_completo,
              s.nivel_escolar,
              s.grado,
              sh.porcentaje,
              sh.vigencia_inicio,
              sh.vigencia_fin,
              sh.motivo
       FROM scholarships sh
       INNER JOIN students s ON sh.student_id = s.id
       WHERE s.campus_id = $1
          AND s.status = 'activo'
         AND sh.vigencia_inicio <= CURRENT_DATE
         AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)
         AND ($2 = '' OR LOWER(s.nivel_escolar) LIKE LOWER($2))
       ORDER BY s.nivel_escolar, s.nombre_completo
       LIMIT 25`,
      [ctx.campusId, nivel ? `%${nivel}%` : ""]
    );

    const titulo = nivel
      ? `Alumnos con beca activa en ${nivel}`
      : "Alumnos con beca activa";

    if (rows.length === 0) {
      return {
        success: true,
        title: titulo,
        summary: nivel
          ? `No hay alumnos con beca activa en la sección "${nivel}".`
          : "No hay alumnos con beca activa en este campus.",
        rows: [],
      };
    }

    const resultRows: ActionResultRow[] = rows.map((r: any) => {
      const descuento = r.porcentaje != null ? `${r.porcentaje}%` : "—";
      return {
        label: `${r.nombre_completo}${r.grado ? ` · ${r.grado}` : ""}`,
        value: `${descuento} beca${r.motivo ? ` · ${r.motivo}` : ""}`,
        highlight: false,
      };
    });

    return {
      success: true,
      title: `${titulo} — ${rows.length} alumno(s)`,
      summary: `Hay **${rows.length} alumno(s)** con beca activa${nivel ? ` en ${nivel}` : ""}.`,
      rows: resultRows,
    };
  } catch (e: any) {
    return { success: false, title: "Error en becas", summary: `No pude consultar las becas: ${e.message}` };
  }
}

/** Lista cargos pendientes / vencidos de un alumno */
async function queryCargosAlumno(params: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  const nombre = (params.nombre || "").trim();
  if (nombre.length < 2) {
    return {
      success: false,
      title: "Cargos de alumno",
      summary: 'Indica el nombre. Ejemplo: _"qué cargos tiene García"_',
    };
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.nombre_completo,
              COALESCE(co.nombre, 'Sin concepto') AS concepto,
              c.monto_base_centavos,
              c.estado,
              c.fecha_vencimiento
       FROM charges c
       INNER JOIN students s ON c.student_id = s.id
       LEFT JOIN concepts co ON co.id = c.concept_id
       WHERE s.campus_id = $1
         AND LOWER(s.nombre_completo) LIKE LOWER($2)
         AND c.estado IN ('pendiente','vencido')
       ORDER BY c.fecha_vencimiento
       LIMIT 10`,
      [ctx.campusId, `%${nombre}%`]
    );

    if (rows.length === 0) {
      return {
        success: true,
        title: "Sin cargos pendientes",
        summary: `El alumno "${nombre}" no tiene cargos pendientes o vencidos.`,
      };
    }

    const resultRows: ActionResultRow[] = rows.map((r: any) => ({
      label: `${r.nombre_completo} — ${r.concepto}`,
      value: `${fmt(r.monto_base_centavos)} · ${r.estado}`,
      highlight: r.estado === "vencido",
    }));

    return {
      success: true,
      title: `${rows.length} cargo(s) pendiente(s)/vencido(s)`,
      summary: `"${nombre}" tiene **${rows.length} cargo(s)** sin pagar.`,
      rows: resultRows,
    };
  } catch (e: any) {
    return { success: false, title: "Error en cargos", summary: `No pude consultar cargos: ${e.message}` };
  }
}

/** Familias con N o más alumnos inscritos */
async function queryFamiliasHijos(p: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
  const minHijos: number = typeof p.minHijos === "number" ? p.minHijos : 1;
  try {
    const { rows } = await pool.query(
      `SELECT f.nombre AS familia,
              COUNT(fs.student_id) AS num_hijos
         FROM families f
         INNER JOIN family_students fs ON fs.family_id = f.id
         WHERE f.campus_id = $1 AND f.tenant_id = $2
         GROUP BY f.id, f.nombre
         HAVING COUNT(fs.student_id) > $3
         ORDER BY num_hijos DESC, f.nombre
         LIMIT 20`,
      [ctx.campusId, ctx.tenantId, minHijos]
    );

    if (rows.length === 0) {
      return {
        success: true,
        title: `Familias con más de ${minHijos} hijo(s)`,
        summary: `No hay familias con más de ${minHijos} alumno(s) inscrito(s) en este campus.`,
        rows: [],
      };
    }

    const resultRows: ActionResultRow[] = rows.map((r: any) => ({
      label: r.familia,
      value: `${r.num_hijos} ${Number(r.num_hijos) === 1 ? "alumno" : "alumnos"}`,
      highlight: Number(r.num_hijos) >= 3,
    }));

    return {
      success: true,
      title: `Familias con más de ${minHijos} hijo(s) — ${rows.length} encontradas`,
      summary: `Encontré **${rows.length} familia(s)** con más de ${minHijos} alumno(s) inscrito(s).`,
      rows: resultRows,
    };
  } catch (e: any) {
    return { success: false, title: "Error en consulta", summary: `No pude consultar las familias: ${e.message}` };
  }
}

/** Verifica todas las queries del asistente contra la DB real */
async function queryVerificarSistema(_p: Record<string, any>, _ctx: ActionContext): Promise<ActionResult> {
  const report = await runAllProbes();

  const failedRows: ActionResultRow[] = report.results
    .filter((r) => !r.ok)
    .map((r) => ({
      label: `❌ ${r.name}`,
      value: r.error?.slice(0, 80) ?? "error desconocido",
      highlight: true,
    }));

  const passedRows: ActionResultRow[] = report.results
    .filter((r) => r.ok)
    .map((r) => ({
      label: `✅ ${r.name}`,
      value: `${r.durationMs}ms`,
      highlight: false,
    }));

  if (report.failed === 0) {
    return {
      success: true,
      title: `Sistema verificado — ${report.totalProbes} sondas ✅`,
      summary:
        `**Todas las ${report.totalProbes} consultas del asistente están sincronizadas con la base de datos.** ` +
        `No se detectaron columnas ni tablas faltantes. (${report.durationMs}ms)`,
      rows: passedRows,
    };
  }

  return {
    success: false,
    title: `⚠️ ${report.failed} error(es) detectado(s) de ${report.totalProbes} sondas`,
    summary:
      `Encontré **${report.failed} problema(s)** en las consultas del asistente. ` +
      `Estas queries fallarán cuando un usuario las ejecute. ` +
      `${report.passed} de ${report.totalProbes} sondas pasaron correctamente.`,
    rows: [...failedRows, ...passedRows],
  };
}

// ── Dispatcher principal ───────────────────────────────────────────────────────

export async function executeAction(
  actionId: string,
  params: Record<string, any>,
  ctx: ActionContext
): Promise<ActionResult> {
  // ── §5.6 Guarda dura financiera ───────────────────────────────────────────
  // Si la acción está en la lista protegida y no viene con confirmación
  // explícita del administrador, bloqueamos completamente. Las acciones
  // query:* son de solo lectura y pasan siempre.
  if (FINANCIAL_PROTECTED_ACTIONS.has(actionId)) {
    // Las action:* con requiresConfirmation se manejan en el flujo de
    // confirmación del widget — nunca deben llegar aquí sin ese flag.
    // Si alguien las llama directamente, devolvemos error de seguridad.
    return {
      success: false,
      title: "Acción bloqueada",
      summary:
        "Esta acción modifica registros financieros y no puede ejecutarse automáticamente. " +
        "El asistente requiere confirmación explícita del administrador desde el panel antes de continuar.",
      requiresConfirmation: true,
      confirmPayload: { actionId, params, label: "Confirmar acción financiera" },
    };
  }

  switch (actionId) {
    case "query:discrepancia":     return queryDiscrepancia(params, ctx);
    case "query:contar":           return queryContar(params, ctx);
    case "query:resumen_financiero": return queryResumenFinanciero(params, ctx);
    case "query:buscar_alumno":    return queryBuscarAlumno(params, ctx);
    case "query:saldo_alumno":     return querySaldoAlumno(params, ctx);
    case "query:becas_alumno":     return queryBecasAlumno(params, ctx);
    case "query:cargos_alumno":    return queryCargosAlumno(params, ctx);
    case "query:familias_hijos":   return queryFamiliasHijos(params, ctx);
    case "query:becas_nivel":        return queryBecasNivel(params, ctx);
    case "query:verificar_sistema":  return queryVerificarSistema(params, ctx);
    default:
      return { success: false, title: "Acción no reconocida", summary: "No entendí qué necesitas. Puedes preguntarme por alumnos, becas, pagos, cargos o el resumen financiero." };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// N4/N5 — Resolución de contexto para acciones con confirmación
// ══════════════════════════════════════════════════════════════════════════════

export type SuggestContextResult =
  | { kind: "signal";        signal: SuggestActionSignal }
  | { kind: "clarification"; reply: string }
  | null;

/** Resuelve el contexto completo desde la DB para una intención de escritura.
 *  NUNCA ejecuta nada — solo consulta y construye la señal de sugerencia.
 *
 *  Devuelve:
 *   - `{ kind: "signal" }`        → 1 coincidencia exacta, lista para confirmar.
 *   - `{ kind: "clarification" }` → ambigüedad, explica al usuario qué especificar.
 *   - `null`                      → sin coincidencias, caer a matchIntent. */
export async function resolveSuggestContext(
  trigger: SuggestActionTrigger,
  ctx: { campusId: number; tenantId: number }
): Promise<SuggestContextResult> {
  const { campusId, tenantId } = ctx;

  // ── pagar_manual ──────────────────────────────────────────────────────────
  if (trigger.action === "pagar_manual" && trigger.nombre) {
    const pattern = `%${trigger.nombre.trim()}%`;
    const { rows } = await pool.query(
      `SELECT c.id, c.monto_base_centavos, c.fecha_vencimiento,
              con.nombre AS concepto, s.nombre_completo AS alumno
       FROM charges c
       JOIN students s ON s.id = c.student_id
       LEFT JOIN concepts con ON con.id = c.concept_id
       WHERE s.campus_id = $1
         AND c.tenant_id = $2
         AND c.estado    = 'pendiente'
         AND s.nombre_completo ILIKE $3
       ORDER BY c.fecha_vencimiento ASC
       LIMIT 10`,
      [campusId, tenantId, pattern]
    );

    if (rows.length === 0) return null;

    if (rows.length > 1) {
      const lista = rows
        .map((r: any, i: number) => {
          const monto = `$${(Number(r.monto_base_centavos) / 100).toLocaleString("es-MX")}`;
          const vence = r.fecha_vencimiento
            ? new Date(r.fecha_vencimiento).toLocaleDateString("es-MX")
            : "";
          return `${i + 1}. ${r.concepto ?? "Cargo"} — ${monto}${vence ? ` (vence ${vence})` : ""}`;
        })
        .join("\n");
      return {
        kind: "clarification",
        reply:
          `Encontré ${rows.length} cargos pendientes de **${rows[0].alumno}**. ` +
          `Especifica cuál quieres pagar:\n\n${lista}\n\nEscribe el número o el concepto exacto.`,
      };
    }

    const cargo = rows[0] as any;
    const monto = `$${(Number(cargo.monto_base_centavos) / 100).toLocaleString("es-MX")}`;
    return {
      kind: "signal",
      signal: {
        action:   "pagar_manual",
        endpoint: `/api/admin/charges/${cargo.id}/pagar-manual`,
        body:     { metodo: "efectivo" },
        label:    "Registrar pago manual",
        contexto: {
          alumno:   cargo.alumno,
          monto,
          concepto: cargo.concepto ?? "Cargo pendiente",
          cargo_id: cargo.id,
        },
      },
    };
  }

  // ── resolver_excepcion ────────────────────────────────────────────────────
  if (trigger.action === "resolver_excepcion") {
    const txParams: any[] = [campusId];
    let whereExtra = "";
    if (trigger.monto_centavos) {
      txParams.push(trigger.monto_centavos);
      whereExtra += ` AND ABS(bt.monto_centavos - $${txParams.length}) <= 200`;
    }
    if (trigger.referencia) {
      txParams.push(`%${trigger.referencia}%`);
      whereExtra += ` AND bt.referencia ILIKE $${txParams.length}`;
    }

    const { rows: txRows } = await pool.query(
      `SELECT bt.id, bt.monto_centavos, bt.referencia, bt.nombre_ordenante, bt.fecha
       FROM bank_transactions bt
       WHERE bt.campus_id = $1
         AND bt.estado_conciliacion = 'pendiente'
         AND bt.tipo = 'credito'
         ${whereExtra}
       ORDER BY bt.fecha DESC
       LIMIT 5`,
      txParams
    );

    if (txRows.length === 0) return null;

    if (txRows.length > 1) {
      const lista = (txRows as any[])
        .map((tx, i) => {
          const m = `$${(Number(tx.monto_centavos) / 100).toLocaleString("es-MX")}`;
          return `${i + 1}. ${m} — ${tx.nombre_ordenante ?? "sin nombre"} (ref: ${tx.referencia ?? "—"})`;
        })
        .join("\n");
      return {
        kind: "clarification",
        reply:
          `Encontré ${txRows.length} transacciones pendientes. Especifica cuál conciliar:\n\n${lista}` +
          `\n\nEscribe el número de referencia o el monto exacto.`,
      };
    }

    const tx = txRows[0] as any;

    // Buscar el mejor cargo pendiente por monto (±$1 = tolerancia del endpoint resolver)
    const { rows: chargeRows } = await pool.query(
      `SELECT c.id,
              ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                + COALESCE(c.recargo_aplicado_centavos,0) AS monto_neto,
              con.nombre AS concepto, s.nombre_completo AS alumno
       FROM charges c
       JOIN students s ON s.id = c.student_id
       LEFT JOIN concepts con ON con.id = c.concept_id
       WHERE s.campus_id = $1
         AND c.tenant_id = $2
         AND c.estado    = 'pendiente'
         AND ABS(
               ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                 + COALESCE(c.recargo_aplicado_centavos,0)
               - $3
             ) <= 100
       ORDER BY c.fecha_vencimiento ASC
       LIMIT 5`,
      [campusId, tenantId, Number(tx.monto_centavos)]
    );

    if (chargeRows.length === 0) {
      const montoTx = `$${(Number(tx.monto_centavos) / 100).toLocaleString("es-MX")}`;
      return {
        kind: "clarification",
        reply:
          `Encontré una transacción de **${montoTx}** de ${tx.nombre_ordenante ?? "banco"}, ` +
          `pero no hay ningún cargo pendiente con ese monto exacto. ` +
          `Revisa la bandeja de excepciones para aplicarla manualmente.`,
      };
    }

    if (chargeRows.length > 1) {
      const lista = (chargeRows as any[])
        .map((c, i) =>
          `${i + 1}. ${c.alumno} — ${c.concepto ?? "Cargo"} ($${(Number(c.monto_neto) / 100).toLocaleString("es-MX")})`
        )
        .join("\n");
      return {
        kind: "clarification",
        reply:
          `Hay ${chargeRows.length} cargos pendientes con ese monto. Especifica a cuál aplicar:\n\n${lista}` +
          `\n\nEscribe el nombre del alumno.`,
      };
    }

    const cargo    = chargeRows[0] as any;
    const montoTx  = `$${(Number(tx.monto_centavos)     / 100).toLocaleString("es-MX")}`;
    const montoC   = `$${(Number(cargo.monto_neto)       / 100).toLocaleString("es-MX")}`;

    return {
      kind: "signal",
      signal: {
        action:   "resolver_excepcion",
        endpoint: `/api/conciliacion/excepciones/${tx.id}/resolver`,
        body:     { accion: "aplicar", charge_id: cargo.id },
        label:    "Aplicar excepción bancaria al cargo",
        contexto: {
          banco:     tx.nombre_ordenante ?? "SPEI",
          monto:     montoTx,
          referencia: tx.referencia ?? undefined,
          tx_id:     tx.id,
          alumno:    cargo.alumno,
          concepto:  `${cargo.concepto ?? "Cargo"} (${montoC})`,
          cargo_id:  cargo.id,
        },
      },
    };
  }

  // ── asignar_beca ──────────────────────────────────────────────────────────
  if (trigger.action === "asignar_beca" && trigger.nombre) {
    // Porcentaje ausente o inválido → pedir clarificación antes de ir a DB
    if (!trigger.porcentaje) {
      return {
        kind: "clarification",
        reply: `¿Qué porcentaje de beca deseas asignar? Escríbelo así: **"beca de 15% a ${trigger.nombre}"**.`,
      };
    }
    if (trigger.porcentaje <= 0 || trigger.porcentaje > 100) {
      return {
        kind: "clarification",
        reply: `El porcentaje debe ser un número entre 1 y 100. ¿Cuánto quieres asignar?`,
      };
    }

    const pattern = `%${trigger.nombre.trim()}%`;
    const { rows } = await pool.query(
      `SELECT id, nombre_completo FROM students
       WHERE campus_id = $1 AND tenant_id = $2
         AND nombre_completo ILIKE $3
       ORDER BY nombre_completo ASC LIMIT 5`,
      [campusId, tenantId, pattern]
    );

    if (rows.length === 0) return null;

    if (rows.length > 1) {
      const lista = (rows as any[])
        .map((s: any, i: number) => `${i + 1}. ${s.nombre_completo}`)
        .join("\n");
      return {
        kind: "clarification",
        reply:
          `Encontré ${rows.length} alumnos con ese nombre:\n\n${lista}\n\n` +
          `Escribe el nombre completo para identificar al alumno correcto.`,
      };
    }

    const student = rows[0] as any;

    // Becas vigentes actuales (para overlap_warning informativo)
    const { rows: vigentes } = await pool.query(
      `SELECT id, porcentaje, vigencia_fin
       FROM scholarships
       WHERE student_id = $1 AND vigencia_fin >= CURRENT_DATE
       ORDER BY porcentaje DESC`,
      [student.id]
    );

    const hoy = new Date().toISOString().split("T")[0];
    const d   = new Date(hoy);
    d.setFullYear(d.getFullYear() + 1);
    const vigenciaFin = d.toISOString().split("T")[0];

    return {
      kind: "signal",
      signal: {
        action:   "asignar_beca",
        endpoint: `/api/admin/students/${student.id}/beca`,
        body: {
          porcentaje:      trigger.porcentaje,
          motivo:          "(asignado vía asistente)",
          vigencia_inicio: hoy,
          vigencia_fin:    vigenciaFin,
        },
        label:    "Asignar beca",
        contexto: {
          alumno:          student.nombre_completo,
          student_id:      student.id,
          porcentaje:      trigger.porcentaje,
          becas_vigentes:  vigentes.length,
          vigencia_inicio: hoy,
          vigencia_fin:    vigenciaFin,
        },
      },
    };
  }

  // ── condonar_saldo ────────────────────────────────────────────────────────
  if (trigger.action === "condonar_saldo" && trigger.nombre) {
    const pattern = `%${trigger.nombre.trim()}%`;
    const { rows: studentRows } = await pool.query(
      `SELECT id, nombre_completo FROM students
       WHERE campus_id = $1 AND tenant_id = $2
         AND nombre_completo ILIKE $3
       ORDER BY nombre_completo ASC LIMIT 5`,
      [campusId, tenantId, pattern]
    );

    if (studentRows.length === 0) return null;

    if (studentRows.length > 1) {
      const lista = (studentRows as any[])
        .map((s: any, i: number) => `${i + 1}. ${s.nombre_completo}`)
        .join("\n");
      return {
        kind: "clarification",
        reply:
          `Encontré ${studentRows.length} alumnos con ese nombre:\n\n${lista}\n\n` +
          `Escribe el nombre completo.`,
      };
    }

    const student = studentRows[0] as any;

    // Buscar plan activo con saldo pendiente
    const { rows: planRows } = await pool.query(
      `SELECT pp.id, pp.tipo_origen,
              COALESCE(SUM(c.monto_base_centavos), 0)::bigint AS saldo_centavos,
              COUNT(c.id) AS cuotas_pendientes
       FROM payment_plans pp
       LEFT JOIN charges c ON c.plan_id = pp.id AND c.estado = 'pendiente'
       WHERE pp.student_id = $1
         AND pp.tenant_id  = $2
         AND pp.estado     = 'activo'
       GROUP BY pp.id, pp.tipo_origen
       ORDER BY pp.id DESC
       LIMIT 1`,
      [student.id, tenantId]
    );

    if (planRows.length === 0) {
      return {
        kind: "clarification",
        reply:
          `No encontré un plan de pago activo para **${student.nombre_completo}**. ` +
          `Si deseas cancelar cargos sueltos, hazlo desde Cargos.`,
      };
    }

    const plan  = planRows[0] as any;
    const saldo = Number(plan.saldo_centavos);
    const monto = `$${(saldo / 100).toLocaleString("es-MX")}`;

    return {
      kind: "signal",
      signal: {
        action:   "condonar_saldo",
        endpoint: `/api/planes-pago/${plan.id}/cancelar`,
        body: {
          destino_saldo_pendiente: "condonar",
          // motivo y motivo_condonacion se recogen a través de inputs_required
        },
        inputs_required: [
          { key: "motivo",             label: "Motivo de cancelación del plan",  minLength: 10 },
          { key: "motivo_condonacion", label: "Justificación de la condonación", minLength: 10 },
        ],
        label:    "Condonar saldo pendiente",
        contexto: {
          alumno:            student.nombre_completo,
          student_id:        student.id,
          plan_id:           Number(plan.id),
          monto_pendiente:   monto,
          cuotas_pendientes: Number(plan.cuotas_pendientes),
          tipo_origen:       plan.tipo_origen,
        },
      },
    };
  }

  return null;
}
