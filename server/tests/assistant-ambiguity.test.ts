/**
 * Tests para el manejo de ambigüedad en matchIntent
 *
 * Cubre:
 *  - Bug de Rodrigo: "costo de la colegiatura de primaria" en /estudiantes
 *    → antes respondía "Ya estás en Estudiantes" (bug)
 *    → ahora muestra chips de desambiguación
 *  - Caso dominante claro: sigue navegando directo sin mostrar opciones innecesarias
 *  - Empate genuino entre 3 módulos sin currentPath: muestra las 3 opciones
 *
 * Sin LLM ni llamadas externas — scoring puro sobre keywords.
 */

import { describe, it, expect } from "vitest";
import { matchIntent } from "../assistant-knowledge";

// ── Caso Rodrigo: bug reproducido y corregido ────────────────────────────────

describe("matchIntent — ambigüedad: caso Rodrigo (bug nav suprimida)", () => {

  it("BUG REPRODUCIDO: antes de la corrección, este mensaje en /estudiantes devolvería 'Ya estás en Estudiantes' — ahora NO debe hacerlo", () => {
    const r = matchIntent(
      "costo de la colegiatura de primaria",
      "administrador_campus",
      "/estudiantes"
    );
    // El bug era: reply contenía "Ya estás en Estudiantes" sin mostrar alternativas
    expect(r.reply).not.toMatch(/ya estás en \*\*Estudiantes\*\*/i);
    expect(r.reply).not.toMatch(/ya estás en estudiantes/i);
  });

  it("COMPORTAMIENTO CORRECTO: muestra chips de desambiguación, no navega ciegamente", () => {
    const r = matchIntent(
      "costo de la colegiatura de primaria",
      "administrador_campus",
      "/estudiantes"
    );
    // Debe mostrar sugerencias en vez de navegar o decir "ya estás"
    expect(r.suggestions).toBeTruthy();
    expect(r.suggestions!.length).toBeGreaterThanOrEqual(2);
    // No debe navegar automáticamente
    expect(r.navigate).toBeFalsy();
    // El texto de desambiguación debe invitar a elegir
    expect(r.reply).toMatch(/buscabas/i);
  });

  it("las opciones incluyen Cargos (keyword 'colegiatura' exacta)", () => {
    const r = matchIntent(
      "costo de la colegiatura de primaria",
      "administrador_campus",
      "/estudiantes"
    );
    const routes = r.suggestions!.map((s) => s.route);
    expect(routes).toContain("/cargos");
  });

  it("las opciones incluyen Catálogo de Productos (keyword 'precio primaria')", () => {
    const r = matchIntent(
      "costo de la colegiatura de primaria",
      "administrador_campus",
      "/estudiantes"
    );
    const routes = r.suggestions!.map((s) => s.route);
    expect(routes).toContain("/catalogo-productos");
  });

  it("Estudiantes NO aparece en las opciones (ya está en esa página)", () => {
    const r = matchIntent(
      "costo de la colegiatura de primaria",
      "administrador_campus",
      "/estudiantes"
    );
    const routes = r.suggestions!.map((s) => s.route);
    expect(routes).not.toContain("/estudiantes");
  });

  it("sin currentPath: muestra desambiguación con hasta 3 opciones incluyendo Cargos", () => {
    const r = matchIntent(
      "costo de la colegiatura de primaria",
      "administrador_campus"
      // sin currentPath
    );
    expect(r.suggestions).toBeTruthy();
    const routes = r.suggestions!.map((s) => s.route);
    expect(routes).toContain("/cargos");
    // Nunca más de 3 chips
    expect(r.suggestions!.length).toBeLessThanOrEqual(3);
  });
});

// ── Caso dominante claro: sigue navegando directo ────────────────────────────

describe("matchIntent — puntuación claramente dominante: navega directo", () => {

  it("'quiero registrar un pago' → navega directo a /pagos sin chips", () => {
    const r = matchIntent(
      "quiero registrar un pago",
      "administrador_campus",
      "/estudiantes"
    );
    // Ganador claro → debe navegar, no mostrar desambiguación
    expect(r.navigate?.route).toBe("/pagos");
    // Si hay sugerencias de desambiguación no debe haber reply de "buscabas"
    expect(r.reply).not.toMatch(/buscabas/i);
  });

  it("'módulo de becas y descuentos' → navega a /becas", () => {
    // Usamos mensaje sin nombre propio para no disparar detectActionIntent
    const r = matchIntent(
      "módulo de becas y descuentos",
      "administrador_campus",
      "/pagos"
    );
    expect(r.navigate?.route).toBe("/becas");
    expect(r.reply).not.toMatch(/buscabas/i);
  });

  it("'quiero ver mis estudiantes' → navega a /estudiantes", () => {
    const r = matchIntent(
      "quiero ver mis estudiantes",
      "administrador_campus",
      "/cargos"
    );
    expect(r.navigate?.route).toBe("/estudiantes");
    expect(r.reply).not.toMatch(/buscabas/i);
  });
});

// ── Empate genuino sin currentPath: muestra las 3 opciones ──────────────────

describe("matchIntent — empate genuino sin currentPath", () => {

  it("'colegiatura primaria' sin currentPath → chips de desambiguación (sin navegar)", () => {
    const r = matchIntent(
      "colegiatura primaria",
      "administrador_campus"
      // sin currentPath
    );
    // Dos keywords exactas en módulos distintos → ambiguo
    expect(r.suggestions).toBeTruthy();
    expect(r.suggestions!.length).toBeGreaterThanOrEqual(2);
    expect(r.navigate).toBeFalsy();
    expect(r.reply).toMatch(/buscabas/i);
  });

  it("el número de chips nunca supera 3", () => {
    const r = matchIntent(
      "costo de la colegiatura de primaria",
      "administrador_campus"
    );
    if (r.suggestions) {
      expect(r.suggestions.length).toBeLessThanOrEqual(3);
    }
  });
});

// ── Guardia: el mecanismo "ya estás en X" sigue funcionando en casos claros ──

describe("matchIntent — 'ya estás en X' solo para ganadores claros", () => {

  it("mensaje claramente de /pagos estando en /pagos → 'ya estás'", () => {
    const r = matchIntent(
      "registrar un nuevo pago",
      "administrador_campus",
      "/pagos"
    );
    // "pago"/"pagos" exact → alto score sin empate real → ya estás
    expect(r.reply).toMatch(/ya estás en \*\*Pagos\*\*/i);
    expect(r.navigate).toBeFalsy();
  });

  it("mensaje de familias estando en /familias → 'ya estás'", () => {
    const r = matchIntent(
      "quiero ver las familias y tutores",
      "administrador_campus",
      "/familias"
    );
    expect(r.reply).toMatch(/ya estás en \*\*Familias\*\*/i);
    expect(r.navigate).toBeFalsy();
  });
});
