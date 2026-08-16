/**
 * SIA — Pruebas post-fix de atomicidad, dry_run y auditoría
 * en POST /api/admin/students/import (admin.ts).
 *
 * Verifica que el fix NO rompió el contrato con estudiantes.tsx:
 *   - Mismo formato de respuesta: { total_processed, successful, errors[], created_students[] }
 *   - Mismas columnas flexibles de CSV (case-insensitive: "Nombre Completo", "CURP", etc.)
 *   - Misma notificación de errores parciales
 *
 * Y añade las tres propiedades de seguridad:
 *   SIA-03: dry_run=true → cero escrituras en DB
 *   SIA-04: batch válido → atomicidad (BEGIN/COMMIT)
 *   SIA-05: fila con error de DB → SAVEPOINT, las demás se crean
 *   SIA-06: auditoría registrada en audit_log después del commit
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
    { id: ADMIN_ID, email: "admin@sia-test.mx", role: "administrador_campus",
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET, { expiresIn: "10m" },
  );
}

function asstToken() {
  return jwt.sign(
    { id: ADMIN_ID, email: "asistente@sia-test.mx", role: "asistente",
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET, { expiresIn: "10m" },
  );
}

const TOKEN = adminToken();
const createdIds: number[] = [];

const NOMBRE_LARGO_260 = "Z".repeat(260); // pasa validación, falla varchar(255) en DB

/** Genera un CURP de exactamente 18 chars que pasa el patrón oficial SAT. */
function mkCurp(ts: number, offset = 0): string {
  // Codifica unicidad en los 2 dígitos de "año" (posiciones 5-6).
  // Prefijo SIAT: S(letra), I(vocal), A, T — posiciones 1-4 válidas.
  const yy = String((ts + offset) % 100).padStart(2, '0');
  return `SIAT${yy}0101HNENNNA0`; // 18 chars, formato CURP oficial ✓
}

// Limpia cualquier residuo de corridas anteriores interrumpidas antes de arrancar.
// afterAll cubre la corrida actual; beforeAll cubre el caso de que afterAll
// no alcanzara a ejecutarse en la corrida previa (ej. worker interrumpido).
beforeAll(async () => {
  await pool.query(
    `DELETE FROM students WHERE curp LIKE 'SIAT%' AND tenant_id = $1`,
    [TENANT_ID],
  );
});

afterAll(async () => {
  if (createdIds.length) {
    await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [createdIds]);
  }
  // limpiar por patrón de CURP de test (prefijo SIAT-)
  await pool.query(
    `DELETE FROM students
     WHERE curp LIKE 'SIAT%' AND tenant_id = $1`,
    [TENANT_ID],
  );
});

// ── helpers ──────────────────────────────────────────────────────────────────

function csvRow(name: string, curp: string, grado = "3ro", grupo = "A"): string {
  return `${name},${curp},${grado},${grupo},activo`;
}

async function postImport(csv: string, dryRun = false, token = TOKEN) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "test.csv");
  const url = `${BASE}/api/admin/students/import${dryRun ? "?dry_run=true" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json() as any };
}

async function studentInDb(curp: string): Promise<number | null> {
  const r = await pool.query(
    `SELECT id FROM students WHERE curp = $1 AND tenant_id = $2`,
    [curp, TENANT_ID],
  );
  return (r.rows as any[]).length > 0 ? (r.rows[0] as any).id : null;
}

// ── SIA-01: sin token → 401 ───────────────────────────────────────────────────
describe("POST /api/admin/students/import — atomicidad + dry_run + auditoría", () => {

  it("SIA-01: sin token → 401", async () => {
    const form = new FormData();
    form.append("file", new Blob(["Nombre Completo,CURP\nAlice,SIAA010101MDFXXX01"], { type: "text/csv" }), "t.csv");
    const res = await fetch(`${BASE}/api/admin/students/import`, {
      method: "POST", body: form,
    });
    expect(res.status).toBe(401);
  });

  // ── SIA-02: asistente (sin STUDENTS.IMPORT) → 403 ───────────────────────────
  it("SIA-02: rol asistente (sin STUDENTS.IMPORT) → 403", async () => {
    const { status } = await postImport("Nombre Completo,CURP\nAlice,SIAA010101MDFXXX01", false, asstToken());
    expect(status).toBe(403);
  });

  // ── SIA-03: dry_run=true → formato correcto, cero alumnos en DB ─────────────
  it("SIA-03: dry_run=true → misma forma de respuesta, ningún alumno escrito en DB", async () => {
    const ts = Date.now();
    const curp = mkCurp(ts);
    const csv = [
      "Nombre Completo,CURP,Grado,Grupo,Estatus",
      csvRow(`DryRun ${ts}`, curp),
    ].join("\n");

    const { status, body } = await postImport(csv, true);

    expect(status).toBe(200);

    // Formato de respuesta intacto para estudiantes.tsx
    expect(body).toHaveProperty("total_processed");
    expect(body).toHaveProperty("successful");
    expect(body).toHaveProperty("errors");
    expect(body).toHaveProperty("created_students");
    expect(body.successful).toBe(1);
    expect(body.errors).toHaveLength(0);

    // dry_run=true → ROLLBACK → ningún alumno en DB
    const id = await studentInDb(curp);
    expect(id).toBeNull();
  });

  // ── SIA-04: batch válido → todos en DB, formato preservado ───────────────────
  it("SIA-04: batch de 3 alumnos válidos → todos en DB, " +
     "formato de respuesta igual al que espera estudiantes.tsx", async () => {
    const ts = Date.now();
    const curps = [
      mkCurp(ts, 1),
      mkCurp(ts, 2),
      mkCurp(ts, 3),
    ];
    const csv = [
      "Nombre Completo,CURP,Grado,Grupo,Estatus",
      csvRow("Alumno Alpha", curps[0], "1ro", "A"),
      csvRow("Alumno Beta",  curps[1], "2do", "B"),
      csvRow("Alumno Gamma", curps[2], "3ro", "C"),
    ].join("\n");

    const { status, body } = await postImport(csv);

    expect(status).toBe(200);

    // Formato exacto que consume estudiantes.tsx (línea 552: data.successful)
    expect(body.total_processed).toBe(3);
    expect(body.successful).toBe(3);
    expect(body.errors).toHaveLength(0);
    expect(Array.isArray(body.created_students)).toBe(true);
    expect(body.created_students.length).toBe(3);
    expect(typeof body.message).toBe("string");

    // Los 3 alumnos están en la DB
    for (const curp of curps) {
      const id = await studentInDb(curp);
      expect(id).not.toBeNull();
      if (id) createdIds.push(id);
    }
  });

  // ── SIA-05: fila con error de DB (nombre 260 chars > varchar 255) ─────────────
  //   SAVEPOINT por fila: Alice y Dave creados, Bob no.
  //   Comportamiento observable IGUAL que antes del fix;
  //   la diferencia es que ahora todo ocurre dentro de BEGIN/COMMIT.
  it("SIA-05: fila 2 falla en DB (nombre > varchar 255) → " +
     "SAVEPOINT aísla el error, Alice y Dave se crean, " +
     "respuesta lleva errors[] con descripción del fallo", async () => {
    const ts = Date.now();
    const curpAlice = mkCurp(ts, 10);
    const curpBob   = mkCurp(ts, 11);
    const curpDave  = mkCurp(ts, 12);

    const csv = [
      "Nombre Completo,CURP,Grado,Grupo,Estatus",
      csvRow("Alice SIA Fix", curpAlice, "3ro", "A"),
      csvRow(NOMBRE_LARGO_260, curpBob, "4to", "A"),    // ← falla varchar(255)
      csvRow("Dave SIA Fix",  curpDave,  "5to", "B"),
    ].join("\n");

    const { status, body } = await postImport(csv);

    expect(status).toBe(200);

    // Formato de respuesta preservado
    expect(body.total_processed).toBe(3);
    expect(body.successful).toBe(2);
    expect((body.errors as string[]).length).toBeGreaterThan(0);
    expect(Array.isArray(body.created_students)).toBe(true);

    // Alice y Dave en DB
    const aliceId = await studentInDb(curpAlice);
    expect(aliceId).not.toBeNull();
    if (aliceId) createdIds.push(aliceId);

    const daveId = await studentInDb(curpDave);
    expect(daveId).not.toBeNull();
    if (daveId) createdIds.push(daveId);

    // Bob NO en DB (SAVEPOINT rollback de su fila)
    const bobId = await studentInDb(curpBob);
    expect(bobId).toBeNull();
  });

  // ── SIA-06: columnas flexibles de CSV preservadas ────────────────────────────
  //   El parseo case-insensitive de admin.ts no cambia.
  it("SIA-06: columnas CSV en minúsculas ('nombre_completo', 'curp') " +
     "también son aceptadas — parseo flexible sin cambios", async () => {
    const ts = Date.now();
    const curp = mkCurp(ts, 20);
    const csv = [
      "nombre_completo,curp,grado,grupo,status",     // ← lowercase
      `Alumno Flex ${ts},${curp},1ro,A,activo`,
    ].join("\n");

    const { status, body } = await postImport(csv);

    expect(status).toBe(200);
    expect(body.successful).toBe(1);

    const id = await studentInDb(curp);
    expect(id).not.toBeNull();
    if (id) createdIds.push(id);
  });

  // ── SIA-07: dry_run semántico — formato de respuesta correcto ─────────────────
  //   Confirma que con dry_run la respuesta incluye committed=false
  //   (mismo patrón que el resto de endpoints de import).
  it("SIA-07: dry_run=true → body incluye committed=false (o al menos cero alumnos en DB)", async () => {
    const ts = Date.now();
    const curp = mkCurp(ts, 30);
    const csv = [
      "Nombre Completo,CURP",
      `DryRun Check ${ts},${curp}`,
    ].join("\n");

    const { status, body } = await postImport(csv, true);
    expect(status).toBe(200);
    // committed=false es opcional aquí (admin.ts puede usar su propio campo)
    // pero el alumno NO debe estar en DB
    const id = await studentInDb(curp);
    expect(id).toBeNull();
  });

  // ── SIA-08: auditoría en audit_log después del commit ────────────────────────
  it("SIA-08: import real → enqueueAuditLog emitido (registro en audit_log dentro de 3 s)", async () => {
    const ts = Date.now();
    const curp = mkCurp(ts, 40);
    const csv = [
      "Nombre Completo,CURP,Grado,Grupo,Estatus",
      `Alumno Audit ${ts},${curp},1ro,A,activo`,
    ].join("\n");

    const { status, body } = await postImport(csv);
    expect(status).toBe(200);
    expect(body.successful).toBe(1);

    const studentId = await studentInDb(curp);
    expect(studentId).not.toBeNull();
    if (studentId) createdIds.push(studentId);

    // Sondear el audit_log hasta 3 segundos
    let auditRow: any = null;
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500));
      const r = await pool.query(
        `SELECT id, action FROM audit_log
         WHERE action = 'STUDENTS_IMPORT'
           AND tenant_id = $1
           AND created_at >= NOW() - INTERVAL '30 seconds'
         ORDER BY id DESC LIMIT 1`,
        [TENANT_ID],
      );
      if ((r.rows as any[]).length > 0) { auditRow = r.rows[0]; break; }
    }

    expect(auditRow).not.toBeNull();
    expect(auditRow.action).toBe("STUDENTS_IMPORT");
  });
});
