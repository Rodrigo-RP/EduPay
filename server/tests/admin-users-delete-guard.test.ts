/**
 * Prueba de regresión: DELETE /api/admin/users/:id — brecha canEditUser
 *
 * VULNERABILIDAD ORIGINAL:
 *   El alias /api/admin/users/:id (users.ts:356) omitía la llamada a
 *   canEditUser() que sí tiene el endpoint primario /api/users/:id (users.ts:308).
 *   Cualquier usuario autenticado del mismo campus podía borrar a un usuario de
 *   nivel jerárquico superior usando este alias.
 *
 * ESCENARIO:
 *   Actor  → rol 'asistente'        (nivel 2 en ROLE_HIERARCHY)
 *   Target → rol 'administrador_campus' (nivel 5)
 *   Endpoint → DELETE /api/admin/users/:id
 *
 * ANTES del fix: devuelve 200 y elimina (vulnerabilidad confirmada).
 * DESPUÉS del fix: debe devolver 403 y el usuario objetivo sigue existiendo.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Estado compartido ──────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let asistenteId: number;   // actor (nivel 2)
let adminCampusId: number; // víctima (nivel 5)
let tokenAsistente: string;

async function del(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "DELETE",
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
    [`DeleteGuardTest ${ts}`, `DGT${ts}`]
  );
  tenantId = (tRow.rows[0] as any).id;

  // Campus
  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus DGT ${ts}`]
  );
  campusId = (cRow.rows[0] as any).id;

  const hash = await bcrypt.hash("Test1234!", 10);

  // Usuario 'asistente' (actor, nivel 2)
  const aRow = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,$5,'asistente',true) RETURNING id`,
    [tenantId, campusId, "Actor Asistente", `asistente.dgt${ts}@test.internal`, hash]
  );
  asistenteId = (aRow.rows[0] as any).id;

  // Usuario 'administrador_campus' (víctima, nivel 5)
  const acRow = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,$5,'administrador_campus',true) RETURNING id`,
    [tenantId, campusId, "Victim Admin", `admin.campus.dgt${ts}@test.internal`, hash]
  );
  adminCampusId = (acRow.rows[0] as any).id;

  // JWT del asistente (con 'id' real para que self-delete check funcione)
  tokenAsistente = jwt.sign(
    {
      id:        asistenteId,
      email:     `asistente.dgt${ts}@test.internal`,
      role:      "asistente",
      campus_id: campusId,
      tenant_id: tenantId,
      type:      "user",
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

// ── Teardown ───────────────────────────────────────────────────────────────
afterAll(async () => {
  if (!tenantId) return;
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════
describe("DELETE /api/admin/users/:id — guard canEditUser (regresión de seguridad)", () => {

  it("REG-SEC-01: asistente (nivel 2) → borrar administrador_campus (nivel 5) debe devolver 403 y el usuario debe seguir existiendo", async () => {
    const r = await del(`/api/admin/users/${adminCampusId}`, tokenAsistente);

    // El endpoint DEBE rechazar con 403
    expect(r.status, `Esperado 403, recibido ${r.status} — canEditUser no aplicado en el alias`).toBe(403);

    // Verificar que el usuario objetivo no fue eliminado
    const check = await pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [adminCampusId]
    );
    expect(
      check.rows.length,
      "El usuario administrador_campus fue eliminado a pesar del rechazo esperado"
    ).toBe(1);
  });

  it("REG-SEC-02: asistente (nivel 2) → borrar otro asistente (mismo nivel) también debe devolver 403 (igual jerarquía no autoriza)", async () => {
    // Crear un segundo asistente como objetivo
    const ts2 = Date.now().toString().slice(-6);
    const hash = await bcrypt.hash("Test1234!", 10);
    const r2 = await pool.query(
      `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
       VALUES ($1,$2,$3,$4,$5,'asistente',true) RETURNING id`,
      [tenantId, campusId, "Peer Asistente", `peer.asistente${ts2}@test.internal`, hash]
    );
    const peerId = (r2.rows[0] as any).id;

    const res = await del(`/api/admin/users/${peerId}`, tokenAsistente);
    expect(res.status, `Esperado 403 al borrar mismo nivel, recibido ${res.status}`).toBe(403);

    // Cleanup del peer (el asistente no pudo borrarlo, así que sigue ahí)
    await pool.query(`DELETE FROM users WHERE id = $1`, [peerId]).catch(() => {});
  });

  it("REG-SEC-03: endpoint primario /api/users/:id ya devolvía 403 correctamente (control positivo)", async () => {
    const r = await del(`/api/users/${adminCampusId}`, tokenAsistente);
    // El endpoint primario siempre tuvo el guard — confirmar que sigue funcionando
    expect(r.status, `El endpoint primario debe seguir devolviendo 403`).toBe(403);
    const check = await pool.query(
      `SELECT id FROM users WHERE id = $1`, [adminCampusId]
    );
    expect(check.rows.length).toBe(1);
  });
});
