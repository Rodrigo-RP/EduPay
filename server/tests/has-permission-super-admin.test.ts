/**
 * Regresión: hasPermission() — bypass incondicional de super_admin.
 *
 * ANTES del fix, el shortcut `if (userRole === 'super_admin') return true`
 * estaba situado DESPUÉS de `if (!permission) return false`, lo que lo
 * convertía en código muerto cuando la combinación module×action no existía
 * explícitamente en el array de permisos de super_admin.
 *
 * El fix mueve el chequeo de super_admin a la PRIMERA línea de la función,
 * antes de cualquier lookup en ROLE_PERMISSIONS.
 *
 * Tests:
 *   SA-01  super_admin + SCHOLARSHIPS.READ   → true  (ausente del array antes del fix)
 *   SA-02  super_admin + RECEIVABLES.PROCESS → true  (ausente del array antes del fix)
 *   SA-03  super_admin + SYSTEM.IMPORT       → true  (ausente del array antes del fix)
 *   SA-04  super_admin + FISCAL.CONFIGURE    → true  (ausente del array antes del fix)
 *   SA-05  super_admin + CRM.UPDATE          → true  (ausente del array antes del fix)
 *   SA-06  super_admin + ALUMNI.READ         → true  (ausente del array antes del fix)
 *   SA-07  super_admin + cualquier módulo inventado → true (garantía estructural)
 *   SA-08  asistente + PAYMENTS.PROCESS      → false  (comportamiento de otros roles no cambiado)
 *   SA-09  admisiones + SECURITY.READ        → false  (ídem)
 *   SA-10  contador_general + CHARGES.CREATE → false  (ídem)
 *   SA-11  auxiliar_contable + SETTINGS.CONFIGURE → false (ídem)
 *   SA-12  administrador_campus + SECURITY.READ → true (sí tiene el permiso)
 */

import { describe, it, expect } from "vitest";
import { hasPermission, MODULES, ACTIONS } from "../../shared/permissions";

describe("hasPermission — super_admin bypass incondicional", () => {

  // ── Casos que ANTES devolvían false (ausentes del array) ──────────────────

  it("SA-01: super_admin + SCHOLARSHIPS.READ → true aunque no esté en el array", () => {
    expect(hasPermission("super_admin", MODULES.SCHOLARSHIPS, ACTIONS.READ)).toBe(true);
  });

  it("SA-02: super_admin + RECEIVABLES.PROCESS → true aunque no esté en el array", () => {
    expect(hasPermission("super_admin", MODULES.RECEIVABLES, ACTIONS.PROCESS)).toBe(true);
  });

  it("SA-03: super_admin + SYSTEM.IMPORT → true aunque no esté en el array", () => {
    expect(hasPermission("super_admin", MODULES.SYSTEM, ACTIONS.IMPORT)).toBe(true);
  });

  it("SA-04: super_admin + FISCAL.CONFIGURE → true aunque no esté en el array", () => {
    expect(hasPermission("super_admin", MODULES.FISCAL, ACTIONS.CONFIGURE)).toBe(true);
  });

  it("SA-05: super_admin + CRM.UPDATE → true aunque no esté en el array", () => {
    expect(hasPermission("super_admin", MODULES.CRM, ACTIONS.UPDATE)).toBe(true);
  });

  it("SA-06: super_admin + ALUMNI.READ → true aunque no esté en el array", () => {
    expect(hasPermission("super_admin", MODULES.ALUMNI, ACTIONS.READ)).toBe(true);
  });

  // ── Garantía estructural: módulo completamente ficticio ───────────────────

  it("SA-07: super_admin + módulo y acción inventados → true (cobertura estructural)", () => {
    expect(hasPermission("super_admin", "modulo_inexistente", "accion_inexistente")).toBe(true);
  });

  // ── Comportamiento de otros roles — sin cambios ───────────────────────────

  it("SA-08: asistente + PAYMENTS.PROCESS → false (sin permiso, igual que antes)", () => {
    expect(hasPermission("asistente", MODULES.PAYMENTS, ACTIONS.PROCESS)).toBe(false);
  });

  it("SA-09: admisiones + SECURITY.READ → false (sin permiso, igual que antes)", () => {
    expect(hasPermission("admisiones", MODULES.SECURITY, ACTIONS.READ)).toBe(false);
  });

  it("SA-10: contador_general + CHARGES.CREATE → false (sin permiso, igual que antes)", () => {
    expect(hasPermission("contador_general", MODULES.CHARGES, ACTIONS.CREATE)).toBe(false);
  });

  it("SA-11: auxiliar_contable + SETTINGS.CONFIGURE → false (sin permiso, igual que antes)", () => {
    expect(hasPermission("auxiliar_contable", MODULES.SETTINGS, ACTIONS.CONFIGURE)).toBe(false);
  });

  // ── Control positivo: rol no-super_admin con permiso real ─────────────────

  it("SA-12: administrador_campus + SECURITY.READ → true (permiso explícito presente)", () => {
    expect(hasPermission("administrador_campus", MODULES.SECURITY, ACTIONS.READ)).toBe(true);
  });

});
