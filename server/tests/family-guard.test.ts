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
 * Nota sobre la matriz RBAC actual:
 *   TODOS los roles de staff definidos (super_admin, administrador_general,
 *   administrador_campus, contador_general, auxiliar_contable, asistente,
 *   admisiones) incluyen FAMILIES.READ. Por tanto, el guard hoy bloquea:
 *     a) Roles desconocidos / no registrados en la matriz (FAM-G-01/03).
 *     b) En el futuro: usuarios a quienes se les retire el permiso vía
 *        custom_permissions (cuando la función soporte revocación).
 *
 * Tests:
 *  FAM-G-01  rol desconocido 'invitado' (sin FAMILIES.READ) → 403 /families
 *  FAM-G-02  administrador_campus (con FAMILIES.READ) → 200 + array (regresión)
 *  FAM-G-03  rol desconocido 'invitado' (sin FAMILIES.READ) → 403 /family/:id/balance
 *  FAM-G-04  administrador_campus (con FAMILIES.READ) → guard pasa (200 o 404, no 403)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// Campus/tenant del seed demo — tiene familias reales para el control positivo
const CAMPUS_ID = 48;
const TENANT_ID = 29;
const FAMILY_ID = 1; // existe en el seed demo (campus 48)

/**
 * Genera un JWT firmado con la clave del servidor.
 * Rol 'invitado' no está en la matriz RBAC → hasPermission() retorna false
 * → hasPermissionForUser() retorna false → 403.
 */
function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "guard-fam@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenInvitado     = makeToken("invitado");           // rol sin entrada en RBAC → FAMILIES.READ=false
const tokenAdminCampus  = makeToken("administrador_campus"); // rol con FAMILIES.READ=true

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FAM-G — Guard FAMILIES.READ", () => {

  // ── GET /api/families/:campusId ───────────────────────────────────────────

  describe("GET /api/families/:campusId — lista de familias con balance", () => {

    it("FAM-G-01: rol desconocido 'invitado' (sin FAMILIES.READ en RBAC) → 403", async () => {
      const r = await fetch(`${BASE}/api/families/${CAMPUS_ID}`, { headers: H(tokenInvitado) });
      expect(r.status).toBe(403);
    });

    it("FAM-G-02: administrador_campus (con FAMILIES.READ) → 200 con array de familias (control positivo + regresión)", async () => {
      const r    = await fetch(`${BASE}/api/families/${CAMPUS_ID}`, { headers: H(tokenAdminCampus) });
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

    it("FAM-G-04: administrador_campus (con FAMILIES.READ) → guard pasa — 200 o 404, nunca 403", async () => {
      const r = await fetch(`${BASE}/api/family/${FAMILY_ID}/balance`, { headers: H(tokenAdminCampus) });
      // 200 si la familia existe en el tenant, 404 si no — ambos confirman que el guard cedió
      expect(r.status).not.toBe(403);
      expect([200, 404].includes(r.status)).toBe(true);
    });

  });

});
