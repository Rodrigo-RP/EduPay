/**
 * CF-CALENDAR — guard de rol + aislamiento en /api/calendario/eventos
 *
 * Antes del fix:
 *   - Los 4 endpoints solo tenían authenticateToken — cualquier rol podía
 *     crear y completar eventos.
 *   - El alias GET /api/calendario/eventos no llamaba a checkCampusTenant,
 *     a diferencia de GET /api/calendario/eventos/:campusId que sí lo hacía.
 *   - POST completar filtraba por campus_id pero no por tenant_id.
 *
 * Cambios aplicados:
 *   - MODULES.CALENDAR nuevo módulo en shared/permissions.ts.
 *   - CALENDAR.CREATE asignado a: super_admin, administrador_general,
 *     administrador_campus, contador_general.
 *   - CALENDAR.READ asignado a todos los roles (sin guard en GETs —
 *     el control es la visibilidad operativa, no la seguridad de datos).
 *   - POST crear  → guard CALENDAR.CREATE
 *   - POST completar → guard CALENDAR.CREATE + tenant_id en WHERE
 *   - GET alias → checkCampusTenant añadido
 *
 * CAL-01  POST crear, sin token → 401
 * CAL-02  POST crear, asistente → 403, sin INSERT en DB
 * CAL-03  POST crear, auxiliar_contable → 403, sin INSERT
 * CAL-04  POST crear, administrador_campus → 200, evento en DB
 * CAL-05  POST crear, contador_general → 200, evento en DB
 * CAL-06  POST completar, sin token → 401
 * CAL-07  POST completar, asistente → 403, completado sigue false
 * CAL-08  POST completar, administrador_campus → 200, completado=true en DB
 * CAL-09  POST completar con evento de campusB (otro tenant) usando tokenA → no altera el evento
 * CAL-10  GET /api/calendario/eventos con campus de tenant ajeno → 403 (checkCampusTenant)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

const post = async (path: string, body: object, token?: string) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json().catch(() => ({})) : {};
  return { status: r.status, body: data };
};

const get = async (path: string, token?: string) => {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, body: data };
};

// ── fixtures ──────────────────────────────────────────────────────────────────
const TS = Date.now().toString().slice(-7);

let tenantAId: number;
let campusAId: number;
let tenantBId: number;
let campusBId: number;

let tokAsistente:   string;
let tokAuxiliar:    string;
let tokAdminCampus: string;
let tokContador:    string;
// Token con campus de tenant B pero tenant_id de tenant A (cross-tenant)
let tokCrossed:     string;

const makeToken = (id: number, role: string, campusId: number, tenantId: number) =>
  jwt.sign({ id, role, campus_id: campusId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });

const insertUser = async (role: string, campusId: number, tenantId: number) => {
  const r = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
    [campusId, tenantId, `${role}.cal.${TS}@test.mx`, `User CAL ${role}`, role],
  );
  return (r.rows[0] as any).id as number;
};

const countEvents = async (campusId: number, titulo: string) => {
  const r = await pool.query(
    `SELECT COUNT(*) FROM financial_events WHERE campus_id=$1 AND titulo=$2`,
    [campusId, titulo],
  );
  return parseInt((r.rows[0] as any).count);
};

const getEventCompletado = async (id: number) => {
  const r = await pool.query(`SELECT completado FROM financial_events WHERE id=$1`, [id]);
  return (r.rows[0] as any)?.completado ?? null;
};

beforeAll(async () => {
  // Tenant A + campus A
  const tA = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CAL-A ${TS}`, `CAA${TS}`],
  );
  tenantAId = (tA.rows[0] as any).id;
  const cA = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CAL-A ${TS}`, tenantAId],
  );
  campusAId = (cA.rows[0] as any).id;

  // Tenant B + campus B (para test de aislamiento)
  const tB = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CAL-B ${TS}`, `CAB${TS}`],
  );
  tenantBId = (tB.rows[0] as any).id;
  const cB = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CAL-B ${TS}`, tenantBId],
  );
  campusBId = (cB.rows[0] as any).id;

  // Usuarios en campus A
  const idA  = await insertUser("asistente",           campusAId, tenantAId);
  const idAx = await insertUser("auxiliar_contable",   campusAId, tenantAId);
  const idAC = await insertUser("administrador_campus", campusAId, tenantAId);
  const idCG = await insertUser("contador_general",    campusAId, tenantAId);

  tokAsistente    = makeToken(idA,  "asistente",           campusAId, tenantAId);
  tokAuxiliar     = makeToken(idAx, "auxiliar_contable",   campusAId, tenantAId);
  tokAdminCampus  = makeToken(idAC, "administrador_campus", campusAId, tenantAId);
  tokContador     = makeToken(idCG, "contador_general",    campusAId, tenantAId);

  // Token cruzado: campus_id del campus B, tenant_id del tenant A
  // checkCampusTenant detectará que campus B no pertenece a tenant A → 403
  tokCrossed = makeToken(idA, "asistente", campusBId, tenantAId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM financial_events WHERE campus_id IN ($1,$2)`, [campusAId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE campus_id IN ($1,$2)`, [campusAId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`, [campusAId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM tenants WHERE id IN ($1,$2)`, [tenantAId, tenantBId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-CALENDAR — guard de rol + aislamiento en /api/calendario/eventos", () => {

  // ── POST /api/calendario/eventos (crear) ──────────────────────────────────

  it("CAL-01: POST crear, sin token → 401", async () => {
    const { status } = await post("/api/calendario/eventos", { titulo: "T", fecha: "2026-09-01", tipo: "corte" });
    expect(status).toBe(401);
  });

  it("CAL-02: POST crear, asistente → 403 + sin INSERT en DB", async () => {
    const titulo = `cal-guard-test-A2-${TS}`;
    const before = await countEvents(campusAId, titulo);
    const { status, body } = await post("/api/calendario/eventos",
      { titulo, fecha: "2026-09-01", tipo: "corte" },
      tokAsistente,
    );
    expect(status).toBe(403);
    expect(body.message).toMatch(/permiso/i);
    expect(await countEvents(campusAId, titulo)).toBe(before);
  });

  it("CAL-03: POST crear, auxiliar_contable → 403 + sin INSERT en DB", async () => {
    const titulo = `cal-guard-test-A3-${TS}`;
    const { status } = await post("/api/calendario/eventos",
      { titulo, fecha: "2026-09-01", tipo: "corte" },
      tokAuxiliar,
    );
    expect(status).toBe(403);
    expect(await countEvents(campusAId, titulo)).toBe(0);
  });

  it("CAL-04: POST crear, administrador_campus → 200 + evento en DB", async () => {
    const titulo = `cal-guard-test-A4-${TS}`;
    const { status, body } = await post("/api/calendario/eventos",
      { titulo, fecha: "2026-09-01", tipo: "cierre_mes", urgencia: "alta" },
      tokAdminCampus,
    );
    expect(status).toBe(200);
    expect(body.id).toBeTruthy();
    expect(await countEvents(campusAId, titulo)).toBe(1);
  });

  it("CAL-05: POST crear, contador_general → 200 + evento en DB", async () => {
    const titulo = `cal-guard-test-A5-${TS}`;
    const { status, body } = await post("/api/calendario/eventos",
      { titulo, fecha: "2026-09-15", tipo: "vencimiento" },
      tokContador,
    );
    expect(status).toBe(200);
    expect(body.id).toBeTruthy();
    expect(await countEvents(campusAId, titulo)).toBe(1);
  });

  // ── POST /api/calendario/eventos/:id/completar ────────────────────────────

  it("CAL-06: POST completar, sin token → 401", async () => {
    const { status } = await post("/api/calendario/eventos/9999/completar", {});
    expect(status).toBe(401);
  });

  it("CAL-07: POST completar, asistente → 403 + completado sigue false", async () => {
    // Crear evento con rol permitido
    const r = await pool.query(
      `INSERT INTO financial_events (campus_id, tenant_id, titulo, fecha, tipo, urgencia, completado)
       VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id`,
      [campusAId, tenantAId, `cal-completar-test-A7-${TS}`, "2026-09-01", "corte", "normal"],
    );
    const eventId = (r.rows[0] as any).id;

    const { status } = await post(`/api/calendario/eventos/${eventId}/completar`, {}, tokAsistente);
    expect(status).toBe(403);
    expect(await getEventCompletado(eventId)).toBe(false);
  });

  it("CAL-08: POST completar, administrador_campus → 200 + completado=true en DB", async () => {
    const r = await pool.query(
      `INSERT INTO financial_events (campus_id, tenant_id, titulo, fecha, tipo, urgencia, completado)
       VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id`,
      [campusAId, tenantAId, `cal-completar-test-A8-${TS}`, "2026-09-01", "corte", "normal"],
    );
    const eventId = (r.rows[0] as any).id;

    const { status, body } = await post(`/api/calendario/eventos/${eventId}/completar`, {}, tokAdminCampus);
    expect(status).toBe(200);
    expect(body.message).toMatch(/completado/i);
    expect(await getEventCompletado(eventId)).toBe(true);
  });

  it("CAL-09: POST completar con evento de campusB (tenant_id distinto) usando tokenA → evento no se altera", async () => {
    // Evento en campus B (tenant B)
    const r = await pool.query(
      `INSERT INTO financial_events (campus_id, tenant_id, titulo, fecha, tipo, urgencia, completado)
       VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id`,
      [campusBId, tenantBId, `cal-aislamiento-B9-${TS}`, "2026-09-01", "corte", "normal"],
    );
    const eventIdB = (r.rows[0] as any).id;

    // tokAdminCampus tiene campus_id=campusAId, tenant_id=tenantAId
    // El UPDATE filtra: campus_id=campusAId AND tenant_id=tenantAId → no coincide con el evento B
    await post(`/api/calendario/eventos/${eventIdB}/completar`, {}, tokAdminCampus);

    // El evento de campus B no debe haber sido modificado
    expect(await getEventCompletado(eventIdB)).toBe(false);
  });

  // ── GET /api/calendario/eventos (alias) — checkCampusTenant ──────────────

  it("CAL-10: GET alias con token que tiene campus de otro tenant → 403", async () => {
    // tokCrossed tiene campus_id=campusBId (pertenece a tenantB) pero tenant_id=tenantAId
    // checkCampusTenant: busca campuses WHERE id=campusBId AND tenant_id=tenantAId → no existe → 403
    const { status, body } = await get("/api/calendario/eventos", tokCrossed);
    expect(status).toBe(403);
    expect(body.message).toMatch(/campus no pertenece a este tenant/i);
  });
});
