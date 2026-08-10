/**
 * Regresión: palabras clave explícitas deben ganar sobre patrones de dígito inicial
 * en getAcademicLevel().
 *
 * Antes del fix el orden era:
 *   KINDER  (includes PRE → capta PREPA por error)
 *   PRIMARIA || ^[1-6]        ← "1er BACHILLERATO" caía aquí
 *   SECUNDARIA || ^[7-9]
 *   BACHILLERATO || PREPARATORIA
 *
 * Casos que FALLAN antes del fix (y deben pasar tras él):
 *   AKD-01  "1er BACHILLERATO" → BACHILLERATO  (no PRIMARIA)
 *   AKD-02  "2do BACHILLERATO" → BACHILLERATO  (no PRIMARIA)
 *   AKD-03  "1er PREPARATORIA" → BACHILLERATO  (no PRIMARIA)
 *   AKD-04  "1 SECUNDARIA"     → SECUNDARIA    (no PRIMARIA)
 *   AKD-05  "1° PREPA"         → BACHILLERATO  (no KINDER — bug secundario:
 *                                 includes('PRE') capturaba 'PREPA' como KINDER)
 *   AKD-06  "3er SECUNDARIA"   → SECUNDARIA    (no PRIMARIA)
 *
 * Casos que deben seguir pasando igual (no regresión):
 *   AKD-07  "K2"               → KINDER
 *   AKD-08  "3° PRIMARIA"      → PRIMARIA   (mapa exacto)
 *   AKD-09  "1° SECUNDARIA"    → SECUNDARIA (mapa exacto)
 *   AKD-10  "2° BACHILLERATO"  → BACHILLERATO (mapa exacto)
 *   AKD-11  null               → PRIMARIA   (default null)
 *   AKD-12  "texto raro"       → PRIMARIA   (default final)
 *   AKD-13  "7°"               → SECUNDARIA (dígito)
 *   AKD-14  "10°"              → BACHILLERATO (dígito ^1[0-2])
 */

import { describe, it, expect } from "vitest";
import { getAcademicLevel } from "../../shared/academic-levels";

describe("getAcademicLevel — keyword beats digit when both present", () => {

  // ── Casos que fallaban antes del fix ────────────────────────────────────────
  it("AKD-01: '1er BACHILLERATO' → BACHILLERATO (no PRIMARIA)", () => {
    expect(getAcademicLevel("1er BACHILLERATO")).toBe("BACHILLERATO");
  });

  it("AKD-02: '2do BACHILLERATO' → BACHILLERATO (no PRIMARIA)", () => {
    expect(getAcademicLevel("2do BACHILLERATO")).toBe("BACHILLERATO");
  });

  it("AKD-03: '1er PREPARATORIA' → BACHILLERATO (no PRIMARIA)", () => {
    expect(getAcademicLevel("1er PREPARATORIA")).toBe("BACHILLERATO");
  });

  it("AKD-04: '1 SECUNDARIA' → SECUNDARIA (no PRIMARIA)", () => {
    expect(getAcademicLevel("1 SECUNDARIA")).toBe("SECUNDARIA");
  });

  it("AKD-05: '1° PREPA' → BACHILLERATO (no KINDER — includes('PRE') era bug)", () => {
    expect(getAcademicLevel("1° PREPA")).toBe("BACHILLERATO");
  });

  it("AKD-06: '3er SECUNDARIA' → SECUNDARIA (no PRIMARIA)", () => {
    expect(getAcademicLevel("3er SECUNDARIA")).toBe("SECUNDARIA");
  });

  // ── No regresión: casos que deben seguir igual ───────────────────────────────
  it("AKD-07: 'K2' → KINDER (mapa exacto)", () => {
    expect(getAcademicLevel("K2")).toBe("KINDER");
  });

  it("AKD-08: '3° PRIMARIA' → PRIMARIA (mapa exacto)", () => {
    expect(getAcademicLevel("3° PRIMARIA")).toBe("PRIMARIA");
  });

  it("AKD-09: '1° SECUNDARIA' → SECUNDARIA (mapa exacto)", () => {
    expect(getAcademicLevel("1° SECUNDARIA")).toBe("SECUNDARIA");
  });

  it("AKD-10: '2° BACHILLERATO' → BACHILLERATO (mapa exacto)", () => {
    expect(getAcademicLevel("2° BACHILLERATO")).toBe("BACHILLERATO");
  });

  it("AKD-11: null → PRIMARIA (default null)", () => {
    expect(getAcademicLevel(null)).toBe("PRIMARIA");
  });

  it("AKD-12: 'texto raro' → PRIMARIA (default final — ambiguo, no se lanza error)", () => {
    expect(getAcademicLevel("texto raro")).toBe("PRIMARIA");
  });

  it("AKD-13: '7°' → SECUNDARIA (dígito fuzzy)", () => {
    expect(getAcademicLevel("7°")).toBe("SECUNDARIA");
  });

  it("AKD-14: '10°' → BACHILLERATO (dígito ^1[0-2])", () => {
    expect(getAcademicLevel("10°")).toBe("BACHILLERATO");
  });

  it("AKD-15: 'PREESCOLAR 2' → KINDER (no confundido con PREPA/PRE)", () => {
    expect(getAcademicLevel("PREESCOLAR 2")).toBe("KINDER");
  });

});
