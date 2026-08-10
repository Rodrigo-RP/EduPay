/**
 * CF-CONSEJO — guard de rol en GET /api/reportes/consejo/:campusId
 *                          y GET /api/reportes/consejo (alias)
 *
 * Antes del fix: solo authenticateToken + checkCampusTenant. Cualquier rol
 * autenticado podía descargar el reporte ejecutivo del consejo directivo.
 *
 * Guard aplicado: hasPermission(role, MODULES.FINANCIAL, ACTIONS.READ)
 * administrador_campus tenía omisión de FINANCIAL.READ → corregido.
 *
 * Fix #135: queries de becas_aplicadas usaban campus_id y activo que no
 * existen en scholarships → ahora JOIN a students + filtro de vigencia.
 * CON-04b y CON-08 verifican el valor real (>= 1), no solo presencia.
 *
 * CON-01  sin token → 401
 * CON-02  asistente → 403
 * CON-03  auxiliar_contable → 403
 * CON-04  administrador_campus → 200 + kpis + top_deudores array
 * CON-04b administrador_campus → becas_aplicadas >= 1 (valor real, no 0 por catch)
 * CON-05  contador_general → 200 + kpis con las claves esperadas
 * CON-06  administrador_general → 200
 * CON-07  admisiones → 403 (no tiene FINANCIAL.READ)
 * CON-08  alias /api/reportes/consejo → becas_aplicadas >= 1 para el campus del token
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
let studentId: number;
let scholarshipId: number;

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

  // Alumno real para que la beca quede ligada al campus via JOIN
  const sRow = await pool.query(
    `INSERT INTO students
       (nombres, apellido_paterno, nombre_completo, campus_id, tenant_id, id_referencia, status, grado)
     VALUES ($1,$2,$3,$4,$5,$6,'activo','1° PRIMARIA') RETURNING id`,
    [`AlumnoCON`, `Test${TS}`, `AlumnoCON Test${TS}`, campusId, tenantId, `CON${TS}`],
  );
  studentId = (sRow.rows[0] as any).id;

  // Beca vigente hoy — verifica que becas_aplicadas devuelve >= 1 tras el fix
  const bRow = await pool.query(
    `INSERT INTO scholarships
       (student_id, tenant_id, porcentaje, motivo, vigencia_inicio, vigencia_fin)
     VALUES ($1,$2,30,$3, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year') RETURNING id`,
    [studentId, tenantId, `Beca CON ${TS}`],
  );
  scholarshipId = (bRow.rows[0] as any).id;

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
  await pool.query(`DELETE FROM scholarships WHERE id=$1`,   [scholarshipId]).catch(() => {});
  await pool.query(`DELETE FROM students    WHERE id=$1`,    [studentId]).catch(() => {});
  await pool.query(`DELETE FROM users       WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM campuses    WHERE id=$1`,    [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants     WHERE id=$1`,    [tenantId]).catch(() => {});
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
    expect(body).toHaveProperty("kpis");
    for (const key of EXPECTED_KPI_KEYS) {
      expect(body.kpis).toHaveProperty(key);
      expect(typeof body.kpis[key]).toBe("number");
    }
    expect(body).toHaveProperty("top_deudores");
    expect(Array.isArray(body.top_deudores)).toBe(true);
  });

  it("CON-04b: becas_aplicadas refleja valor real (>= 1) — no 0 por catch silencioso", async () => {
    // Hay 1 beca vigente para el campus de prueba (insertada en beforeAll).
    // Antes del fix de #135 la query fallaba con 'column not found'
    // y el catch devolvía 0 siempre — este test lo habría detectado.
    const { status, body } = await get(`/api/reportes/consejo/${campusId}`, tokAdminCampus);
    expect(status).toBe(200);
    expect(body.kpis.becas_aplicadas).toBeGreaterThanOrEqual(1);
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

  it("CON-08: alias /api/reportes/consejo → becas_aplicadas >= 1 para el campus del token", async () => {
    // Alias sin :campusId — toma campus_id del JWT.
    // Token de administrador_campus tiene campus_id = campusId del fixture,
    // donde hay 1 beca vigente. Verifica que el alias usa la misma query
    // corregida (sin campus_id ni activo directos en scholarships).
    const { status, body } = await get(`/api/reportes/consejo`, tokAdminCampus);
    expect(status).toBe(200);
    expect(body).toHaveProperty("kpis");
    expect(body.kpis.becas_aplicadas).toBeGreaterThanOrEqual(1);
  });
});
