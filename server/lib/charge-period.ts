import { billingPeriodForConcept } from "./due-date-resolver";

/**
 * Clave de periodo con la que un cargo emitido en lote se hace único por (alumno, concepto, periodo).
 * Se guarda en `charges.periodo`; el índice único parcial `charges_student_concept_periodo_unique`
 * impide duplicarlo (Q-37, Q-33).
 *
 * - mensual: "YYYY-MM"
 * - cuatrimestral, semestral, anual: "<ciclo>|<clave>"
 * - única o eventual: `null` (sin regla), salvo `uniquePerCycle`, que usa el ciclo escolar (catálogo de productos).
 * Los cargos extraordinarios nunca usan clave: pueden repetirse por diseño.
 */
export function chargePeriodKey(
  periodicity: unknown,
  payload: any,
  issueDate: string,
  options: { uniquePerCycle?: boolean } = {},
): string | null {
  const period = billingPeriodForConcept(periodicity, payload, issueDate);
  if (period.kind === "monthly") {
    const month = String(period.month ?? "");
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  }
  const cycle = String(period.schoolCycle ?? "").trim();
  const key = String(period.periodKey ?? "").trim();
  if (key) return `${cycle}|${key}`.slice(0, 40);
  return options.uniquePerCycle && cycle ? cycle.slice(0, 40) : null;
}

type Queryable = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

/** Alumnos que ya tienen un cargo vigente (no cancelado) de este concepto y periodo. */
export async function studentsWithPeriodCharge(db: Queryable, conceptId: number, periodo: string): Promise<Set<number>> {
  const r = await db.query(
    `SELECT student_id FROM charges WHERE concept_id = $1 AND periodo = $2 AND estado <> 'cancelado'`,
    [conceptId, periodo],
  );
  return new Set(r.rows.map((row) => Number(row.student_id)));
}

/** 23505 sobre el índice de unicidad por periodo: otra solicitud lo emitió entre la consulta y el insert. */
export function isPeriodDuplicate(error: any): boolean {
  return error?.code === "23505" && String(error?.constraint ?? "") === "charges_student_concept_periodo_unique";
}
