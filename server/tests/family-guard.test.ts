/**
 * server/tests/family-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard FAMILIES.READ en endpoints de familias.
 *
 * Estado anterior al fix:
 *   GET /api/families/:campusId  y  GET /api/family/:id/balance
 *   solo verificaban req.user?.type !== 'guardian'. Cualquier usuario
 *   staff autenticado (con cualquier rol, incluyendo roles desconocidos
 *   no registrados en la matriz RBAC) obtenía HTTP 200 con balances
 *   financieros completos y la lista de estudiantes vinculados.
 *
 * Fix aplicado (misc.ts):
 *   Se añade hasPermissionForUser(user, MODULES.FAMILIES, ACTIONS.READ)
 *   en ambos endpoints. La llamada:
 *     1. Primero evalúa hasPermission(role, ...) — RBAC estático.
 *     2. Si el rol no concede acceso, busca 'families.read' en
 *        user.custom_permissions (cargado desde DB por authenticateToken).
 *   Si ninguna de las dos ramas lo concede → 403.
 *
 * Matriz RBAC — FAMILIES.READ:
 *   CON permiso:    super_admin, administrador_general, administrador_campus,
 *                   contador_general, auxiliar_contable, asistente
 *   SIN permiso:    admisiones  (quitado — mismo criterio que PAYMENTS.READ
 *                   y DASHBOARD.READ; admisiones no tiene acceso financiero)
 *                   roles desconocidos (no registrados en el RBAC)
 *
 * Tests:
 *  FAM-G-01  rol desconocido 'invitado' (sin FAMILIES.READ) → 403 /families
 *  FAM-G-02  administrador_campus (con FAMILIES.READ) → 200 + array (regresión)
 *  FAM-G-03  rol desconocido 'invitado' (sin FAMILIES.READ) → 403 /family/:id/balance
 *  FAM-G-04  administrador_campus (con FAMILIES.READ) → guard pasa (200 o 404, no 403)
 *  FAM-G-05  admisiones (sin FAMILIES.READ tras el cambio) → 403 /families
 *  FAM-G-06  admisiones (sin FAMILIES.READ) → 403 /family/:id/balance
 *  FAM-G-07  asistente (FAMILIES.READ intacto) → 200 /families (regresión)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// Campus/tenant del seed demo — tiene familias reales para los controles positivos
const CAMPUS_ID = 48;
const TENANT_ID = 29;
const FAMILY_ID = 1; // existe en el seed demo (campus 48)

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "guard-fam@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenInvitado    = makeToken("invitado");            // desconocido → FAMILIES.READ=false
const tokenAdmisiones  = makeToken("admisiones");          // FAMILIES.READ eliminado en permissions.ts
const tokenAsistente   = makeToken("asistente");           // FAMILIES.READ intacto
const tokenAdminCampus = makeToken("administrador_campus"); // FAMILIES.READ intacto

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FAM-G — Guard FAMILIES.READ", () => {

  // ── GET /api/families/:campusId ───────────────────────────────────────────

  describe("GET /api/families/:campusId — lista de familias con balance", () => {

    it("FAM-G-01: rol desconocido 'invitado' (sin FAMILIES.READ en RBAC) → 403", async () => {
      const r = await fetch(`${BASE}/api/families/${CAMPUS_ID}`, { headers: H(tokenInvitado) });
      expect(r.status).toBe(403);
    });

    it("FAM-G-02: administrador_campus (con FAMILIES.READ) → 200 con array de familias (regresión)", async () => {
      const r    = await fetch(`${BASE}/api/families/${CAMPUS_ID}`, { headers: H(tokenAdminCampus) });
      const body = await r.json().catch(() => null);
      expect(r.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });

    it("FAM-G-05: admisiones (FAMILIES.READ eliminado) → 403", async () => {
      const r = await fetch(`${BASE}/api/families/${CAMPUS_ID}`, { headers: H(tokenAdmisiones) });
      expect(r.status).toBe(403);
    });

    it("FAM-G-07: asistente (FAMILIES.READ intacto) → 200 (regresión — no debe haber cambiado)", async () => {
      const r    = await fetch(`${BASE}/api/families/${CAMPUS_ID}`, { headers: H(tokenAsistente) });
      const body = await r.json().catch(() => null);
      expect(r.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });

  });

  // ── GET /api/family/:id/balance ───────────────────────────────────────────

  describe("GET /api/family/:id/balance — balance detallado de una familia", () => {

    it("FAM-G-03: rol desconocido 'invitado' (sin FAMILIES.READ en RBAC) → 403", async () => {
      const r = await fetch(`${BASE}/api/family/${FAMILY_ID}/balance`, { headers: H(tokenInvitado) });
      expect(r.status).toBe(403);
    });

    it("FAM-G-04: administrador_campus (con FAMILIES.READ) → guard pasa — 200 o 404, nunca 403 (regresión)", async () => {
      const r = await fetch(`${BASE}/api/family/${FAMILY_ID}/balance`, { headers: H(tokenAdminCampus) });
      expect(r.status).not.toBe(403);
      expect([200, 404].includes(r.status)).toBe(true);
    });

    it("FAM-G-06: admisiones (FAMILIES.READ eliminado) → 403", async () => {
      const r = await fetch(`${BASE}/api/family/${FAMILY_ID}/balance`, { headers: H(tokenAdmisiones) });
      expect(r.status).toBe(403);
    });

  });

});
