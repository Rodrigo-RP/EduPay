/** Funciones puras: no importan base, configuración, proveedores ni secretos. */
export const MAX_MONTO_CENTAVOS = 50_000_000;
export const MIN_CUOTAS_CONVENIO = 3;
export const MAX_CUOTAS_CONVENIO = 6;

export class FinancialInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialInputError";
  }
}

function fail(message: string): never {
  throw new FinancialInputError(message);
}

function decimalParts(value: unknown, label: string): [number, number] {
  if (typeof value !== "string" && typeof value !== "number") {
    fail(`${label}: escribe un número con máximo dos decimales.`);
  }
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    fail(`${label}: escribe un número no negativo con máximo dos decimales.`);
  }
  const [whole, decimal = ""] = text.split(".");
  const integer = Number(whole);
  if (!Number.isSafeInteger(integer) || integer > Math.floor(Number.MAX_SAFE_INTEGER / 100)) {
    fail(`${label}: el importe es demasiado grande.`);
  }
  return [integer, Number(decimal.padEnd(2, "0"))];
}

/** La multiplicación opera sólo sobre la parte ENTERA, nunca sobre pesos decimales. */
export function pesosToCentavos(value: unknown, allowZero = false, label = "El monto"): number {
  const [integer, decimal] = decimalParts(value, label);
  return centavos(integer * 100 + decimal, allowZero, label);
}

export function centavos(value: unknown, allowZero = false, label = "El monto"): number {
  if (typeof value !== "number" && typeof value !== "string") {
    fail(`${label}: indica centavos enteros.`);
  }
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) {
    fail(`${label}: indica centavos enteros.`);
  }
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1) || amount > MAX_MONTO_CENTAVOS) {
    fail(`${label}: debe ser ${allowZero ? "de cero" : "mayor que cero"} y hasta $500,000.00.`);
  }
  return amount;
}

export function percentage(value: unknown, label = "El porcentaje"): number {
  const [integer, decimal] = decimalParts(value, label);
  const hundredths = integer * 100 + decimal;
  if (hundredths > 10_000) fail(`${label}: debe estar entre 0 y 100, con máximo dos decimales.`);
  return hundredths / 100;
}

export function positiveId(value: unknown, label = "El identificador"): number {
  if ((typeof value !== "number" && typeof value !== "string")
    || !/^[1-9]\d*$/.test(String(value))
    || !Number.isSafeInteger(Number(value))
    || Number(value) > 2_147_483_647) {
    fail(`${label}: debe ser un entero positivo válido.`);
  }
  return Number(value);
}

export function isoFinancialDate(value: unknown, label = "La fecha"): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
    fail(`${label}: usa una fecha real con formato YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${label}: usa una fecha real con formato YYYY-MM-DD.`);
  }
  return value;
}

export function orderedDates(start: unknown, end: unknown): void {
  const a = isoFinancialDate(start, "La fecha inicial");
  const b = isoFinancialDate(end, "La fecha final");
  if (b < a) fail("El vencimiento o fecha final no puede ser anterior a la emisión o fecha inicial.");
}

export function installments(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string")
    || !/^\d+$/.test(String(value))
    || !Number.isInteger(Number(value))
    || Number(value) < MIN_CUOTAS_CONVENIO || Number(value) > MAX_CUOTAS_CONVENIO) {
    fail(`El convenio debe tener de ${MIN_CUOTAS_CONVENIO} a ${MAX_CUOTAS_CONVENIO} cuotas mensuales.`);
  }
  return Number(value);
}

export function splitInstallments(total: number, initial: unknown, count: unknown): number[] {
  const n = installments(count);
  const paid = centavos(initial, true, "El pago inicial");
  if (!Number.isSafeInteger(total) || total <= 0) fail("El adeudo debe ser un entero positivo en centavos.");
  const remaining = total - paid;
  if (remaining < n) fail("El pago inicial debe dejar al menos un centavo para cada cuota.");
  const base = Math.floor(remaining / n);
  const remainder = remaining - base * n;
  return Array.from({ length: n }, (_, i) => centavos(base + (i === n - 1 ? remainder : 0)));
}

/** Meses calendario, conservando el día original o el último del mes destino. */
export function monthlyDueDate(start: string, month: number): string {
  isoFinancialDate(start);
  const date = new Date(`${start}T00:00:00.000Z`);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + month);
  const last = new Date(date.getTime());
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  date.setUTCDate(Math.min(originalDay, last.getUTCDate()));
  return isoFinancialDate(date.toISOString().slice(0, 10));
}
