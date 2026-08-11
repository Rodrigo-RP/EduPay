/**
 * server/tests/fiscal-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA SEGURIDAD — Control FSC: Guards FISCAL.READ y FISCAL.CONFIGURE
 * en rutas de fiscal.ts (CFDI / facturación)
 *
 * VULNERABILIDAD REPRODUCIDA (pre-fix):
 *   - GET  /api/fiscal/estadisticas-cfdi → HTTP 200 con datos reales para
 *     cualquier rol autenticado, incl. 'asistente'
 *     ({"emitidos":1,"monto_emitido":350000,"pendientes":27,"cancelados":0})
 *   - POST /api/fiscal/timbrar-lote (body vacío) → 400 "No hay pagos" para
 *     asistente — handler alcanzado, debería ser 403
 *   - POST /api/fiscal/cancelar-cfdi → 500 para auxiliar_contable —
 *     handler alcanzado, debería ser 403
 *
 * DECISIÓN DE ROLES (permissions.ts):
 *   FISCAL.READ    → super_admin, administrador_general, administrador_campus,
 *                    contador_general, auxiliar_contable
 *                    BLOQUEADOS: admisiones, asistente
 *   FISCAL.CONFIGURE → super_admin, administrador_general, administrador_campus,
 *                      contador_general
 *                      BLOQUEADOS: auxiliar_contable, admisiones, asistente
 *
 * RUTAS cubiertas:
 *   READ (7 GETs):
 *     GET /api/fiscal
 *     GET /api/fiscal/pendientes-cfdi/:campusId
 *     GET /api/fiscal/pendientes-cfdi
 *     GET /api/fiscal/estadisticas-cfdi
 *     GET /api/fiscal/config-automatica
 *     GET /api/fiscal/estado-pac
 *     GET /api/fiscal/reportes-contables
 *   CONFIGURE (7 POST/PUT):
 *     POST /api/fiscal/timbrar-lote
 *     POST /api/fiscal/regenerar-cfdi/:id
 *     POST /api/fiscal/cancelar-cfdi
 *     PUT  /api/fiscal/config-automatica
 *     POST /api/fiscal/configurar-pac
 *     POST /api/fiscal/generar-reporte-contable
 *     POST /api/fiscal/generar-reporte-sat
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ─────────────────────────────────────────────────────────

let tenantId     = 0;
let campusId     = 0;

const TS = Date.now().toString().slice(-7);

let tokenAdmin      = ""; // administrador_campus
let tokenContador   = ""; // contador_general
let tokenAuxiliar   = ""; // auxiliar_contable
let tokenAsistente  = ""; // asistente
let tokenAdmisiones = ""; // admisiones
let tokenSinPerm    = ""; // rol desconocido

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@fsc${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestFisc2025!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`FSCGuard ${TS}`, `FSC${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-FSC-${TS}`]
  );
  campusId = cRow.rows[0].id;

  async function createUser(name: string, role: string, prefix: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users
         (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${prefix}.${TS}@fsc.test`, hash, role]
    );
    return r.rows[0].id as number;
  }

  const adminId      = await createUser("Admin FSC",    "administrador_campus", "admin");
  const contadorId   = await createUser("Contador FSC", "contador_general",     "cont");
  const auxiliarId   = await createUser("Aux FSC",      "auxiliar_contable",    "aux");
  const asistenteId  = await createUser("Asist FSC",    "asistente",            "asist");
  const admisionesId = await createUser("Admis FSC",    "admisiones",           "admis");

  tokenAdmin      = makeToken(adminId,      "administrador_campus");
  tokenContador   = makeToken(contadorId,   "contador_general");
  tokenAuxiliar   = makeToken(auxiliarId,   "auxiliar_contable");
  tokenAsistente  = makeToken(asistenteId,  "asistente");
  tokenAdmisiones = makeToken(admisionesId, "admisiones");
  tokenSinPerm    = jwt.sign(
    { id: 88882, email: `unknown@fsc${TS}.test`, role: "desconocido",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id        = $1`, [tenantId]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const H = (t: string) => ({ Authorization: `Bearer ${t}` });

const GET  = (path: string, t: string) => fetch(`${BASE}${path}`, { headers: H(t) });
const POST = (path: string, t: string, body: any = {}) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { ...H(t), "Content-Type": "application/json" }, body: JSON.stringify(body) });
const PUT  = (path: string, t: string, body: any = {}) =>
  fetch(`${BASE}${path}`, { method: "PUT",  headers: { ...H(t), "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FSC — Guards FISCAL.READ y FISCAL.CONFIGURE en rutas de fiscal.ts", () => {

  // ── BLOQUEO FISCAL.READ ───────────────────────────────────────────────────

  describe("BLOQUEO (403) — FISCAL.READ: asistente y admisiones bloqueados", () => {

    it("FSC-01: asistente GET /api/fiscal → 403 (pre-fix era 200 con datos)", async () => {
      const r = await GET("/api/fiscal", tokenAsistente);
      expect(r.status).toBe(403);
    });

    it("FSC-02: asistente GET /api/fiscal/estadisticas-cfdi → 403 (pre-fix era 200 con emitidos/pendientes)", async () => {
      const r = await GET("/api/fiscal/estadisticas-cfdi", tokenAsistente);
      expect(r.status).toBe(403);
    });

    it("FSC-03: admisiones GET /api/fiscal/pendientes-cfdi → 403", async () => {
      const r = await GET("/api/fiscal/pendientes-cfdi", tokenAdmisiones);
      expect(r.status).toBe(403);
    });

    it("FSC-04: admisiones GET /api/fiscal/config-automatica → 403", async () => {
      const r = await GET("/api/fiscal/config-automatica", tokenAdmisiones);
      expect(r.status).toBe(403);
    });

    it("FSC-05: asistente GET /api/fiscal/estado-pac → 403", async () => {
      const r = await GET("/api/fiscal/estado-pac", tokenAsistente);
      expect(r.status).toBe(403);
    });

    it("FSC-06: asistente GET /api/fiscal/reportes-contables → 403", async () => {
      const r = await GET("/api/fiscal/reportes-contables", tokenAsistente);
      expect(r.status).toBe(403);
    });

    it("FSC-07: rol desconocido GET /api/fiscal/estadisticas-cfdi → 403", async () => {
      const r = await GET("/api/fiscal/estadisticas-cfdi", tokenSinPerm);
      expect(r.status).toBe(403);
    });
  });

  // ── BLOQUEO FISCAL.CONFIGURE ──────────────────────────────────────────────

  describe("BLOQUEO (403) — FISCAL.CONFIGURE: auxiliar_contable, asistente, admisiones bloqueados", () => {

    it("FSC-08: auxiliar_contable POST /api/fiscal/timbrar-lote → 403 (pre-fix era 400 — handler alcanzado)", async () => {
      const r = await POST("/api/fiscal/timbrar-lote", tokenAuxiliar, { payment_ids: [] });
      expect(r.status).toBe(403);
    });

    it("FSC-09: asistente POST /api/fiscal/timbrar-lote → 403 (pre-fix era 400 — handler alcanzado)", async () => {
      const r = await POST("/api/fiscal/timbrar-lote", tokenAsistente, { payment_ids: [] });
      expect(r.status).toBe(403);
    });

    it("FSC-10: admisiones POST /api/fiscal/timbrar-lote → 403", async () => {
      const r = await POST("/api/fiscal/timbrar-lote", tokenAdmisiones, { payment_ids: [] });
      expect(r.status).toBe(403);
    });

    it("FSC-11: auxiliar_contable POST /api/fiscal/cancelar-cfdi → 403 (pre-fix era 500 — handler alcanzado)", async () => {
      const r = await POST("/api/fiscal/cancelar-cfdi", tokenAuxiliar, { invoice_id: 1, motivo: "test" });
      expect(r.status).toBe(403);
    });

    it("FSC-12: asistente POST /api/fiscal/cancelar-cfdi → 403", async () => {
      const r = await POST("/api/fiscal/cancelar-cfdi", tokenAsistente, { invoice_id: 1, motivo: "test" });
      expect(r.status).toBe(403);
    });

    it("FSC-13: auxiliar_contable PUT /api/fiscal/config-automatica → 403", async () => {
      const r = await PUT("/api/fiscal/config-automatica", tokenAuxiliar, { habilitado: false });
      expect(r.status).toBe(403);
    });

    it("FSC-14: auxiliar_contable POST /api/fiscal/configurar-pac → 403", async () => {
      const r = await POST("/api/fiscal/configurar-pac", tokenAuxiliar, { pac_nombre: "Facturama" });
      expect(r.status).toBe(403);
    });

    it("FSC-15: asistente POST /api/fiscal/generar-reporte-contable → 403", async () => {
      const r = await POST("/api/fiscal/generar-reporte-contable", tokenAsistente, { tipo: "mensual", periodo: "2026-01" });
      expect(r.status).toBe(403);
    });

    it("FSC-16: admisiones POST /api/fiscal/generar-reporte-sat → 403", async () => {
      const r = await POST("/api/fiscal/generar-reporte-sat", tokenAdmisiones, { tipo: "diot", periodo: "2026-01" });
      expect(r.status).toBe(403);
    });

    it("FSC-17: auxiliar_contable POST /api/fiscal/regenerar-cfdi/1 → 403", async () => {
      const r = await POST("/api/fiscal/regenerar-cfdi/1", tokenAuxiliar);
      expect(r.status).toBe(403);
    });
  });

  // ── CONTROL POSITIVO FISCAL.READ ─────────────────────────────────────────

  describe("CONTROL POSITIVO (200) — FISCAL.READ: roles autorizados acceden", () => {

    async function expectRead200(path: string, token: string, label: string) {
      const r = await GET(path, token);
      expect(r.status, `${label} en ${path}: esperaba 200, recibió ${r.status}`).toBe(200);
    }

    it("FSC-18: administrador_campus GET /api/fiscal/estadisticas-cfdi → 200", async () => {
      await expectRead200("/api/fiscal/estadisticas-cfdi", tokenAdmin, "administrador_campus");
    });

    it("FSC-19: contador_general GET /api/fiscal/estadisticas-cfdi → 200", async () => {
      await expectRead200("/api/fiscal/estadisticas-cfdi", tokenContador, "contador_general");
    });

    it("FSC-20: auxiliar_contable GET /api/fiscal/estadisticas-cfdi → 200 (FISCAL.READ — sin CONFIGURE)", async () => {
      await expectRead200("/api/fiscal/estadisticas-cfdi", tokenAuxiliar, "auxiliar_contable");
    });

    it("FSC-21: contador_general GET /api/fiscal/reportes-contables → 200", async () => {
      await expectRead200("/api/fiscal/reportes-contables", tokenContador, "contador_general");
    });

    it("FSC-22: administrador_campus GET /api/fiscal/estado-pac → 200", async () => {
      await expectRead200("/api/fiscal/estado-pac", tokenAdmin, "administrador_campus");
    });

    it("FSC-23: auxiliar_contable GET /api/fiscal → 200", async () => {
      await expectRead200("/api/fiscal", tokenAuxiliar, "auxiliar_contable");
    });
  });

  // ── CONTROL POSITIVO FISCAL.CONFIGURE ────────────────────────────────────

  describe("CONTROL POSITIVO (no 403) — FISCAL.CONFIGURE: admin y contador pasan el guard", () => {

    async function expectNotForbidden(r: Response, label: string) {
      // El guard no bloquea — cualquier respuesta excepto 403 confirma que el handler fue alcanzado
      expect(r.status, `${label}: recibió 403, el guard bloqueó cuando no debería`).not.toBe(403);
    }

    it("FSC-24: contador_general POST /api/fiscal/timbrar-lote (body vacío) → NO 403 (guard pasa, handler valida body)", async () => {
      const r = await POST("/api/fiscal/timbrar-lote", tokenContador, {});
      await expectNotForbidden(r, "contador_general timbrar-lote");
    });

    it("FSC-25: administrador_campus PUT /api/fiscal/config-automatica → NO 403", async () => {
      const r = await PUT("/api/fiscal/config-automatica", tokenAdmin, { habilitado: false, timbrado_automatico: false });
      await expectNotForbidden(r, "administrador_campus config-automatica");
    });

    it("FSC-26: contador_general POST /api/fiscal/generar-reporte-sat → NO 403", async () => {
      const r = await POST("/api/fiscal/generar-reporte-sat", tokenContador, { tipo: "diot", periodo: "2026-01" });
      await expectNotForbidden(r, "contador_general generar-reporte-sat");
    });

    it("FSC-27: administrador_campus POST /api/fiscal/configurar-pac → NO 403", async () => {
      const r = await POST("/api/fiscal/configurar-pac", tokenAdmin, { pac_nombre: "Facturama", ambiente: "sandbox" });
      await expectNotForbidden(r, "administrador_campus configurar-pac");
    });

    it("FSC-28: contador_general POST /api/fiscal/generar-reporte-contable → NO 403", async () => {
      const r = await POST("/api/fiscal/generar-reporte-contable", tokenContador, { tipo: "mensual", periodo: "2026-01" });
      await expectNotForbidden(r, "contador_general generar-reporte-contable");
    });
  });
});
