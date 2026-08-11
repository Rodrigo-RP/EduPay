/**
 * server/tests/admissions-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA SEGURIDAD — Control ADM: Guard ADMISSIONS.READ
 * en GET /api/admin/admissions-report
 *
 * CONTEXTO:
 *   - El guard existía bajo MODULES.SCHOLARSHIPS, ACTIONS.READ.
 *   - Este test verifica que la migración a MODULES.ADMISSIONS, ACTIONS.READ
 *     no cambia el comportamiento observable: los mismos roles que antes
 *     podían acceder siguen accediendo; los mismos que estaban bloqueados
 *     siguen bloqueados.
 *
 * ROLES CON ADMISSIONS.READ (= podían ver el reporte con SCHOLARSHIPS.READ):
 *   ✓ super_admin           — bypass incondicional
 *   ✓ administrador_campus  — explícito en permissions.ts
 *   ✓ admisiones            — explícito en permissions.ts
 *   ✓ asistente             — explícito en permissions.ts
 *
 * ROLES SIN ADMISSIONS.READ (= bloqueados antes y ahora):
 *   ✗ administrador_general — solo tenía SCHOLARSHIPS.ASSIGN, no READ
 *   ✗ contador_general      — solo tenía SCHOLARSHIPS.ASSIGN, no READ
 *   ✗ auxiliar_contable     — sin entrada SCHOLARSHIPS en absoluto
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const ENDPOINT   = "/api/admin/admissions-report";

const TS = Date.now().toString().slice(-7);

let tenantId = 0;
let campusId = 0;

let tokenAdminCampus  = "";
let tokenAdmisiones   = "";
let tokenAsistente    = "";
let tokenAdminGeneral = "";
let tokenContador     = "";
let tokenAuxiliar     = "";

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@adm${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestAdm2025!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`ADMGuard ${TS}`, `ADM${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-ADM-${TS}`]
  );
  campusId = cRow.rows[0].id;

  async function createUser(name: string, role: string, prefix: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users
         (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${prefix}.${TS}@adm.test`, hash, role]
    );
    return r.rows[0].id as number;
  }

  const acId = await createUser("Admin Campus ADM", "administrador_campus",  "ac");
  const adId = await createUser("Admisiones ADM",   "admisiones",             "ad");
  const asId = await createUser("Asistente ADM",    "asistente",              "as");
  const agId = await createUser("Admin Gral ADM",   "administrador_general",  "ag");
  const coId = await createUser("Contador ADM",     "contador_general",       "co");
  const axId = await createUser("Auxiliar ADM",     "auxiliar_contable",      "ax");

  tokenAdminCampus  = makeToken(acId, "administrador_campus");
  tokenAdmisiones   = makeToken(adId, "admisiones");
  tokenAsistente    = makeToken(asId, "asistente");
  tokenAdminGeneral = makeToken(agId, "administrador_general");
  tokenContador     = makeToken(coId, "contador_general");
  tokenAuxiliar     = makeToken(axId, "auxiliar_contable");
});

afterAll(async () => {
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id        = $1`, [tenantId]);
});

const GET = (token: string) =>
  fetch(`${BASE}${ENDPOINT}`, { headers: { Authorization: `Bearer ${token}` } });

// ── REGRESIÓN DE BLOQUEO ──────────────────────────────────────────────────────

describe("ADM — Regresión de bloqueo: roles sin ADMISSIONS.READ siguen en 403", () => {

  it("ADM-01: administrador_general → 403 (no tenía SCHOLARSHIPS.READ; no tiene ADMISSIONS.READ)", async () => {
    const r = await GET(tokenAdminGeneral);
    expect(r.status).toBe(403);
  });

  it("ADM-02: contador_general → 403 (no tenía SCHOLARSHIPS.READ; no tiene ADMISSIONS.READ)", async () => {
    const r = await GET(tokenContador);
    expect(r.status).toBe(403);
  });

  it("ADM-03: auxiliar_contable → 403 (no tenía SCHOLARSHIPS.READ; no tiene ADMISSIONS.READ)", async () => {
    const r = await GET(tokenAuxiliar);
    expect(r.status).toBe(403);
  });

  it("ADM-04: sin token → 401", async () => {
    const r = await fetch(`${BASE}${ENDPOINT}`);
    expect(r.status).toBe(401);
  });
});

// ── REGRESIÓN DE ACCESO ───────────────────────────────────────────────────────

describe("ADM — Regresión de acceso: roles con ADMISSIONS.READ siguen en 200", () => {

  async function expectReport200(token: string, label: string) {
    const r    = await GET(token);
    const body = await r.json() as any;
    expect(r.status, `${label}: esperaba 200, recibió ${r.status} — ${JSON.stringify(body)}`).toBe(200);
    // El reporte siempre devuelve las dos secciones, aunque estén en cero
    expect(body).toHaveProperty("becas");
    expect(body).toHaveProperty("inscripciones");
  }

  it("ADM-05: administrador_campus → 200 con estructura becas+inscripciones (ADMISSIONS.READ)", async () => {
    await expectReport200(tokenAdminCampus, "administrador_campus");
  });

  it("ADM-06: admisiones → 200 con estructura becas+inscripciones (ADMISSIONS.READ)", async () => {
    await expectReport200(tokenAdmisiones, "admisiones");
  });

  it("ADM-07: asistente → 200 con estructura becas+inscripciones (ADMISSIONS.READ)", async () => {
    await expectReport200(tokenAsistente, "asistente");
  });
});
