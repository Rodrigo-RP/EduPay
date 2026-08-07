/**
 * Regresión: foto_url almacenada sin codificación HTML por sanitizeInput
 *
 * BUG ORIGINAL (antes del fix en security-engine.ts):
 *   AttackProtection.sanitizeInput convertía '/' en '&#x2F;' en TODOS los
 *   campos del body. Un PUT /api/profile con foto_url="https://cdn.mx/a.jpg"
 *   persistía "https:&#x2F;&#x2F;cdn.mx&#x2F;a.jpg" — URL rota en la DB.
 *
 * FIX: se eliminó '.replace(/\//g, "&#x2F;")' de sanitizeInput.
 *   '/' no es vector XSS cuando '<' ya se codifica a '&lt;'.
 *   El cambio aplica globalmente: foto_url, logo_url, sitio_web, etc.
 *
 * Tests:
 *   FUR-01  PUT /api/profile con foto_url real → 200
 *   FUR-02  users.foto_url en DB sin codificación HTML
 *   FUR-03  POST /api/users con foto_url real → 201
 *   FUR-04  users.foto_url del usuario creado sin codificación HTML
 *   FUR-05  otros campos de body sí siguen sanitizados (<, >, ", ')
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const TEST_FOTO_URL = "https://cdn.example.mx/fotos/usuario-123.jpg";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let userId: number;        // para PUT /api/profile
let adminId: number;       // para POST /api/users (necesita rol con USERS.CREATE)
let createdUserId: number; // id del usuario creado en FUR-03

let tokenUser: string;
let tokenAdmin: string;

async function apiFetch(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant FUR ${ts}`, `FUR${ts}`]
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus FUR ${ts}`, tenantId]
  );
  campusId = (cRow.rows[0] as any).id;

  // Usuario normal — para PUT /api/profile
  const uRow = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x','User FUR','asistente') RETURNING id`,
    [campusId, tenantId, `user.fur.${ts}@test.mx`]
  );
  userId = (uRow.rows[0] as any).id;

  // Administrador — para POST /api/users
  const aRow = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x','Admin FUR','administrador_campus') RETURNING id`,
    [campusId, tenantId, `admin.fur.${ts}@test.mx`]
  );
  adminId = (aRow.rows[0] as any).id;

  tokenUser = jwt.sign(
    { id: userId, role: "asistente", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET, { expiresIn: "1h" }
  );
  tokenAdmin = jwt.sign(
    { id: adminId, role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET, { expiresIn: "1h" }
  );
});

afterAll(async () => {
  if (createdUserId) await pool.query(`DELETE FROM users WHERE id = $1`, [createdUserId]);
  await pool.query(`DELETE FROM users WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Regresión sanitizador — foto_url sin codificación HTML", () => {

  // ── PUT /api/profile ────────────────────────────────────────────────────────
  it("FUR-01: PUT /api/profile con foto_url real → 200", async () => {
    const { status } = await apiFetch("PUT", "/api/profile", tokenUser, {
      foto_url: TEST_FOTO_URL,
    });
    expect(status).toBe(200);
  });

  it("FUR-02: users.foto_url en DB sin codificación HTML tras PUT /api/profile", async () => {
    const row = await pool.query(
      `SELECT foto_url FROM users WHERE id = $1`, [userId]
    );
    expect((row.rows[0] as any).foto_url).toBe(TEST_FOTO_URL);
  });

  // ── POST /api/users ─────────────────────────────────────────────────────────
  it("FUR-03: POST /api/users con foto_url real → 201", async () => {
    const ts2 = Date.now().toString().slice(-5);
    const { status, body } = await apiFetch("POST", "/api/users", tokenAdmin, {
      name:          `Usuario Foto ${ts2}`,
      email:         `foto.reg.${ts2}@test.mx`,
      password_hash: "$2b$10$placeholder",
      role:          "asistente",
      foto_url:      TEST_FOTO_URL,
    });
    expect(status).toBe(201);
    createdUserId = (body as any).id;
    expect(createdUserId).toBeGreaterThan(0);
  });

  it("FUR-04: users.foto_url del usuario creado en DB sin codificación HTML", async () => {
    const row = await pool.query(
      `SELECT foto_url FROM users WHERE id = $1`, [createdUserId]
    );
    expect((row.rows[0] as any).foto_url).toBe(TEST_FOTO_URL);
  });

  // ── El resto del sanitizador sigue activo ────────────────────────────────────
  it("FUR-05: sanitizeInput sigue bloqueando <, >, \", ' — solo '/' ya no se codifica", async () => {
    // El sanitizador aplica antes de que el endpoint llegue a la lógica,
    // así que un campo de texto con XSS payload llega codificado al handler.
    // Verificamos indirectamente: si el nombre llega con &lt; codificado,
    // storage lo guardará así (no ejecutará HTML). Actualizamos el nombre del
    // usuario con un payload XSS y comprobamos que los caracteres peligrosos
    // llegan codificados a la DB pero '/' llega sin codificar.
    const xssPayload = "<script>alert('xss')</script>/ruta";
    await apiFetch("PUT", "/api/profile", tokenUser, { name: xssPayload });

    const row = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
    const storedName = (row.rows[0] as any).name as string;

    // '<' y '>' codificados → XSS neutralizado
    expect(storedName).toContain("&lt;");
    expect(storedName).toContain("&gt;");
    // '/' NO codificado (fix aplicado)
    expect(storedName).not.toContain("&#x2F;");
    expect(storedName).toContain("/ruta");
  });

});
