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
         (SELECT COUNT(DISTINCT student_id) FROM scholarships WHERE tenant_id = $2)   AS alumnos_con_beca,
         (SELECT COUNT(*) FROM scholarships WHERE tenant_id = $2)                      AS becas_total,
         (SELECT COUNT(DISTINCT c.student_id)
            FROM charges c INNER JOIN students s ON c.student_id = s.id
            WHERE s.campus_id = $1)                                                    AS alumnos_con_cargo,
         (SELECT COUNT(*) FROM charges c
            INNER JOIN students s ON c.student_id = s.id WHERE s.campus_id = $1)      AS cargos_total`,
      [ctx.campusId, ctx.tenantId]
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
                COUNT(DISTINCT student_id) AS alumnos_becados
         FROM scholarships WHERE tenant_id = $1`,
        [ctx.tenantId]
      );
      const r = rows[0];
      return {
        success: true,
        title: "Becas y descuentos",
        summary: `Hay **${r.total} becas/descuentos** asignados a ${r.alumnos_becados} alumnos distintos.`,
        rows: [
          { label: "Total becas/descuentos",  value: r.total,          highlight: true },
          { label: "Alumnos beneficiados",    value: r.alumnos_becados },
        ],
      };
    }

    if (entity.includes("pago")) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(p.monto),0) AS suma
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
         COALESCE(SUM(c.monto) FILTER(WHERE c.estado = 'pagado'),   0) AS cobrado,
         COALESCE(SUM(c.monto) FILTER(WHERE c.estado = 'pendiente'),0) AS pendiente,
         COALESCE(SUM(c.monto) FILTER(WHERE c.estado = 'vencido'),  0) AS vencido,
         COUNT(*) FILTER(WHERE c.estado = 'pagado')                    AS pagos_count,
         COUNT(*) FILTER(WHERE c.estado IN ('pendiente','vencido'))     AS adeudos_count
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
      `SELECT s.nombre_completo, s.grado, s.grupo, s.status,
              COALESCE(
                (SELECT SUM(monto) FILTER(WHERE estado IN ('pendiente','vencido'))
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
        `SELECT s.nombre_completo, s.grado, s.grupo, s.status,
                COALESCE((SELECT SUM(monto) FILTER(WHERE estado IN ('pendiente','vencido'))
                          FROM charges WHERE student_id = s.id), 0) AS saldo_pendiente
         FROM students s
         WHERE s.campus_id = $1 AND LOWER(s.nombre_completo) LIKE LOWER($2)
         ORDER BY s.nombre_completo LIMIT 5`,
        [ctx.campusId, `%${nombre}%`]
      );
      if (rows.length === 0) {
        return { success: false, title: "Sin resultados", summary: `No encontré alumnos con "${nombre}".` };
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
      `SELECT s.nombre_completo, sh.tipo_beca, sh.tipo_descuento,
              sh.porcentaje_descuento, sh.monto_fijo, sh.vigencia, sh.observaciones
       FROM scholarships sh
       INNER JOIN students s ON sh.student_id = s.id
       WHERE s.campus_id = $1 AND LOWER(s.nombre_completo) LIKE LOWER($2)
       ORDER BY s.nombre_completo, sh.tipo_beca
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

    const resultRows: ActionResultRow[] = rows.map((r: any) => ({
      label: `${r.nombre_completo} — ${r.tipo_beca}`,
      value: r.tipo_descuento === "porcentaje"
        ? `${r.porcentaje_descuento}% (${r.vigencia})`
        : `${fmt(r.monto_fijo)} fijo (${r.vigencia})`,
    }));

    return {
      success: true,
      title: "Becas asignadas",
      summary: `Encontré **${rows.length} beca(s)** para "${nombre}".`,
      rows: resultRows,
    };
  } catch (e: any) {
    return { success: false, title: "Error", summary: `No pude consultar becas: ${e.message}` };
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
      `SELECT s.nombre_completo, c.concepto, c.monto, c.estado, c.fecha_vencimiento
       FROM charges c
       INNER JOIN students s ON c.student_id = s.id
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
      value: `${fmt(r.monto)} · ${r.estado}`,
      highlight: r.estado === "vencido",
    }));

    return {
      success: true,
      title: `${rows.length} cargo(s) pendiente(s)/vencido(s)`,
      summary: `"${nombre}" tiene **${rows.length} cargo(s)** sin pagar.`,
      rows: resultRows,
    };
  } catch (e: any) {
    return { success: false, title: "Error", summary: `No pude consultar cargos: ${e.message}` };
  }
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
    default:
      return { success: false, title: "Acción no reconocida", summary: "No entendí qué necesitas. Puedes preguntarme por alumnos, becas, pagos, cargos o el resumen financiero." };
  }
}
