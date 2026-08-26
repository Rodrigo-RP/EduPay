import type { Pool, PoolClient } from "@neondatabase/serverless";

type SqlClient = Pick<Pool | PoolClient, "query">;

export type MonthlyBillingPeriod = {
  kind: "monthly";
  month: string; // YYYY-MM
};

export type LongBillingPeriod = {
  kind: "long";
  schoolCycle: string;
  periodKey: string;
};

export type BillingPeriod = MonthlyBillingPeriod | LongBillingPeriod;

export type ResolveConfiguredDueDateInput = {
  tenantId: number | null | undefined;
  campusId: number;
  conceptId: number;
  issueDate: string;
  billingPeriod: BillingPeriod;
};

export type ResolvedDueDate = {
  dueDate: string;
  source: "monthly_rule" | "explicit_period";
  configurationId: number;
  periodKey: string;
};

export function billingPeriodForConcept(
  periodicity: unknown,
  payload: any,
  issueDate: string,
): BillingPeriod {
  const normalized = normalizePeriodicity(periodicity);
  if (normalized === "mensual") {
    return {
      kind: "monthly",
      month: payload?.billing_period?.month
        ?? payload?.periodo
        ?? issueDate.slice(0, 7),
    };
  }
  return {
    kind: "long",
    schoolCycle: payload?.billing_period?.schoolCycle
      ?? payload?.ciclo_escolar
      ?? "",
    periodKey: payload?.billing_period?.periodKey
      ?? payload?.periodo_clave
      ?? (normalized === "anual" ? "ANUAL" : ""),
  };
}

export function usesConfiguredDueDate(periodicity: unknown): boolean {
  const normalized = normalizePeriodicity(periodicity);
  return normalized === "mensual"
    || normalized === "cuatrimestral"
    || normalized === "semestral"
    || normalized === "anual";
}

export type DueDateResolutionErrorCode =
  | "CONCEPT_NOT_FOUND"
  | "BILLING_PERIOD_MISMATCH"
  | "MISSING_CONFIGURATION"
  | "AMBIGUOUS_CONFIGURATION"
  | "INVALID_CONFIGURATION";

export class DueDateResolutionError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: DueDateResolutionErrorCode,
    message: string,
    statusCode = 422,
  ) {
    super(message);
    this.name = "DueDateResolutionError";
    this.statusCode = statusCode;
  }
}

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthNameFor(month: number): string {
  return MONTH_NAMES[month - 1];
}

function parseApplicableMonths(raw: unknown): string[] {
  if (raw === "todos") return [...MONTH_NAMES];
  if (Array.isArray(raw)) return raw.map(String).map((value) => value.toLowerCase());
  if (typeof raw !== "string") return [];

  const decoded = raw.replace(/&quot;/g, '"');
  if (decoded === "todos") return [...MONTH_NAMES];
  try {
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed)
      ? parsed.map(String).map((value) => value.toLowerCase())
      : [];
  } catch {
    return [];
  }
}

function monthIsConfigured(raw: unknown, month: number): boolean {
  const configuredMonths = parseApplicableMonths(raw);
  return configuredMonths.includes(monthNameFor(month))
    || configuredMonths.includes(String(month))
    || configuredMonths.includes(String(month - 1));
}

function invalid(message: string): never {
  throw new DueDateResolutionError("INVALID_CONFIGURATION", message);
}

function ensureIssueDate(issueDate: string): void {
  if (!isIsoDate(issueDate)) invalid("La fecha de emisión no es una fecha válida");
}

function ensureDueDateNotBeforeIssue(dueDate: string, issueDate: string): void {
  if (dueDate < issueDate) {
    invalid("La fecha de vencimiento configurada es anterior a la fecha de emisión");
  }
}

function resolveMonthlyDate(
  year: number,
  month: number,
  day: number,
  issueDate: string,
): string {
  const maxDay = daysInMonth(year, month);
  if (!Number.isSafeInteger(day) || day < 1 || day > maxDay) {
    invalid(`El día ${day} no existe en ${year}-${String(month).padStart(2, "0")}`);
  }
  const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  ensureDueDateNotBeforeIssue(dueDate, issueDate);
  return dueDate;
}

function normalizePeriodicity(periodicity: unknown): string {
  return String(periodicity ?? "").trim().toLowerCase();
}

function requireMonthlyPeriod(period: BillingPeriod): MonthlyBillingPeriod {
  if (period.kind !== "monthly" || !/^\d{4}-\d{2}$/.test(period.month)) {
    throw new DueDateResolutionError(
      "BILLING_PERIOD_MISMATCH",
      "El concepto mensual requiere un periodo mensual con formato YYYY-MM",
    );
  }
  const [year, month] = period.month.split("-").map(Number);
  if (month < 1 || month > 12) {
    throw new DueDateResolutionError("INVALID_CONFIGURATION", "El mes de facturación no es válido");
  }
  return { kind: "monthly", month: `${year}-${String(month).padStart(2, "0")}` };
}

function requireLongPeriod(period: BillingPeriod): LongBillingPeriod {
  if (
    period.kind !== "long"
    || !period.schoolCycle?.trim()
    || !period.periodKey?.trim()
  ) {
    throw new DueDateResolutionError(
      "BILLING_PERIOD_MISMATCH",
      "El concepto de periodo largo requiere ciclo escolar y periodo_clave",
    );
  }
  return {
    kind: "long",
    schoolCycle: period.schoolCycle.trim(),
    periodKey: period.periodKey.trim(),
  };
}

/**
 * Resolves an institutional due date from persisted configuration.
 *
 * Monthly concepts use payment_due_dates. Long concepts use the exact
 * cycle/period row in payment_due_date_periods. The function deliberately
 * has no date default: callers must surface the domain error to the operator.
 */
export async function resolveConfiguredDueDate(
  client: SqlClient,
  input: ResolveConfiguredDueDateInput,
): Promise<ResolvedDueDate> {
  const tenantId = input.tenantId == null ? null : Number(input.tenantId);
  const campusId = Number(input.campusId);
  const conceptId = Number(input.conceptId);

  if (!Number.isSafeInteger(campusId) || campusId <= 0) {
    throw new DueDateResolutionError("CONCEPT_NOT_FOUND", "Campus inválido");
  }
  if (!Number.isSafeInteger(conceptId) || conceptId <= 0) {
    throw new DueDateResolutionError("CONCEPT_NOT_FOUND", "Concepto inválido");
  }
  ensureIssueDate(input.issueDate);

  const conceptResult = await client.query(
    `SELECT c.id, c.nombre, c.periodicidad
       FROM concepts c
       JOIN campuses cp ON cp.id = c.campus_id
      WHERE c.id = $1
        AND c.campus_id = $2
        AND (
          $3::integer IS NULL
          OR (cp.tenant_id = $3 AND (c.tenant_id = $3 OR c.tenant_id IS NULL))
        )`,
    [conceptId, campusId, tenantId],
  );
  const concept = conceptResult.rows[0] as
    | { id: number; nombre: string; periodicidad: string }
    | undefined;
  if (!concept) {
    throw new DueDateResolutionError(
      "CONCEPT_NOT_FOUND",
      "El concepto no existe o no pertenece al campus actual",
      404,
    );
  }

  const periodicidad = normalizePeriodicity(concept.periodicidad);

  if (periodicidad === "mensual") {
    const monthlyPeriod = requireMonthlyPeriod(input.billingPeriod);
    const [year, month] = monthlyPeriod.month.split("-").map(Number);
    const candidates = await client.query(
      `SELECT id, dia_vencimiento, mes_aplicacion
         FROM payment_due_dates
        WHERE campus_id = $1
          AND ($2::integer IS NULL OR tenant_id = $2)
          AND activo = TRUE
          AND (
            concept_id = $3
            OR (concept_id IS NULL AND concepto = $4)
          )`,
      [campusId, tenantId, concept.id, concept.nombre],
    );
    const applicable = candidates.rows.filter((row: any) =>
      monthIsConfigured(row.mes_aplicacion, month),
    );
    if (applicable.length === 0) {
      throw new DueDateResolutionError(
        "MISSING_CONFIGURATION",
        `No hay fecha de vencimiento configurada para ${concept.nombre} en ${monthlyPeriod.month}`,
      );
    }
    if (applicable.length > 1) {
      throw new DueDateResolutionError(
        "AMBIGUOUS_CONFIGURATION",
        `Hay ${applicable.length} fechas de vencimiento activas para ${concept.nombre} en ${monthlyPeriod.month}`,
        409,
      );
    }
    return {
      dueDate: resolveMonthlyDate(
        year,
        month,
        Number(applicable[0].dia_vencimiento),
        input.issueDate,
      ),
      source: "monthly_rule",
      configurationId: Number(applicable[0].id),
      periodKey: monthlyPeriod.month,
    };
  }

  if (periodicidad !== "cuatrimestral" && periodicidad !== "semestral" && periodicidad !== "anual") {
    throw new DueDateResolutionError(
      "BILLING_PERIOD_MISMATCH",
      `El concepto ${concept.nombre} (${periodicidad || "sin periodicidad"}) requiere una fecha manual extraordinaria`,
    );
  }

  const longPeriod = requireLongPeriod(input.billingPeriod);
  const candidates = await client.query(
    `SELECT id, fecha_inicio::text, fecha_fin::text, fecha_vencimiento::text
       FROM payment_due_date_periods
      WHERE tenant_id = $1
        AND campus_id = $2
        AND concept_id = $3
        AND ciclo_escolar = $4
        AND periodo_clave = $5
        AND activo = TRUE`,
    [tenantId, campusId, concept.id, longPeriod.schoolCycle, longPeriod.periodKey],
  );
  if (candidates.rows.length === 0) {
    throw new DueDateResolutionError(
      "MISSING_CONFIGURATION",
      `No hay fecha de vencimiento configurada para ${concept.nombre}, ciclo ${longPeriod.schoolCycle}, periodo ${longPeriod.periodKey}`,
    );
  }
  if (candidates.rows.length > 1) {
    throw new DueDateResolutionError(
      "AMBIGUOUS_CONFIGURATION",
      `Hay más de una fecha activa para ${concept.nombre}, ciclo ${longPeriod.schoolCycle}, periodo ${longPeriod.periodKey}`,
      409,
    );
  }

  const row = candidates.rows[0] as {
    id: number;
    fecha_inicio: string;
    fecha_fin: string;
    fecha_vencimiento: string;
  };
  if (
    !isIsoDate(row.fecha_inicio)
    || !isIsoDate(row.fecha_fin)
    || !isIsoDate(row.fecha_vencimiento)
    || row.fecha_fin < row.fecha_inicio
    || row.fecha_vencimiento < row.fecha_inicio
    || row.fecha_vencimiento > row.fecha_fin
  ) {
    invalid(`La configuración del periodo ${longPeriod.periodKey} tiene fechas inválidas`);
  }
  ensureDueDateNotBeforeIssue(row.fecha_vencimiento, input.issueDate);

  return {
    dueDate: row.fecha_vencimiento,
    source: "explicit_period",
    configurationId: Number(row.id),
    periodKey: longPeriod.periodKey,
  };
}
