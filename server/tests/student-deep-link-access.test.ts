import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const suffix = Date.now().toString().slice(-8);

let tenantId = 0;
let otherTenantId = 0;
let campusId = 0;
let sameTenantOtherCampusId = 0;
let otherTenantCampusId = 0;
let userId = 0;
let allowedStudentId = 0;
let otherCampusStudentId = 0;
let otherTenantStudentId = 0;
let token = "";

async function createStudent(tenant: number, campus: number, label: string): Promise<number> {
  const result = await pool.query(
    `INSERT INTO students
      (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, nivel_escolar, grado, grupo, status, id_referencia)
     VALUES ($1, $2, $3, 'DeepLink', $3, 'Primaria', '4', 'A', 'activo', $4)
     RETURNING id`,
    [tenant, campus, label, `DL-${suffix}-${label.slice(0, 4)}`],
  );
  return Number(result.rows[0].id);
}

beforeAll(async () => {
  tenantId = Number((await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`Tenant deep-link ${suffix}`, `DL${suffix}`],
  )).rows[0].id);
  otherTenantId = Number((await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`Tenant externo ${suffix}`, `DX${suffix}`],
  )).rows[0].id);

  campusId = Number((await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
    [tenantId, `Campus deep-link ${suffix}`],
  )).rows[0].id);
  sameTenantOtherCampusId = Number((await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
    [tenantId, `Campus alterno ${suffix}`],
  )).rows[0].id);
  otherTenantCampusId = Number((await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
    [otherTenantId, `Campus externo ${suffix}`],
  )).rows[0].id);

  userId = Number((await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
     VALUES ($1, $2, 'Admin deep-link', $3, 'hash', 'administrador_campus', true, '{}')
     RETURNING id`,
    [tenantId, campusId, `deep-link.${suffix}@test.invalid`],
  )).rows[0].id);
  token = jwt.sign(
    { id: userId, role: "administrador_campus", tenant_id: tenantId, campus_id: campusId, type: "user" },
    JWT_SECRET,
    { expiresIn: "10m" },
  );

  allowedStudentId = await createStudent(tenantId, campusId, `Permitido ${suffix}`);
  otherCampusStudentId = await createStudent(tenantId, sameTenantOtherCampusId, `Campus externo ${suffix}`);
  otherTenantStudentId = await createStudent(otherTenantId, otherTenantCampusId, `Tenant externo ${suffix}`);
});

afterAll(async () => {
  const studentIds = [allowedStudentId, otherCampusStudentId, otherTenantStudentId].filter(Boolean);
  if (studentIds.length) await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [studentIds]);
  if (userId) await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  if (otherTenantCampusId) await pool.query(`DELETE FROM campuses WHERE id = $1`, [otherTenantCampusId]);
  if (sameTenantOtherCampusId) await pool.query(`DELETE FROM campuses WHERE id = $1`, [sameTenantOtherCampusId]);
  if (campusId) await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  if (otherTenantId) await pool.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
  if (tenantId) await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("deep-link de estudiantes — aislamiento de campus y tenant", () => {
  async function getStudent(studentId: number) {
    return fetch(`${BASE}/api/admin/students?studentId=${studentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  it("devuelve sólo el alumno del campus y tenant presentes en el JWT", async () => {
    const response = await getStudent(allowedStudentId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ id: allowedStudentId, campus_id: campusId, tenant_id: tenantId });
  });

  it("rechaza un studentId de otro campus del mismo tenant a nivel de API", async () => {
    const response = await getStudent(otherCampusStudentId);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toMatch(/no disponible.*campus/i);
    expect(JSON.stringify(body)).not.toContain(`Campus externo ${suffix}`);
  });

  it("rechaza un studentId de otro tenant a nivel de API", async () => {
    const response = await getStudent(otherTenantStudentId);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toMatch(/no disponible.*campus/i);
    expect(JSON.stringify(body)).not.toContain(`Tenant externo ${suffix}`);
  });
});