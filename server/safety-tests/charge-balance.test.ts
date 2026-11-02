import { expect, it } from "vitest";
import { chargeBalance } from "../../shared/charge-balance";

it.each([
  [100000, "50.00", 0, 0, 50000],
  [100000, "50", 3000, 10000, 43000],
  [99, "50.00", 0, 0, 50],
  [101, "50.00", 0, 0, 51],
  [100000, null, 0, 100000, 0],
  [100000, "100", 0, 0, 0],
])("centavos exactos: base %s, beca %s, recargo %s, aplicado %s", (base, beca, recargo, applied, expected) => {
  expect(chargeBalance({ monto_base_centavos: base, beca_aplicada: beca,
    recargo_aplicado_centavos: recargo, ya_pagado: applied }).pendiente_centavos).toBe(expected);
});
it("cargos cancelados y reestructurados no se proponen", () => {
  for (const estado of ["cancelado", "reestructurado"]) {
    expect(chargeBalance({ monto_base_centavos: 100000, estado }).pendiente_centavos).toBe(0);
  }
});
it.each([NaN, 1.5, -1, Number.MAX_SAFE_INTEGER + 1])("rechaza centavos inválidos %s", value => {
  expect(() => chargeBalance({ monto_base_centavos: value })).toThrow();
});
