import { describe, expect, it } from "vitest";
import {
  centavos, pesosToCentavos, percentage, isoFinancialDate, orderedDates,
  installments, splitInstallments, monthlyDueDate, positiveId, MAX_MONTO_CENTAVOS, scholarshipBenefitPercentage, automaticScholarshipPercentage,
} from "../lib/financial-input";

describe("Entradas financieras puras, sin conexión", () => {
  it.each([0, 100.01])("beca automática rechaza %s sin conexión", value => {
    expect(() => automaticScholarshipPercentage(value)).toThrow(/porcentaje/i);
  });
  it.each([0.01, 100])("beca automática admite %s sin conexión", value => {
    expect(automaticScholarshipPercentage(value)).toBe(value);
  });
  it.each(["-1", "abc", "", null, NaN, "1.234", "100.005", Infinity, true, {}, [], "1e2"])(
    "rechaza pesos inválidos %j", value => expect(() => pesosToCentavos(value)).toThrow(),
  );
  it.each([["0.29", 29], ["0.1", 10], [0.29, 29], ["500000.00", MAX_MONTO_CENTAVOS]])(
    "convierte por partes %j", (input, result) => expect(pesosToCentavos(input)).toBe(result),
  );
  it("valida el límite exacto, su sucesor y cero sólo cuando corresponde", () => {
    expect(centavos(MAX_MONTO_CENTAVOS)).toBe(MAX_MONTO_CENTAVOS);
    expect(() => centavos(MAX_MONTO_CENTAVOS + 1)).toThrow();
    expect(() => pesosToCentavos("500000.01")).toThrow();
    expect(() => centavos(0)).toThrow();
    expect(() => pesosToCentavos(0)).toThrow();
    expect(centavos(0, true)).toBe(0);
    expect(() => centavos(null, true)).toThrow();
    expect(() => centavos("1.2")).toThrow();
  });
  it.each([100.01, -1, "100.005", "", null, NaN])("rechaza porcentaje %j", value => {
    expect(() => percentage(value)).toThrow();
  });
  it("acepta porcentajes extremos y dos decimales", () => {
    expect(percentage(0)).toBe(0);
    expect(percentage("100")).toBe(100);
    expect(percentage("19.29")).toBe(19.29);
  });
  it("conserva la excepción entera de tipos de beca sin redondear", () => {
    expect(() => scholarshipBenefitPercentage("12.50")).toThrow(/entero.*0 a 100/);
    expect(scholarshipBenefitPercentage(25)).toBe(25);
    expect(scholarshipBenefitPercentage(0)).toBe(0);
    expect(scholarshipBenefitPercentage(100)).toBe(100);
    expect(percentage("12.50")).toBe(12.5);
  });
  it.each(["2026-02-30", "2026-2-01", "2025-02-29", "0000-01-01", "", null])(
    "rechaza fecha %j", value => expect(() => isoFinancialDate(value)).toThrow(),
  );
  it("valida fechas reales y ordenadas", () => {
    expect(isoFinancialDate("2028-02-29")).toBe("2028-02-29");
    expect(() => orderedDates("2026-10-28", "2026-10-27")).toThrow();
    expect(() => orderedDates("2026-10-28", "2026-10-28")).not.toThrow();
  });
  it.each([2, 7, 3.5, null, true, "abc"])("rechaza cuotas %j", n => expect(() => installments(n)).toThrow());
  it.each([3, 6])("acepta %j cuotas", n => expect(installments(n)).toBe(n));
  it("el residuo sólo se agrega a la última cuota, con suma exacta", () => {
    expect(splitInstallments(100, 0, 3)).toEqual([33, 33, 34]);
    expect(splitInstallments(100, 10, 6)).toEqual([15, 15, 15, 15, 15, 15]);
    const cuotas = splitInstallments(10003, 100, 6);
    expect(cuotas).toEqual([1650, 1650, 1650, 1650, 1650, 1653]);
    expect(cuotas.reduce((a, b) => a + b, 100)).toBe(10003);
    expect(() => splitInstallments(100, 100, 3)).toThrow();
  });
  it("usa meses calendario y ajusta fin de mes", () => {
    expect(monthlyDueDate("2028-01-31", 1)).toBe("2028-02-29");
    expect(monthlyDueDate("2028-01-31", 2)).toBe("2028-03-31");
  });
  it.each([0, -1, 1.5, "1abc", null, true, [], 2_147_483_648])(
    "rechaza ID %j", id => expect(() => positiveId(id)).toThrow(),
  );
});
