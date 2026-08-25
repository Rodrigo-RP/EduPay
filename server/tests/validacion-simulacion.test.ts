/**
 * Tests para:
 *   GET /api/admin/configuracion/validacion-onboarding
 *   GET /api/admin/configuracion/simulacion-cargos
 *
 * Cobertura (4 casos, requeridos por tarea #163):
 *   VS-01  Campus con alumno sin familia → errores[0] menciona alumno, ok=false
 *   VS-02  Campus con datos correctos     → ok=true, errores=[]
 *   VS-03  Simulación con conceptos       → total matemáticamente correcto
 *   VS-04  Campus sin conceptos           → sin_conceptos=true, total=0
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const SERVER = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJwt(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(`${SERVER}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: res.ok ? await res.json() : null };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

let tenantId: number;
// Campus A: alumno sin familia, sin conceptos (VS-01, VS-04)
let campusA_id: number;
let studentA_id: number;
let tokenA: string;
// Campus B: alumno con familia + tutor con correo + concepto (VS-02, VS-03)
let campusB_id: number;
let studentB_id: number;
let familyB_id: number;
let guardianB_id: number;
let conceptB_id: number;
let tokenB: string;

beforeAll(async () => {
  // ── Tenant ──────────────────────────────────────────────────────────────
  // tenants: nombre_legal (NOT NULL), rfc (NOT NULL)
  const tenantRow = await pool.query<{ id: number }>(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ('Tenant VS163', 'TVS163TST000') RETURNING id`,
  );
  tenantId = tenantRow.rows[0].id;

  // ── Campus A (sin familia, sin conceptos) ────────────────────────────────
  // campuses: tenant_id, nombre (NOT NULL)
  const camA = await pool.query<{ id: number }>(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus VS163-A') RETURNING id`,
    [tenantId],
  );
  campusA_id = camA.rows[0].id;

  // Alumno en campus A (sin family_students → provoca error en validacion)
  const stuA = await pool.query<{ id: number }>(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, status)
     VALUES ($1, $2, 'Alumno SinFamilia VS163', 'activo') RETURNING id`,
    [campusA_id, tenantId],
  );
  studentA_id = stuA.rows[0].id;

  // JWT para campus A — users: name (NOT NULL), email, password_hash, role
  const userA = await pool.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, campus_id, tenant_id)
     VALUES ('Admin VS163-A', 'admin163a@test.local', 'x', 'administrador_campus', $1, $2) RETURNING id`,
    [campusA_id, tenantId],
  );
  tokenA = makeJwt({ id: userA.rows[0].id, role: "administrador_campus", campus_id: campusA_id, tenant_id: tenantId });

  // ── Campus B (datos correctos + concepto) ────────────────────────────────
  const camB = await pool.query<{ id: number }>(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus VS163-B') RETURNING id`,
    [tenantId],
  );
  campusB_id = camB.rows[0].id;

  // Alumno en campus B
  const stuB = await pool.query<{ id: number }>(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, status)
     VALUES ($1, $2, 'Alumno ConFamilia VS163', 'activo') RETURNING id`,
    [campusB_id, tenantId],
  );
  studentB_id = stuB.rows[0].id;

  // Guardian para campus B
  // guardians: correo_institucional_familiar (NOT NULL), nombres (NOT NULL)
  // email: en DB real es NOT NULL aunque Drizzle lo declara nullable
  const grd = await pool.query<{ id: number }>(
    `INSERT INTO guardians (nombres, nombre_completo, correo_institucional_familiar, email, campus_id, tenant_id)
     VALUES ('Tutor VS163', 'Tutor VS163', 'tutor163@test.local', 'tutor163@test.local', $1, $2) RETURNING id`,
    [campusB_id, tenantId],
  );
  guardianB_id = grd.rows[0].id;

  // Familia en campus B
  // families: tenant_id (NOT NULL), campus_id (NOT NULL), nombre (NOT NULL)
  const fam = await pool.query<{ id: number }>(
    `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
     VALUES ($1, $2, 'Familia VS163', $3) RETURNING id`,
    [tenantId, campusB_id, guardianB_id],
  );
  familyB_id = fam.rows[0].id;

  // Vincular alumno B ↔ familia B
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1, $2)`,
    [familyB_id, studentB_id],
  );

  // Vincular alumno B ↔ guardian B (requerido para el check de correo vía student_guardian)
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1, $2)`,
    [studentB_id, guardianB_id],
  );

  // Concepto para campus B: Colegiatura $1 500.00 MXN sin IVA
  const con = await pool.query<{ id: number }>(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos, iva)
     VALUES ($1, $2, 'Colegiatura VS163', 'colegiatura', 'mensual', 150000, false) RETURNING id`,
    [campusB_id, tenantId],
  );
  conceptB_id = con.rows[0].id;

  // JWT para campus B
  const userB = await pool.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, campus_id, tenant_id)
     VALUES ('Admin VS163-B', 'admin163b@test.local', 'x', 'administrador_campus', $1, $2) RETURNING id`,
    [campusB_id, tenantId],
  );
  tokenB = makeJwt({ id: userB.rows[0].id, role: "administrador_campus", campus_id: campusB_id, tenant_id: tenantId });
});

afterAll(async () => {
  // Limpiar en orden inverso a FK
  if (conceptB_id)   await pool.query(`DELETE FROM concepts         WHERE id = $1`, [conceptB_id]);
  if (studentB_id)   await pool.query(`DELETE FROM student_guardian WHERE student_id = $1`, [studentB_id]);
  if (familyB_id)    await pool.query(`DELETE FROM family_students  WHERE family_id = $1`, [familyB_id]);
  if (familyB_id)    await pool.query(`DELETE FROM families         WHERE id = $1`, [familyB_id]);
  if (guardianB_id)  await pool.query(`DELETE FROM guardians        WHERE id = $1`, [guardianB_id]);
  if (studentA_id)   await pool.query(`DELETE FROM students         WHERE id = $1`, [studentA_id]);
  if (studentB_id)   await pool.query(`DELETE FROM students         WHERE id = $1`, [studentB_id]);
  // Usuarios de test
  await pool.query(`DELETE FROM users WHERE email IN ('admin163a@test.local','admin163b@test.local')`);
  // Campuses + tenant
  if (campusA_id) await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusA_id]);
  if (campusB_id) await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusB_id]);
  if (tenantId)   await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/admin/configuracion/validacion-onboarding", () => {
  it("VS-01 — campus con alumno sin familia → ok=false y error específico", async () => {
    const { status, body } = await apiFetch(
      "/api/admin/configuracion/validacion-onboarding",
      tokenA,
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(false);

    // Al menos un error menciona explícitamente el alumno o la ausencia de familia
    const errorTexto = body.errores.join(" ");
    expect(errorTexto).toMatch(/sin familia/i);

    // Verificar directamente en DB que el alumno realmente carece de familia
    const dbCheck = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM students s
       LEFT JOIN family_students fs ON fs.student_id = s.id
       WHERE s.campus_id = $1 AND fs.student_id IS NULL`,
      [campusA_id],
    );
    expect(Number((dbCheck.rows[0] as any).cnt)).toBeGreaterThan(0);
  });

  it("VS-02 — campus con datos correctos → ok=true, errores vacíos", async () => {
    const { status, body } = await apiFetch(
      "/api/admin/configuracion/validacion-onboarding",
      tokenB,
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.errores).toHaveLength(0);

    // Verificar en DB: alumno B sí tiene familia asignada
    const dbCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM family_students WHERE student_id = $1`,
      [studentB_id],
    );
    expect(Number((dbCheck.rows[0] as any).cnt)).toBe(1);
  });
});

describe("GET /api/admin/configuracion/simulacion-cargos", () => {
  it("VS-03 — simulación con conceptos y alumnos reales → total matemáticamente correcto", async () => {
    // Concepto: 150000 centavos sin IVA × 1 alumno activo = 150000
    const { status, body } = await apiFetch(
      "/api/admin/configuracion/simulacion-cargos",
      tokenB,
    );
    expect(status).toBe(200);
    expect(body.sin_conceptos).toBe(false);
    expect(body.total_alumnos).toBe(1);

    // Verificar desglose
    const concepto = body.desglose_por_concepto.find(
      (c: any) => c.concepto_id === conceptB_id,
    );
    expect(concepto).toBeDefined();
    expect(concepto.monto_unitario_centavos).toBe(150000); // sin IVA
    expect(concepto.subtotal_centavos).toBe(150000);       // 1 alumno × 150000

    // Total proyectado debe igualar la suma de subtotales del desglose
    const sumaDesglose = body.desglose_por_concepto.reduce(
      (acc: number, c: any) => acc + c.subtotal_centavos, 0,
    );
    expect(body.total_cargos_proyectados_centavos).toBe(sumaDesglose);

    // Verificar contra DB que efectivamente hay 1 alumno activo en campus B
    const dbCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM students
       WHERE campus_id = $1 AND COALESCE(status,'activo') = 'activo'`,
      [campusB_id],
    );
    expect(Number(dbCount.rows[0].count)).toBe(body.total_alumnos);
  });

  it("VS-04 — campus sin conceptos → sin_conceptos=true, total=0 (no es un error)", async () => {
    // Campus A tiene un alumno pero cero conceptos
    const { status, body } = await apiFetch(
      "/api/admin/configuracion/simulacion-cargos",
      tokenA,
    );
    expect(status).toBe(200);
    expect(body.sin_conceptos).toBe(true);
    expect(body.total_cargos_proyectados_centavos).toBe(0);
    expect(body.desglose_por_concepto).toHaveLength(0);

    // Confirmar en DB que campus A realmente no tiene conceptos
    const dbConceptos = await pool.query(
      `SELECT COUNT(*) AS cnt FROM concepts WHERE campus_id = $1`,
      [campusA_id],
    );
    expect(Number((dbConceptos.rows[0] as any).cnt)).toBe(0);
  });
});
