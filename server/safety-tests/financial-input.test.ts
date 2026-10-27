import { describe, expect, it } from "vitest";
import {
  centavos, nonNegativeCentavos, pesos, percentage, isoFinancialDate,
  financialBodies, paymentPlanInput, validateFinancialImportRows, storedProductPrices,
} from "../lib/financial-input";

describe("Contratos financieros sin base de datos", () => {
  it.each([-1, 0, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1,
    "100", "10abc", "", null, true, [], {}])("rechaza centavos inválidos %j", value => {
    expect(centavos.safeParse(value).success).toBe(false);
  });
  it.each([1, 100, Number.MAX_SAFE_INTEGER])("acepta centavos enteros %j", value => {
    expect(centavos.parse(value)).toBe(value);
  });
  it("normaliza BIGINT del catálogo sin alterar ceros de niveles no vendidos", () => {
    expect(storedProductPrices.parse({
      precio_kinder: "129", precio_primaria: "0", precio_secundaria: 0, precio_bachillerato: 0,
    })).toEqual({ precio_kinder: 129, precio_primaria: 0, precio_secundaria: 0, precio_bachillerato: 0 });
  });
  it("permite cero sólo para precios no aplicables, anticipos, recargos y cierre", () => {
    expect(nonNegativeCentavos.parse(0)).toBe(0);
    expect(financialBodies.product.parse({ precio_kinder: 0 }).precio_kinder).toBe(0);
    expect(financialBodies.closure.parse({ efectivo_capturado_centavos: 0 })).toBeTruthy();
  });
  it.each([-1, 0, 0.001, 0.000000001, 1.999, NaN, Infinity, Number.MAX_SAFE_INTEGER,
    "-1", "1abc", "$1", "1,000", "1e2", "", " ", null, false, [], {}])("rechaza pesos inválidos %j", value => {
    expect(pesos.safeParse(value).success).toBe(false);
  });
  it.each([0.01, 0.29, 1.1, 1500, "0.01", "0.29", "100.50"])("acepta pesos exactos %j", value => {
    expect(pesos.parse(value)).toBe(Number(value));
  });
  it.each([-0.01, 100.01, NaN, Infinity, "50", true, null])("rechaza porcentaje inválido %j", value => {
    expect(percentage.safeParse(value).success).toBe(false);
  });
  it.each([0, 0.01, 50, 100])("acepta porcentajes incluidos los extremos %j", value => {
    expect(percentage.parse(value)).toBe(value);
  });
  it.each(["", "ayer", "2026-2-01", "2026-02-30", "2025-02-29", "2026-04-31",
    "2026-13-01", "2026-00-10", "2026-01-00", "1999-12-31", "2101-01-01",
    "2026-01-01T12:00:00Z", null, 46235])("rechaza fecha imposible o fuera de rango %j", value => {
    expect(isoFinancialDate.safeParse(value).success).toBe(false);
  });
  it.each(["2000-01-01", "2024-02-29", "2100-12-31"])("acepta fecha real %s", value => {
    expect(isoFinancialDate.parse(value)).toBe(value);
  });
  const plan = { charge_ids: [1], fecha_inicio: "2026-11-01", numero_pagos: 4 };
  it.each([0, -1, 1.5, 121, NaN, Infinity, "4", null])("rechaza cantidad de cuotas %j", numero_pagos => {
    expect(financialBodies.plan.safeParse({ ...plan, numero_pagos }).success).toBe(false);
  });
  it.each([1, 120])("acepta límites de cuotas %j", numero_pagos => {
    expect(financialBodies.plan.safeParse({ ...plan, numero_pagos }).success).toBe(true);
  });
  it("permite configurar un máximo distinto de cuotas", () => {
    expect(paymentPlanInput(3).safeParse(plan).success).toBe(false);
    expect(paymentPlanInput(5).safeParse(plan).success).toBe(true);
  });
  it("rechaza última cuota fuera de rango y cargos duplicados", () => {
    expect(financialBodies.plan.safeParse({ ...plan, fecha_inicio: "2100-12-30" }).success).toBe(false);
    expect(financialBodies.plan.safeParse({ ...plan, charge_ids: [1, 1] }).success).toBe(false);
  });
  it("rechaza fechas invertidas y billing_period inválido", () => {
    expect(financialBodies.catalog.safeParse({
      producto_id: 1, fecha_emision: "2026-11-02", fecha_vencimiento: "2026-11-01",
    }).success).toBe(false);
    expect(financialBodies.bulk.safeParse({
      campus_id: 1, concept_id: 2, ciclo_escolar: "2026-2027", billing_period: { month: "2026-13" },
    }).success).toBe(false);
  });
  it.each([null, [], "", undefined])("rechaza cuerpos vacíos o con tipo incorrecto %j", value => {
    expect(financialBodies.monthly.safeParse(value).success).toBe(false);
  });
});

describe("Preflight financiero de archivos", () => {
  it.each(["100abc", "1.5", "-100", "NaN", "", null, true, Number.MAX_SAFE_INTEGER + 1])(
    "rechaza centavos que parseInt antes truncaba: %j", monto_centavos => {
      const result = validateFinancialImportRows("adeudos", [{ monto_centavos, fecha_vencimiento: "2026-11-01" }]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ fila: 2, campo: "monto_centavos" });
    });
  it("normaliza celdas Excel de fecha y números completos sin truncar", () => {
    const result = validateFinancialImportRows("adeudos", [{ monto_centavos: "100", fecha_vencimiento: 46235 }]);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ monto_centavos: 100, fecha_vencimiento: "2026-08-01" });
  });
  it.each(["2026-02-30", "ayer", 1e20, new Date("invalid")])("rechaza fecha importada %j", fecha_vencimiento => {
    expect(validateFinancialImportRows("adeudos", [{ monto_centavos: 100, fecha_vencimiento }]).errors.length).toBeGreaterThan(0);
  });
  it.each([0, "0", 100, "100"])("acepta extremos del porcentaje importado %j", valor_descuento => {
    expect(validateFinancialImportRows("becas", [{ valor_descuento }]).errors).toEqual([]);
  });
  it.each([-1, "101", "50abc", true, null])("rechaza porcentaje importado %j", valor_descuento => {
    expect(validateFinancialImportRows("becas", [{ valor_descuento }]).errors.length).toBeGreaterThan(0);
  });
  it("valida responsabilidad familiar y vigencias invertidas", () => {
    expect(validateFinancialImportRows("familias", [{ porcentaje_responsabilidad: "101" }]).errors.length).toBe(1);
    expect(validateFinancialImportRows("becas", [{
      valor_descuento: 50, vigencia_inicio: "2026-11-02", vigencia_fin: "2026-11-01",
    }]).errors.length).toBe(1);
  });
  it("rechaza también vigencia final derivada fuera del rango", () => {
    expect(validateFinancialImportRows("becas", [{
      valor_descuento: 50, vigencia_inicio: "2100-11-01",
    }]).errors[0]).toMatchObject({ campo: "vigencia_fin" });
  });
});
