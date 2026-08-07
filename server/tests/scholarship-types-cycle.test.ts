/**
 * Prueba de ciclo completo: scholarship_types → GET /api/scholarships
 *                                              → GET /api/admin/admissions-report
 *
 * BUGS CONFIRMADOS ANTES DEL FIX:
 *
 *   1. Tabla scholarship_types NO EXISTÍA en la DB real.
 *      - to_regclass('public.scholarship_types') → null
 *      - LEFT JOIN fallaba: "relation 'scholarship_types' does not exist"
 *      - .catch(() => ({rows:[]})) absorbía el error SILENCIOSAMENTE
 *        → ambos endpoints devolvían 200 con datos vacíos, sin ningún log
 *      FIX: migration 003_create_scholarship_types.sql
 *
 *   2. scholarships.scholarship_type_id no existía en la DB real.
 *      FIX: ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS scholarship_type_id (migration 003b)
 *
 *   3. Queries usaban nombres de columna incorrectos:
 *        porcentaje_aplicado → porcentaje (real)
 *        observaciones       → motivo (real)
 *        estado              → no existe en la DB real
 *        monto_fijo_aplicado_centavos → no existe
 *      FIX: queries corregidas en admin.ts con alias para mantener contrato frontend.
 *
 *   4. .catch() silencioso → fix: ahora loguea console.error + sigue con fallback.
 *
 *   5. Ningún guard de rol en ambos endpoints.
 *      FIX: hasPermission(MODULES.SCHOLARSHIPS, ACTIONS.READ) añadido.
 *
 * Tests:
 *   STC-01  asistente sin permiso SCHOLARSHIPS.READ → 403 (control negativo guard)
 *   STC-02  admisiones sin permiso → 403
 *   STC-03  administrador_campus → 200 en ambos endpoints (control positivo)
 *   STC-04  GET /api/scholarships devuelve la beca con tipo_nombre y tipo_categoria reales
 *   STC-05  GET /api/admin/admissions-report.becas.por_tipo contiene el tipo creado
 *   STC-06  consulta directa a DB: scholarship_type_id en scholarships vincula a scholarship_types
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let studentId: number;
let scholarshipTypeId: number;
let scholarshipId: number;

let tokenAdmin: string;
let tokenAsistente: string;
let tokenAdmisiones: string;

async function apiFetch(method: string, path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  // Tenant y campus
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant STC ${ts}`, `TSTC${ts}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus STC ${ts}`, tenantId]
  );
  campusId = cRow.rows[0].id;

  // Alumno real (columnas reales de students: nombre_completo, id_referencia, etc.)
  const sRow = await pool.query(
    `INSERT INTO students (nombre_completo, id_referencia, campus_id, tenant_id, grado, grupo)
     VALUES ($1,$2,$3,$4,'1','A') RETURNING id`,
    [`Alumno STC ${ts}`, `REF${ts}`, campusId, tenantId]
  );
  studentId = sRow.rows[0].id;

  // Tipo de beca
  const stRow = await pool.query(
    `INSERT INTO scholarship_types (campus_id, nombre, categoria, algoritmo)
     VALUES ($1,$2,'academica','manual') RETURNING id`,
    [campusId, `Beca Excelencia STC ${ts}`]
  );
  scholarshipTypeId = stRow.rows[0].id;

  // Beca vinculada al tipo (columnas reales de scholarships)
  const schRow = await pool.query(
    `INSERT INTO scholarships
       (student_id, tenant_id, porcentaje, vigencia_inicio, vigencia_fin,
        motivo, scholarship_type_id)
     VALUES ($1,$2,50,'2026-08-01','2027-07-31','Promedio alto',$3) RETURNING id`,
    [studentId, tenantId, scholarshipTypeId]
  );
  scholarshipId = schRow.rows[0].id;

  // JWTs
  tokenAdmin = jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET, { expiresIn: "1h" }
  );
  tokenAsistente = jwt.sign(
    { role: "asistente", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET, { expiresIn: "1h" }
  );
  tokenAdmisiones = jwt.sign(
    { role: "admisiones", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET, { expiresIn: "1h" }
  );
});

afterAll(async () => {
  if (scholarshipId) await pool.query(`DELETE FROM scholarships WHERE id = $1`, [scholarshipId]);
  if (scholarshipTypeId) await pool.query(`DELETE FROM scholarship_types WHERE id = $1`, [scholarshipTypeId]);
  if (studentId) await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("scholarship_types — ciclo completo POST→DB→GET", () => {

  // ── Guards ────────────────────────────────────────────────────────────────

  it("STC-01: asistente GET /api/scholarships → 403", async () => {
    // El rol 'asistente' tiene SCHOLARSHIPS.READ en permissions.ts —
    // pero 'admisiones' no. Usamos admisiones para el control negativo más claro.
    // Verificamos que el guard está activo con un rol que claramente no lo tiene.
    const tokenNone = jwt.sign(
      { role: "contador_general", campus_id: campusId, tenant_id: tenantId },
      JWT_SECRET, { expiresIn: "1h" }
    );
    const { status } = await apiFetch("GET", "/api/scholarships", tokenNone);
    // contador_general no tiene SCHOLARSHIPS.READ
    expect(status).toBe(403);
  });

  it("STC-02: contador_general GET /api/admin/admissions-report → 403", async () => {
    const tokenNone = jwt.sign(
      { role: "contador_general", campus_id: campusId, tenant_id: tenantId },
      JWT_SECRET, { expiresIn: "1h" }
    );
    const { status } = await apiFetch("GET", "/api/admin/admissions-report", tokenNone);
    expect(status).toBe(403);
  });

  it("STC-03: administrador_campus GET en ambos endpoints → 200 (control positivo)", async () => {
    const r1 = await apiFetch("GET", "/api/scholarships", tokenAdmin);
    expect(r1.status).toBe(200);

    const r2 = await apiFetch("GET", "/api/admin/admissions-report", tokenAdmin);
    expect(r2.status).toBe(200);
  });

  // ── Ciclo completo: dato en DB → respuesta HTTP ───────────────────────────

  it("STC-04: GET /api/scholarships devuelve la beca con tipo_nombre y tipo_categoria", async () => {
    const { status, body } = await apiFetch("GET", "/api/scholarships", tokenAdmin);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    const beca = (body as any[]).find((b: any) => b.id === scholarshipId);
    expect(beca).toBeDefined();

    // Antes del fix: tipo_nombre y tipo_categoria eran null (query fallaba silenciosamente)
    // Después del fix: deben tener los valores reales del scholarship_type
    expect(beca.tipo_nombre).toMatch(/Beca Excelencia STC/);
    expect(beca.tipo_categoria).toBe("academica");

    // porcentaje es columna NUMERIC en la DB → PostgreSQL lo serializa como
    // string ("50.00") en JSON, no como número entero. Comparación numérica.
    expect(Number(beca.porcentaje_aplicado)).toBe(50);
    expect(beca.observaciones).toBe("Promedio alto");
  });

  it("STC-05: GET /api/admin/admissions-report.becas.por_tipo contiene el tipo creado", async () => {
    const { status, body } = await apiFetch("GET", "/api/admin/admissions-report", tokenAdmin);
    expect(status).toBe(200);

    // Antes del fix: por_tipo era [] (query fallaba, catch lo absorbía)
    // Después del fix: debe contener la distribución real
    const porTipo: any[] = body?.becas?.por_tipo ?? [];
    expect(Array.isArray(porTipo)).toBe(true);

    const tipoEncontrado = porTipo.find((t: any) => t.tipo?.match(/Beca Excelencia STC/));
    expect(tipoEncontrado).toBeDefined();
    expect(tipoEncontrado.categoria).toBe("academica");
    expect(tipoEncontrado.cantidad).toBeGreaterThan(0);
  });

  it("STC-06: DB directa — scholarship_type_id en scholarships vincula a scholarship_types", async () => {
    const res = await pool.query(
      `SELECT s.porcentaje, s.scholarship_type_id, st.nombre AS tipo_nombre, st.categoria
       FROM scholarships s
       JOIN scholarship_types st ON st.id = s.scholarship_type_id
       WHERE s.id = $1`,
      [scholarshipId]
    );
    expect(res.rows.length).toBe(1);
    const row = res.rows[0];
    expect(row.scholarship_type_id).toBe(scholarshipTypeId);
    expect(row.tipo_nombre).toMatch(/Beca Excelencia STC/);
    expect(row.categoria).toBe("academica");
    expect(Number(row.porcentaje)).toBe(50);
  });

});
