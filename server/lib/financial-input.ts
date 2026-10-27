import type { RequestHandler } from "express";
import { z } from "zod";

// Límites editables sin cambiar los contratos de cada ruta. Los centavos deben
// conservar precisión exacta en JavaScript; cero sólo donde tiene sentido.
export const financialInputLimits = {
  maxCentavos: Number.MAX_SAFE_INTEGER,
  maxInstallments: 120,
  minDate: "2000-01-01",
  maxDate: "2100-12-31",
} as const;

export const centavos = z.number().finite().int().positive().max(financialInputLimits.maxCentavos);
export const nonNegativeCentavos = centavos.or(z.literal(0));
export const percentage = z.number().finite().min(0).max(100);
export const positiveId = z.union([
  z.number(),
  z.string().regex(/^[1-9]\d*$/).transform(Number),
]).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

// Formularios y CSV envían decimales como texto. No usar coerce/parseFloat:
// aceptar sólo el número completo, nunca booleanos, vacíos o "100pesos".
const decimal = z.union([
  z.number(),
  z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number),
]).pipe(z.number().finite());
export const pesos = decimal.refine(
  value => value > 0
    && /^\d+(?:\.\d{1,2})?$/.test(String(value))
    && Math.round(value * 100) > 0
    && Number.isSafeInteger(Math.round(value * 100)),
  "El monto debe ser positivo y tener como máximo dos decimales",
);
export const csvCentavos = z.union([
  z.number(),
  z.string().trim().regex(/^\d+$/).transform(Number),
]).pipe(centavos);
export const csvPercentage = decimal.pipe(percentage);

export const isoFinancialDate = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < financialInputLimits.minDate || value > financialInputLimits.maxDate) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, `Usa una fecha real YYYY-MM-DD entre ${financialInputLimits.minDate} y ${financialInputLimits.maxDate}`);

export const monthPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(value => isoFinancialDate.safeParse(`${value}-01`).success, "El período está fuera de rango");

const text = z.string().trim().min(1);
const optionalText = z.string().max(2000).optional();
const dateFields = {
  fecha_emision: isoFinancialDate.optional(),
  fecha_vencimiento: isoFinancialDate.optional(),
  periodo: monthPeriod.optional(),
  periodo_inicio: isoFinancialDate.optional(),
  periodo_fin: isoFinancialDate.optional(),
  billing_period: z.object({
    month: monthPeriod.optional(),
    schoolCycle: text.optional(),
    periodKey: text.optional(),
  }).optional(),
};
const orderedDates = (value: { fecha_emision?: string; fecha_vencimiento?: string; periodo_inicio?: string; periodo_fin?: string }) =>
  (!value.fecha_emision || !value.fecha_vencimiento || value.fecha_emision <= value.fecha_vencimiento)
  && (!value.periodo_inicio || !value.periodo_fin || value.periodo_inicio <= value.periodo_fin);

export function paymentPlanInput(maxInstallments: number = financialInputLimits.maxInstallments) {
  return z.object({
    charge_ids: z.array(positiveId).min(1).max(1000).optional(),
    concept_id: positiveId.optional(),
    student_id: positiveId.optional(),
    guardian_id: positiveId.optional(),
    monto_inicial_centavos: nonNegativeCentavos.optional(),
    recargo_centavos: nonNegativeCentavos.optional(),
    numero_pagos: z.number().int().min(1).max(maxInstallments),
    frecuencia: z.enum(["mensual", "quincenal", "semanal"]).optional(),
    fecha_inicio: isoFinancialDate,
    observaciones: optionalText,
  }).passthrough().superRefine((value, ctx) => {
    if (!!value.charge_ids === !!value.concept_id) {
      ctx.addIssue({ code: "custom", path: ["charge_ids"], message: "Indica cargos a reestructurar o un concepto futuro, no ambos" });
    }
    if (value.charge_ids && new Set(value.charge_ids).size !== value.charge_ids.length) {
      ctx.addIssue({ code: "custom", path: ["charge_ids"], message: "No repitas cargos en el plan" });
    }
    if (value.concept_id && !value.student_id) {
      ctx.addIssue({ code: "custom", path: ["student_id"], message: "Indica el alumno del acuerdo futuro" });
    }
    // Misma frecuencia de generarCuotaCharges: la primera vence tras un
    // intervalo y la última tras N intervalos de 7, 15 o 30 días.
    const last = new Date(`${value.fecha_inicio}T00:00:00Z`);
    const days = value.frecuencia === "semanal" ? 7 : value.frecuencia === "quincenal" ? 15 : 30;
    last.setUTCDate(last.getUTCDate() + value.numero_pagos * days);
    if (!Number.isFinite(last.getTime()) || last.toISOString().slice(0, 10) > financialInputLimits.maxDate) {
      ctx.addIssue({ code: "custom", path: ["fecha_inicio"], message: "La última cuota quedaría fuera del rango de fechas permitido" });
    }
  });
}

const productPrices = z.object({
  precio_kinder: nonNegativeCentavos.optional(),
  precio_primaria: nonNegativeCentavos.optional(),
  precio_secundaria: nonNegativeCentavos.optional(),
  precio_bachillerato: nonNegativeCentavos.optional(),
}).passthrough();
export const bankTransactionInput = z.object({
  fecha: isoFinancialDate,
  monto: pesos,
  tipo: z.enum(["credito", "debito"]).optional(),
  descripcion: z.string().nullable().optional(),
  referencia: z.string().nullable().optional(),
  clabe: z.string().nullable().optional(),
  nombre: z.string().nullable().optional(),
}).passthrough();
export const parsedBankTransactionInput = z.object({
  fecha: isoFinancialDate, monto_centavos: centavos,
  tipo: z.enum(["credito", "debito"]).optional(),
}).passthrough();

// Las celdas XLSX de fecha llegan como serial numérico; sólo se normalizan en
// importación, no en los contratos JSON. CSV se lee en modo raw para exigir ISO.
const spreadsheetDate = z.preprocess(value => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 36526 && value <= 73415) {
    return new Date((value - 25569) * 86400000).toISOString().slice(0, 10);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return value;
}, isoFinancialDate);

export const financialBodies = {
  concept: z.object({
    nombre: text, tipo: text, periodicidad: text, monto_centavos: centavos,
    iva: z.boolean().optional(),
  }).passthrough(),
  conceptUpdate: z.object({
    nombre: text.optional(), tipo: text.optional(), periodicidad: text.optional(),
    monto_centavos: centavos.optional(), iva: z.boolean().optional(),
  }).passthrough().refine(value =>
    ["nombre", "tipo", "periodicidad", "monto_centavos", "iva"].some(key => value[key] !== undefined),
  "Indica al menos un campo del concepto para actualizar"),
  generate: z.object({
    concepto: text.optional(),
    descripcion: optionalText,
    monto_manual: centavos.optional(),
    product_id: positiveId.optional(),
    student_id: positiveId.optional(),
    ciclo_escolar: text.optional(),
    aplicar_becas: z.boolean().optional(),
    incluir_recargos: z.boolean().optional(),
    dry_run: z.boolean().optional(),
    es_adeudo_migrado: z.boolean().optional(),
    ...dateFields,
  }).passthrough().refine(orderedDates, "El vencimiento o fin del período no puede ser anterior al inicio"),
  bulk: z.object({
    campus_id: positiveId, concept_id: positiveId, ciclo_escolar: text, ...dateFields,
  }).passthrough().refine(orderedDates, "El vencimiento o fin del período no puede ser anterior al inicio"),
  monthly: z.object({ periodo: monthPeriod, ciclo_escolar: text.optional() }).passthrough(),
  extraordinary: z.object({
    student_id: positiveId, concept_id: positiveId.optional(), monto: pesos,
    descripcion: optionalText, fecha_vencimiento: isoFinancialDate, motivo_override: text,
  }).passthrough().refine(value => value.fecha_vencimiento >= new Date().toISOString().slice(0, 10),
    { path: ["fecha_vencimiento"], message: "El vencimiento no puede estar en el pasado" }),
  catalog: z.object({
    producto_id: positiveId, ciclo_escolar: text.optional(), ...dateFields,
  }).passthrough().refine(orderedDates, "El vencimiento o fin del período no puede ser anterior al inicio"),
  plan: paymentPlanInput(),
  product: productPrices,
  cash: z.object({
    estudiante_id: positiveId, charge_id: positiveId.optional(), monto: pesos,
    recibido_por: optionalText, observaciones: optionalText,
  }).passthrough(),
  transfer: bankTransactionInput.extend({ fecha: isoFinancialDate.optional() }),
  bankImport: z.object({ transacciones: z.array(bankTransactionInput).min(1).max(10000) }).passthrough(),
  closure: z.object({
    fecha: isoFinancialDate.optional(), efectivo_capturado_centavos: nonNegativeCentavos,
    observaciones: optionalText,
  }).passthrough(),
};

function issueMessage(issue: z.ZodIssue): string {
  if (issue.code === "custom") return issue.message;
  if (issue.code === "invalid_type") return "El campo es obligatorio y debe tener el tipo de dato indicado";
  if (issue.code === "too_small") return `El valor mínimo permitido es ${issue.minimum}${issue.inclusive ? "" : " (sin incluirlo)"}`;
  if (issue.code === "too_big") return `El valor máximo permitido es ${issue.maximum}`;
  if (issue.code === "invalid_enum_value") return `Elige uno de estos valores: ${issue.options.join(", ")}`;
  return "Ingresa un valor válido, sin texto adicional ni decimales no permitidos";
}

/** Se ejecuta después de autenticar y antes del handler (sin acceso a BD). */
export function validateFinancialBody(schema: z.ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Revisa los datos: los montos deben ser válidos y las fechas deben ser reales.",
        errors: parsed.error.issues.map(issue => ({
          campo: issue.path.join("."), mensaje: issueMessage(issue),
        })),
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

/** Preflight de archivos: todas las filas financieras antes de abrir conexión. */
export function validateFinancialImportRows(category: string, rows: any[]) {
  const errors: { fila: number; campo: string; mensaje: string }[] = [];
  const normalized = rows.map((original, index) => {
    const row = { ...original };
    if (category === "becas") {
      row.vigencia_inicio ??= new Date().toISOString().slice(0, 10);
      if (row.vigencia_fin === undefined) {
        const start = spreadsheetDate.safeParse(row.vigencia_inicio);
        if (start.success) {
          const end = new Date(`${start.data}T00:00:00Z`);
          end.setUTCFullYear(end.getUTCFullYear() + 1);
          row.vigencia_fin = end.toISOString().slice(0, 10);
        }
      }
    }
    const schemas: Record<string, z.ZodTypeAny> = category === "adeudos" ? {
      monto_centavos: csvCentavos, fecha_vencimiento: spreadsheetDate,
      ...(row.fecha_emision !== undefined ? { fecha_emision: spreadsheetDate } : {}),
    } : category === "becas" ? {
      valor_descuento: csvPercentage,
      ...(row.vigencia_inicio !== undefined ? { vigencia_inicio: spreadsheetDate } : {}),
      ...(row.vigencia_fin !== undefined ? { vigencia_fin: spreadsheetDate } : {}),
    } : category === "familias" && row.porcentaje_responsabilidad !== undefined
      && row.porcentaje_responsabilidad !== "" ? { porcentaje_responsabilidad: csvPercentage } : {};
    const parsed = z.object(schemas).passthrough().safeParse(row);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push({
        fila: index + 2, campo: issue.path.join("."), mensaje: issueMessage(issue),
      });
      return row;
    }
    const value = parsed.data;
    if ((value.fecha_emision && value.fecha_vencimiento && value.fecha_emision > value.fecha_vencimiento)
      || (value.vigencia_inicio && value.vigencia_fin && value.vigencia_inicio > value.vigencia_fin)) {
      errors.push({ fila: index + 2, campo: "fecha", mensaje: "La fecha final no puede ser anterior a la inicial" });
    }
    return parsed.data;
  });
  return { rows: normalized, errors };
}
