/**
 * Prueba de regresión: guard SETTINGS.CONFIGURE en endpoints de información institucional
 *
 * VULNERABILIDAD CONFIRMADA (antes del fix, por orden de gravedad):
 *
 *   POST /api/profile/institutional-info     → 200 con JWT de asistente
 *     IIG-04: RFC en institutional_info cambió de originalRfc a 'RFC-ATACANTE'
 *   PUT  /api/profile/institutional-info/:id → 200 con JWT de asistente
 *   DELETE /api/profile/institutional-info/:id → 200 con JWT de asistente
 *
 *   POST /api/institutional-info (CF-19):
 *     Requiere user.id válido en JWT (llama getUserById). En producción, todos
 *     los JWT lo tienen → el endpoint era vulnerable a cualquier rol autenticado.
 *     En el test pre-fix, devolvió 404 (sin user.id en JWT) antes del guard,
 *     lo que no es protección real — es un accidente de la implementación.
 *
 * DESPUÉS del fix:
 *   hasPermission(role, MODULES.SETTINGS, ACTIONS.CONFIGURE) es la primera
 *   verificación en los 4 endpoints de escritura.
 *   Autorizado: super_admin, administrador_general, administrador_campus.
 *   Bloqueado: contador_general, auxiliar_contable, asistente, admisiones.
 *
 * Tests:
 *   IIG-01  asistente POST /api/institutional-info → 403 (before: 404 por getUserById)
 *   IIG-02  RFC en institutional_settings intacto tras IIG-01
 *   IIG-03  asistente POST /api/profile/institutional-info → 403 (before: 200, RFC sobreescrito)
 *   IIG-04  RFC en institutional_info intacto tras IIG-03
 *   IIG-05  asistente PUT /api/profile/institutional-info/:id → 403 (before: 200)
 *   IIG-06  asistente DELETE /api/profile/institutional-info/:id → 403 (before: 200)
 *   IIG-07  administrador_campus POST /api/institutional-info → 200 (control positivo)
 *   IIG-08  RFC actualizado en institutional_settings tras IIG-07
 *   IIG-09  administrador_campus POST /api/profile/institutional-info → 200/201 (control positivo)
 *   IIG-10  RFC actualizado en institutional_info tras IIG-09
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let originalRfc: string;
let settingsId: number;   // institutional_settings row (para CF-19)
let infoId: number;       // institutional_info row (para profile endpoints)
let adminUserId: number;  // usuario real administrador_campus (para CF-19 control +)

let tokenAsistente: string;
let tokenAdminCampus: string;

async function apiFetch(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-6); // 6 dígitos
  // RFC ≤ 13 chars (restricción de varchar(13) en institutional_info)
  originalRfc = `RF${ts}`; // 8 chars ✓

  // Tenant y campus
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant IIG ${ts}`, `TIIG${ts}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus IIG ${ts}`, tenantId]
  );
  campusId = cRow.rows[0].id;

  // Usuario real administrador_campus — necesario para CF-19 (llama getUserById)
  const uRow = await pool.query(
    `INSERT INTO users
       (tenant_id, campus_id, name, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      tenantId,
      campusId,
      `Admin IIG ${ts}`,
      `admin_iig_${ts}@test.com`,
      `$2b$10$placeholder_hash_for_test`,
      `administrador_campus`,
    ]
  );
  adminUserId = uRow.rows[0].id;

  // institutional_settings — usado por POST /api/institutional-info (CF-19)
  const sRow = await pool.query(
    `INSERT INTO institutional_settings
       (campus_id, tenant_id, rfc, nombre_legal, ciudad)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [campusId, tenantId, originalRfc, `Escuela IIG ${ts}`, "CDMX"]
  );
  settingsId = sRow.rows[0].id;

  // institutional_info — usado por POST/PUT/DELETE /api/profile/institutional-info
  const iRow = await pool.query(
    `INSERT INTO institutional_info
       (campus_id, seccion_educativa, rfc)
     VALUES ($1,'PRIMARIA',$2) RETURNING id`,
    [campusId, originalRfc]
  );
  infoId = iRow.rows[0].id;

  // JWT sin 'id' para el asistente (guard dispara antes de getUserById)
  tokenAsistente = jwt.sign(
    { role: "asistente", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // JWT con 'id' real para admin (CF-19 llama getUserById tras pasar el guard)
  tokenAdminCampus = jwt.sign(
    { id: adminUserId, role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM institutional_settings WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM institutional_info WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [adminUserId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Información institucional — guard SETTINGS.CONFIGURE", () => {

  // ── Bloqueo: rol asistente ────────────────────────────────────────────────

  it("IIG-01: asistente POST /api/institutional-info → 403", async () => {
    const { status } = await apiFetch(
      "POST",
      "/api/institutional-info",
      tokenAsistente,
      { rfc: "RF-ATK", nombre_legal: "Hackeada", ciudad: "Villania" }
    );
    // Antes del fix: 404 (getUserById falla porque no hay id en JWT — no es
    //   protección real; en producción el JWT sí lleva id y el 200 persiste).
    // Después del fix: 403 (guard dispara antes de getUserById).
    expect(status).toBe(403);
  });

  it("IIG-02: RFC en institutional_settings sin cambios tras IIG-01", async () => {
    const res = await pool.query(
      `SELECT rfc FROM institutional_settings WHERE id = $1`,
      [settingsId]
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].rfc).toBe(originalRfc);
  });

  it("IIG-03: asistente POST /api/profile/institutional-info → 403", async () => {
    const { status } = await apiFetch(
      "POST",
      "/api/profile/institutional-info",
      tokenAsistente,
      { seccion_educativa: "PRIMARIA", rfc: "RF-ATK", cct: "CCT-FALSO" }
    );
    // Antes del fix: 200 (actualizó el registro PRIMARIA — IIG-04 lo confirmó)
    // Después del fix: 403
    expect(status).toBe(403);
  });

  it("IIG-04: RFC en institutional_info sin cambios tras IIG-03", async () => {
    const res = await pool.query(
      `SELECT rfc FROM institutional_info WHERE id = $1`,
      [infoId]
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].rfc).toBe(originalRfc);
  });

  it("IIG-05: asistente PUT /api/profile/institutional-info/:id → 403", async () => {
    const { status } = await apiFetch(
      "PUT",
      `/api/profile/institutional-info/${infoId}`,
      tokenAsistente,
      { seccion_educativa: "PRIMARIA", rfc: "RF-ATK", cct: "CCT-FALSO" }
    );
    // Antes del fix: 200
    // Después del fix: 403
    expect(status).toBe(403);
  });

  it("IIG-06: asistente DELETE /api/profile/institutional-info/:id → 403", async () => {
    const { status } = await apiFetch(
      "DELETE",
      `/api/profile/institutional-info/${infoId}`,
      tokenAsistente
    );
    // Antes del fix: 200
    // Después del fix: 403
    expect(status).toBe(403);
  });

  // ── Control positivo: administrador_campus sí puede ──────────────────────

  it("IIG-07: administrador_campus POST /api/institutional-info → 200", async () => {
    const newRfc = `RFADM${Date.now().toString().slice(-4)}`; // 9 chars ✓ (≤13)
    const { status, body } = await apiFetch(
      "POST",
      "/api/institutional-info",
      tokenAdminCampus,
      { rfc: newRfc, nombre_legal: "Escuela actualizada", ciudad: "Guadalajara" }
    );
    expect(status).toBe(200);
    expect(body.message).toMatch(/guardada/i);
  });

  it("IIG-08: RFC actualizado en institutional_settings tras IIG-07", async () => {
    const res = await pool.query(
      `SELECT rfc FROM institutional_settings WHERE campus_id = $1`,
      [campusId]
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].rfc).not.toBe(originalRfc);
    expect(res.rows[0].rfc).toMatch(/^RFADM/);
  });

  it("IIG-09: administrador_campus POST /api/profile/institutional-info → 200 o 201", async () => {
    // RFC corto (≤13 chars) para respetar varchar(13) en institutional_info
    const newRfc = `RFPRF${Date.now().toString().slice(-4)}`; // 9 chars ✓
    const { status } = await apiFetch(
      "POST",
      "/api/profile/institutional-info",
      tokenAdminCampus,
      { seccion_educativa: "SECUNDARIA", rfc: newRfc, cct: "CCT-SEC" }
    );
    // 201 si crea nuevo (no existe SECUNDARIA para este campus aún)
    // 200 si actualiza existente
    expect([200, 201]).toContain(status);
  });

  it("IIG-10: registro SECUNDARIA en institutional_info creado/actualizado por admin", async () => {
    const res = await pool.query(
      `SELECT rfc FROM institutional_info
       WHERE campus_id = $1 AND seccion_educativa = 'SECUNDARIA'`,
      [campusId]
    );
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows[0].rfc).toMatch(/^RFPRF/);
  });

});
