/**
 * Tests unitarios para matchIntent y detectActionIntent
 * §7 del documento de instrucciones del asistente virtual EduPay
 *
 * Cubre:
 *  - Coincidencia exacta (navegación, diagnóstico, acción)
 *  - Mensajes ambiguos (más de una posible intención)
 *  - Sin coincidencia → respuesta de "no entendí" con categorías
 *  - Acciones de datos (query:*)
 *  - Casos límite: mensaje vacío, mayúsculas, acentos, errores tipográficos
 */

import { describe, it, expect } from "vitest";
import { matchIntent, detectActionIntent } from "../assistant-knowledge";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Verifica que la respuesta NO sea la de "no entendí" */
function wasUnderstood(result: ReturnType<typeof matchIntent>): boolean {
  return !result.reply.toLowerCase().includes("no entendí") &&
         !result.reply.toLowerCase().includes("no pude entender");
}

// ── matchIntent: navegación ──────────────────────────────────────────────────

describe("matchIntent — navegación", () => {
  it("reconoce intención de alumnos/estudiantes", () => {
    const r = matchIntent("quiero ver mis estudiantes", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
    expect(r.navigate?.route).toBeTruthy();
  });

  it("reconoce intención de pagos", () => {
    const r = matchIntent("dónde registro un pago", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
    expect(r.navigate?.route).toBeTruthy();
  });

  it("reconoce intención de becas", () => {
    const r = matchIntent("quiero ver las becas", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
    expect(r.navigate?.route).toBeTruthy();
  });

  it("reconoce intención de reportes", () => {
    const r = matchIntent("necesito el reporte financiero", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
    expect(r.navigate?.route).toBeTruthy();
  });

  it("reconoce intención de caja con acento omitido", () => {
    const r = matchIntent("quiero ver la caja", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
  });

  it("tolera mayúsculas", () => {
    const r = matchIntent("DÓNDE REGISTRO UN PAGO", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
  });

  it("tolera variaciones de ortografía en 'estudiantes'", () => {
    // 'alumnos' es sinónimo aceptado
    const r = matchIntent("ver alumnos activos", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
  });
});

// ── matchIntent: diagnóstico ─────────────────────────────────────────────────

describe("matchIntent — diagnóstico de fallas", () => {
  it("detecta reporte de fallo en importación de excel", () => {
    const r = matchIntent("no me deja importar el excel", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
    // Debe proponer diagnóstico, no navegación
    expect(r.navigate).toBeFalsy();
    expect(r.diagnose ?? (r as any).suggestions).toBeTruthy();
  });

  it("detecta reporte de fallo en facturas", () => {
    const r = matchIntent("no se generó la factura", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
    expect(r.navigate).toBeFalsy();
  });

  it("detecta reporte de fallo en reportes", () => {
    const r = matchIntent("el reporte no descarga", "administrador_campus");
    expect(wasUnderstood(r)).toBe(true);
    expect(r.navigate).toBeFalsy();
  });
});

// ── matchIntent: acciones de datos ───────────────────────────────────────────

describe("matchIntent — consultas de datos (detectActionIntent)", () => {
  it("detecta consulta de cuántos alumnos", () => {
    const r = matchIntent("cuántos alumnos tengo", "administrador_campus");
    // Debe responder "Consultando…" y traer la acción
    expect(r.reply).toMatch(/consultando/i);
    expect((r as any).action?.actionId).toBe("query:contar");
  });

  it("detecta consulta de cuántas becas", () => {
    const r = matchIntent("cuántas becas hay", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:contar");
  });

  it("detecta consulta de resumen financiero", () => {
    const r = matchIntent("cuánto se ha cobrado este mes", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:resumen_financiero");
  });

  it("detecta discrepancia de números", () => {
    const r = matchIntent("solo tengo 8 alumnos pero 78 becas", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:discrepancia");
  });

  it("detecta búsqueda de alumno por nombre", () => {
    const r = matchIntent("busca al alumno García", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:buscar_alumno");
    expect((r as any).action?.params?.nombre).toMatch(/garc/i);
  });

  it("detecta becas de un alumno específico", () => {
    const r = matchIntent("qué becas tiene López", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:becas_alumno");
  });

  it("detecta cargos de un alumno específico", () => {
    const r = matchIntent("qué cargos debe Martínez", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:cargos_alumno");
  });
});

// ── matchIntent: sin coincidencia ────────────────────────────────────────────

describe("matchIntent — sin coincidencia", () => {
  it("mensaje vacío devuelve respuesta de ayuda", () => {
    const r = matchIntent("", "administrador_campus");
    expect(r.reply).toBeTruthy();
    // No debe navegar ni proponer acción
    expect(r.navigate).toBeFalsy();
    expect((r as any).action).toBeFalsy();
  });

  it("mensaje completamente irrelevante devuelve 'no entendí'", () => {
    const r = matchIntent("qué bonito día hace hoy", "administrador_campus");
    expect(r.reply.toLowerCase()).toMatch(/no entend|no pude/);
    expect(r.navigate).toBeFalsy();
  });

  it("mensaje corto sin contexto no inventa ruta", () => {
    const r = matchIntent("hola", "administrador_campus");
    expect(r.navigate).toBeFalsy();
  });
});

// ── matchIntent: ambigüedad ───────────────────────────────────────────────────

describe("matchIntent — mensajes ambiguos", () => {
  it("mensaje con dos módulos posibles devuelve sugerencias sin navegar ciegamente", () => {
    // "pagos y becas" podría coincidir con ambos módulos
    const r = matchIntent("quiero ver los pagos y las becas", "administrador_campus");
    // Lo importante: devuelve algo útil (navegación al más relevante o sugerencias)
    expect(r.reply).toBeTruthy();
    // Nunca debe devolver respuesta vacía o nula
    expect(r.reply.length).toBeGreaterThan(10);
  });
});

// ── matchIntent: familias con hijos ──────────────────────────────────────────

describe("matchIntent — familias con múltiples hijos", () => {
  it("detecta 'que familias tienen mas de 1 hijo'", () => {
    const r = matchIntent("que familias tienen mas de 1 hijo", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:familias_hijos");
    expect((r as any).action?.params?.minHijos).toBe(1);
  });

  it("detecta 'familias con 2 o mas alumnos'", () => {
    const r = matchIntent("familias con 2 o mas alumnos", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:familias_hijos");
  });

  it("detecta 'que familias tienen hermanos'", () => {
    const r = matchIntent("que familias tienen hermanos", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:familias_hijos");
    expect((r as any).action?.params?.minHijos).toBe(1);
  });

  it("detecta 'familias con mas de 2 hijos'", () => {
    const r = matchIntent("familias con mas de 2 hijos", "administrador_campus");
    expect((r as any).action?.actionId).toBe("query:familias_hijos");
    expect((r as any).action?.params?.minHijos).toBe(2);
  });
});

// ── detectActionIntent directo ────────────────────────────────────────────────

describe("detectActionIntent — casos directos", () => {
  it("retorna null para mensaje de navegación pura", () => {
    const a = detectActionIntent("dónde está el módulo de alumnos");
    expect(a).toBeNull();
  });

  it("retorna null para mensaje vacío", () => {
    const a = detectActionIntent("");
    expect(a).toBeNull();
  });

  it("detecta correctamente query:resumen_financiero", () => {
    const a = detectActionIntent("cuánto llevamos cobrado");
    expect(a?.actionId).toBe("query:resumen_financiero");
  });

  it("detecta query:contar para 'pagos'", () => {
    const a = detectActionIntent("cuántos pagos hubo este mes");
    expect(a?.actionId).toBe("query:contar");
    expect(a?.params?.entity).toMatch(/pagos?/);
  });

  it("detecta query:discrepancia con patrón numérico + 'pero'", () => {
    const a = detectActionIntent("tengo 50 alumnos pero 200 cargos, no coincide");
    expect(a?.actionId).toBe("query:discrepancia");
  });
});
