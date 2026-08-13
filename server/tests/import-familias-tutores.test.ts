/**
 * POST /api/import/data/familias/tutores — import masivo de familias
 *
 * Reutiliza createFamily() vía client externo: los grupos exitosos se
 * acumulan en la transacción exterior; los errores de negocio (422) del
 * servicio solo fallan el grupo sin abortar el resto.
 *
 * IFT-00   Sin token → 401
 * IFT-00b  Asistente (sin FAMILIES.CREATE) → 403
 * IFT-01   CSV con 2 alumnos del mismo grupo (2 filas) → 1 familia creada
 *          con ambos alumnos, successful=2, verified en DB
 * IFT-02   CSV con 2 grupos: uno válido (1 fila) + uno con alumnos en
 *          familias distintas (2 filas) → el grupo válido succeeds,
 *          el conflicto falla (failed=2), el válido se conserva en DB
 * IFT-03   dry_run=true → committed=false, cero escrituras en DB
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TENANT_ID  = 29;
const CAMPUS_ID  = 48;
const ADMIN_ID   = 80;

// ── Tokens ────────────────────────────────────────────────────────────────────
function makeToken(role: string): string {
  return jwt.sign(
    { id: ADMIN_ID, email: `${role}@ift-test.mx`, role,
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}
const tokenAdmin    = makeToken("administrador_campus");
const tokenAsistente = makeToken("asistente");

// ── Fixtures ─────────────────────────────────────────────────────────────────
let studentAId: number; // IFT-01, IFT-03: alumno libre (no tiene familia al inicio)
let studentBId: number; // IFT-01: segundo alumno mismo grupo
let studentCId: number; // IFT-02 conflicto: en familyX
let studentDId: number; // IFT-02 conflicto: en familyY
let studentFreeId: number; // IFT-02 success group: alumno sin familia

let preFamilyXId: number; // pre-existente para studentC
let preFamilyYId: number; // pre-existente para studentD

// IDs creados durante tests (para limpieza)
const created = {
  familyIds:   [] as number[],
  guardianIds: [] as number[],
  studentIds:  [] as number[],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildCsv(rows: Record<string, string | number | boolean>[]): string {
  const COLS = [
    "nombre_familia","id_referencia_alumno","curp_alumno",
    "tipo_guardian","nombres_tutor","apellido_paterno_tutor","apellido_materno_tutor",
    "curp_tutor","email_tutor","celular_tutor","es_responsable_pago","porcentaje_responsabilidad",
  ];
  const lines = rows.map(r => COLS.map(c => r[c] ?? "").join(","));
  return [COLS.join(","), ...lines].join("\n");
}

async function postImport(
  csvContent: string,
  token?: string,
  dryRun = false,
) {
  const form = new FormData();
  form.append("file", new Blob([csvContent], { type: "text/csv" }), "familias.csv");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const url = `${BASE}/api/import/data/familias/tutores${dryRun ? "?dry_run=true" : ""}`;
  const res = await fetch(url, { method: "POST", headers, body: form });
  return { status: res.status, body: await res.json() as any };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now();

  // Alumnos libres (sin familia inicial)
  const sa = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno IFT A','IFT-A-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentAId = (sa.rows[0] as any).id;

  const sb = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno IFT B','IFT-B-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentBId = (sb.rows[0] as any).id;

  // Alumno para el success group de IFT-02 (sin familia)
  const sf = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno IFT Free','IFT-FREE-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentFreeId = (sf.rows[0] as any).id;

  // Alumnos en familias distintas (para IFT-02 conflicto)
  const sc = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno IFT C','IFT-C-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentCId = (sc.rows[0] as any).id;

  const sd = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno IFT D','IFT-D-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentDId = (sd.rows[0] as any).id;

  // Familia X → studentC
  const fx = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre)
     VALUES ($1,$2,'Familia X IFT') RETURNING id`,
    [TENANT_ID, CAMPUS_ID],
  );
  preFamilyXId = (fx.rows[0] as any).id;
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2)`,
    [preFamilyXId, studentCId],
  );

  // Familia Y → studentD
  const fy = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre)
     VALUES ($1,$2,'Familia Y IFT') RETURNING id`,
    [TENANT_ID, CAMPUS_ID],
  );
  preFamilyYId = (fy.rows[0] as any).id;
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2)`,
    [preFamilyYId, studentDId],
  );
});

afterAll(async () => {
  const allStudents = [studentAId, studentBId, studentCId, studentDId, studentFreeId].filter(Boolean);

  if (allStudents.length) {
    await pool.query(`DELETE FROM student_guardian WHERE student_id = ANY($1::int[])`, [allStudents]);
    await pool.query(`DELETE FROM family_students  WHERE student_id = ANY($1::int[])`, [allStudents]);
  }

  const allFamilies = [preFamilyXId, preFamilyYId, ...created.familyIds].filter(Boolean);
  if (allFamilies.length) {
    await pool.query(`DELETE FROM family_students WHERE family_id = ANY($1::int[])`, [allFamilies]);
    await pool.query(`DELETE FROM families WHERE id = ANY($1::int[])`, [allFamilies]);
  }

  if (created.guardianIds.length) {
    await pool.query(`DELETE FROM guardians WHERE id = ANY($1::int[])`, [created.guardianIds]);
  }

  if (allStudents.length) {
    await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [allStudents]);
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("POST /api/import/data/familias/tutores", () => {
  it("IFT-00: sin token → 401", async () => {
    const csv = buildCsv([{ nombre_familia: "F", id_referencia_alumno: "x",
      nombres_tutor: "T", email_tutor: "t@t.mx", es_responsable_pago: "true" }]);
    const { status } = await postImport(csv);
    expect(status).toBe(401);
  });

  it("IFT-00b: asistente (sin FAMILIES.CREATE) → 403", async () => {
    const csv = buildCsv([{ nombre_familia: "F", id_referencia_alumno: "x",
      nombres_tutor: "T", email_tutor: "t@t.mx", es_responsable_pago: "true" }]);
    const { status } = await postImport(csv, tokenAsistente);
    expect(status).toBe(403);
  });

  it("IFT-01: 2 filas, misma familia, 2 alumnos, 1 tutor → " +
     "1 familia creada, ambos alumnos vinculados, successful=2", async () => {
    const ts = Date.now();
    const tutorEmail = `ift01-tutor-${ts}@test.mx`;

    // Cada fila = 1 alumno + 1 tutor (mismo tutor para ambos → se deduplicará en el import)
    const csv = buildCsv([
      {
        nombre_familia:      "Familia IFT-01",
        id_referencia_alumno: `IFT-A-${ts - 1}`, // se resuelve por id_referencia del student
        tipo_guardian:       "padre",
        nombres_tutor:       "Tutor IFT01",
        apellido_paterno_tutor: "García",
        email_tutor:         tutorEmail,
        es_responsable_pago: "true",
      },
      {
        nombre_familia:      "Familia IFT-01",
        id_referencia_alumno: `IFT-B-${ts - 1}`,
        tipo_guardian:       "padre",
        nombres_tutor:       "Tutor IFT01",
        apellido_paterno_tutor: "García",
        email_tutor:         tutorEmail,
        es_responsable_pago: "true",
      },
    ]);

    // Los id_referencia de los alumnos de test se generaron con `Date.now()` en beforeAll.
    // Los reemplazamos con los reales:
    const csvReal = buildCsv([
      {
        nombre_familia:      "Familia IFT-01",
        id_referencia_alumno: `IFT-A-${Object.keys({}).length}`, // placeholder — ver abajo
        tipo_guardian:       "padre",
        nombres_tutor:       "Tutor IFT01",
        apellido_paterno_tutor: "García",
        email_tutor:         tutorEmail,
        es_responsable_pago: "true",
      },
    ]);
    void csvReal; // unused — usaremos el student_id directo vía CURP workaround

    // Usar CURP lookup: los alumnos de test no tienen CURP, pero tienen id_referencia.
    // Buscamos el id_referencia real en la DB.
    const refA = await pool.query(`SELECT id_referencia FROM students WHERE id = $1`, [studentAId]);
    const refB = await pool.query(`SELECT id_referencia FROM students WHERE id = $1`, [studentBId]);
    const idRefA = (refA.rows[0] as any).id_referencia as string;
    const idRefB = (refB.rows[0] as any).id_referencia as string;

    const csvFinal = buildCsv([
      {
        nombre_familia:       "Familia IFT-01",
        id_referencia_alumno: idRefA,
        tipo_guardian:        "padre",
        nombres_tutor:        "Tutor IFT01",
        apellido_paterno_tutor: "García",
        email_tutor:          tutorEmail,
        es_responsable_pago:  "true",
      },
      {
        nombre_familia:       "Familia IFT-01",
        id_referencia_alumno: idRefB,
        tipo_guardian:        "padre",
        nombres_tutor:        "Tutor IFT01",
        apellido_paterno_tutor: "García",
        email_tutor:          tutorEmail,
        es_responsable_pago:  "true",
      },
    ]);

    const { status, body } = await postImport(csvFinal, tokenAdmin);

    expect(status).toBe(200);
    expect(body.successful).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.committed).toBe(true);

    // Registrar family y guardian para afterAll
    // La familia se detecta buscando en DB:
    const famRow = await pool.query(
      `SELECT fs.family_id FROM family_students fs
       WHERE fs.student_id = $1`,
      [studentAId],
    );
    expect((famRow.rows as any[]).length).toBe(1);
    const newFamilyId = (famRow.rows[0] as any).family_id as number;
    created.familyIds.push(newFamilyId);

    // Ambos alumnos en la misma familia
    const fsB = await pool.query(
      `SELECT 1 FROM family_students WHERE family_id = $1 AND student_id = $2`,
      [newFamilyId, studentBId],
    );
    expect((fsB.rows as any[]).length).toBe(1);

    // Tutor creado y vinculado a ambos alumnos
    const guardRow = await pool.query(
      `SELECT id FROM guardians WHERE (correo_institucional_familiar = $1 OR email = $1) AND tenant_id = $2`,
      [tutorEmail, TENANT_ID],
    );
    expect((guardRow.rows as any[]).length).toBe(1);
    const gId = (guardRow.rows[0] as any).id as number;
    created.guardianIds.push(gId);

    const sgA = await pool.query(
      `SELECT 1 FROM student_guardian WHERE student_id = $1 AND guardian_id = $2`,
      [studentAId, gId],
    );
    const sgB = await pool.query(
      `SELECT 1 FROM student_guardian WHERE student_id = $1 AND guardian_id = $2`,
      [studentBId, gId],
    );
    expect((sgA.rows as any[]).length).toBe(1);
    expect((sgB.rows as any[]).length).toBe(1);
  });

  it("IFT-02: CSV con 2 grupos — grupo válido (1 fila) + grupo conflicto " +
     "(alumnos en familias distintas, 2 filas) → successful=1, failed=2, " +
     "grupo válido en DB, grupo conflicto no escrito", async () => {
    const ts = Date.now();

    const refFree = await pool.query(`SELECT id_referencia FROM students WHERE id = $1`, [studentFreeId]);
    const refC    = await pool.query(`SELECT id_referencia FROM students WHERE id = $1`, [studentCId]);
    const refD    = await pool.query(`SELECT id_referencia FROM students WHERE id = $1`, [studentDId]);
    const idFree  = (refFree.rows[0] as any).id_referencia as string;
    const idRefC  = (refC.rows[0] as any).id_referencia as string;
    const idRefD  = (refD.rows[0] as any).id_referencia as string;

    const tutorFreeEmail    = `ift02-free-${ts}@test.mx`;
    const tutorConflictEmail = `ift02-conflict-${ts}@test.mx`;

    const csv = buildCsv([
      // Grupo válido (1 fila, alumno sin familia)
      {
        nombre_familia:       "Familia IFT-02-OK",
        id_referencia_alumno: idFree,
        tipo_guardian:        "madre",
        nombres_tutor:        "Tutor IFT02 OK",
        email_tutor:          tutorFreeEmail,
        es_responsable_pago:  "true",
      },
      // Grupo conflicto (2 filas — studentC en familyX, studentD en familyY)
      {
        nombre_familia:       "Familia IFT-02-CONFLICT",
        id_referencia_alumno: idRefC,
        tipo_guardian:        "padre",
        nombres_tutor:        "Tutor IFT02 Conflict",
        email_tutor:          tutorConflictEmail,
        es_responsable_pago:  "true",
      },
      {
        nombre_familia:       "Familia IFT-02-CONFLICT",
        id_referencia_alumno: idRefD,
        tipo_guardian:        "padre",
        nombres_tutor:        "Tutor IFT02 Conflict",
        email_tutor:          tutorConflictEmail,
        es_responsable_pago:  "true",
      },
    ]);

    const familyCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    const nBefore = Number((familyCountBefore.rows[0] as any).n);

    const { status, body } = await postImport(csv, tokenAdmin);

    expect(status).toBe(200);
    expect(body.successful).toBe(1);  // grupo OK: 1 fila
    expect(body.failed).toBe(2);       // grupo conflicto: 2 filas
    expect(body.committed).toBe(true);
    // El error del grupo conflicto debe estar en errors[]
    expect(body.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(body.errors)).toMatch(/familia|familia|distintas|conflict/i);

    // Solo 1 familia nueva creada (la del grupo OK)
    const familyCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    expect(Number((familyCountAfter.rows[0] as any).n)).toBe(nBefore + 1);

    // El tutor del grupo OK fue creado
    const tutorOkRow = await pool.query(
      `SELECT id FROM guardians WHERE (correo_institucional_familiar = $1 OR email = $1) AND tenant_id = $2`,
      [tutorFreeEmail, TENANT_ID],
    );
    expect((tutorOkRow.rows as any[]).length).toBe(1);
    created.guardianIds.push((tutorOkRow.rows[0] as any).id);

    // studentFree está en la nueva familia
    const fsFree = await pool.query(
      `SELECT family_id FROM family_students WHERE student_id = $1`,
      [studentFreeId],
    );
    expect((fsFree.rows as any[]).length).toBe(1);
    created.familyIds.push((fsFree.rows[0] as any).family_id);

    // El tutor del conflicto NO fue creado
    const tutorConflictRow = await pool.query(
      `SELECT id FROM guardians WHERE (correo_institucional_familiar = $1 OR email = $1) AND tenant_id = $2`,
      [tutorConflictEmail, TENANT_ID],
    );
    expect((tutorConflictRow.rows as any[]).length).toBe(0);

    // studentC y studentD siguen en sus familias originales (no cambiaron)
    const fsC = await pool.query(
      `SELECT family_id FROM family_students WHERE student_id = $1`,
      [studentCId],
    );
    expect((fsC.rows[0] as any).family_id).toBe(preFamilyXId);

    const fsD = await pool.query(
      `SELECT family_id FROM family_students WHERE student_id = $1`,
      [studentDId],
    );
    expect((fsD.rows[0] as any).family_id).toBe(preFamilyYId);
  });

  it("IFT-03: dry_run=true → committed=false, cero escrituras en DB", async () => {
    const ts = Date.now();

    // Crear un alumno extra ad-hoc para tener un alumno limpio
    const sDry = await pool.query(
      `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
       VALUES ($1,$2,'Alumno IFT Dry','IFT-DRY-${ts}','activo') RETURNING id, id_referencia`,
      [CAMPUS_ID, TENANT_ID],
    );
    const dryStudentId = (sDry.rows[0] as any).id as number;
    const dryStudentRef = (sDry.rows[0] as any).id_referencia as string;

    const familyCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    const guardianCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM guardians WHERE tenant_id = $1`,
      [TENANT_ID],
    );

    const dryEmail = `ift03-dry-${ts}@test.mx`;
    const csv = buildCsv([
      {
        nombre_familia:       "Familia IFT-03-DRY",
        id_referencia_alumno: dryStudentRef,
        tipo_guardian:        "tutor",
        nombres_tutor:        "Tutor Dry IFT03",
        email_tutor:          dryEmail,
        es_responsable_pago:  "true",
      },
    ]);

    const { status, body } = await postImport(csv, tokenAdmin, /* dryRun= */ true);

    expect(status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.successful).toBe(1); // validación pasó
    expect(body.failed).toBe(0);

    // Sin familia nueva en DB
    const familyCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    expect(Number((familyCountAfter.rows[0] as any).n)).toBe(
      Number((familyCountBefore.rows[0] as any).n),
    );

    // Sin guardian nuevo en DB
    const guardianCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM guardians WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    expect(Number((guardianCountAfter.rows[0] as any).n)).toBe(
      Number((guardianCountBefore.rows[0] as any).n),
    );

    // Alumno sin familia
    const fsRow = await pool.query(
      `SELECT 1 FROM family_students WHERE student_id = $1`,
      [dryStudentId],
    );
    expect((fsRow.rows as any[]).length).toBe(0);

    // Cleanup ad-hoc student
    await pool.query(`DELETE FROM students WHERE id = $1`, [dryStudentId]);
  });
});
