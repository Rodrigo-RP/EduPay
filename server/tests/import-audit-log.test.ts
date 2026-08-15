/**
 * Pruebas de registro en audit_log para importaciones masivas
 *
 * IAL-01  importación real exitosa → entry en audit_log action='import', metadata correcta
 * IAL-02  importación con rollback fatal → entry en audit_log action='import_failed'
 * IAL-03  dry_run=true → cero entradas nuevas en audit_log (no ocurrió cambio real)
 *
 * Patrón ADR-001: el INSERT a audit_log es fire-and-forget, fuera de la txn de negocio.
 * Los tests sondean la DB hasta 2 s para esperar la escritura asincrónica.
 *
 * Nota JSONB-as-text: pg puede devolver metadata como objeto o como cadena según el
 * driver; se usa metadata::text AS meta_text + toContain('"key"') para evitar
 * falsos undefined (ver audit-log-meta-test.md).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TENANT_ID  = 29;
const CAMPUS_ID  = 48;
const ADMIN_ID   = 80;   // usuario real en demo seed — FK de audit_log.user_id aplica

let testStudentId: number;
let testStudentRef: string;

// Timestamp de inicio de cada test — usado para filtrar entradas nuevas en audit_log
let testStartedAt: string;

// Registros escritos por IAL-01 — limpiar en afterAll
const committedStudentCurps: string[] = [];

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
  const boundary = "----IALBoundary" + Date.now();
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

/** Sondea audit_log hasta 2 s esperando que aparezca la entrada fire-and-forget. */
async function pollAuditLog(
  action: string,
  entityType: string,
  afterTimestamp: string,
  timeoutMs = 2000,
): Promise<{ found: boolean; row: any | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pool.query(
      `SELECT id, action, entity_type, entity_id, user_id,
              metadata::text AS meta_text,
              created_at
       FROM audit_log
       WHERE action = $1
         AND entity_type = $2
         AND tenant_id = $3
         AND created_at >= $4::timestamptz
       ORDER BY created_at DESC
       LIMIT 1`,
      [action, entityType, TENANT_ID, afterTimestamp],
    );
    if (r.rows.length > 0) return { found: true, row: r.rows[0] };
    await new Promise((res) => setTimeout(res, 100));
  }
  return { found: false, row: null };
}

beforeAll(async () => {
  // Alumno real para importar becas (IAL-01)
  testStudentRef = `IAL-TEST-${Date.now()}`;
  const r = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, nombre_completo, status, id_referencia)
     VALUES ($1, $2, 'Alumno', 'Alumno IAL', 'activo', $3) RETURNING id`,
    [TENANT_ID, CAMPUS_ID, testStudentRef],
  );
  testStudentId = r.rows[0].id;

  // CHECK CONSTRAINT temporal para forzar error fatal en IAL-02.
  // Rechaza CURPs que empiecen con 'TEAT' — patrón válido en formato SAT
  // pero nunca aparece en datos reales. Así el error lo produce la DB
  // (no la validación de formato en aplicación), probando el path de rollback.
  await pool.query(`
    ALTER TABLE students
    ADD CONSTRAINT chk_ial_test_rollback
    CHECK (curp NOT LIKE 'TEAT%')
  `);

  // Marca temporal de inicio — filtra entradas previas en audit_log
  const tsRes = await pool.query("SELECT NOW()::text AS ts");
  testStartedAt = tsRes.rows[0].ts;
});

afterAll(async () => {
  await pool.query(
    "ALTER TABLE students DROP CONSTRAINT IF EXISTS chk_ial_test_rollback",
  );
  await pool.query("DELETE FROM students WHERE id = $1", [testStudentId]);
  await pool.query("DELETE FROM scholarships WHERE student_id = $1", [testStudentId]);

  if (committedStudentCurps.length > 0) {
    await pool.query(
      `DELETE FROM students WHERE curp = ANY($1::text[])`,
      [committedStudentCurps],
    );
  }
});

describe("POST /api/import/data — registro en audit_log", () => {

  // ── IAL-01: importación exitosa → action='import' en audit_log ────────────
  it("IAL-01: importación real exitosa → entrada en audit_log con action='import' y metadatos correctos", async () => {
    const beforeReq = new Date().toISOString();
    const csv = `id_estudiante,tipo_beca,valor_descuento\n${testStudentRef},EXCELENCIA,30`;
    const { status, body } = await importCsv(tokenAdmin, "becas", "asignaciones", csv);

    expect(status).toBe(200);
    expect(body.committed).toBe(true);
    expect(body.successful).toBe(1);

    // Sondear audit_log (INSERT es fire-and-forget, puede llegar levemente después del 200)
    const { found, row } = await pollAuditLog("import", "asignaciones", beforeReq);

    expect(found).toBe(true);
    // pg devuelve columnas INTEGER como número, no como string
    expect(row.entity_id).toBe(CAMPUS_ID);
    expect(row.user_id).toBe(ADMIN_ID);

    // Metadatos vía ::text para evitar falso undefined con JSONB.
    // Valores numéricos en JSON no llevan comillas: "successful":1 no "successful":"1"
    expect(row.meta_text).toContain('"category"');
    expect(row.meta_text).toContain('"becas"');
    expect(row.meta_text).toContain('"successful"');
    expect(row.meta_text).toContain(':1');
    expect(row.meta_text).toContain('"failed"');
    expect(row.meta_text).toContain(':0');
  });

  // ── IAL-02: error fatal (ROLLBACK) → action='import_failed' en audit_log ──
  it("IAL-02: importación con rollback fatal → entrada en audit_log con action='import_failed'", async () => {
    const beforeReq = new Date().toISOString();
    // curpRow1 = CURP válido (no empieza con TEAT) → pasa validación y CHECK.
    // curpRow2 = CURP válido en formato pero viola CHECK NOT LIKE 'TEAT%' → error fatal DB.
    const _tsIal = Date.now();
    const curpRow1 = `AUID${String(_tsIal % 100).padStart(2,'0')}0101HNENNNA${_tsIal % 10}`;
    const curpRow2 = `TEAT000101HNENNNA0`; // formato válido, viola chk_ial_test_rollback
    const csv = [
      "nombre_completo,curp",
      `Alumno IAL Row1,${curpRow1}`,
      `Alumno IAL Row2,${curpRow2}`,
    ].join("\n");

    const { status } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv);
    expect(status).toBe(500);

    // Sondear audit_log para la entrada de fallo
    const { found, row } = await pollAuditLog("import_failed", "estudiantes", beforeReq);

    expect(found).toBe(true);
    // pg devuelve INTEGER como número
    expect(row.entity_id).toBe(CAMPUS_ID);
    expect(row.user_id).toBe(ADMIN_ID);
    // 'action' es columna separada — en metadata va el mensaje de error de la excepción
    expect(row.meta_text).toContain('"error"');
  });

  // ── IAL-03: dry_run=true → cero entradas nuevas en audit_log ─────────────
  it("IAL-03: dry_run=true → ninguna entrada nueva en audit_log (no hubo cambio real)", async () => {
    const beforeReq = new Date().toISOString();
    const curp = `IAL3${String(Date.now()).slice(-8)}`;
    const csv = `nombre_completo,curp\nAlumno IAL DryRun,${curp}`;

    const { status, body } = await importCsv(tokenAdmin, "estudiantes", "estudiantes", csv, { dry_run: "true" });
    expect(status).toBe(200);
    expect(body.committed).toBe(false);

    // Esperar un momento para que si hubiera un INSERT asincrónico llegara
    await new Promise((res) => setTimeout(res, 500));

    // No debe existir ninguna entrada de audit_log generada después de beforeReq
    // con action 'import' ni 'import_failed' para entity_type='estudiantes'
    const rImport = await pool.query(
      `SELECT id FROM audit_log
       WHERE action = 'import'
         AND entity_type = 'estudiantes'
         AND tenant_id = $1
         AND created_at >= $2::timestamptz`,
      [TENANT_ID, beforeReq],
    );
    const rFailed = await pool.query(
      `SELECT id FROM audit_log
       WHERE action = 'import_failed'
         AND entity_type = 'estudiantes'
         AND tenant_id = $1
         AND created_at >= $2::timestamptz`,
      [TENANT_ID, beforeReq],
    );
    expect(rImport.rows.length).toBe(0);
    expect(rFailed.rows.length).toBe(0);
  });

});
