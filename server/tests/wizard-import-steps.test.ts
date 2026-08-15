/**
 * WIS — Pruebas de integración para los 4 pasos de importación del wizard
 *
 * Verifica para cada uno de los 4 pasos (alumnos, familias, becas, adeudos):
 *   1. dry_run=true  → el servidor devuelve successful/failed pero NO escribe en DB.
 *   2. Import real   → escribe en DB, devuelve successful >= 1.
 *   3. PATCH step    → solo se llama cuando successful >= 1; el step queda marcado.
 *   4. All-fail      → successful === 0; el test NO llama PATCH;
 *                      GET confirma que el step sigue sin marcar.
 *
 * Regla crítica del wizard (punto 3 de la tarea):
 *   PATCH /api/admin/configuracion/onboarding-step/:stepId
 *   solo se invoca si el import real devolvió successful >= 1.
 *   Si todas las filas fallaron, el paso NO se marca — se le enseña al usuario
 *   el error y tiene que corregir el archivo.
 *
 * WIS-01  dry_run alumnos — 200, successful>0, cero estudiantes insertados en DB
 * WIS-02  real import alumnos — 200, successful>=1, estudiante en DB
 * WIS-03  PATCH step 'alumnos' — 200, step marcado en onboarding-status
 * WIS-04  all-fail alumnos — 200, successful=0; GET step sigue sin marcar
 * WIS-05  dry_run familias — 200, successful>0, cero guardianes insertados
 * WIS-06  real import familias — 200, successful>=1, guardián en DB
 * WIS-07  PATCH step 'familias' — step marcado
 * WIS-08  dry_run becas — 200, successful>0, cero scholarships insertadas
 * WIS-09  real import becas — 200, successful>=1, scholarship en DB
 * WIS-10  PATCH step 'becas' — step marcado
 * WIS-11  dry_run adeudos — 200, successful>0, cero charges migrados insertados
 * WIS-12  real import adeudos — 200, successful>=1, charge en DB
 * WIS-13  PATCH step 'adeudos' — step marcado
 * WIS-14  all-fail adeudos (monto=0) — successful=0; GET confirma step sigue marcado
 *          (ya fue marcado en WIS-13; el resultado es idempotente, no se desmarca)
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
    {
      id: ADMIN_ID, email: "admin@wis-test.mx",
      role: "administrador_campus",
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID,
    },
    JWT_SECRET,
    { expiresIn: "15m" },
  );
}

const TOKEN = adminToken();

// ── CURP helpers ─────────────────────────────────────────────────────────────
// CURP de exactamente 18 chars: prefijo 4 + 14 dígitos del timestamp.
const TS = Date.now();

function mkCurp(prefix: string, offset = 0): string {
  // Genera CURP de 18 chars que pasa el patrón oficial SAT.
  // prefix debe ser: letra + vocal + letra + letra (ej: "WISA", "WISB").
  // Unicidad codificada en 2 dígitos del "año" (posiciones 5-6).
  const yy = String((TS + offset) % 100).padStart(2, "0");
  return `${prefix}${yy}0101HNENNNA0`; // 4+2+4+1+2+3+1+1 = 18 ✓
}

// CURPs de los estudiantes creados por importación (para cleanup)
const CURP_ALUMNO_IMPORT   = mkCurp("WISA", 1); // creado en WIS-02
const CURP_SEED_STUDENT    = mkCurp("WISB", 2); // seed para familias/becas/adeudos
const EMAIL_GUARDIAN       = `wis-guardian-${TS}@test.mx`;

// IDs rastreados para cleanup
let seedStudentId: number;
const importedStudentCurps: string[] = [];
const importedFamilyIds:    number[] = [];
const importedGuardianIds:  number[] = [];
const importedScholarshipIds: number[] = [];
const importedChargeIds:    number[] = [];

// Pasos originales (para restaurar en afterAll)
let originalSteps: Record<string, boolean> = {};

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Guardar estado original de onboarding_steps_completados
  const r = await pool.query(
    `SELECT onboarding_steps_completados FROM campuses WHERE id = $1`,
    [CAMPUS_ID],
  );
  originalSteps = (r.rows[0] as any)?.onboarding_steps_completados ?? {};

  // Crear alumno semilla con CURP conocida para poder importar familias/becas/adeudos
  const sr = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, curp, status)
     VALUES ($1, $2, 'Alumno Semilla WIS', $3, 'activo')
     RETURNING id`,
    [CAMPUS_ID, TENANT_ID, CURP_SEED_STUDENT],
  );
  seedStudentId = (sr.rows[0] as any).id;
});

afterAll(async () => {
  // Limpiar adeudos migrados de test
  // charges NO tiene campus_id — filtrar via JOIN con students
  if (importedChargeIds.length) {
    await pool.query(
      `DELETE FROM charges WHERE id = ANY($1::int[])`,
      [importedChargeIds],
    );
  }
  // Limpiar por patrón (curp 'WIS%') por si el tracking falló
  await pool.query(
    `DELETE FROM charges
     WHERE es_adeudo_migrado = TRUE
       AND student_id IN (
         SELECT id FROM students WHERE curp LIKE 'WIS%' AND tenant_id = $1
       )`,
    [TENANT_ID],
  );

  // Limpiar becas
  if (importedScholarshipIds.length) {
    await pool.query(
      `DELETE FROM scholarships WHERE id = ANY($1::int[])`,
      [importedScholarshipIds],
    );
  }
  await pool.query(
    `DELETE FROM scholarships
     WHERE tenant_id = $1
       AND student_id IN (
         SELECT id FROM students WHERE curp LIKE 'WIS%' AND tenant_id = $1
       )`,
    [TENANT_ID],
  );

  // Limpiar vínculos y familias
  if (importedFamilyIds.length) {
    await pool.query(`DELETE FROM family_students WHERE family_id = ANY($1::int[])`, [importedFamilyIds]);
    await pool.query(`DELETE FROM families WHERE id = ANY($1::int[])`, [importedFamilyIds]);
  }

  // Limpiar guardianes importados
  if (importedGuardianIds.length) {
    await pool.query(`DELETE FROM student_guardian WHERE guardian_id = ANY($1::int[])`, [importedGuardianIds]);
    await pool.query(`DELETE FROM guardians WHERE id = ANY($1::int[])`, [importedGuardianIds]);
  }
  await pool.query(
    `DELETE FROM guardians
     WHERE campus_id = $1 AND correo_institucional_familiar ILIKE '%wis%'`,
    [CAMPUS_ID],
  );

  // Limpiar alumnos importados + semilla
  await pool.query(
    `DELETE FROM students WHERE curp LIKE 'WIS%' AND tenant_id = $1`,
    [TENANT_ID],
  );

  // Restaurar onboarding_steps_completados al estado original
  await pool.query(
    `UPDATE campuses SET onboarding_steps_completados = $1 WHERE id = $2`,
    [originalSteps, CAMPUS_ID],
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postImport(
  endpoint: string,
  csvContent: string,
  dryRun = false,
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append("file", new Blob([csvContent], { type: "text/csv" }), "test.csv");
  const url = `${BASE}${endpoint}${dryRun ? "?dry_run=true" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

async function patchStep(stepId: string): Promise<{ status: number; body: any }> {
  const res = await fetch(
    `${BASE}/api/admin/configuracion/onboarding-step/${stepId}`,
    { method: "PATCH", headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  return { status: res.status, body: await res.json() };
}

/** Verificación de pasos directamente en DB — no consume quota del rate limiter. */
async function getStepsFromDB(): Promise<Record<string, boolean>> {
  const r = await pool.query(
    `SELECT onboarding_steps_completados FROM campuses WHERE id = $1`,
    [CAMPUS_ID],
  );
  return (r.rows[0] as any)?.onboarding_steps_completados ?? {};
}

// ── CSV builders ──────────────────────────────────────────────────────────────

function csvAlumnos(rows: Array<{ nombre: string; curp: string }>): string {
  const header = "nombre_completo,curp,grado,grupo,nivel_academico,status";
  const lines  = rows.map(r => `${r.nombre},${r.curp},3ro,A,SECUNDARIA,activo`);
  return [header, ...lines].join("\n");
}

function csvAlumnosAllFail(): string {
  // Filas sin CURP — el endpoint rechaza toda fila sin nombre_completo + curp
  const header = "nombre_completo,curp";
  return `${header}\nAlumno Sin CURP,\nOtro Sin CURP,`;
}

function csvFamilias(curpAlumno: string, emailTutor: string): string {
  const header = [
    "nombre_familia", "id_referencia_alumno", "curp_alumno",
    "tipo_guardian", "nombres_tutor", "apellido_paterno_tutor", "apellido_materno_tutor",
    "curp_tutor", "email_tutor", "celular_tutor", "es_responsable_pago", "porcentaje_responsabilidad",
  ].join(",");
  const row = [
    "Familia WIS Test", "", curpAlumno,
    "padre", "Tutor WIS", "Apellido WIS", "",
    "", emailTutor, "", "true", "100",
  ].join(",");
  return `${header}\n${row}`;
}

function csvBecas(curpAlumno: string): string {
  const header = "id_estudiante,curp_estudiante,nombre_estudiante,tipo_beca,tipo_descuento,valor_descuento,vigencia_inicio,vigencia_fin,observaciones";
  const row    = `,${curpAlumno},Alumno Semilla WIS,Beca WIS Test,porcentaje,10,2026-01-01,2026-12-31,Test`;
  return `${header}\n${row}`;
}

function csvAdeudos(curpAlumno: string): string {
  const header = "id_estudiante,curp_estudiante,tipo_concepto,monto_centavos,fecha_vencimiento,ciclo_escolar,descripcion";
  const row    = `,${curpAlumno},colegiatura,50000,2025-12-31,2025-2026,Adeudo WIS migrado`;
  return `${header}\n${row}`;
}

function csvAdeudosMontoInvalido(curpAlumno: string): string {
  // monto_centavos = 0 → inválido → todas las filas fallan
  const header = "id_estudiante,curp_estudiante,tipo_concepto,monto_centavos,fecha_vencimiento,ciclo_escolar,descripcion";
  const row    = `,${curpAlumno},colegiatura,0,2025-12-31,2025-2026,Adeudo monto invalido`;
  return `${header}\n${row}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// ALUMNOS (estudiantes/estudiantes)
// ═════════════════════════════════════════════════════════════════════════════

describe("WIS — Paso alumnos (estudiantes/estudiantes)", () => {

  it("WIS-01: dry_run=true → successful>0 y CERO estudiantes insertados en DB", async () => {
    const csv = csvAlumnos([{ nombre: "Alumno WIS DryRun", curp: CURP_ALUMNO_IMPORT }]);
    const { status, body } = await postImport(
      "/api/import/data/estudiantes/estudiantes", csv, true
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThan(0);
    expect(body.committed).toBe(false);

    // Verificar que NO se insertó en la DB
    const r = await pool.query(
      `SELECT id FROM students WHERE curp = $1 AND tenant_id = $2`,
      [CURP_ALUMNO_IMPORT, TENANT_ID],
    );
    expect(r.rowCount).toBe(0); // dry_run: cero escrituras
  });

  it("WIS-02: import real → successful>=1, estudiante visible en DB", async () => {
    const csv = csvAlumnos([{ nombre: "Alumno WIS Real", curp: CURP_ALUMNO_IMPORT }]);
    const { status, body } = await postImport(
      "/api/import/data/estudiantes/estudiantes", csv, false
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThanOrEqual(1);
    importedStudentCurps.push(CURP_ALUMNO_IMPORT);

    // Verificar que SÍ se insertó en la DB
    const r = await pool.query(
      `SELECT id, nombre_completo FROM students WHERE curp = $1 AND tenant_id = $2`,
      [CURP_ALUMNO_IMPORT, TENANT_ID],
    );
    expect(r.rowCount).toBe(1);
    expect((r.rows[0] as any).nombre_completo).toBe("Alumno WIS Real");
  });

  it("WIS-03: PATCH step 'alumnos' (solo porque successful>=1 en WIS-02) → step marcado", async () => {
    const { status, body } = await patchStep("alumnos");
    expect(status).toBe(200);
    expect(body.steps).toBeDefined();

    // Verificar en DB directamente (no consume quota del rate limiter)
    const steps = await getStepsFromDB();
    expect(steps["alumnos"]).toBe(true);
  });

  it("WIS-04: all-fail (todas las filas sin CURP) → successful=0; step NO se marca (PATCH no se invoca)", async () => {
    const stepsBefore = await getStepsFromDB();

    const { status, body } = await postImport(
      "/api/import/data/estudiantes/estudiantes", csvAlumnosAllFail(), false
    );
    expect(status).toBe(200);
    expect(body.successful).toBe(0);
    expect(body.failed).toBeGreaterThan(0);

    // El test NO llama PATCH (simulando la lógica del cliente: if successful>=1 → PATCH)
    const stepsAfter = await getStepsFromDB();
    expect(stepsAfter["alumnos"]).toBe(stepsBefore["alumnos"]); // sin cambio
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// FAMILIAS (familias/tutores)
// ═════════════════════════════════════════════════════════════════════════════

describe("WIS — Paso familias (familias/tutores)", () => {

  it("WIS-05: dry_run=true → successful>0 y CERO guardianes insertados en DB", async () => {
    const emailDryRun = `wis-dry-${TS}@test.mx`;
    const csv = csvFamilias(CURP_SEED_STUDENT, emailDryRun);
    const { status, body } = await postImport(
      "/api/import/data/familias/tutores", csv, true
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThan(0);
    expect(body.committed).toBe(false);

    // Verificar que NO se insertó guardián
    const r = await pool.query(
      `SELECT id FROM guardians WHERE correo_institucional_familiar = $1`,
      [emailDryRun],
    );
    expect(r.rowCount).toBe(0);
  });

  it("WIS-06: import real familias → successful>=1, guardián y familia en DB", async () => {
    const csv = csvFamilias(CURP_SEED_STUDENT, EMAIL_GUARDIAN);
    const { status, body } = await postImport(
      "/api/import/data/familias/tutores", csv, false
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThanOrEqual(1);

    // Verificar guardián en DB
    const gr = await pool.query(
      `SELECT id FROM guardians WHERE correo_institucional_familiar = $1 AND campus_id = $2`,
      [EMAIL_GUARDIAN, CAMPUS_ID],
    );
    expect(gr.rowCount).toBeGreaterThanOrEqual(1);
    for (const row of gr.rows) importedGuardianIds.push((row as any).id);

    // Verificar familia en DB
    const fr = await pool.query(
      `SELECT id FROM families WHERE campus_id = $1 AND nombre ILIKE '%WIS%'`,
      [CAMPUS_ID],
    );
    for (const row of fr.rows) importedFamilyIds.push((row as any).id);
  });

  it("WIS-07: PATCH step 'familias' → step marcado en DB", async () => {
    const { status } = await patchStep("familias");
    expect(status).toBe(200);
    const steps = await getStepsFromDB();
    expect(steps["familias"]).toBe(true);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// BECAS (becas/asignaciones)
// ═════════════════════════════════════════════════════════════════════════════

describe("WIS — Paso becas (becas/asignaciones)", () => {

  it("WIS-08: dry_run=true → successful>0 y CERO scholarships insertadas en DB", async () => {
    const csv = csvBecas(CURP_SEED_STUDENT);
    const { status, body } = await postImport(
      "/api/import/data/becas/asignaciones", csv, true
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThan(0);
    expect(body.committed).toBe(false);

    // Verificar que NO se insertó scholarship
    const r = await pool.query(
      `SELECT s.id FROM scholarships s
       JOIN students st ON st.id = s.student_id
       WHERE st.curp = $1 AND st.tenant_id = $2`,
      [CURP_SEED_STUDENT, TENANT_ID],
    );
    expect(r.rowCount).toBe(0);
  });

  it("WIS-09: import real becas → successful>=1, scholarship en DB", async () => {
    const csv = csvBecas(CURP_SEED_STUDENT);
    const { status, body } = await postImport(
      "/api/import/data/becas/asignaciones", csv, false
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThanOrEqual(1);

    // Verificar scholarship en DB
    const r = await pool.query(
      `SELECT s.id, s.porcentaje FROM scholarships s
       JOIN students st ON st.id = s.student_id
       WHERE st.curp = $1 AND st.tenant_id = $2`,
      [CURP_SEED_STUDENT, TENANT_ID],
    );
    expect(r.rowCount).toBeGreaterThanOrEqual(1);
    expect(Number((r.rows[0] as any).porcentaje)).toBe(10);
    for (const row of r.rows) importedScholarshipIds.push((row as any).id);
  });

  it("WIS-10: PATCH step 'becas' → step marcado", async () => {
    const { status } = await patchStep("becas");
    expect(status).toBe(200);
    const steps = await getStepsFromDB();
    expect(steps["becas"]).toBe(true);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// ADEUDOS (adeudos/migrados)
// ═════════════════════════════════════════════════════════════════════════════

describe("WIS — Paso adeudos (adeudos/migrados)", () => {

  it("WIS-11: dry_run=true → successful>0 y CERO charges migrados insertados en DB", async () => {
    const csv = csvAdeudos(CURP_SEED_STUDENT);

    // Contar charges migrados ANTES del dry_run (campus_id NO existe en charges — JOIN via students)
    const before = await pool.query(
      `SELECT count(*) FROM charges c
       JOIN students st ON st.id = c.student_id
       WHERE st.campus_id = $1 AND c.es_adeudo_migrado = TRUE`,
      [CAMPUS_ID],
    );
    const countBefore = parseInt((before.rows[0] as any).count, 10);

    const { status, body } = await postImport(
      "/api/import/data/adeudos/migrados", csv, true
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThan(0);
    expect(body.committed).toBe(false);

    // Verificar CERO nuevos charges migrados (campus_id NO existe en charges — JOIN via students)
    const after = await pool.query(
      `SELECT count(*) FROM charges c
       JOIN students st ON st.id = c.student_id
       WHERE st.campus_id = $1 AND c.es_adeudo_migrado = TRUE`,
      [CAMPUS_ID],
    );
    const countAfter = parseInt((after.rows[0] as any).count, 10);
    expect(countAfter).toBe(countBefore); // dry_run: sin cambios
  });

  it("WIS-12: import real adeudos → successful>=1, charge con es_adeudo_migrado=TRUE en DB", async () => {
    const csv = csvAdeudos(CURP_SEED_STUDENT);
    const { status, body } = await postImport(
      "/api/import/data/adeudos/migrados", csv, false
    );
    expect(status).toBe(200);
    expect(body.successful).toBeGreaterThanOrEqual(1);

    // Verificar charge migrado en DB (columna real: monto_base_centavos, no monto_centavos)
    const r = await pool.query(
      `SELECT c.id, c.monto_base_centavos, c.es_adeudo_migrado
       FROM charges c
       JOIN students st ON st.id = c.student_id
       WHERE st.curp = $1 AND st.tenant_id = $2
         AND c.es_adeudo_migrado = TRUE
       ORDER BY c.id DESC LIMIT 1`,
      [CURP_SEED_STUDENT, TENANT_ID],
    );
    expect(r.rowCount).toBeGreaterThanOrEqual(1);
    expect(Number((r.rows[0] as any).monto_base_centavos)).toBe(50000); // PG devuelve string
    expect((r.rows[0] as any).es_adeudo_migrado).toBe(true);
    importedChargeIds.push((r.rows[0] as any).id);
  });

  it("WIS-13: PATCH step 'adeudos' → step marcado en DB", async () => {
    const { status } = await patchStep("adeudos");
    expect(status).toBe(200);
    const steps = await getStepsFromDB();
    expect(steps["adeudos"]).toBe(true);
  });

  it("WIS-14: all-fail adeudos (monto=0) → successful=0; test NO llama PATCH; step sigue marcado (idempotente)", async () => {
    // El step ya fue marcado en WIS-13 — verificamos que un import fallido
    // NO desmarca un step previamente completado (el PATCH es additive, no destructivo).
    const stepsBefore = await getStepsFromDB();
    expect(stepsBefore["adeudos"]).toBe(true); // confirmación de WIS-13

    const csv = csvAdeudosMontoInvalido(CURP_SEED_STUDENT);
    const { status, body } = await postImport(
      "/api/import/data/adeudos/migrados", csv, false
    );
    expect(status).toBe(200);
    expect(body.successful).toBe(0);
    expect(body.failed).toBeGreaterThan(0);

    // El test NO llama PATCH (simulando lógica del cliente: if successful>=1 → PATCH)
    // El step 'adeudos' debe seguir marcado (PATCH additive no lo puede desmarcar)
    const stepsAfter = await getStepsFromDB();
    expect(stepsAfter["adeudos"]).toBe(true); // no se alteró
  });

});
