/**
 * CF-20 — POST /api/admin/configuracion/escuela
 *
 * BUG CONFIRMADO EMPÍRICAMENTE (antes del fix):
 *   POST con { nombre, rfc, direccion, telefono, email, logo_url, nivel_educativo }
 *   → responde 200 {"mensaje":"Configuración de escuela guardada"}
 *   → campuses: solo 'nombre' persiste
 *   → institutional_settings: NO ROW — los 5 campos restantes descartados silenciosamente
 *   → sin guard de rol → cualquier autenticado puede llamarlo
 *
 * MAPEO CORRECTO (derivado de columnas reales de la DB):
 *   campuses:               id, tenant_id, nombre, clave_sep, created_at, updated_at
 *   institutional_settings: id, campus_id, tenant_id, rfc, direccion_fiscal, ciudad,
 *                           codigo_postal, telefono_principal, email_institucional,
 *                           sitio_web, nombre_legal, logo_url, created_at, updated_at
 *
 *   nombre        → campuses.nombre
 *   rfc           → institutional_settings.rfc
 *   direccion     → institutional_settings.direccion_fiscal
 *   telefono      → institutional_settings.telefono_principal
 *   email         → institutional_settings.email_institucional
 *   logo_url      → institutional_settings.logo_url
 *   nivel_educativo → SIN COLUMNA en ninguna tabla (ignorado sin error, no duplicado)
 *
 * Tests:
 *   CEC-01  asistente → 403, sin cambios en campuses ni institutional_settings
 *   CEC-02  campuses.nombre intacto tras CEC-01
 *   CEC-03  institutional_settings sin fila nueva tras CEC-01
 *   CEC-04  admin_campus POST con los 6 campos + nivel_educativo → 200
 *   CEC-05  campuses.nombre actualizado
 *   CEC-06  institutional_settings.rfc persistido
 *   CEC-07  institutional_settings.direccion_fiscal persistida
 *   CEC-08  institutional_settings.telefono_principal persistido
 *   CEC-09  institutional_settings.email_institucional persistido
 *   CEC-10  institutional_settings.logo_url persistida
 *   CEC-11  nivel_educativo no causó error ni columna fantasma (servidor devolvió 200)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let originalNombre: string;

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
  const ts = Date.now().toString().slice(-6);
  originalNombre = `Campus CF20 ${ts}`;

  // Tenant + campus propios para el test (tenants: nombre_legal, rfc)
  const tenantRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CF20 ${ts}`, `CF2${ts}`]
  );
  tenantId = (tenantRow.rows[0] as any).id;

  const campusRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, originalNombre]
  );
  campusId = (campusRow.rows[0] as any).id;

  // Usuarios reales para JWTs con user.id válido
  const adminRow = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x','Admin CF20','administrador_campus') RETURNING id`,
    [campusId, tenantId, `admin.cf20.${ts}@test.mx`]
  );
  const asisRow = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x','Asis CF20','asistente') RETURNING id`,
    [campusId, tenantId, `asis.cf20.${ts}@test.mx`]
  );

  const adminId = (adminRow.rows[0] as any).id;
  const asisId  = (asisRow.rows[0] as any).id;

  tokenAdminCampus = jwt.sign(
    { id: adminId, role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET, { expiresIn: "1h" }
  );
  tokenAsistente = jwt.sign(
    { id: asisId, role: "asistente", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET, { expiresIn: "1h" }
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM institutional_settings WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM users WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ── Payload del test ──────────────────────────────────────────────────────────
const PAYLOAD = {
  nombre:           "Instituto Actualizado CF20",
  rfc:              "IJF930101CF2",
  direccion:        "Av. Reforma 789, Col. Centro",
  telefono:         "5559876543",
  email:            "contacto.cf20@test.mx",
  logo_url:         "https://test.mx/logo-cf20.png",
  nivel_educativo:  "SECUNDARIA",   // sin columna en ninguna tabla → ignorado sin error
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("CF-20 POST /api/admin/configuracion/escuela — ciclo completo + guard", () => {

  // ── Bloqueo de rol ──────────────────────────────────────────────────────────
  it("CEC-01: asistente → 403", async () => {
    const { status } = await apiFetch("POST", "/api/admin/configuracion/escuela", tokenAsistente, PAYLOAD);
    expect(status).toBe(403);
  });

  it("CEC-02: campuses.nombre intacto tras CEC-01", async () => {
    const row = await pool.query(`SELECT nombre FROM campuses WHERE id = $1`, [campusId]);
    expect((row.rows[0] as any).nombre).toBe(originalNombre);
  });

  it("CEC-03: institutional_settings sin fila nueva tras CEC-01", async () => {
    const row = await pool.query(
      `SELECT id FROM institutional_settings WHERE campus_id = $1`, [campusId]
    );
    expect(row.rows.length).toBe(0);
  });

  // ── Ciclo completo (control positivo) ───────────────────────────────────────
  it("CEC-04: admin_campus con los 6 campos + nivel_educativo → 200", async () => {
    const { status, body } = await apiFetch(
      "POST", "/api/admin/configuracion/escuela", tokenAdminCampus, PAYLOAD
    );
    expect(status).toBe(200);
    expect((body as any).campus_id).toBe(campusId);
  });

  it("CEC-05: campuses.nombre actualizado", async () => {
    const row = await pool.query(`SELECT nombre FROM campuses WHERE id = $1`, [campusId]);
    expect((row.rows[0] as any).nombre).toBe(PAYLOAD.nombre);
  });

  it("CEC-06: institutional_settings.rfc persistido", async () => {
    const row = await pool.query(
      `SELECT rfc FROM institutional_settings WHERE campus_id = $1`, [campusId]
    );
    expect(row.rows.length).toBe(1);
    expect((row.rows[0] as any).rfc).toBe(PAYLOAD.rfc);
  });

  it("CEC-07: institutional_settings.direccion_fiscal persistida", async () => {
    const row = await pool.query(
      `SELECT direccion_fiscal FROM institutional_settings WHERE campus_id = $1`, [campusId]
    );
    expect((row.rows[0] as any).direccion_fiscal).toBe(PAYLOAD.direccion);
  });

  it("CEC-08: institutional_settings.telefono_principal persistido", async () => {
    const row = await pool.query(
      `SELECT telefono_principal FROM institutional_settings WHERE campus_id = $1`, [campusId]
    );
    expect((row.rows[0] as any).telefono_principal).toBe(PAYLOAD.telefono);
  });

  it("CEC-09: institutional_settings.email_institucional persistido", async () => {
    const row = await pool.query(
      `SELECT email_institucional FROM institutional_settings WHERE campus_id = $1`, [campusId]
    );
    expect((row.rows[0] as any).email_institucional).toBe(PAYLOAD.email);
  });

  it("CEC-10: institutional_settings.logo_url persistida", async () => {
    const row = await pool.query(
      `SELECT logo_url FROM institutional_settings WHERE campus_id = $1`, [campusId]
    );
    expect((row.rows[0] as any).logo_url).toBe(PAYLOAD.logo_url);
  });

  it("CEC-11: nivel_educativo no causó error ni columna fantasma (respuesta fue 200)", async () => {
    // El test CEC-04 ya verificó que el servidor respondió 200 con nivel_educativo en el body.
    // Verificamos adicionalmente que no existe ninguna columna nivel_educativo en campuses
    // ni en institutional_settings (el servidor no debe haberla creado dinámicamente).
    const campusCol = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='campuses' AND column_name='nivel_educativo'`
    );
    const settingsCol = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='institutional_settings' AND column_name='nivel_educativo'`
    );
    expect(campusCol.rows.length).toBe(0);
    expect(settingsCol.rows.length).toBe(0);
  });

});
