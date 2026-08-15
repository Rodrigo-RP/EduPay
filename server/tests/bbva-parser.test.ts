/**
 * server/tests/bbva-parser.test.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Pruebas unitarias del parser de BBVA.
 *
 * Diseño: se llama directamente a parseFromLines() con fixtures de texto
 * y coordenadas 100% sintéticos.
 *
 * Las coordenadas X son las reales validadas empíricamente con PDFs reales
 * (ver .agents/memory/pdf-parser-validation.md), pero TODOS los valores de
 * texto (montos, nombres, referencias, rastreos, CLABEs) son ficticios:
 * no coinciden con ninguna transacción real de ningún banco ni persona.
 *
 *   CARGO  x ∈ [375, 391]   → umbral ≤ 400
 *   ABONO  x ∈ [415, 425]   → umbral ≥ 410
 *   SALDO  x ∈ [470, 569]   → ignorados (x ≥ 460)
 *
 * BBP-01  SPEI RECIBIDO — CLABE y nombre extraídos correctamente
 * BBP-02  PAGO DE NOMINA — abono sin CLABE ni nombre
 * BBP-03  CARGO — excluido silenciosamente (no aparece en transactions ni errors)
 * BBP-04  Bloque malformado — va a errors[], el resto continúa parseando
 * BBP-05  Línea de pie de página — ignorada, no rompe el bloque anterior
 * BBP-06  Saldos en la misma línea (x ≥ 460) — no afectan monto ni causan error
 * BBP-07  Metadata — banco, periodo y total_abonos_centavos correctos
 * BBP-08  Mes inválido — reportado en errors[], no lanza excepción
 */

import { describe, it, expect } from "vitest";
import { parseFromLines } from "../lib/bank-parsers/bbva-parser";
import type { TextLine } from "../lib/bank-parsers/types";

const YEAR = 2026;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Construye la línea principal de una transacción */
function txLine(
  dd: string,
  mes: string,
  y: number,
  desc: string,
  amountStr: string,
  amountX: number,
  extraParts: Array<{ str: string; x: number }> = [],
): TextLine {
  return {
    y,
    pageNum: 1,
    parts: [
      { str: `${dd}/${mes}`, x: 16 },
      { str: `${dd}/${mes}`, x: 61 },
      { str: desc,           x: 107 },
      { str: amountStr,      x: amountX },
      ...extraParts,
    ],
  };
}

/** Línea de continuación simple */
function contLine(text: string, y: number, x = 16): TextLine {
  return { y, pageNum: 1, parts: [{ str: text, x }] };
}

// ── Fixtures — todos los valores de texto son ficticios ───────────────────────
//
// Las coordenadas X son las reales del parser (validadas empíricamente).
// Los montos, nombres, referencias, rastreos y CLABEs son inventados.

// BBP-01 — SPEI RECIBIDO (ABONO a x=420, columna validada para abonos)
// Estructura de 5 líneas: main + ref + CLABE + rastreo + nombre
const FIXTURE_SPEI: TextLine[] = [
  txLine("14", "MAR", 240, "SPEI RECIBIDOBANORTE", "4,200.00", 420),
  { y: 220, pageNum: 1, parts: [
    { str: "PAGO PRUEBA 220033",       x: 16 },
    { str: "Referencia 1122334455 021", x: 250 },
  ]},
  contLine("072180000101234567",          200),  // CLABE sintética 18 dígitos
  contLine("20260314700000TEST000012345", 180),  // rastreo sintético — no es nombre
  contLine("EMPRESA EJEMPLO S.A. DE C.V.", 160), // nombre_ordenante sintético
];

// BBP-02 — PAGO DE NOMINA (ABONO a x=420, con saldos en misma línea)
const FIXTURE_NOMINA: TextLine[] = [
  txLine("14", "MAR", 140, "PAGO DE NOMINA", "9,000.00", 420, [
    { str: "20,000.00", x: 475 },  // saldo OPERACION — ignorar (x ≥ 460)
    { str: "20,000.00", x: 557 },  // saldo LIQUIDACION — ignorar
  ]),
  { y: 120, pageNum: 1, parts: [
    { str: "PAGADORA EJEMPLO S.A. DE C.V.", x: 16 },
    { str: "Referencia SN 0000000001",       x: 250 },
  ]},
];

// BBP-03 — CARGO (a x=391 ≤ 400) — debe descartarse silenciosamente
const FIXTURE_CARGO: TextLine[] = [
  txLine("10", "MAR", 100, "COMPRA EN LINEA *SUSCRIPCION", "150.00", 391, [
    { str: "10,000.00", x: 475 },
    { str:  "9,850.00", x: 557 },
  ]),
  { y: 80, pageNum: 1, parts: [
    { str: "RFC: TEST010101AAA 10:00 AUT: 000000", x: 16 },
    { str: "Referencia ******0001",                x: 250 },
  ]},
];

// BBP-04 — Bloque malformado: tiene fecha pero sin monto
const FIXTURE_MALFORMED: TextLine[] = [
  { y: 60, pageNum: 1, parts: [
    { str: "01/JUN", x: 16 },
    { str: "01/JUN", x: 61 },
    { str: "TRANSFERENCIA SIN MONTO", x: 107 },
    // ← sin monto
  ]},
];

// BBP-05 — Pie de página BBVA (debe ignorarse)
const FOOTER_LINE: TextLine = {
  y: 50, pageNum: 1,
  parts: [{ str: "BBVA MEXICO, S.A., INSTITUCION DE BANCA MULTIPLE", x: 16 }],
};

// BBP-08 — Mes inválido
const FIXTURE_MES_INVALIDO: TextLine[] = [
  txLine("15", "XYZ", 300, "ABONO MISTERIOSO", "500.00", 420),
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BBVAParser — parseFromLines", () => {

  it("BBP-01 SPEI RECIBIDO: fecha, monto, clabe y nombre extraídos correctamente", () => {
    const result = parseFromLines([...FIXTURE_SPEI], YEAR);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];

    expect(tx.fecha).toBe("2026-03-14");
    expect(tx.descripcion).toBe("SPEI RECIBIDOBANORTE");
    expect(tx.monto_centavos).toBe(420_000);
    expect(tx.tipo).toBe("credito");
    expect(tx.clabe_ordenante).toBe("072180000101234567");
    expect(tx.nombre_ordenante).toBe("EMPRESA EJEMPLO S.A. DE C.V.");
    expect(tx.referencia).toBe("1122334455");
    expect(result.errors).toHaveLength(0);
  });

  it("BBP-02 PAGO DE NOMINA: monto correcto, sin CLABE ni nombre", () => {
    const result = parseFromLines([...FIXTURE_NOMINA], YEAR);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];

    expect(tx.fecha).toBe("2026-03-14");
    expect(tx.monto_centavos).toBe(900_000);
    expect(tx.tipo).toBe("credito");
    expect(tx.clabe_ordenante).toBeNull();
    expect(tx.nombre_ordenante).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it("BBP-03 CARGO — excluido silenciosamente: no aparece en transactions ni en errors", () => {
    const result = parseFromLines([...FIXTURE_CARGO], YEAR);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("BBP-04 bloque malformado → errors[], el SPEI anterior sigue parseando", () => {
    const lines = [...FIXTURE_SPEI, ...FIXTURE_MALFORMED];
    const result = parseFromLines(lines, YEAR);

    // SPEI sí se parseó
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].monto_centavos).toBe(420_000);

    // Malformado reportado
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].razon).toMatch(/monto/i);
    expect(result.errors[0].texto).toContain("TRANSFERENCIA SIN MONTO");
  });

  it("BBP-05 línea de pie de página ignorada — no rompe el bloque contiguo", () => {
    // Footer insertado ENTRE SPEI y NOMINA
    const lines = [...FIXTURE_SPEI, FOOTER_LINE, ...FIXTURE_NOMINA];
    const result = parseFromLines(lines, YEAR);

    // Ambos abonos parseados correctamente
    expect(result.transactions).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("BBP-06 saldos en la misma línea (x ≥ 460) no afectan el monto ni causan error", () => {
    // NOMINA tiene saldos a x=475 y x=557 en la misma línea
    const result = parseFromLines([...FIXTURE_NOMINA], YEAR);

    expect(result.transactions[0].monto_centavos).toBe(900_000);
    expect(result.errors).toHaveLength(0);
  });

  it("BBP-07 metadata: banco, periodo y total_abonos_centavos correctos", () => {
    const lines = [...FIXTURE_SPEI, ...FIXTURE_NOMINA];
    const result = parseFromLines(lines, YEAR);

    expect(result.metadata.banco).toBe("BBVA");
    expect(result.metadata.periodo_inicio).toBe("2026-03-14");
    expect(result.metadata.periodo_fin).toBe("2026-03-14");
    expect(result.metadata.total_abonos_centavos).toBe(420_000 + 900_000);
  });

  it("BBP-08 mes inválido reportado en errors[], no lanza excepción", () => {
    const result = parseFromLines([...FIXTURE_MES_INVALIDO], YEAR);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].razon).toMatch(/[Mm]es/);
  });

});
