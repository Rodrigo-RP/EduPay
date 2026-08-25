/**
 * CF-SEARCH — GET /api/search cross-campus leak (misc.ts:1252)
 *
 * Antes del fix: las 4 queries filtran por tenant_id únicamente.
 * campus_id se captura del JWT (línea 1256) pero nunca aparece en WHERE.
 * En un tenant con varios campuses, cualquier usuario ve datos ajenos.
 *
 * SRH-01  Reproducción del leak: búsqueda desde campus A encuentra alumno que
 *         solo existe en campus B del mismo tenant → debe FALLAR antes del fix.
 * SRH-02  Igual para tutores: email único en campus B es visible desde campus A.
 * SRH-03  Después del fix: campus A no encuentra al alumno de campus B.
 * SRH-04  Control positivo: campus B sí encuentra su propio alumno.
 * SRH-05  administrador_general ve todos los campuses del tenant (cross-campus intencional).
 * SRH-06  super_admin ve todos los campuses del tenant.
 * SRH-07  Término con < 3 caracteres → 200 vacío, sin error.
 * SRH-08  Sin token → 401.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

async function apiGet(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId:   number;
let campusAId:  number;
let campusBId:  number;

let tokenCampusA:          string;   // administrador_campus del campus A
let tokenCampusB:          string;   // administrador_campus del campus B
let tokenAdminGeneral:     string;   // administrador_general (cross-campus)
let tokenSuperAdmin:       string;   // super_admin (cross-campus)

// Término único solo en campus B — improbable de colisionar con datos reales
const UNIQUE_NOMBRE   = "Zxqvbn Srh Testez";
const UNIQUE_EMAIL    = `srh.unico.campusb@searchtest-${Date.now()}.mx`;

let studentBId:  number;
let guardianBId: number;

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  // Tenant compartido
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant SRH ${ts}`, `SRH${ts}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  // Campus A y B dentro del mismo tenant
  const c1 = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus SRH A ${ts}`, tenantId],
  );
  campusAId = (c1.rows[0] as any).id;

  const c2 = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus SRH B ${ts}`, tenantId],
  );
  campusBId = (c2.rows[0] as any).id;

  // Usuarios
  const insertUser = async (cId: number, role: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
      [cId, tenantId, `${role}.srh.${ts}.${cId}@test.mx`, `User SRH`, role],
    );
    return (r.rows[0] as any).id as number;
  };

  const idA  = await insertUser(campusAId, "administrador_campus");
  const idB  = await insertUser(campusBId, "administrador_campus");
  const idAG = await insertUser(campusAId, "administrador_general");
  const idSA = await insertUser(campusAId, "super_admin");

  const tok = (id: number, role: string, cId: number) =>
    jwt.sign({ id, role, campus_id: cId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });

  tokenCampusA      = tok(idA,  "administrador_campus",  campusAId);
  tokenCampusB      = tok(idB,  "administrador_campus",  campusBId);
  tokenAdminGeneral = tok(idAG, "administrador_general", campusAId);
  tokenSuperAdmin   = tok(idSA, "super_admin",           campusAId);

  // Alumno en campus B — nombre único que no puede estar en campus A
  const sRow = await pool.query(
    `INSERT INTO students
       (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo, grado, status)
     VALUES ($1,$2,'Zxqvbn','Srh Testez','Zxqvbn Srh Testez','1° PRIMARIA','activo')
     RETURNING id`,
    [campusBId, tenantId],
  );
  studentBId = (sRow.rows[0] as any).id;

  // Tutor en campus B — email único
  // guardians.email es NOT NULL → se incluye siempre; correo_institucional_familiar
  // es el que usan las búsquedas (campo de contacto de la familia).
  const gRow = await pool.query(
    `INSERT INTO guardians
       (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo,
        correo_institucional_familiar, email, tipo_guardian)
     VALUES ($1,$2,'TutorUnico','SrhB','TutorUnico SrhB',$3,$3,'padre')
     RETURNING id`,
    [campusBId, tenantId, UNIQUE_EMAIL],
  );
  guardianBId = (gRow.rows[0] as any).id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM students WHERE id=$1`,  [studentBId]).catch(() => {});
  await pool.query(`DELETE FROM guardians WHERE id=$1`, [guardianBId]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE campus_id IN ($1,$2)`, [campusAId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`, [campusAId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`, [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-SEARCH — GET /api/search cross-campus isolation", () => {

  it("SRH-08: sin token → 401", async () => {
    const { status } = await apiGet("/api/search?q=Zxqvbn");
    expect(status).toBe(401);
  });

  it("SRH-07: término con < 3 caracteres → 200 vacío sin error", async () => {
    const { status, body } = await apiGet("/api/search?q=Zx", tokenCampusA);
    expect(status).toBe(200);
    expect(body.alumnos).toHaveLength(0);
    expect(body.tutores).toHaveLength(0);
  });

  it("SRH-03: campus A NO encuentra el alumno que solo existe en campus B (aislamiento)", async () => {
    const { status, body } = await apiGet("/api/search?q=Zxqvbn", tokenCampusA);
    expect(status).toBe(200);
    // Con el fix: campus_id filtra — el alumno de B es invisible desde A
    const ids = (body.alumnos as any[]).map((a: any) => a.id);
    expect(ids).not.toContain(studentBId);
  });

  it("SRH-02: campus A NO ve el tutor que solo existe en campus B", async () => {
    const { status, body } = await apiGet(
      `/api/search?q=${encodeURIComponent("TutorUnico")}`,
      tokenCampusA,
    );
    expect(status).toBe(200);
    const ids = (body.tutores as any[]).map((t: any) => t.id);
    expect(ids).not.toContain(guardianBId);
  });

  it("SRH-04: campus B SÍ encuentra su propio alumno (control positivo)", async () => {
    const { status, body } = await apiGet("/api/search?q=Zxqvbn", tokenCampusB);
    expect(status).toBe(200);
    const ids = (body.alumnos as any[]).map((a: any) => a.id);
    expect(ids).toContain(studentBId);
  });

  it("SRH-05: administrador_general ve alumno de campus B desde campus A (cross-campus intencional)", async () => {
    const { status, body } = await apiGet("/api/search?q=Zxqvbn", tokenAdminGeneral);
    expect(status).toBe(200);
    const ids = (body.alumnos as any[]).map((a: any) => a.id);
    expect(ids).toContain(studentBId);
  });

  it("SRH-06: super_admin ve alumno de campus B desde campus A (cross-campus intencional)", async () => {
    const { status, body } = await apiGet("/api/search?q=Zxqvbn", tokenSuperAdmin);
    expect(status).toBe(200);
    const ids = (body.alumnos as any[]).map((a: any) => a.id);
    expect(ids).toContain(studentBId);
  });

});
