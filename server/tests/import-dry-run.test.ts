/**
 * Pruebas de modo dry_run en POST /api/import/data/:category/:templateId
 *
 * IDR-01  dry_run=true, datos válidos (becas) → 200, committed:false, ninguna beca en DB, successful correcto
 * IDR-02  dry_run=true, datos válidos (estudiantes) → 200, committed:false, ningún alumno en DB
 * IDR-03  dry_run=true, datos válidos (tutores) → 200, committed:false, ningún guardian en DB
 * IDR-04  dry_run=true con una fila inválida → failed=1 reportado correctamente, committed:false
 * IDR-05  dry_run ausente → committed:true, datos realmente escritos en DB (regresión)
 * IDR-06  dry_run=false explícito → igual que ausente (committed:true, datos en DB)
 * IDR-07  dry_run=1 (variante numérica) → committed:false
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TENANT_ID  = 29;
const CAMPUS_ID  = 48;
const ADMIN_ID   = 80;

let testStudentId: number;
let testStudentRef: string;

// Registros que escriben tests de regresión (IDR-05, IDR-06) — limpiar en afterAll
const committedStudentCurps: string[] = [];
const committedGuardianEmails: string[] = [];

function makeToken(role: string): string {
  return jwt.sign(
    { id: ADMIN_ID, email: `${role}@test.com`, role, tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}
const tokenAdmin = makeToken("administrador_campus");

async function importCsv(
  token: string,
  category: string,
  templateId: string,
  csvContent: string,
  queryParams: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const qs = new URLSearchParams(queryParams).toString();
  const url = `${BASE}/api/import/data/${category}/${templateId}${qs ? `?${qs}` : ""}`;
  const boundary = "----DryRunBoundary" + Date.now();
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="test.csv"`,
    `Content-Type: text/csv`,
    ``,
    csvContent,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const responseBody = await res.json().catch(() => ({}));
  return { status: res.status, body: responseBody };
}

beforeAll(async () => {
  testStudentRef = `IDR-TEST-${Date.now()}`;
  const r = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, nombre_completo, status, id_referencia)
     VALUES ($1, $2, 'Alumno', 'Alumno IDR', 'activo', $3) RETURNING id`,
    [TENANT_ID, CAMPUS_ID, testStudentRef],
  );
  testStudentId = r.rows[0].id;
});

afterAll(async () => {
  await pool.query("DELETE FROM students WHERE id = $1", [testStudentId]);
  await pool.query("DELETE FROM scholarships WHERE student_id = $1", [testStudentId]);

  if (committedStudentCurps.length > 0) {
    await pool.query(
      `DELETE FROM students WHERE curp = ANY($1::text[])`,
      [committedStudentCurps],
    );
  }
  if (committedGuardianEmails.length > 0) {
    await pool.query(
      `DELETE FROM guardians WHERE email = ANY($1::text[])`,
      [committedGuardianEmails],
    );
  }
});

describe("POST /api/import/data — modo dry_run", () => {

  // ── IDR-01: dry_run becas → sin escritura en DB ──────────────────────────
  it("IDR-01: dry_run=true, beca válida → 200, committed:false, ninguna beca en DB", async () => {
    const csv = `id_estudiante,tipo_beca,valor_descuento\n${testStudentRef},EXCELENCIA,20`;
    const { status, body } = await importCsv(tokenAdmin, "becas", "asignaciones", csv, { dry_run: "true" });

    expect(status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.successful).toBe(1);   // habría sido exitosa
    expect(body.failed).toBe(0);

    // Verificar que ninguna beca fue escrita
    const db = await pool.query(
      "SELECT id FROM scholarships WHERE student_id = $1 AND porcentaje = 20",
      [testStudentId],
    );
    expect(db.rows.length).toBe(0);
  });

  // ── IDR-02: dry_run estudiantes → sin escritura en DB ───────────────────
  it("IDR-02: dry_run=true, alumno válido → 200, committed:false, ningún alumno en DB", async () => {
    const curp = `IDR2${String(Date.now()).slice(-8)}`;
    const csv = `nombre_completo,curp\nAlumno IDR Dry,${curp}`;
    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv, { dry_run: "true" });

    expect(status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.successful).toBe(1);

    const db = await pool.query("SELECT id FROM students WHERE curp = $1", [curp]);
    expect(db.rows.length).toBe(0);
  });

  // ── IDR-03: dry_run tutores → sin escritura en DB ────────────────────────
  it("IDR-03: dry_run=true, tutor válido → 200, committed:false, ningún guardian en DB", async () => {
    const email = `idr3-${Date.now()}@dry.test`;
    const csv = `nombre_completo,email\nTutor IDR Dry,${email}`;
    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "tutores", csv, { dry_run: "true" });

    expect(status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.successful).toBe(1);

    const db = await pool.query("SELECT id FROM guardians WHERE email = $1", [email]);
    expect(db.rows.length).toBe(0);
  });

  // ── IDR-04: dry_run con fila inválida → error reportado, committed:false ─
  it("IDR-04: dry_run=true, fila sin tipo_beca → failed=1 en resultado, committed:false", async () => {
    // Fila 1: sin tipo_beca (error de validación)
    // Fila 2: válida — debería aparecer como successful (aunque con dry_run nada se escribe)
    const csv = [
      "id_estudiante,tipo_beca,valor_descuento",
      `${testStudentRef},,15`,          // falta tipo_beca → failed
      `${testStudentRef},BECA2,25`,     // válida → successful
    ].join("\n");

    const { status, body } = await importCsv(tokenAdmin, "becas", "asignaciones", csv, { dry_run: "true" });

    expect(status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.failed).toBe(1);
    expect(body.successful).toBe(1);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0]).toMatch(/tipo_beca/i);
  });

  // ── IDR-05: sin dry_run → COMMIT real (regresión) ────────────────────────
  it("IDR-05: sin dry_run → committed:true, alumno efectivamente en DB", async () => {
    const curp = `IDR5${String(Date.now()).slice(-8)}`;
    committedStudentCurps.push(curp);

    const csv = `nombre_completo,curp\nAlumno IDR Commit,${curp}`;
    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv);

    expect(status).toBe(200);
    expect(body.committed).toBe(true);
    expect(body.successful).toBe(1);

    const db = await pool.query(
      "SELECT id FROM students WHERE curp = $1 AND campus_id = $2",
      [curp, CAMPUS_ID],
    );
    expect(db.rows.length).toBe(1);
  });

  // ── IDR-06: dry_run=false explícito → igual que ausente ─────────────────
  it("IDR-06: dry_run=false → committed:true, tutor efectivamente en DB", async () => {
    const email = `idr6-${Date.now()}@commit.test`;
    committedGuardianEmails.push(email);

    const csv = `nombre_completo,email\nTutor IDR False,${email}`;
    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "tutores", csv, { dry_run: "false" });

    expect(status).toBe(200);
    expect(body.committed).toBe(true);

    const db = await pool.query("SELECT id FROM guardians WHERE email = $1", [email]);
    expect(db.rows.length).toBe(1);
  });

  // ── IDR-07: dry_run=1 (variante numérica) → rollback ────────────────────
  it("IDR-07: dry_run=1 → committed:false, ningún alumno en DB", async () => {
    const curp = `IDR7${String(Date.now()).slice(-8)}`;
    const csv = `nombre_completo,curp\nAlumno IDR One,${curp}`;
    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv, { dry_run: "1" });

    expect(status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.successful).toBe(1);

    const db = await pool.query("SELECT id FROM students WHERE curp = $1", [curp]);
    expect(db.rows.length).toBe(0);
  });

});
