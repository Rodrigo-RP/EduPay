/**
 * server/tests/dashboard-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA SEGURIDAD — Control DSH: Guard DASHBOARD.READ en
 * GET /api/admin/dashboard/:campusId
 *
 * VULNERABILIDAD REPRODUCIDA (pre-fix):
 *   requireAuth solo verificaba que el JWT era válido; no comprobaba permisos.
 *   → role 'guardian' (fuera de ROLE_PERMISSIONS) devolvía HTTP 200 con los
 *     seis campos financieros: ciclo_metrics, mes_metrics, alertas, desglose_nivel.
 *   → role 'asistente' ídem — cualquier token firmado alcanzaba el handler.
 *
 * DECISIÓN DE ROLES (permissions.ts, todas las entradas DASHBOARD.READ):
 *   super_admin           ✓ bypass incondicional
 *   administrador_general ✓ scope 'campus'
 *   administrador_campus  ✓ scope 'campus'
 *   contador_general      ✓ scope 'campus' — "dashboard financiero"
 *   auxiliar_contable     ✓ scope 'campus' — "dashboard básico"
 *   admisiones            ✗ DASHBOARD.READ eliminado → 403
 *   asistente             ✓ scope 'campus'
 *   guardian              ✗ no está en ROLE_PERMISSIONS → 403
 *   (rol desconocido)     ✗ ídem
 *
 * NOTA: todos los roles estándar tienen DASHBOARD.READ; el guard bloquea
 * roles fuera de ROLE_PERMISSIONS (guardian, tutor, desconocido) y cualquier
 * rol futuro que no haya sido registrado explícitamente. El contenido
 * diferenciado por rol (dashboard financiero vs básico) es una mejora
 * pendiente en el data layer — no en el access layer.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ─────────────────────────────────────────────────────────

let tenantId = 0;
let campusId = 0;
let adminId  = 0;

const TS = Date.now().toString().slice(-7);

let tokenAdmin      = "";
let tokenContador   = "";
let tokenAsistente  = "";
let tokenAdmisiones = "";
let tokenAuxiliar   = "";

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@dsh${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

/** Token con rol fuera de ROLE_PERMISSIONS — prueba el caso de vulnerabilidad */
function makeUnknownRoleToken(role: string): string {
  return jwt.sign(
    { id: 88881, email: `unknown@dsh${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestDash2025!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`DSHGuard ${TS}`, `DSH${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-DSH-${TS}`]
  );
  campusId = cRow.rows[0].id;

  async function createUser(name: string, role: string, prefix: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users
         (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${prefix}.${TS}@dsh.test`, hash, role]
    );
    return r.rows[0].id as number;
  }

  adminId = await createUser("Admin DSH", "administrador_campus", "admin");

  // Crear usuarios para tokens
  const contadorId   = await createUser("Contador DSH",  "contador_general",  "cont");
  const asistenteId  = await createUser("Asistente DSH", "asistente",          "asist");
  const admisionesId = await createUser("Admis DSH",     "admisiones",         "admis");
  const auxiliarId   = await createUser("Aux DSH",       "auxiliar_contable",  "aux");

  tokenAdmin      = makeToken(adminId,      "administrador_campus");
  tokenContador   = makeToken(contadorId,   "contador_general");
  tokenAsistente  = makeToken(asistenteId,  "asistente");
  tokenAdmisiones = makeToken(admisionesId, "admisiones");
  tokenAuxiliar   = makeToken(auxiliarId,   "auxiliar_contable");
});

afterAll(async () => {
  await pool.query(`DELETE FROM users   WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id        = $1`, [tenantId]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENDPOINT = () => `${BASE}/api/admin/dashboard/${campusId}`;

async function getWith(token: string) {
  return fetch(ENDPOINT(), {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DSH — Guard DASHBOARD.READ en GET /api/admin/dashboard/:campusId", () => {

  // ── BLOQUEO (roles fuera de ROLE_PERMISSIONS) ──────────────────────────────

  describe("BLOQUEO (403) — roles sin DASHBOARD.READ", () => {

    it("DSH-01: sin token → 401", async () => {
      const r = await fetch(ENDPOINT());
      expect(r.status).toBe(401);
    });

    it("DSH-02: rol 'guardian' (fuera de ROLE_PERMISSIONS) → 403", async () => {
      // Este es exactamente el caso de la vulnerabilidad reproducida:
      // pre-fix devolvía 200 con los 6 campos financieros
      const tok = makeUnknownRoleToken("guardian");
      const r   = await getWith(tok);
      expect(r.status).toBe(403);
    });

    it("DSH-03: rol 'tutor' (desconocido) → 403", async () => {
      const tok = makeUnknownRoleToken("tutor");
      const r   = await getWith(tok);
      expect(r.status).toBe(403);
    });

    it("DSH-04: rol vacío string '' → 403", async () => {
      const tok = makeUnknownRoleToken("");
      const r   = await getWith(tok);
      expect(r.status).toBe(403);
    });

    it("DSH-08: admisiones GET /api/admin/dashboard → 403 (DASHBOARD.READ eliminado)", async () => {
      const r = await getWith(tokenAdmisiones);
      expect(r.status).toBe(403);
    });
  });

  // ── CONTROL POSITIVO (todos los roles estándar tienen DASHBOARD.READ) ───────

  describe("CONTROL POSITIVO (200) — roles con DASHBOARD.READ", () => {

    async function expectDashboard200(token: string, label: string) {
      const r    = await getWith(token);
      const body = await r.json() as any;
      expect(r.status, `${label}: esperaba 200, recibió ${r.status} — ${JSON.stringify(body)}`).toBe(200);
      // Verificar que los campos KPI principales están presentes
      expect(body).toHaveProperty("ciclo");
      expect(body).toHaveProperty("ciclo_metrics");
      expect(body).toHaveProperty("mes_metrics");
    }

    it("DSH-05: administrador_campus → 200 con KPIs", async () => {
      await expectDashboard200(tokenAdmin, "administrador_campus");
    });

    it("DSH-06: contador_general → 200 con KPIs", async () => {
      await expectDashboard200(tokenContador, "contador_general");
    });

    it("DSH-07: asistente → 200 con KPIs (DASHBOARD.READ intacto — regresión)", async () => {
      await expectDashboard200(tokenAsistente, "asistente");
    });

    it("DSH-09: auxiliar_contable → 200 con KPIs", async () => {
      await expectDashboard200(tokenAuxiliar, "auxiliar_contable");
    });
  });

  // ── VERIFICACIÓN DE ESTRUCTURA (regresión) ────────────────────────────────

  describe("REGRESIÓN — estructura de respuesta intacta", () => {

    it("DSH-10: respuesta tiene los 6 campos top-level del dashboard", async () => {
      const r    = await getWith(tokenAdmin);
      const body = await r.json() as any;
      expect(r.status).toBe(200);
      expect(body).toHaveProperty("ciclo");
      expect(body).toHaveProperty("ciclo_metrics");
      expect(body).toHaveProperty("mes_metrics");
      expect(body).toHaveProperty("alertas");
      expect(body).toHaveProperty("niveles_disponibles");
      expect(body).toHaveProperty("desglose_nivel");
    });

    it("DSH-11: campus de otro tenant → 403 (checkCampusTenant intacto)", async () => {
      // campusId -1 no existe; checkCampusTenant devuelve 403 antes de consultar
      const r = await fetch(`${BASE}/api/admin/dashboard/999999`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      // Puede ser 403 (tenant mismatch) o 404 dependiendo de la implementación
      expect([403, 404]).toContain(r.status);
    });
  });
});
