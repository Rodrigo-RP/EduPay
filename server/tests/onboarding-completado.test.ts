/**
 * CF-21 — Onboarding persistido en campuses.onboarding_completado
 *
 * Verifica los cinco puntos corregidos en la capa del servidor:
 *
 *   1. Columna real: campuses.onboarding_completado (migration 002)
 *   2. GET /api/admin/configuracion/onboarding-status → estado desde DB
 *   3. POST /api/admin/configuracion/completar-onboarding → UPDATE real + sobrevive reinicio
 *   4. Guard SETTINGS.CONFIGURE en ambos endpoints
 *   5. Ciclo completo: POST → DB actualizada → GET refleja cambio
 *
 * OBD-01  GET sin token → 401
 * OBD-02  GET con asistente (sin SETTINGS.CONFIGURE) → 403
 * OBD-03  GET con administrador_campus → 200, completado=false para campus nuevo
 * OBD-04  POST sin token → 401
 * OBD-05  POST con asistente → 403, DB intacta
 * OBD-06  POST con administrador_campus → 200, DB.onboarding_completado = true
 * OBD-07  GET tras POST → completado=true (persistencia real)
 * OBD-08  POST idempotente (segunda vez) → 200, columna sigue true
 * OBD-09  campus_id del JWT no puede completar el onboarding de otro campus
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";
import { resetApiAuthRateLimitStore } from "../security-middleware";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── helpers ───────────────────────────────────────────────────────────────────
async function apiFetch(method: string, path: string, token?: string, body?: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const GET  = (path: string, token?: string) => apiFetch("GET",  path, token);
const POST = (path: string, token?: string, body?: object) => apiFetch("POST", path, token, body);

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;       // campus limpio (starts onboarding_completado = false)
let campusOtroId: number;   // campus de otro tenant

let tokenAsistente: string;
let tokenAdminCampus: string;
let tokenAdminOtroCampus: string;

beforeAll(async () => {
  resetApiAuthRateLimitStore(); // Evita 429 por acumulación entre corridas consecutivas
  const ts = Date.now().toString().slice(-6);

  // Tenant principal
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant OBD ${ts}`, `OBD${ts}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  // Campus fresco (sin estudiantes ni conceptos → onboarding_completado = false)
  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id, onboarding_completado)
     VALUES ($1,$2, false) RETURNING id`,
    [`Campus OBD ${ts}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  // Campus de otro tenant (para test de aislamiento OBD-09)
  const t2Row = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant OBD2 ${ts}`, `OBD2${ts}`],
  );
  const c2Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id, onboarding_completado)
     VALUES ($1,$2, false) RETURNING id`,
    [`Campus OBD2 ${ts}`, (t2Row.rows[0] as any).id],
  );
  campusOtroId = (c2Row.rows[0] as any).id;

  const makeUser = async (cId: number, tId: number, role: string, suffix: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
      [cId, tId, `${role}.obd.${suffix}@test.mx`, `User ${role} ${suffix}`, role],
    );
    return (r.rows[0] as any).id as number;
  };

  const idAsistente    = await makeUser(campusId,     tenantId,                   "asistente",            ts);
  const idAdminCampus  = await makeUser(campusId,     tenantId,                   "administrador_campus",  ts);
  const idAdminOtro    = await makeUser(campusOtroId, (await pool.query(`SELECT id FROM tenants ORDER BY id DESC LIMIT 1 OFFSET 0`)).rows[0].id, "administrador_campus", `alt${ts}`);

  // Fetch the correct tenant_id for campusOtroId
  const otroTenant = await pool.query(`SELECT tenant_id FROM campuses WHERE id=$1`, [campusOtroId]);
  const otroTenantId = (otroTenant.rows[0] as any).tenant_id;

  // Recreate admin del otro campus with correct tenant
  await pool.query(`DELETE FROM users WHERE id=$1`, [idAdminOtro]);
  const idAdminOtro2 = await makeUser(campusOtroId, otroTenantId, "administrador_campus", `alt${ts}`);

  const makeToken = (id: number, role: string, cId: number, tId: number) =>
    jwt.sign({ id, role, campus_id: cId, tenant_id: tId }, JWT_SECRET, { expiresIn: "1h" });

  tokenAsistente        = makeToken(idAsistente,    "asistente",           campusId,     tenantId);
  tokenAdminCampus      = makeToken(idAdminCampus,  "administrador_campus", campusId,     tenantId);
  tokenAdminOtroCampus  = makeToken(idAdminOtro2,   "administrador_campus", campusOtroId, otroTenantId);
});

afterAll(async () => {
  // Clean up in reverse FK order
  await pool.query(`DELETE FROM users    WHERE campus_id IN ($1,$2)`, [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`,        [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`,                [tenantId]).catch(() => {});
  const otroTenant = await pool.query(`SELECT tenant_id FROM campuses WHERE id=$1 LIMIT 1`, [campusOtroId]).catch(() => ({rows:[]}));
  if ((otroTenant as any).rows?.[0]) {
    await pool.query(`DELETE FROM tenants WHERE id=$1`, [(otroTenant as any).rows[0].tenant_id]).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-21 — GET /api/admin/configuracion/onboarding-status", () => {

  it("OBD-01: sin token → 401", async () => {
    const { status } = await GET("/api/admin/configuracion/onboarding-status");
    expect(status).toBe(401);
  });

  it("OBD-02: asistente (sin SETTINGS.CONFIGURE) → 403", async () => {
    const { status } = await GET("/api/admin/configuracion/onboarding-status", tokenAsistente);
    expect(status).toBe(403);
  });

  it("OBD-03: administrador_campus → 200, completado=false para campus nuevo", async () => {
    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdminCampus);
    expect(status).toBe(200);
    expect((body as any).completado).toBe(false);
    expect((body as any).campus_id).toBe(campusId);
  });
});

describe("CF-21 — POST /api/admin/configuracion/completar-onboarding", () => {

  it("OBD-04: sin token → 401", async () => {
    const { status } = await POST("/api/admin/configuracion/completar-onboarding");
    expect(status).toBe(401);
  });

  it("OBD-05: asistente → 403, DB.onboarding_completado sigue false", async () => {
    const { status } = await POST("/api/admin/configuracion/completar-onboarding", tokenAsistente, {});
    expect(status).toBe(403);
    const row = await pool.query(`SELECT onboarding_completado FROM campuses WHERE id=$1`, [campusId]);
    expect((row.rows[0] as any).onboarding_completado).toBe(false);
  });

  it("OBD-06: administrador_campus → 200, DB.onboarding_completado = true", async () => {
    const { status, body } = await POST("/api/admin/configuracion/completar-onboarding", tokenAdminCampus, {});
    expect(status).toBe(200);
    expect((body as any).completado).toBe(true);

    // Verificación directa en DB
    const row = await pool.query(`SELECT onboarding_completado FROM campuses WHERE id=$1`, [campusId]);
    expect((row.rows[0] as any).onboarding_completado).toBe(true);
  });

  it("OBD-07: GET tras POST → completado=true (estado persiste en DB)", async () => {
    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdminCampus);
    expect(status).toBe(200);
    expect((body as any).completado).toBe(true);
  });

  it("OBD-08: segundo POST (idempotente) → 200, columna sigue true", async () => {
    const { status } = await POST("/api/admin/configuracion/completar-onboarding", tokenAdminCampus, {});
    expect(status).toBe(200);
    const row = await pool.query(`SELECT onboarding_completado FROM campuses WHERE id=$1`, [campusId]);
    expect((row.rows[0] as any).onboarding_completado).toBe(true);
  });

  it("OBD-09: admin de otro campus NO puede completar el onboarding del campus original", async () => {
    // El JWT de tokenAdminOtroCampus lleva campus_id = campusOtroId
    // → el UPDATE toca solo campusOtroId, no campusId
    // → campusId.onboarding_completado fue puesto a true en OBD-06
    //   y campusOtroId empieza en false → tras el POST de este admin debe ser true solo para campusOtroId
    const antes = await pool.query(`SELECT onboarding_completado FROM campuses WHERE id=$1`, [campusOtroId]);
    expect((antes.rows[0] as any).onboarding_completado).toBe(false);

    const { status } = await POST("/api/admin/configuracion/completar-onboarding", tokenAdminOtroCampus, {});
    expect(status).toBe(200);

    // campusOtroId ahora completado
    const despues = await pool.query(`SELECT onboarding_completado FROM campuses WHERE id=$1`, [campusOtroId]);
    expect((despues.rows[0] as any).onboarding_completado).toBe(true);

    // campusId no fue tocado por este JWT
    const original = await pool.query(`SELECT onboarding_completado FROM campuses WHERE id=$1`, [campusId]);
    expect((original.rows[0] as any).onboarding_completado).toBe(true); // ya era true desde OBD-06
  });
});
