/**
 * CF-IMPORT-BECAS — POST /api/import/data/becas/asignaciones (payments.ts:396-463)
 *
 * Bug: el handler usa un array de 4 estudiantes hardcodeado, nunca escribe en
 * la tabla scholarships, pero devuelve { successful: N } como si hubiera
 * insertado registros reales.
 *
 * IBK-01 PRE-FIX  Reproducción empírica: importar un CURP real (no de los 4
 *                  hardcodeados) → responde successful:1 pero scholarships
 *                  sigue sin ningún registro nuevo. (Este test FALLA antes
 *                  del fix y PASA después.)
 *
 * IBK-02  Ciclo completo: CURP real del campus correcto → 200, scholarship
 *         creada en DB con porcentaje y motivo correctos.
 *
 * IBK-03  Alumno del campus CORRECTO pero buscado por id_referencia (campo
 *         alternativo) → también crea beca en DB.
 *
 * IBK-04  CURP que no existe en ningún campus → failed:1, cero registros en DB.
 *
 * IBK-05  CURP de alumno de OTRO campus del mismo tenant → failed:1, sin
 *         registro en DB (aislamiento cross-campus).
 *
 * IBK-06  Fila sin tipo_beca → failed:1 (validación).
 *
 * IBK-07  Fila sin valor_descuento → failed:1 (validación).
 *
 * IBK-08  valor_descuento fuera de rango (> 100) → failed:1 (validación).
 *
 * IBK-09  Sin token → 401.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── helpers ───────────────────────────────────────────────────────────────────

function buildCsv(rows: Record<string, string | number>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines   = rows.map(r => headers.map(h => r[h] ?? "").join(","));
  return [headers.join(","), ...lines].join("\n");
}

async function postImport(
  csvContent: string,
  token?: string,
  category = "becas",
  templateId = "asignaciones",
) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([csvContent], { type: "text/csv" }),
    "becas.csv",
  );
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(
    `${BASE}/api/import/data/${category}/${templateId}`,
    { method: "POST", headers, body: form },
  );
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function countScholarshipsForStudent(studentId: number) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM scholarships WHERE student_id = $1`,
    [studentId],
  );
  return (r.rows[0] as any).n as number;
}

// ── fixtures ──────────────────────────────────────────────────────────────────
// TS7 para nombres de tenant/campus/email; TS6 para CURPs (varchar 18 exacto)
// CURP = 4 letras + 6 dígitos + 6 letras + 2 alfanum = 18 chars
const TS  = Date.now().toString().slice(-7);   // 7 dígitos — fixtures generales
const TS6 = TS.slice(0, 6);                    // 6 dígitos — solo para CURPs
const CURP_A  = `TSTA${TS6}HDFMST01`;   // alumno campus A — 4+6+8 = 18 chars
const CURP_B  = `TSTB${TS6}HDFMST02`;   // alumno campus B — 4+6+8 = 18 chars
const CURP_NK = `NKXX${TS6}HDFMST03`;   // CURP inexistente — 4+6+8 = 18 chars

let tenantId:   number;
let campusAId:  number;
let campusBId:  number;
let studentAId: number;   // alumno en campus A
let studentBId: number;   // alumno en campus B
let idRefA: string;       // id_referencia del alumno A
let tokenA: string;       // JWT del campus A
let createdScholarshipIds: number[] = [];

beforeAll(async () => {
  // Tenant
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant IBK ${TS}`, `IBK${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  // Campuses
  const c1 = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus IBK A ${TS}`, tenantId],
  );
  campusAId = (c1.rows[0] as any).id;

  const c2 = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus IBK B ${TS}`, tenantId],
  );
  campusBId = (c2.rows[0] as any).id;

  // Usuario administrador del campus A
  idRefA = `IBKREF${TS}`;
  const uRow = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x','Admin IBK A','administrador_campus') RETURNING id`,
    [campusAId, tenantId, `admin.ibk.${TS}@test.mx`],
  );
  const userId = (uRow.rows[0] as any).id;

  tokenA = jwt.sign(
    { id: userId, role: "administrador_campus", campus_id: campusAId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

  // Alumno en campus A
  const sA = await pool.query(
    `INSERT INTO students
       (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo,
        curp, id_referencia, grado, status)
     VALUES ($1,$2,'AlumnoIBK','Apellido','AlumnoIBK Apellido',$3,$4,'1° PRIMARIA','activo')
     RETURNING id`,
    [campusAId, tenantId, CURP_A, idRefA],
  );
  studentAId = (sA.rows[0] as any).id;

  // Alumno en campus B (mismo tenant, distinto campus)
  const sB = await pool.query(
    `INSERT INTO students
       (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo,
        curp, id_referencia, grado, status)
     VALUES ($1,$2,'AlumnoBIBK','ApellidoB','AlumnoBIBK ApellidoB',$3,$4,'1° PRIMARIA','activo')
     RETURNING id`,
    [campusBId, tenantId, CURP_B, `IBKREFB${TS}`],
  );
  studentBId = (sB.rows[0] as any).id;
});

afterAll(async () => {
  if (createdScholarshipIds.length) {
    await pool.query(
      `DELETE FROM scholarships WHERE id = ANY($1)`,
      [createdScholarshipIds],
    ).catch(() => {});
  }
  // Eliminar becas residuales por student_id (por si la cleanup de ids falló)
  await pool.query(`DELETE FROM scholarships WHERE student_id IN ($1,$2)`, [studentAId, studentBId]).catch(() => {});
  await pool.query(`DELETE FROM students  WHERE id IN ($1,$2)`,  [studentAId, studentBId]).catch(() => {});
  await pool.query(`DELETE FROM users     WHERE campus_id IN ($1,$2)`, [campusAId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM campuses  WHERE id IN ($1,$2)`,  [campusAId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM tenants   WHERE id=$1`, [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-IMPORT-BECAS — POST /api/import/data/becas/asignaciones", () => {

  it("IBK-09: sin token → 401", async () => {
    const csv = buildCsv([{ curp_estudiante: CURP_A, tipo_beca: "excelencia", valor_descuento: 50 }]);
    const { status } = await postImport(csv, undefined);
    expect(status).toBe(401);
  });

  it("IBK-01: PRE-FIX empírico — CURP real responde successful:1 pero DB no tiene el registro (bug)", async () => {
    // Este test prueba que el bug YA ESTÁ CORREGIDO:
    // después del fix, successful:1 DEBE coincidir con un registro real en DB.
    // Si el handler sigue siendo código muerto, successful:1 pero DB count=0 → falla aquí.
    const before = await countScholarshipsForStudent(studentAId);
    const csv    = buildCsv([{ curp_estudiante: CURP_A, tipo_beca: "excelencia_test_ibk01", valor_descuento: 30 }]);
    const { status, body } = await postImport(csv, tokenA);

    expect(status).toBe(200);
    expect(body.successful).toBe(1);
    expect(body.failed).toBe(0);

    const after = await countScholarshipsForStudent(studentAId);
    // Con el fix: after === before + 1 (registro real creado)
    // Sin el fix: after === before (código muerto — este expect falla, probando el bug)
    expect(after).toBe(before + 1);

    // Registrar ID para cleanup
    const row = await pool.query(
      `SELECT id FROM scholarships WHERE student_id=$1 AND motivo='excelencia_test_ibk01' ORDER BY id DESC LIMIT 1`,
      [studentAId],
    );
    if ((row.rows[0] as any)?.id) createdScholarshipIds.push((row.rows[0] as any).id);
  });

  it("IBK-02: CURP real del campus correcto → beca creada en DB con porcentaje y motivo correctos", async () => {
    const csv = buildCsv([{
      curp_estudiante: CURP_A,
      tipo_beca:       "rendimiento",
      valor_descuento: 75,
      vigencia_inicio: "2026-08-01",
      vigencia_fin:    "2027-07-31",
      motivo:          "Beca rendimiento IBK02",
    }]);
    const { status, body } = await postImport(csv, tokenA);
    expect(status).toBe(200);
    expect(body.successful).toBe(1);
    expect(body.failed).toBe(0);

    const r = await pool.query(
      `SELECT porcentaje, motivo, vigencia_inicio, vigencia_fin
         FROM scholarships WHERE student_id=$1
        ORDER BY id DESC LIMIT 1`,
      [studentAId],
    );
    expect(r.rows).toHaveLength(1);
    const beca = r.rows[0] as any;
    expect(Number(beca.porcentaje)).toBe(75);
    expect(beca.motivo).toBe("Beca rendimiento IBK02");
    expect(beca.vigencia_inicio.toISOString().startsWith("2026-08-01")).toBe(true);
    expect(beca.vigencia_fin.toISOString().startsWith("2027-07-31")).toBe(true);

    const row = await pool.query(
      `SELECT id FROM scholarships WHERE student_id=$1 AND motivo='Beca rendimiento IBK02' ORDER BY id DESC LIMIT 1`,
      [studentAId],
    );
    if ((row.rows[0] as any)?.id) createdScholarshipIds.push((row.rows[0] as any).id);
  });

  it("IBK-03: búsqueda por id_referencia (campo alternativo) → beca creada en DB", async () => {
    const before = await countScholarshipsForStudent(studentAId);
    const csv = buildCsv([{
      id_estudiante:   idRefA,
      tipo_beca:       "apoyo",
      valor_descuento: 25,
    }]);
    const { status, body } = await postImport(csv, tokenA);
    expect(status).toBe(200);
    expect(body.successful).toBe(1);

    const after = await countScholarshipsForStudent(studentAId);
    expect(after).toBe(before + 1);

    const row = await pool.query(
      `SELECT id FROM scholarships WHERE student_id=$1 ORDER BY id DESC LIMIT 1`,
      [studentAId],
    );
    if ((row.rows[0] as any)?.id) createdScholarshipIds.push((row.rows[0] as any).id);
  });

  it("IBK-04: CURP que no existe en ningún campus → failed:1, cero registros en DB", async () => {
    const before = await countScholarshipsForStudent(studentAId);
    const csv = buildCsv([{ curp_estudiante: CURP_NK, tipo_beca: "excelencia", valor_descuento: 50 }]);
    const { status, body } = await postImport(csv, tokenA);
    expect(status).toBe(200);
    expect(body.successful).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.errors[0]).toMatch(/no encontrado/i);

    const after = await countScholarshipsForStudent(studentAId);
    expect(after).toBe(before); // sin cambio en DB
  });

  it("IBK-05: CURP de alumno de OTRO campus del mismo tenant → failed:1, sin registro (aislamiento)", async () => {
    const beforeA = await countScholarshipsForStudent(studentAId);
    const beforeB = await countScholarshipsForStudent(studentBId);

    const csv = buildCsv([{ curp_estudiante: CURP_B, tipo_beca: "excelencia", valor_descuento: 50 }]);
    const { status, body } = await postImport(csv, tokenA); // token del campus A
    expect(status).toBe(200);
    expect(body.successful).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.errors[0]).toMatch(/no encontrado/i);

    expect(await countScholarshipsForStudent(studentAId)).toBe(beforeA);
    expect(await countScholarshipsForStudent(studentBId)).toBe(beforeB);
  });

  it("IBK-06: fila sin tipo_beca → failed:1 (validación)", async () => {
    const csv = buildCsv([{ curp_estudiante: CURP_A, valor_descuento: 50 }]);
    const { status, body } = await postImport(csv, tokenA);
    expect(status).toBe(200);
    expect(body.failed).toBe(1);
    expect(body.successful).toBe(0);
    expect(body.errors[0]).toMatch(/tipo_beca/i);
  });

  it("IBK-07: fila sin valor_descuento → failed:1 (validación)", async () => {
    const csv = buildCsv([{ curp_estudiante: CURP_A, tipo_beca: "excelencia" }]);
    const { status, body } = await postImport(csv, tokenA);
    expect(status).toBe(200);
    expect(body.failed).toBe(1);
    expect(body.successful).toBe(0);
    expect(body.errors[0]).toMatch(/valor_descuento/i);
  });

  it("IBK-08: valor_descuento fuera de rango (> 100) → failed:1 (validación)", async () => {
    const csv = buildCsv([{ curp_estudiante: CURP_A, tipo_beca: "excelencia", valor_descuento: 150 }]);
    const { status, body } = await postImport(csv, tokenA);
    expect(status).toBe(200);
    expect(body.failed).toBe(1);
    expect(body.successful).toBe(0);
    expect(body.errors[0]).toMatch(/valor_descuento/i);
  });
});
