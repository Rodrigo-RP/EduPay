/**
 * Prueba de persistencia real del import de familias
 *
 * Verifica que POST /api/import/data/familias/tutores escribe en la DB real
 * y que GET /api/families/:campusId (el mismo endpoint que usa familias.tsx
 * al cargar la página) devuelve la familia importada.
 *
 * Esta es la prueba definitiva de que el import ya no es cosmético:
 * si falla, el usuario vería su familia desaparecer al recargar la página.
 *
 * IFP-01: import real → GET /api/families muestra la familia nueva
 * IFP-02: reload (segunda llamada al GET) devuelve el mismo resultado
 *         (idempotente, no aparece duplicado)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TENANT_ID  = 29;
const CAMPUS_ID  = 48;
const ADMIN_ID   = 80;

function adminToken() {
  return jwt.sign(
    { id: ADMIN_ID, email: "admin@ifp-test.mx", role: "administrador_campus",
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}

const TOKEN = adminToken();

// ── Fixtures ─────────────────────────────────────────────────────────────────
let studentId: number;
let studentRef: string;
const createdFamilyIds: number[] = [];
const createdGuardianIds: number[] = [];

beforeAll(async () => {
  const ts = Date.now();
  studentRef = `IFP-${ts}`;
  const r = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno IFP Persist',$3,'activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID, studentRef],
  );
  studentId = (r.rows[0] as any).id;
});

afterAll(async () => {
  if (studentId) {
    await pool.query(`DELETE FROM student_guardian WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM family_students  WHERE student_id = $1`, [studentId]);
  }
  if (createdFamilyIds.length) {
    await pool.query(`DELETE FROM family_students WHERE family_id = ANY($1::int[])`, [createdFamilyIds]);
    await pool.query(`DELETE FROM families WHERE id = ANY($1::int[])`, [createdFamilyIds]);
  }
  if (createdGuardianIds.length) {
    await pool.query(`DELETE FROM guardians WHERE id = ANY($1::int[])`, [createdGuardianIds]);
  }
  if (studentId) {
    await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildCsv(studentRef: string, tutorEmail: string): string {
  const header = "nombre_familia,id_referencia_alumno,curp_alumno,tipo_guardian," +
    "nombres_tutor,apellido_paterno_tutor,apellido_materno_tutor," +
    "curp_tutor,email_tutor,celular_tutor,es_responsable_pago,porcentaje_responsabilidad";
  const row = `Familia Persist Test,${studentRef},,padre,Tutor Persist,,,,${tutorEmail},,true,`;
  return `${header}\n${row}`;
}

async function postImport(csv: string, dryRun = false) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "persist.csv");
  const url = `${BASE}/api/import/data/familias/tutores${dryRun ? "?dry_run=true" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  return { status: res.status, body: await res.json() as any };
}

async function getFamilies() {
  const res = await fetch(`${BASE}/api/families/${CAMPUS_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { status: res.status, body: await res.json() as any[] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Import masivo → persistencia verificada con GET /api/families", () => {
  it("IFP-01: import real (no dry_run) → GET /api/families devuelve la familia nueva", async () => {
    const ts = Date.now();
    const tutorEmail = `ifp-persist-${ts}@test.mx`;
    const familyName = "Familia Persist Test";

    // Snap del conteo de familias antes del import
    const familyCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1 AND campus_id = $2`,
      [TENANT_ID, CAMPUS_ID],
    );
    const nBefore = Number((familyCountBefore.rows[0] as any).n);

    // 1. Import real
    const { status, body } = await postImport(buildCsv(studentRef, tutorEmail));
    expect(status).toBe(200);
    expect(body.committed).toBe(true);
    expect(body.successful).toBe(1);
    expect(body.failed).toBe(0);

    // 2. La familia debe existir en la DB
    const famRow = await pool.query(
      `SELECT id, nombre FROM families WHERE tenant_id = $1 AND campus_id = $2 AND nombre = $3`,
      [TENANT_ID, CAMPUS_ID, familyName],
    );
    expect((famRow.rows as any[]).length).toBe(1);
    const familyId = (famRow.rows[0] as any).id as number;
    createdFamilyIds.push(familyId);

    // El alumno está vinculado
    const fsRow = await pool.query(
      `SELECT 1 FROM family_students WHERE family_id = $1 AND student_id = $2`,
      [familyId, studentId],
    );
    expect((fsRow.rows as any[]).length).toBe(1);

    // El tutor está en la DB
    const gRow = await pool.query(
      `SELECT id FROM guardians WHERE (correo_institucional_familiar = $1 OR email = $1) AND tenant_id = $2`,
      [tutorEmail, TENANT_ID],
    );
    expect((gRow.rows as any[]).length).toBe(1);
    createdGuardianIds.push((gRow.rows[0] as any).id);

    // 3. El conteo de familias aumentó exactamente en 1
    const familyCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1 AND campus_id = $2`,
      [TENANT_ID, CAMPUS_ID],
    );
    expect(Number((familyCountAfter.rows[0] as any).n)).toBe(nBefore + 1);

    // 4. GET /api/families/:campusId (lo que llama familias.tsx al cargar)
    //    devuelve la familia importada — PRUEBA de que el import no es cosmético
    const { status: gStatus, body: families } = await getFamilies();
    expect(gStatus).toBe(200);
    const match = (families as any[]).find(
      (f: any) => f.id === familyId || f.nombre === familyName,
    );
    expect(match).toBeDefined();
    expect(match.nombre).toBe(familyName);

    // El alumno aparece en la respuesta del GET
    const studentInFamily = (match.estudiantes || []).find(
      (s: any) => s.id === studentId,
    );
    expect(studentInFamily).toBeDefined();
  });

  it("IFP-02: segundo GET /api/families devuelve exactamente el mismo resultado " +
     "(sin duplicados — import es idempotente en la lectura)", async () => {
    // Llamar dos veces y comparar — si el backend retorna N familias ambas veces,
    // no se está acumulando estado local entre peticiones.
    const { body: first  } = await getFamilies();
    const { body: second } = await getFamilies();

    expect(first.length).toBe(second.length);

    const ids1 = first.map((f: any)  => f.id).sort();
    const ids2 = second.map((f: any) => f.id).sort();
    expect(ids1).toEqual(ids2);
  });
});
