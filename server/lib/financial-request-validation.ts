import type { RequestHandler } from "express";
import { schoolDate } from "@shared/school-date";
import {
  centavos, FinancialInputError, installments, isoFinancialDate, orderedDates,
  percentage, pesosToCentavos, positiveId, scholarshipBenefitPercentage, automaticScholarshipPercentage, monthlyDueDate,
} from "./financial-input";

type Contract = { method: string; path: string; required?: string[] };
/** Inventario ejecutable; no modifica cuerpos ni sustituye permisos o pertenencia. */
export const financialContracts: Contract[] = [
  ...[
    "/api/admin/concepts", "/api/admin/charges/bulk", "/api/admin/cargos/generar-mensual",
    "/api/admin/cargos/extraordinario", "/api/admin/cargos/desde-catalogo",
    "/api/admin/charges/:chargeId/pagar-manual", "/api/payments/manual",
    "/api/guardian/pagar", "/api/charges/generate", "/api/concepts",
    "/api/payment-config/due-dates-complete", "/api/payment-config/due-date-periods",
    "/api/payment-config/surcharge-rules-complete", "/api/payment-config/due-dates",
    "/api/payment-config/surcharge-rules", "/api/admin/family-credits/:creditId/aplicar",
    "/api/admin/alertas/condonaciones/:planId/override-token", "/api/admin/students/:studentId/beca",
    "/api/admin/scholarship-types", "/api/caja/pago-efectivo", "/api/caja/transferencia-manual",
    "/api/caja/cerrar-dia", "/api/conciliacion/importar", "/api/conciliacion/importar-pdf",
    "/api/conciliacion/excepciones/:id/resolver", "/api/conciliacion/excepciones/stripe/:id/resolver",
    "/api/planes-pago", "/api/planes-pago/cuotas/:cuotaId/pagar", "/api/products",
    "/api/payment-config/late-fee-rules", "/api/payment-config/test-late-fee",
    "/api/receivables/follow-ups", "/api/receivables/notes", "/api/receivables/promises",
    "/api/receivables/reminders", "/api/receivables/escalations", "/api/receivables/collections",
    "/api/fiscal/generar-reporte-contable", "/api/fiscal/generar-reporte-sat",
    "/api/becas-auto/reglas",
    "/api/reportes/consejo/exportar", "/api/reportes/contable/exportar",
    "/api/reportes/cobranza/exportar",
    "/api/reportes/financiero/exportar", "/api/payments/create-intent", "/api/payments/process",
  ].map(path => ({ method: "POST", path })),
  ...[
    "/api/concepts/:id", "/api/payment-config/due-dates-complete/:id",
    "/api/payment-config/due-date-periods/:id", "/api/payment-config/surcharge-rules-complete/:id",
    "/api/payment-config/due-dates/:id", "/api/payment-config/surcharge-rules/:id",
    "/api/products/:id", "/api/payment-config/late-fee-rules/:id",
  ].map(path => ({ method: "PUT", path })),
  ...[
    "/api/admin/scholarships/:id", "/api/admin/scholarships/:id/estado",
    "/api/admin/scholarship-types/:id", "/api/planes-pago/:id/cancelar", "/api/products/:id",
  ].map(path => ({ method: "PATCH", path })),
  ...[
    "/api/caja/pagos-efectivo", "/api/caja/cierre-dia", "/api/receivables/activities",
    "/api/reportes/consejo", "/api/reportes/contable", "/api/fiscal/pendientes-cfdi",
    "/api/fiscal/pendientes-cfdi/:campusId", "/api/admin/dashboard/:campusId",
    "/api/reportes/cobranza", "/api/reportes/financiero",
  ].map(path => ({ method: "GET", path })),
];

const required: Record<string, string[]> = {
  "/api/admin/cargos/extraordinario": ["student_id", "monto", "fecha_vencimiento"],
  "/api/admin/charges/bulk": ["concept_id"],
  "/api/admin/cargos/desde-catalogo": ["producto_id"],
  "/api/payments/manual": ["student_id", "charge_id", "amount_centavos"],
  "/api/guardian/pagar": ["charge_ids"],
  "/api/caja/pago-efectivo": ["estudiante_id", "monto"],
  "/api/planes-pago": ["numero_pagos", "fecha_inicio"],
  "/api/receivables/promises": ["charge_id", "fecha", "monto_centavos"],
  "/api/receivables/follow-ups": ["charge_id", "fecha"],
  "/api/receivables/notes": ["charge_id"],
  "/api/receivables/reminders": ["charge_ids"],
  "/api/receivables/escalations": ["charge_id"],
  "/api/receivables/collections": ["charge_ids"],
  "/api/admin/family-credits/:creditId/aplicar": ["charge_id"],
  "/api/admin/concepts": ["monto_centavos"],
  "/api/concepts": ["monto_centavos"],
  "/api/conciliacion/importar": ["transacciones"],
};
const idKeys = new Set([
  "charge_id", "payment_id", "cargo_id", "pago_id", "student_id", "estudiante_id",
  "guardian_id", "concept_id", "concepto_id", "product_id", "producto_id", "plan_id",
  "scholarship_type_id", "alerta_id",
]);
const percentageKeys = new Set([
  "porcentaje", "descuento_porcentaje", "valor_descuento", "porcentaje_responsabilidad",
  "porcentaje_descuento", "beca_aplicada",
  "porcentaje_recargo", "incremento_mensual_porcentaje",
]);
const dateKeys = new Set([
  "fecha", "fecha_emision", "fecha_vencimiento", "fecha_pago", "fecha_inicio", "fecha_fin",
  "vigencia_inicio", "vigencia_fin", "fecha_desde", "fecha_hasta", "periodo_inicio", "periodo_fin",
  "fecha_inicio_acumulacion",
]);
const nonnegativeMoney = new Set([
  "monto_inicial_centavos", "recargo_centavos", "recargo_aplicado_centavos",
  "efectivo_capturado_centavos", "monto_fijo_centavos", "monto_maximo_centavos",
  "descuento_fijo_centavos", "precio_kinder", "precio_primaria", "precio_secundaria", "precio_bachillerato",
]);
const positiveMoney = new Set(["monto_centavos", "amount_centavos", "monto_base_centavos", "monto_manual"]);
const optionalNullable = new Set([
  "scholarship_type_id", "monto_fijo", "monto_maximo", "monto_fijo_centavos", "monto_maximo_centavos",
  "vigencia_fin", "vigencia_inicio", "descuento_fijo_centavos",
]);

function period(value: unknown): void {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new FinancialInputError("El período debe tener formato YYYY-MM y un mes válido.");
  }
}

function validateFields(input: unknown, context: string): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new FinancialInputError("Los datos financieros deben ser un objeto.");
  }
  const row = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || (value === null && optionalNullable.has(key))) continue;
    const feeType = row.tipo ?? row.tipo_calculo;
    if (key === "reglas_progresivas" && value === null && feeType !== "progresivo") continue;
    if (key === "incremento_mensual" && (value === "" || value === null)
      && (row.modo_acumulacion !== "incremento_fijo" || row.tipo_incremento_mensual !== "monto")) continue;
    if (key === "incremento_mensual_porcentaje" && (value === "" || value === null)
      && (row.modo_acumulacion !== "incremento_fijo" || row.tipo_incremento_mensual !== "porcentaje")) continue;
    if (key === "porcentaje_recargo" && (value === "" || value === null) && feeType !== "porcentaje") continue;
    if (key === "fecha_inicio_acumulacion" && (value === "" || value === null) && (!row.modo_acumulacion || row.modo_acumulacion === "ninguno")) continue;
    if (value === null && percentageKeys.has(key) && (row.tipo === "fijo" || row.tipo_calculo === "fijo"
      || (key === "descuento_porcentaje" && row.descuento_fijo_centavos != null))) continue;
    if (value === "" && ["monto_maximo", "monto_maximo_centavos"].includes(key)) continue;
    if ((value === "" || value === null) && key === "monto_fijo" && feeType === "porcentaje") continue;
    if (idKeys.has(key)) positiveId(value, key);
    else if (key === "student_ids") {
      if (!Array.isArray(value)) throw new FinancialInputError("Indica una lista válida de estudiantes.");
      value.forEach(id => positiveId(id, "El estudiante"));
    }
    else if (key === "charge_ids") {
      if (!Array.isArray(value) || !value.length) throw new FinancialInputError("Selecciona al menos un cargo con identificador válido.");
      value.forEach(id => positiveId(id, "El cargo"));
    } else if (positiveMoney.has(key)) centavos(value, false, key);
    else if (nonnegativeMoney.has(key)) centavos(value, true, key);
    else if (key === "amount" && context === "/api/payment-config/test-late-fee") centavos(value);
    else if (key === "monto" || key === "amount") pesosToCentavos(value, false, "El monto");
    else if (key === "monto_fijo" || key === "monto_maximo" || key === "incremento_mensual") pesosToCentavos(value, true, key);
    else if (key === "porcentaje_descuento" && context.startsWith("/api/admin/scholarship-types")) scholarshipBenefitPercentage(value);
    else if (key === "descuento_porcentaje" && context === "/api/becas-auto/reglas") automaticScholarshipPercentage(value);
    else if (percentageKeys.has(key)) percentage(value);
    else if (dateKeys.has(key)) isoFinancialDate(value);
    else if (key === "dia_vencimiento") {
      if (positiveId(value, "El día de vencimiento") > 31) {
        throw new FinancialInputError("El día de vencimiento debe ser un entero entre 1 y 31.");
      }
    } else if (key === "meses_aplicacion") {
      const names = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      if (!Array.isArray(value) || !value.length || value.some(month =>
        !(typeof month === "string" && names.includes(month)) && (
        (typeof month !== "string" && typeof month !== "number") || !/^\d+$/.test(String(month))
        || Number(month) < 1 || Number(month) > 12))) {
        throw new FinancialInputError("Selecciona meses válidos, del 1 al 12.");
      }
    }
    else if (["reglas_progresivas", "transacciones"].includes(key)) {
      let list = value;
      if (key === "reglas_progresivas" && typeof value === "string") {
        try { list = JSON.parse(value); } catch { throw new FinancialInputError("Los tramos progresivos deben ser una lista válida."); }
      }
      if (!Array.isArray(list)) throw new FinancialInputError(`${key}: indica una lista válida.`);
      list.forEach(item => validateFields(item, context));
    } else if (["rule", "beneficio"].includes(key)) validateFields(value, context);
    else if (key === "billing_period" && value && typeof value === "object") {
      const month = (value as Record<string, unknown>).month;
      if (month !== undefined) period(month);
    }
  }
  for (const [start, end] of [
    ["fecha_emision", "fecha_vencimiento"], ["fecha_inicio", "fecha_fin"],
    ["fecha_inicio", "fecha_vencimiento"], ["periodo_inicio", "periodo_fin"],
    ["vigencia_inicio", "vigencia_fin"], ["fecha_desde", "fecha_hasta"],
  ]) {
    if (row[start] != null && row[end] != null) orderedDates(row[start], row[end]);
  }
  if (context === "/api/planes-pago") {
    installments(row.numero_pagos);
    const existing = Array.isArray(row.charge_ids) && row.charge_ids.length > 0;
    if (existing === Boolean(row.concept_id)) {
      throw new FinancialInputError("El plan debe especificar charge_ids o concept_id, no ambos ni ninguno.");
    }
    if (!existing) positiveId(row.student_id, "El estudiante");
    orderedDates(schoolDate(), monthlyDueDate(isoFinancialDate(row.fecha_inicio), 1));
    if (row.frecuencia !== undefined && row.frecuencia !== "mensual") {
      throw new FinancialInputError("Los convenios deben tener cuotas mensuales.");
    }
  }
  if (context === "/api/admin/cargos/generar-mensual" && row.periodo !== undefined) period(row.periodo);
  if (context.includes("pendientes-cfdi") && row.mes !== undefined) period(row.mes);
  if ((context.startsWith("/api/reportes/contable") || context.startsWith("/api/fiscal/generar-reporte-")) && row.periodo !== undefined) period(row.periodo);
}

const compiled = financialContracts.map(contract => ({
  ...contract,
  regex: new RegExp(`^${contract.path.replace(/:[A-Za-z_]+/g, "([^/]+)")}/?$`),
}));

/** Se instala antes de authenticateToken: rechaza sintaxis inválida sin consultar SQL. */
export const financialRequestValidation: RequestHandler = (req, res, next) => {
  const contract = compiled.find(c => c.method === req.method && c.regex.test(req.path));
  if (!contract) return next();
  try {
    const captures = contract.regex.exec(req.path)!;
    captures.slice(1).forEach(id => positiveId(decodeURIComponent(id)));
    const body = req.body ?? {};
    if (!["GET", "DELETE"].includes(req.method)) {
      validateFields(body, contract.path);
      for (const name of required[contract.path] ?? []) {
        if (body[name] === undefined) throw new FinancialInputError(`El campo ${name} es obligatorio.`);
      }
    }
    validateFields(req.query, contract.method === "GET" ? contract.path : "");
    next();
  } catch (error) {
    if (!(error instanceof FinancialInputError) && !(error instanceof URIError)) return next(error);
    res.status(400).json({
      message: error instanceof FinancialInputError ? error.message : "El identificador no es válido.",
    });
  }
};
