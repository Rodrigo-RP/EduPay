/**
 * Pruebas de guard de módulo y atomicidad en POST /api/import/data/:category/:templateId
 *
 * IGM-01  asistente → 403 en becas/asignaciones (sin SCHOLARSHIPS.ASSIGN)
 * IGM-02  asistente → 403 en estudiantes/estudiantes (sin STUDENTS.IMPORT)
 * IGM-03  asistente → 403 en estudiantes/tutores (sin FAMILIES.IMPORT)
 * IGM-04  administrador_campus → 200 en becas/asignaciones (control positivo)
 * IGM-05  administrador_campus → 200 en estudiantes/estudiantes (control positivo)
 * IGM-06  administrador_campus → 200 en estudiantes/tutores (control positivo)
 * IGM-07  Fila con error de validación → failed++, resto continúa (regresión comportamiento actual)
 * IGM-08  Error fatal en INSERT (CHECK constraint) → HTTP 500 + ROLLBACK: ninguna fila queda en DB
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TENANT_ID  = 29;
const CAMPUS_ID  = 48;
const ADMIN_ID   = 80; // usuario demo real en la DB

// ── IDs creados en setup ───────────────────────────────────────────────────
let testStudentId: number;   // alumno real para importar becas
let testStudentRef: string;  // id_referencia del alumno

// IDs generados por los tests positivos (para limpiar en afterAll)
const createdStudentCurps: string[] = [];
const createdGuardianEmails: string[] = [];

function makeToken(role: string): string {
  return jwt.sign(
    { id: ADMIN_ID, email: `${role}@test.com`, role, tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}

const tokenAsistente = makeToken("asistente");
const tokenAdmin     = makeToken("administrador_campus");

// ── Helper: envía un CSV vía multipart/form-data ───────────────────────────
async function importCsv(
  token: string,
  category: string,
  templateId: string,
  csvContent: string,
): Promise<{ status: number; body: any }> {
  const boundary = "----TestBoundary" + Date.now();
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="test.csv"`,
    `Content-Type: text/csv`,
    ``,
    csvContent,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(
    `${BASE}/api/import/data/${category}/${templateId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    },
  );
  const responseBody = await res.json().catch(() => ({}));
  return { status: res.status, body: responseBody };
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Alumno real para test de becas (IGM-04)
  testStudentRef = `IGM-TEST-${Date.now()}`;
  const sRes = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, nombre_completo, status, id_referencia)
     VALUES ($1, $2, 'Alumno', 'Alumno IGM', 'activo', $3)
     RETURNING id`,
    [TENANT_ID, CAMPUS_ID, testStudentRef],
  );
  testStudentId = sRes.rows[0].id;

  // CHECK CONSTRAINT temporal para el test de rollback (IGM-08).
  // Rechaza CURPs que empiecen con 'TEAT' — patrón que nunca aparece en datos reales
  // pero que sí es un CURP de formato válido, de modo que el error lo produce la DB
  // (no la validación de formato en aplicación).
  await pool.query(`
    ALTER TABLE students
    ADD CONSTRAINT chk_igm_test_rollback
    CHECK (curp NOT LIKE 'TEAT%')
  `);
});

afterAll(async () => {
  // Eliminar CHECK CONSTRAINT temporal
  await pool.query(`
    ALTER TABLE students DROP CONSTRAINT IF EXISTS chk_igm_test_rollback
  `);

  // Limpiar alumno de setup
  await pool.query("DELETE FROM students WHERE id = $1", [testStudentId]);

  // Limpiar alumnos creados por tests positivos (IGM-05, IGM-07, IGM-08 rollback)
  if (createdStudentCurps.length > 0) {
    await pool.query(
      `DELETE FROM students WHERE curp = ANY($1::text[])`,
      [createdStudentCurps],
    );
  }

  // Limpiar guardians creados por IGM-06
  if (createdGuardianEmails.length > 0) {
    await pool.query(
      `DELETE FROM guardians WHERE email = ANY($1::text[])`,
      [createdGuardianEmails],
    );
  }

  // Limpiar becas asignadas por IGM-04
  await pool.query(
    "DELETE FROM scholarships WHERE student_id = $1",
    [testStudentId],
  );
});

// ── Tests ──────────────────────────────────────────────────────────────────
describe("POST /api/import/data — guard de módulo y atomicidad", () => {

  // ── IGM-01..03: 403 para rol sin permiso ─────────────────────────────────
  it("IGM-01: asistente → 403 en becas/asignaciones (sin SCHOLARSHIPS.ASSIGN)", async () => {
    const csv = "id_estudiante,tipo_beca,valor_descuento\n001,EXCELENCIA,10";
    const { status } = await importCsv(tokenAsistente, "becas", "asignaciones", csv);
    expect(status).toBe(403);
  });

  it("IGM-02: asistente → 403 en estudiantes/estudiantes (sin STUDENTS.IMPORT)", async () => {
    const csv = "nombre_completo,curp\nJuan IGM,JUGM900101HDFXXX01";
    const { status } = await importCsv(tokenAsistente, "estudiantes", "estudiantes", csv);
    expect(status).toBe(403);
  });

  it("IGM-03: asistente → 403 en estudiantes/tutores (sin FAMILIES.CREATE)", async () => {
    const csv = "nombre_completo,email\nTutor IGM,tutor-igm@test.com";
    const { status } = await importCsv(tokenAsistente, "estudiantes", "tutores", csv);
    expect(status).toBe(403);
  });

  // ── IGM-04..06: 200 para administrador_campus (control positivo) ─────────
  it("IGM-04: administrador_campus → 200 en becas/asignaciones, beca insertada en DB", async () => {
    const csv = `id_estudiante,tipo_beca,valor_descuento\n${testStudentRef},EXCELENCIA,15`;
    const { status, body } = await importCsv(tokenAdmin, "becas", "asignaciones", csv);
    expect(status).toBe(200);
    expect(body.successful).toBe(1);
    expect(body.failed).toBe(0);

    // Verificar que la beca quedó en DB
    const dbCheck = await pool.query(
      "SELECT id FROM scholarships WHERE student_id = $1 AND porcentaje = 15",
      [testStudentId],
    );
    expect(dbCheck.rows.length).toBe(1);
  });

  it("IGM-05: administrador_campus → 200 en estudiantes/estudiantes, alumno insertado en DB", async () => {
    // GUMA: G(letra), U(vocal), M, A — prefijo válido para formato CURP.
    const _ts5 = Date.now();
    const curp = `GUMA${String(_ts5 % 100).padStart(2,'0')}0101HNENNNA${_ts5 % 10}`;
    createdStudentCurps.push(curp);

    const csv = `nombre_completo,curp\nAlumno IGM Import,${curp}`;
    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv);
    expect(status).toBe(200);
    expect(body.successful).toBe(1);

    const dbCheck = await pool.query(
      "SELECT id FROM students WHERE curp = $1 AND campus_id = $2",
      [curp, CAMPUS_ID],
    );
    expect(dbCheck.rows.length).toBe(1);
  });

  it("IGM-06: administrador_campus → 200 en estudiantes/tutores, guardian insertado en DB", async () => {
    const email = `igm-tutor-${Date.now()}@test.com`;
    createdGuardianEmails.push(email);

    const csv = `nombre_completo,email\nTutor IGM Import,${email}`;
    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "tutores", csv);
    expect(status).toBe(200);
    expect(body.successful).toBe(1);

    const dbCheck = await pool.query(
      "SELECT id FROM guardians WHERE email = $1 AND campus_id = $2",
      [email, CAMPUS_ID],
    );
    expect(dbCheck.rows.length).toBe(1);
  });

  // ── IGM-07: Fila con error de validación → failed++, resto continúa ──────
  it("IGM-07: fila sin nombre_completo → failed=1, fila válida siguiente → successful=1", async () => {
    const _ts7 = Date.now();
    const curp = `GUMB${String(_ts7 % 100).padStart(2,'0')}0101HNENNNA${_ts7 % 10}`;
    createdStudentCurps.push(curp);

    // Fila 1: sin nombre_completo (error de validación)
    // Fila 2: válida
    const csv = [
      "nombre_completo,curp",
      `,CURP-INVALIDO-001`,       // fila sin nombre → failed
      `Alumno Valid IGM,${curp}`, // fila válida → successful
    ].join("\n");

    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv);
    expect(status).toBe(200);
    expect(body.failed).toBe(1);
    expect(body.successful).toBe(1);

    // La fila válida SÍ quedó en DB
    const dbCheck = await pool.query(
      "SELECT id FROM students WHERE curp = $1",
      [curp],
    );
    expect(dbCheck.rows.length).toBe(1);
  });

  // ── IGM-08: Error fatal en INSERT → rollback completo ────────────────────
  it("IGM-08: error fatal (CHECK constraint) → HTTP 500 + rollback: ninguna fila queda en DB", async () => {
    // curpRow1 = CURP válido (no empieza con TEAT) → pasa validación y CHECK, se inserta.
    // curpRow2 = CURP válido en formato pero viola CHECK NOT LIKE 'TEAT%' → error fatal DB.
    const _ts8 = Date.now();
    const curpRow1 = `GUMC${String(_ts8 % 100).padStart(2,'0')}0101HNENNNA${_ts8 % 10}`;
    const curpRow2 = `TEAT000101HNENNNA0`; // formato CURP válido, viola chk_igm_test_rollback

    const csv = [
      "nombre_completo,curp",
      `Alumno Row1 IGM,${curpRow1}`, // se inserta primero — debe hacer ROLLBACK
      `Alumno Row2 IGM,${curpRow2}`, // viola CHECK → error fatal
    ].join("\n");

    const { status } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv);
    expect(status).toBe(500);

    // Verificar que la fila 1 NO quedó en la DB (rollback limpio)
    const dbCheck1 = await pool.query(
      "SELECT id FROM students WHERE curp = $1",
      [curpRow1],
    );
    expect(dbCheck1.rows.length).toBe(0);

    // La fila 2 tampoco (obvia, pero explícita)
    const dbCheck2 = await pool.query(
      "SELECT id FROM students WHERE curp = $1",
      [curpRow2],
    );
    expect(dbCheck2.rows.length).toBe(0);
  });

});
