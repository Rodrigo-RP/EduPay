/**
 * Prueba de regresión: GET /api/users — guard hasPermission (MODULES.USERS / ACTIONS.READ)
 *
 * VULNERABILIDAD ORIGINAL:
 *   GET /api/users solo tenía authenticateToken. Cualquier usuario autenticado
 *   (asistente, auxiliar_contable, admisiones, contador_general) podía obtener
 *   el directorio completo del personal con roles, platform_permissions,
 *   custom_permissions, has_twofa y last_login_at de todos los usuarios del campus.
 *
 * DESPUÉS del fix:
 *   - Rol sin MODULES.USERS READ (ej. 'asistente') → 403, sin datos de usuario.
 *   - Rol con MODULES.USERS READ (ej. 'administrador_campus') → 200, lista normal.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ──────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let tokenAsistente: string;
let tokenAdminCampus: string;

async function get(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // Tenant
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`GetUsersGuardTest ${ts}`, `GUG${ts}`]
  );
  tenantId = tRow.rows[0].id;

  // Campus
  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus GUG ${ts}`, tenantId]
  );
  campusId = cRow.rows[0].id;

  // JWTs — omitimos 'id' para evitar rollback silencioso del audit_log FK
  tokenAsistente = jwt.sign(
    { role: "asistente", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  tokenAdminCampus = jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

// ── Teardown ───────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ── Tests ──────────────────────────────────────────────────────────────────
describe("GET /api/users — guard hasPermission (MODULES.USERS / ACTIONS.READ)", () => {
  it("GUG-01: asistente (sin USERS.READ) → 403 y sin datos de usuario en el body", async () => {
    const { status, body } = await get("/api/users", tokenAsistente);

    expect(status, `Esperado 403, recibido ${status}`).toBe(403);

    // El body NO debe contener campos de usuario
    const bodyStr = JSON.stringify(body);
    const camposProhibidos = ["email", "name", "password_hash", "has_twofa", "last_login_at"];
    for (const campo of camposProhibidos) {
      expect(bodyStr, `El body no debe contener '${campo}'`).not.toContain(`"${campo}"`);
    }
  });

  it("GUG-02: administrador_campus (con USERS.READ) → 200 y respuesta es un array", async () => {
    const { status, body } = await get("/api/users", tokenAdminCampus);

    expect(status, `Esperado 200, recibido ${status}`).toBe(200);
    expect(Array.isArray(body), "La respuesta debe ser un array").toBe(true);
  });
});
