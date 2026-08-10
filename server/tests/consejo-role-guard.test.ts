/**
 * CF-CONSEJO — guard de rol en GET /api/reportes/consejo/:campusId
 *
 * Antes del fix: solo authenticateToken + checkCampusTenant. Cualquier rol
 * autenticado (asistente, auxiliar_contable) podía descargar el reporte
 * ejecutivo del consejo directivo: KPIs financieros agregados (ingresos,
 * mora, tasa de cobro) + top-10 familias morosas con nombre y monto.
 *
 * Guard aplicado: hasPermission(role, MODULES.FINANCIAL, ACTIONS.READ)
 *
 * Elección de módulo:
 *   REPORTS.READ incluye asistente y auxiliar_contable → demasiado permisivo.
 *   FINANCIAL.READ está semánticamente correcto para KPIs + datos nominales
 *   de morosidad. administrador_campus tenía la omisión (no tenía FINANCIAL.READ)
 *   → corregido en permissions.ts al mismo tiempo que este guard.
 *
 * Roles CON permiso: super_admin, administrador_general, administrador_campus,
 *                    contador_general
 * Roles SIN permiso: asistente, auxiliar_contable, admisiones
 *
 * CON-01  sin token → 401
 * CON-02  asistente → 403
 * CON-03  auxiliar_contable → 403
 * CON-04  administrador_campus → 200 + kpis presentes + top_deudores array
 * CON-05  contador_general → 200 + kpis con las claves esperadas
 * CON-06  administrador_general → 200
 * CON-07  admisiones → 403 (no tiene FINANCIAL.READ)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const get = async (path: string, token?: string) => {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, body: data };
};

// ── fixtures ──────────────────────────────────────────────────────────────────
const TS = Date.now().toString().slice(-7);

let tenantId: number;
let campusId: number;

let tokAsistente:        string;
let tokAuxiliar:         string;
let tokAdminCampus:      string;
let tokContador:         string;
let tokAdminGeneral:     string;
let tokAdmisiones:       string;

const makeToken = (id: number, role: string) =>
  jwt.sign({ id, role, campus_id: campusId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });

const insertUser = async (role: string) => {
  const r = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
    [campusId, tenantId, `${role}.con.${TS}@test.mx`, `User CON ${role}`, role],
  );
  return (r.rows[0] as any).id as number;
};

// KPI keys que el endpoint siempre devuelve
const EXPECTED_KPI_KEYS = [
  "ingresos_mes", "total_facturado", "pendiente",
  "tasa_cobro", "mora", "estudiantes_activos",
];

beforeAll(async () => {
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CON ${TS}`, `CON${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CON ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  const idA  = await insertUser("asistente");
  const idAx = await insertUser("auxiliar_contable");
  const idAC = await insertUser("administrador_campus");
  const idCG = await insertUser("contador_general");
  const idAG = await insertUser("administrador_general");
  const idAd = await insertUser("admisiones");

  tokAsistente    = makeToken(idA,  "asistente");
  tokAuxiliar     = makeToken(idAx, "auxiliar_contable");
  tokAdminCampus  = makeToken(idAC, "administrador_campus");
  tokContador     = makeToken(idCG, "contador_general");
  tokAdminGeneral = makeToken(idAG, "administrador_general");
  tokAdmisiones   = makeToken(idAd, "admisiones");
});

afterAll(async () => {
  await pool.query(`DELETE FROM users   WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id=$1`,       [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`,       [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-CONSEJO — guard FINANCIAL.READ en /api/reportes/consejo/:campusId", () => {

  it("CON-01: sin token → 401", async () => {
    const { status } = await get(`/api/reportes/consejo/${campusId}`);
    expect(status).toBe(401);
  });

  it("CON-02: asistente → 403", async () => {
    const { status, body } = await get(`/api/reportes/consejo/${campusId}`, tokAsistente);
    expect(status).toBe(403);
    expect(body.message).toMatch(/permiso/i);
  });

  it("CON-03: auxiliar_contable → 403", async () => {
    const { status } = await get(`/api/reportes/consejo/${campusId}`, tokAuxiliar);
    expect(status).toBe(403);
  });

  it("CON-04: administrador_campus → 200 + kpis + top_deudores array", async () => {
    const { status, body } = await get(`/api/reportes/consejo/${campusId}`, tokAdminCampus);
    expect(status).toBe(200);
    // Verificar estructura de KPIs
    expect(body).toHaveProperty("kpis");
    for (const key of EXPECTED_KPI_KEYS) {
      expect(body.kpis).toHaveProperty(key);
      expect(typeof body.kpis[key]).toBe("number");
    }
    // top_deudores debe existir como array (puede estar vacío en campus de prueba)
    expect(body).toHaveProperty("top_deudores");
    expect(Array.isArray(body.top_deudores)).toBe(true);
  });

  it("CON-05: contador_general → 200 + kpis con las claves esperadas", async () => {
    const { status, body } = await get(`/api/reportes/consejo/${campusId}`, tokContador);
    expect(status).toBe(200);
    expect(body).toHaveProperty("kpis");
    expect(body.kpis).toHaveProperty("tasa_cobro");
    expect(body.kpis).toHaveProperty("mora");
    expect(body).toHaveProperty("top_deudores");
  });

  it("CON-06: administrador_general → 200", async () => {
    const { status, body } = await get(`/api/reportes/consejo/${campusId}`, tokAdminGeneral);
    expect(status).toBe(200);
    expect(body).toHaveProperty("kpis");
  });

  it("CON-07: admisiones → 403 (no tiene FINANCIAL.READ)", async () => {
    const { status } = await get(`/api/reportes/consejo/${campusId}`, tokAdmisiones);
    expect(status).toBe(403);
  });
});
