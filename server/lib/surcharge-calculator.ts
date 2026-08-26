import { SEP_NON_WORKING_DAYS_2025_2026 } from "@shared/payment-rules";

export type SurchargeType = "porcentaje" | "fijo" | "progresivo";
export type SurchargeAccumulationMode = "ninguno" | "incremento_fijo" | "compuesto";
export type MonthlyIncrementType = "monto" | "porcentaje";

export interface ProgressiveSurchargeTier {
  dias_desde: number;
  dias_hasta: number;
  porcentaje: number;
}

export interface SurchargeRuleForCalculation {
  tipo: SurchargeType;
  dias_gracia: number;
  porcentaje?: number | string | null;
  monto_fijo_centavos?: number | string | null;
  reglas_progresivas?: unknown;
  monto_maximo_centavos?: number | string | null;
  aplica_fines_semana?: boolean;
  aplica_festivos?: boolean;
  modo_acumulacion?: SurchargeAccumulationMode | string | null;
  tipo_incremento_mensual?: MonthlyIncrementType | string | null;
  incremento_mensual_centavos?: number | string | null;
  incremento_mensual_porcentaje?: number | string | null;
  fecha_inicio_acumulacion?: Date | string | null;
}

export interface SurchargeCalculation {
  amountCentavos: number;
  daysLate: number;
  effectiveDaysLate: number;
}

const SEP_HOLIDAY_KEYS = new Set(
  SEP_NON_WORKING_DAYS_2025_2026.map((date) => dateKey(date)),
);

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function toLocalCalendarDate(value: Date | string): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }

  // PostgreSQL DATE values are date-only. Noon avoids an accidental previous-day
  // conversion when the server is running in a negative UTC offset.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  }

  const parsed = new Date(value);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
}

function addCalendarDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfCalendarMonth(value: Date | string): Date {
  const date = toLocalCalendarDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function addCalendarMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1, 12);
}

export function calendarMonthKey(value: Date | string): string {
  return dateKey(startOfCalendarMonth(value));
}

function isCountableDay(
  date: Date,
  includeWeekends: boolean,
  includeHolidays: boolean,
): boolean {
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  if (isWeekend && !includeWeekends) return false;
  return includeHolidays || !SEP_HOLIDAY_KEYS.has(dateKey(date));
}

/**
 * Parses the persisted progressive tiers and rejects gaps, overlaps and
 * non-positive percentages. A rule that cannot be interpreted must never
 * produce a charge.
 */
export function parseProgressiveSurchargeTiers(value: unknown): ProgressiveSurchargeTier[] | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const tiers = raw.map((tier) => ({
    dias_desde: Number(tier?.dias_desde),
    dias_hasta: Number(tier?.dias_hasta),
    porcentaje: Number(tier?.porcentaje),
  }));
  if (tiers.some((tier) =>
    !Number.isInteger(tier.dias_desde) ||
    !Number.isInteger(tier.dias_hasta) ||
    tier.dias_desde < 1 ||
    tier.dias_hasta < tier.dias_desde ||
    !Number.isFinite(tier.porcentaje) ||
    tier.porcentaje <= 0 ||
    tier.porcentaje > 100,
  )) {
    return null;
  }

  tiers.sort((a, b) => a.dias_desde - b.dias_desde);
  for (let index = 1; index < tiers.length; index += 1) {
    if (tiers[index].dias_desde <= tiers[index - 1].dias_hasta) return null;
  }
  return tiers;
}

export function calculateSurcharge(
  rule: SurchargeRuleForCalculation,
  baseAmountCentavos: number,
  dueDate: Date | string,
  calculationDate: Date | string = new Date(),
): SurchargeCalculation {
  const due = toLocalCalendarDate(dueDate);
  const asOf = toLocalCalendarDate(calculationDate);
  if (!Number.isFinite(baseAmountCentavos) || baseAmountCentavos <= 0 || asOf <= due) {
    return { amountCentavos: 0, daysLate: 0, effectiveDaysLate: 0 };
  }

  const includeWeekends = Boolean(rule.aplica_fines_semana);
  const includeHolidays = Boolean(rule.aplica_festivos);
  let daysLate = 0;
  for (let cursor = addCalendarDays(due, 1); cursor <= asOf; cursor = addCalendarDays(cursor, 1)) {
    if (isCountableDay(cursor, includeWeekends, includeHolidays)) daysLate += 1;
  }

  const effectiveDaysLate = Math.max(0, daysLate - Math.max(0, Number(rule.dias_gracia) || 0));
  if (effectiveDaysLate === 0) {
    return { amountCentavos: 0, daysLate, effectiveDaysLate };
  }

  let amountCentavos = 0;
  if (rule.tipo === "porcentaje") {
    const percentage = Number(rule.porcentaje);
    if (Number.isFinite(percentage) && percentage > 0) {
      amountCentavos = Math.round(baseAmountCentavos * (percentage / 100));
    }
  } else if (rule.tipo === "fijo") {
    const fixedAmount = Number(rule.monto_fijo_centavos);
    if (Number.isFinite(fixedAmount) && fixedAmount > 0) {
      amountCentavos = Math.round(fixedAmount);
    }
  } else if (rule.tipo === "progresivo") {
    const tiers = parseProgressiveSurchargeTiers(rule.reglas_progresivas);
    const tier = tiers?.find((candidate) =>
      effectiveDaysLate >= candidate.dias_desde && effectiveDaysLate <= candidate.dias_hasta,
    );
    if (tier) amountCentavos = Math.round(baseAmountCentavos * (tier.porcentaje / 100));
  }

  const maximum = Number(rule.monto_maximo_centavos);
  if (Number.isFinite(maximum) && maximum > 0) {
    amountCentavos = Math.min(amountCentavos, Math.round(maximum));
  }

  return { amountCentavos: Math.max(0, amountCentavos), daysLate, effectiveDaysLate };
}

/**
 * Returns every calendar-month ledger key eligible since the charge became
 * overdue. The due month owns the original surcharge; each later month owns
 * one potential additional increment. An explicit activation date clamps the
 * history so enabling a new accumulation policy never creates retroactive
 * periods.
 */
export function getEligibleSurchargePeriods(
  rule: SurchargeRuleForCalculation,
  dueDate: Date | string,
  calculationDate: Date | string,
): string[] {
  const graceCheck = calculateSurcharge(rule, 1, dueDate, calculationDate);
  if (graceCheck.effectiveDaysLate <= 0) return [];

  const end = startOfCalendarMonth(calculationDate);
  let start = startOfCalendarMonth(dueDate);
  if (rule.fecha_inicio_acumulacion) {
    const activation = startOfCalendarMonth(rule.fecha_inicio_acumulacion);
    if (activation > start) start = activation;
  }
  if (start > end) return [];

  const periods: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addCalendarMonths(cursor, 1)) {
    periods.push(dateKey(cursor));
  }
  return periods;
}

export function calculateFixedMonthlyIncrement(
  rule: SurchargeRuleForCalculation,
  baseAmountCentavos: number,
): { amountCentavos: number; valid: boolean } {
  const type = rule.tipo_incremento_mensual;
  if (type === "monto") {
    const amount = Number(rule.incremento_mensual_centavos);
    return {
      amountCentavos: Number.isSafeInteger(amount) && amount > 0 ? amount : 0,
      valid: Number.isSafeInteger(amount) && amount > 0,
    };
  }
  if (type === "porcentaje") {
    const percentage = Number(rule.incremento_mensual_porcentaje);
    const amount = Math.round(baseAmountCentavos * (percentage / 100));
    return {
      amountCentavos: Number.isFinite(percentage) && percentage > 0 && amount > 0 ? amount : 0,
      valid: Number.isFinite(percentage) && percentage > 0 && amount > 0,
    };
  }
  return { amountCentavos: 0, valid: false };
}

export function calculateCompoundMonthlyIncrement(
  rule: SurchargeRuleForCalculation,
  outstandingBalanceCentavos: number,
): { amountCentavos: number; valid: boolean } {
  const percentage = Number(rule.porcentaje);
  const amount = Math.round(outstandingBalanceCentavos * (percentage / 100));
  return {
    amountCentavos: rule.tipo === "porcentaje" && Number.isFinite(percentage) && percentage > 0 && amount > 0
      ? amount
      : 0,
    valid: rule.tipo === "porcentaje" && Number.isFinite(percentage) && percentage > 0,
  };
}