import { describe, expect, it } from "vitest";
import {
  calculateSurcharge,
  parseProgressiveSurchargeTiers,
} from "../lib/surcharge-calculator";

describe("surcharge calculator", () => {
  it("calcula porcentaje y respeta los días de gracia", () => {
    const result = calculateSurcharge(
      { tipo: "porcentaje", dias_gracia: 2, porcentaje: 10, aplica_fines_semana: true, aplica_festivos: true },
      10_000,
      "2026-08-01",
      "2026-08-04",
    );

    expect(result.effectiveDaysLate).toBe(1);
    expect(result.amountCentavos).toBe(1_000);
  });

  it("calcula monto fijo y aplica el tope configurado", () => {
    const result = calculateSurcharge(
      {
        tipo: "fijo",
        dias_gracia: 0,
        monto_fijo_centavos: 1_500,
        monto_maximo_centavos: 900,
        aplica_fines_semana: true,
        aplica_festivos: true,
      },
      10_000,
      "2026-08-01",
      "2026-08-03",
    );

    expect(result.amountCentavos).toBe(900);
  });

  it("elige el tramo progresivo que corresponde a los días efectivos", () => {
    const result = calculateSurcharge(
      {
        tipo: "progresivo",
        dias_gracia: 0,
        reglas_progresivas: [
          { dias_desde: 1, dias_hasta: 5, porcentaje: 2 },
          { dias_desde: 6, dias_hasta: 30, porcentaje: 7.5 },
        ],
        aplica_fines_semana: true,
        aplica_festivos: true,
      },
      20_000,
      "2026-08-01",
      "2026-08-09",
    );

    expect(result.effectiveDaysLate).toBe(8);
    expect(result.amountCentavos).toBe(1_500);
  });

  it("no permite tramos progresivos traslapados ni genera cargos con ellos", () => {
    const invalidTiers = [
      { dias_desde: 1, dias_hasta: 5, porcentaje: 2 },
      { dias_desde: 5, dias_hasta: 15, porcentaje: 7 },
    ];
    expect(parseProgressiveSurchargeTiers(invalidTiers)).toBeNull();

    expect(calculateSurcharge(
      {
        tipo: "progresivo",
        dias_gracia: 0,
        reglas_progresivas: invalidTiers,
        aplica_fines_semana: true,
        aplica_festivos: true,
      },
      10_000,
      "2026-08-01",
      "2026-08-10",
    ).amountCentavos).toBe(0);
  });

  it("excluye fines de semana cuando la regla no los incluye", () => {
    const result = calculateSurcharge(
      { tipo: "porcentaje", dias_gracia: 0, porcentaje: 5, aplica_fines_semana: false, aplica_festivos: true },
      10_000,
      "2026-08-07", // viernes
      "2026-08-10", // lunes: sólo cuenta lunes
    );

    expect(result.daysLate).toBe(1);
    expect(result.amountCentavos).toBe(500);
  });
});