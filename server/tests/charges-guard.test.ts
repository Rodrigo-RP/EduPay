/**
 * server/tests/charges-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA SEGURIDAD — U09: Gestión de Usuarios
 * CONTROL: CHG — Guards de módulo CHARGES/PAYMENTS/RECEIVABLES
 *
 * Endpoints protegidos (admin.ts):
 *   GET  /api/payments                        → PAYMENTS.READ
 *   GET  /api/charges                         → CHARGES.READ
 *   GET  /api/accounts-receivable             → RECEIVABLES.READ
 *
 * Endpoints protegidos (charges.ts):
 *   POST /api/admin/charges/bulk              → CHARGES.CREATE
 *   GET  /api/admin/cargos                    → CHARGES.READ
 *   GET  /api/admin/cargos/estadisticas       → CHARGES.READ
 *   POST /api/admin/cargos/generar-mensual    → CHARGES.CREATE
 *   GET  /api/admin/cargos/morosos            → CHARGES.READ
 *   POST /api/admin/cargos/desde-catalogo     → CHARGES.CREATE
 *
 * VULNERABILIDAD REPRODUCIDA (antes del fix):
 *   - Cualquier usuario autenticado podía ver/generar cargos y pagos sin
 *     restricción de módulo (asistente podía generar cargos masivos).
 *
 * DECISIÓN DE ROLES (permissions.ts ROLE_PERMISSIONS):
 *   CHARGES.READ    → todos los roles estándar
 *   CHARGES.CREATE  → admin_general, admin_campus
 *                     BLOQUEADOS: admisiones, asistente, contador_general, auxiliar_contable
 *   PAYMENTS.READ   → todos los roles estándar
 *   RECEIVABLES.READ → admin_general, admin_campus, contador_general, auxiliar_contable, asistente
 *                      BLOQUEADO: admisiones (su restricción explícita: "No puede acceder a CxC")
 *   rol_sin_permisos → todo bloqueado (no está en ROLE_PERMISSIONS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ─────────────────────────────────────────────────────────

let tenantId     = 0;
let campusId     = 0;
let adminId      = 0;
let contadorId   = 0;
let auxiliarId   = 0;
let admisionesId = 0;
let asistenteId  = 0;

const TS = Date.now().toString().slice(-7);

let tokenAdmin       = "";
let tokenContador    = "";
let tokenAuxiliar    = "";
let tokenAdmisiones  = "";
let tokenAsistente   = "";
let tokenSinPermisos = "";   // rol no registrado → hasPermission → false siempre

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@chg${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestCHG2025!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`CHGGuard ${TS}`, `CHG${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-CHG-${TS}`]
  );
  campusId = cRow.rows[0].id;

  async function createUser(name: string, role: string, prefix: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users
         (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${prefix}.${TS}@chg.test`, hash, role]
    );
    return r.rows[0].id as number;
  }

  adminId      = await createUser("Admin CHG",    "administrador_campus", "admin");
  contadorId   = await createUser("Contador CHG", "contador_general",     "cont");
  auxiliarId   = await createUser("Auxiliar CHG", "auxiliar_contable",    "aux");
  admisionesId = await createUser("Admis CHG",    "admisiones",           "admis");
  asistenteId  = await createUser("Asist CHG",    "asistente",            "asist");

  tokenAdmin       = makeToken(adminId,      "administrador_campus");
  tokenContador    = makeToken(contadorId,   "contador_general");
  tokenAuxiliar    = makeToken(auxiliarId,   "auxiliar_contable");
  tokenAdmisiones  = makeToken(admisionesId, "admisiones");
  tokenAsistente   = makeToken(asistenteId,  "asistente");
  tokenSinPermisos = makeToken(adminId, "rol_sin_permisos_inventado");
});

// ── Teardown ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (!tenantId) return;
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

const authH = (token: string) => ({ Authorization: `Bearer ${token}` });

const getPayments   = (t: string) => fetch(`${BASE}/api/payments`,           { headers: authH(t) });
const getCharges    = (t: string) => fetch(`${BASE}/api/charges`,            { headers: authH(t) });
const getReceivable = (t: string) => fetch(`${BASE}/api/accounts-receivable`,{ headers: authH(t) });
const getCargos     = (t: string) => fetch(`${BASE}/api/admin/cargos`,       { headers: authH(t) });
const getEstadist   = (t: string) => fetch(`${BASE}/api/admin/cargos/estadisticas`, { headers: authH(t) });
const getMorosos    = (t: string) => fetch(`${BASE}/api/admin/cargos/morosos`,      { headers: authH(t) });

function postBulk(token: string) {
  return fetch(`${BASE}/api/admin/charges/bulk`, {
    method : "POST",
    headers: { "Content-Type": "application/json", ...authH(token) },
    body   : JSON.stringify({ campus_id: campusId, concept_id: 99999 }),
  });
}

function postGenMensual(token: string) {
  return fetch(`${BASE}/api/admin/cargos/generar-mensual`, {
    method : "POST",
    headers: { "Content-Type": "application/json", ...authH(token) },
    body   : JSON.stringify({ periodo: "2026-08", ciclo_escolar: "2025-2026" }),
  });
}

function postDesdeCatalogo(token: string) {
  return fetch(`${BASE}/api/admin/cargos/desde-catalogo`, {
    method : "POST",
    headers: { "Content-Type": "application/json", ...authH(token) },
    body   : JSON.stringify({ producto_id: "1" }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CHG — Guards CHARGES/PAYMENTS/RECEIVABLES en endpoints financieros", () => {

  // ──────────────────────────────────────────────────────────────────────────
  describe("BLOQUEO (403) — CHARGES.CREATE requerido para mutaciones de cargos", () => {

    it("CHG-01: admisiones POST /api/admin/charges/bulk → 403 (no tiene CHARGES.CREATE)", async () => {
      const resp = await postBulk(tokenAdmisiones);
      expect(resp.status).toBe(403);
      const body = await resp.json();
      expect(body.message).toContain("permisos");
    });

    it("CHG-02: asistente POST /api/admin/charges/bulk → 403", async () => {
      const resp = await postBulk(tokenAsistente);
      expect(resp.status).toBe(403);
    });

    it("CHG-03: contador_general POST /api/admin/charges/bulk → 403", async () => {
      const resp = await postBulk(tokenContador);
      expect(resp.status).toBe(403);
    });

    it("CHG-04: auxiliar_contable POST /api/admin/charges/bulk → 403", async () => {
      const resp = await postBulk(tokenAuxiliar);
      expect(resp.status).toBe(403);
    });

    it("CHG-05: admisiones POST /api/admin/cargos/generar-mensual → 403", async () => {
      const resp = await postGenMensual(tokenAdmisiones);
      expect(resp.status).toBe(403);
    });

    it("CHG-06: asistente POST /api/admin/cargos/generar-mensual → 403", async () => {
      const resp = await postGenMensual(tokenAsistente);
      expect(resp.status).toBe(403);
    });

    it("CHG-07: contador_general POST /api/admin/cargos/desde-catalogo → 403", async () => {
      const resp = await postDesdeCatalogo(tokenContador);
      expect(resp.status).toBe(403);
    });

    it("CHG-08: auxiliar_contable POST /api/admin/cargos/desde-catalogo → 403", async () => {
      const resp = await postDesdeCatalogo(tokenAuxiliar);
      expect(resp.status).toBe(403);
    });

    it("CHG-09: asistente POST /api/admin/cargos/desde-catalogo → 403", async () => {
      const resp = await postDesdeCatalogo(tokenAsistente);
      expect(resp.status).toBe(403);
    });

    it("CHG-10: admisiones POST /api/admin/cargos/desde-catalogo → 403", async () => {
      const resp = await postDesdeCatalogo(tokenAdmisiones);
      expect(resp.status).toBe(403);
    });

  });

  // ──────────────────────────────────────────────────────────────────────────
  describe("BLOQUEO (403) — RECEIVABLES.READ requerido para cuentas por cobrar", () => {

    it("CHG-11: admisiones GET /api/accounts-receivable → 403 (sin RECEIVABLES.READ)", async () => {
      const resp = await getReceivable(tokenAdmisiones);
      expect(resp.status).toBe(403);
      const body = await resp.json();
      expect(body.message).toContain("permisos");
    });

    it("CHG-12: rol_sin_permisos GET /api/accounts-receivable → 403", async () => {
      const resp = await getReceivable(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("CHG-13: rol_sin_permisos GET /api/payments → 403 (sin PAYMENTS.READ)", async () => {
      const resp = await getPayments(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("CHG-14: rol_sin_permisos GET /api/charges → 403 (sin CHARGES.READ)", async () => {
      const resp = await getCharges(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("CHG-15: rol_sin_permisos GET /api/admin/cargos → 403", async () => {
      const resp = await getCargos(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("CHG-16: rol_sin_permisos GET /api/admin/cargos/estadisticas → 403", async () => {
      const resp = await getEstadist(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("CHG-17: rol_sin_permisos GET /api/admin/cargos/morosos → 403", async () => {
      const resp = await getMorosos(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

  });

  // ──────────────────────────────────────────────────────────────────────────
  describe("CONTROL POSITIVO (2xx) — roles con permiso correcto acceden", () => {

    it("CHG-18: administrador_campus GET /api/payments → 200 (PAYMENTS.READ)", async () => {
      const resp = await getPayments(tokenAdmin);
      expect(resp.status).toBe(200);
      expect(Array.isArray(await resp.json())).toBe(true);
    });

    it("CHG-19: contador_general GET /api/payments → 200 (PAYMENTS.READ)", async () => {
      const resp = await getPayments(tokenContador);
      expect(resp.status).toBe(200);
    });

    it("CHG-20: auxiliar_contable GET /api/charges → 200 (CHARGES.READ)", async () => {
      const resp = await getCharges(tokenAuxiliar);
      expect(resp.status).toBe(200);
    });

    it("CHG-21: admisiones GET /api/charges → 200 (CHARGES.READ)", async () => {
      const resp = await getCharges(tokenAdmisiones);
      expect(resp.status).toBe(200);
    });

    it("CHG-22: contador_general GET /api/accounts-receivable → 200 (RECEIVABLES.READ)", async () => {
      const resp = await getReceivable(tokenContador);
      expect(resp.status).toBe(200);
    });

    it("CHG-23: auxiliar_contable GET /api/accounts-receivable → 200 (RECEIVABLES.READ)", async () => {
      const resp = await getReceivable(tokenAuxiliar);
      expect(resp.status).toBe(200);
    });

    it("CHG-24: administrador_campus GET /api/admin/cargos → 200 (CHARGES.READ)", async () => {
      const resp = await getCargos(tokenAdmin);
      expect(resp.status).toBe(200);
    });

    it("CHG-25: asistente GET /api/admin/cargos → 200 (CHARGES.READ)", async () => {
      const resp = await getCargos(tokenAsistente);
      expect(resp.status).toBe(200);
    });

    it("CHG-26: contador_general GET /api/admin/cargos/estadisticas → 200 (CHARGES.READ)", async () => {
      const resp = await getEstadist(tokenContador);
      expect(resp.status).toBe(200);
    });

    it("CHG-27: administrador_campus GET /api/admin/cargos/morosos → 200 (CHARGES.READ)", async () => {
      const resp = await getMorosos(tokenAdmin);
      expect(resp.status).toBe(200);
    });

    it("CHG-28: administrador_campus POST /api/admin/charges/bulk → 200/400/404 (CHARGES.CREATE — guard pasa)", async () => {
      const resp = await postBulk(tokenAdmin);
      // Guard pasa; concepto inexistente → 404 ó sin alumnos activos → vacío
      expect(resp.status).not.toBe(403);
    });

    it("CHG-29: administrador_campus POST /api/admin/cargos/generar-mensual → 200/400 (CHARGES.CREATE)", async () => {
      const resp = await postGenMensual(tokenAdmin);
      // Guard pasa; campus nuevo sin alumnos → 400 "No hay alumnos activos"
      expect(resp.status).not.toBe(403);
    });

    it("CHG-30: administrador_campus POST /api/admin/cargos/desde-catalogo → 201/400 (CHARGES.CREATE)", async () => {
      const resp = await postDesdeCatalogo(tokenAdmin);
      // Guard pasa; campus sin alumnos activos → 201 con 0 cargos
      expect(resp.status).not.toBe(403);
    });

  });

  // ──────────────────────────────────────────────────────────────────────────
  describe("REPRODUCCIÓN CERRADA — antes era 2xx, ahora es 403", () => {

    it("CHG-31: asistente podía generar cargos masivos — ahora 403", async () => {
      const resp = await postGenMensual(tokenAsistente);
      expect(resp.status).toBe(403);
    });

    it("CHG-32: admisiones podía aplicar cargos desde catálogo — ahora 403", async () => {
      const resp = await postDesdeCatalogo(tokenAdmisiones);
      expect(resp.status).toBe(403);
    });

    it("CHG-33: admisiones podía ver cuentas por cobrar — ahora 403", async () => {
      const resp = await getReceivable(tokenAdmisiones);
      expect(resp.status).toBe(403);
    });

  });

});
