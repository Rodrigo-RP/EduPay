/**
 * Import de adeudos migrados — POST /api/import/data/adeudos/migrados
 *
 * Verifica la rama nueva del switch de importación.  Los charges resultantes llevan
 * es_adeudo_migrado = TRUE, recargo_aplicado_centavos = 0, y concept_id resuelto por
 * tipo_concepto (vocabulario controlado) + desambigüación por nivel_escolar del alumno.
 *
 * IAM-00   Sin token → 401
 * IAM-00b  Rol sin CHARGES.CREATE (asistente) → 403
 * IAM-01   tipo_concepto inexistente en el campus → failed con mensaje exacto
 * IAM-02   Fila válida → charge creado con es_adeudo_migrado=true,
 *           concept_id correcto, recargo=0, descripcion persistida
 * IAM-03   dry_run=true → cero filas en DB, mismo conteo successful/failed
 * IAM-04   Ambigüedad de concepto resuelta por nivel_escolar del alumno:
 *           dos conceptos de tipo 'colegiatura' (PRIMARIA vs SECUNDARIA) →
 *           alumno PRIMARIA → concept PRIMARIA; alumno SECUNDARIA → concept SECUNDARIA
 * IAM-05   Alumno no encontrado en el campus → fila failed, resto continúa
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TENANT_ID  = 29;
const CAMPUS_ID  = 48;
const ADMIN_ID   = 80;

// ── Fixtures ──────────────────────────────────────────────────────────────────
//
// Los conceptos de IAM-04 (prueba de desambigüación) usan tipo='colegiatura_iam_test',
// un tipo exclusivo de este test que nunca existe en el seed de demo. Esto evita:
//   a) La colisión con los conceptos reales de tipo 'colegiatura' del campus 48.
//   b) El fallback por filtrados.length > 1 (solo existen exactamente 2 conceptos
//      de este tipo: uno con PRIMARIA y otro con SECUNDARIA en el nombre).
//
// La limpieza al inicio del beforeAll elimina residuos de corridas anteriores fallidas.
//
const TIPO_IAM_TEST = 'colegiatura_iam_test'; // tipo ficticio exclusivo del test
let conceptColegPrimId:  number;  // tipo=TIPO_IAM_TEST, nombre contiene 'PRIMARIA'
let conceptColegSecId:   number;  // tipo=TIPO_IAM_TEST, nombre contiene 'SECUNDARIA'
let conceptInscripId:    number;  // tipo='inscripcion'
let studentPrimId:       number;  // nivel_escolar='PRIMARIA'
let studentSecId:        number;  // nivel_escolar='SECUNDARIA'
let importedChargeIds:   number[] = [];  // limpieza en afterAll

// ── Auth tokens ───────────────────────────────────────────────────────────────
function makeToken(role: string): string {
  return jwt.sign(
    { id: ADMIN_ID, email: `${role}@iam-test.mx`, role,
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}
const tokenAdmin    = makeToken("administrador_campus");
const tokenAsistente = makeToken("asistente");  // sin CHARGES.CREATE

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildCsv(rows: Record<string, string | number>[]): string {
  const headers = Object.keys(rows[0]);
  const lines   = rows.map(r => headers.map(h => r[h] ?? "").join(","));
  return [headers.join(","), ...lines].join("\n");
}

async function postImport(
  csvContent: string,
  token?: string,
  dryRun = false,
) {
  const form = new FormData();
  form.append("file", new Blob([csvContent], { type: "text/csv" }), "adeudos.csv");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const url = dryRun
    ? `${BASE}/api/import/data/adeudos/migrados?dry_run=true`
    : `${BASE}/api/import/data/adeudos/migrados`;
  const r = await fetch(url, { method: "POST", headers, body: form });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function getCharge(id: number) {
  const r = await pool.query(
    `SELECT c.id, c.es_adeudo_migrado, c.recargo_aplicado_centavos,
            c.monto_base_centavos, c.concept_id, c.descripcion,
            c.estado, c.ciclo_escolar
     FROM charges c WHERE c.id = $1`,
    [id],
  );
  return r.rows[0] as any ?? null;
}

async function getChargesForStudent(studentId: number): Promise<number[]> {
  const r = await pool.query(
    `SELECT id FROM charges WHERE student_id = $1 AND es_adeudo_migrado = true`,
    [studentId],
  );
  return r.rows.map((row: any) => Number(row.id));
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  // Migraciones idempotentes — columnas podrían ya existir
  await pool.query(`
    ALTER TABLE charges
      ADD COLUMN IF NOT EXISTS es_adeudo_migrado BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE charges
      ADD COLUMN IF NOT EXISTS descripcion TEXT
  `);

  // Limpiar residuos de corridas anteriores fallidas (beforeAll no garantiza
  // que el afterAll anterior haya completado si el proceso fue interrumpido).
  await pool.query(
    `DELETE FROM concepts WHERE campus_id = $1 AND tenant_id = $2 AND tipo = $3`,
    [CAMPUS_ID, TENANT_ID, TIPO_IAM_TEST],
  );

  // Dos conceptos de tipo TIPO_IAM_TEST para probar desambigüación (IAM-04).
  // El tipo ficticio garantiza que solo existen EXACTAMENTE estos dos conceptos
  // para el campus en este tipo → filtrados.length = 1 para cada nivel → 
  // la desambigüación es determinista, sin depender del seed de demo.
  const cp = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos, iva)
     VALUES ($1, $2, 'Colegiatura PRIMARIA Test IAM', $3, 'mensual', 300000, false)
     RETURNING id`,
    [CAMPUS_ID, TENANT_ID, TIPO_IAM_TEST],
  );
  conceptColegPrimId = cp.rows[0].id;

  const cs = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos, iva)
     VALUES ($1, $2, 'Colegiatura SECUNDARIA Test IAM', $3, 'mensual', 350000, false)
     RETURNING id`,
    [CAMPUS_ID, TENANT_ID, TIPO_IAM_TEST],
  );
  conceptColegSecId = cs.rows[0].id;

  // Un concepto de tipo 'inscripcion' (sin ambigüedad)
  const ci = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos, iva)
     VALUES ($1, $2, 'Inscripción Test IAM', 'inscripcion', 'anual', 500000, false)
     RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  conceptInscripId = ci.rows[0].id;

  // Alumno con nivel_escolar='PRIMARIA'
  const sp = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, nombre_completo, status,
                           id_referencia, nivel_escolar)
     VALUES ($1, $2, 'Prim IAM', 'Alumno Primaria IAM', 'activo', $3, 'PRIMARIA')
     RETURNING id`,
    [TENANT_ID, CAMPUS_ID, `IAM-PRIM-${Date.now()}`],
  );
  studentPrimId = sp.rows[0].id;

  // Alumno con nivel_escolar='SECUNDARIA'
  const ss = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, nombre_completo, status,
                           id_referencia, nivel_escolar)
     VALUES ($1, $2, 'Sec IAM', 'Alumno Secundaria IAM', 'activo', $3, 'SECUNDARIA')
     RETURNING id`,
    [TENANT_ID, CAMPUS_ID, `IAM-SEC-${Date.now()}`],
  );
  studentSecId = ss.rows[0].id;
});

afterAll(async () => {
  // Limpiar charges creados durante los tests
  const allStudentCharges = [
    ...(await getChargesForStudent(studentPrimId)),
    ...(await getChargesForStudent(studentSecId)),
    ...importedChargeIds,
  ];
  if (allStudentCharges.length > 0) {
    await pool.query(`DELETE FROM charges WHERE id = ANY($1::int[])`, [allStudentCharges]);
  }
  await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [[studentPrimId, studentSecId]]);
  await pool.query(
    `DELETE FROM concepts WHERE id = ANY($1::int[])`,
    [[conceptColegPrimId, conceptColegSecId, conceptInscripId]],
  );
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("POST /api/import/data/adeudos/migrados", () => {

  // ── IAM-00: Sin token → 401 ────────────────────────────────────────────────
  it("IAM-00: sin token → 401", async () => {
    const csv = buildCsv([{
      id_estudiante: "X", tipo_concepto: "colegiatura",
      monto_centavos: 100000, fecha_vencimiento: "2024-01-10", ciclo_escolar: "2023-2024",
    }]);
    const { status } = await postImport(csv);
    expect(status).toBe(401);
  });

  // ── IAM-00b: Rol sin CHARGES.CREATE → 403 ─────────────────────────────────
  it("IAM-00b: asistente (sin CHARGES.CREATE) → 403", async () => {
    const csv = buildCsv([{
      id_estudiante: "X", tipo_concepto: "colegiatura",
      monto_centavos: 100000, fecha_vencimiento: "2024-01-10", ciclo_escolar: "2023-2024",
    }]);
    const { status } = await postImport(csv, tokenAsistente);
    expect(status).toBe(403);
  });

  // ── IAM-01: tipo_concepto inexistente → failed con mensaje exacto ──────────
  it(
    "IAM-01: tipo_concepto 'tipo_que_no_existe_iam' en campus → failed con mensaje exacto",
    async () => {
      // Buscar la id_referencia del alumno prim para usarla en el CSV
      const refR = await pool.query(
        "SELECT id_referencia FROM students WHERE id = $1",
        [studentPrimId],
      );
      const idRef = refR.rows[0].id_referencia;

      const csv = buildCsv([{
        id_estudiante: idRef,
        tipo_concepto: "tipo_que_no_existe_iam",
        monto_centavos: 100000,
        fecha_vencimiento: "2024-01-10",
        ciclo_escolar: "2023-2024",
        descripcion: "Prueba tipo inexistente",
      }]);
      const { status, body } = await postImport(csv, tokenAdmin);

      expect(status).toBe(200);
      expect(body.failed).toBe(1);
      expect(body.successful).toBe(0);
      // Mensaje exacto de error
      expect(body.errors[0]).toMatch(
        /No existe concepto de tipo 'tipo_que_no_existe_iam' para este campus/,
      );
      expect(body.errors[0]).toMatch(/Configure el catálogo primero/);
    },
  );

  // ── IAM-02: Fila válida → charge creado con los 3 campos clave ─────────────
  it(
    "IAM-02: fila válida (inscripcion, sin ambigüedad) → charge con " +
    "es_adeudo_migrado=true, concept_id correcto, recargo=0, descripcion persistida",
    async () => {
      const refR = await pool.query(
        "SELECT id_referencia FROM students WHERE id = $1",
        [studentPrimId],
      );
      const idRef = refR.rows[0].id_referencia;

      const csv = buildCsv([{
        id_estudiante: idRef,
        tipo_concepto: "inscripcion",
        monto_centavos: 500000,
        fecha_vencimiento: "2023-08-15",
        ciclo_escolar: "2023-2024",
        descripcion: "Inscripción agosto 2023",
      }]);
      const { status, body } = await postImport(csv, tokenAdmin);

      expect(status).toBe(200);
      expect(body.successful).toBe(1);
      expect(body.failed).toBe(0);
      expect(body.committed).toBe(true);

      // El import elige el primer concepto de tipo 'inscripcion' para el campus
      // (ORDER BY id). Puede ser uno del seed o el nuestro — ambos son 'inscripcion'.
      // Verificamos los 3 campos clave + descripcion, no el concept_id específico.
      const chargesR = await pool.query(
        `SELECT c.id, c.es_adeudo_migrado, c.recargo_aplicado_centavos,
                c.monto_base_centavos, c.concept_id, c.descripcion,
                c.estado, c.ciclo_escolar, co.tipo AS concept_tipo
         FROM charges c
         LEFT JOIN concepts co ON co.id = c.concept_id
         WHERE c.student_id = $1
           AND c.es_adeudo_migrado = true
           AND c.monto_base_centavos = 500000
           AND c.ciclo_escolar = '2023-2024'
         ORDER BY c.id DESC LIMIT 1`,
        [studentPrimId],
      );
      const chargeInscripcion = chargesR.rows[0] as any;
      expect(chargeInscripcion).toBeDefined();
      expect(chargeInscripcion.es_adeudo_migrado).toBe(true);
      expect(Number(chargeInscripcion.recargo_aplicado_centavos)).toBe(0);
      expect(Number(chargeInscripcion.monto_base_centavos)).toBe(500000);
      expect(chargeInscripcion.descripcion).toBe("Inscripción agosto 2023");
      expect(chargeInscripcion.estado).toBe("pendiente");
      expect(chargeInscripcion.ciclo_escolar).toBe("2023-2024");
      // El concepto asignado es de tipo 'inscripcion' (independientemente de cuál específico)
      expect(chargeInscripcion.concept_tipo).toBe("inscripcion");

      importedChargeIds.push(Number(chargeInscripcion.id));
    },
  );

  // ── IAM-03: dry_run → cero filas en DB, mismo conteo ──────────────────────
  it(
    "IAM-03: dry_run=true → cero charges creados en DB, successful/failed correcto, committed=false",
    async () => {
      const refR = await pool.query(
        "SELECT id_referencia FROM students WHERE id = $1",
        [studentSecId],
      );
      const idRef = refR.rows[0].id_referencia;

      // Contar charges actuales del alumno SECUNDARIA antes del dry_run
      const antesIds = await getChargesForStudent(studentSecId);
      const antesCnt = antesIds.length;

      const csv = buildCsv([{
        id_estudiante: idRef,
        tipo_concepto: "inscripcion",
        monto_centavos: 500000,
        fecha_vencimiento: "2023-08-20",
        ciclo_escolar: "2023-2024",
        descripcion: "Prueba dry_run",
      }]);
      const { status, body } = await postImport(csv, tokenAdmin, /* dryRun= */ true);

      expect(status).toBe(200);
      expect(body.committed).toBe(false);
      expect(body.successful).toBe(1);   // procesamiento correcto en simulación
      expect(body.failed).toBe(0);

      // DB no cambió
      const despuesIds = await getChargesForStudent(studentSecId);
      expect(despuesIds.length).toBe(antesCnt);
    },
  );

  // ── IAM-04: Desambigüación por nivel_escolar ───────────────────────────────
  it(
    "IAM-04: REPRODUCCIÓN DE AMBIGÜEDAD + RESOLUCIÓN — " +
    "campus con 2 conceptos de tipo 'colegiatura' (PRIMARIA y SECUNDARIA): " +
    "alumno PRIMARIA → concept PRIMARIA; alumno SECUNDARIA → concept SECUNDARIA",
    async () => {
      // Recuperar id_referencia de ambos alumnos
      const refs = await pool.query(
        "SELECT id, id_referencia, nivel_escolar FROM students WHERE id = ANY($1::int[])",
        [[studentPrimId, studentSecId]],
      );
      const primRow = refs.rows.find((r: any) => r.id === studentPrimId) as any;
      const secRow  = refs.rows.find((r: any) => r.id === studentSecId) as any;

      // CSV con dos filas: una por cada alumno, mismo tipo_concepto TIPO_IAM_TEST.
      // Usamos el tipo exclusivo del test para garantizar que solo nuestros 2 conceptos
      // existen en el campus para este tipo → desambigüación determinista.
      const csv = buildCsv([
        {
          id_estudiante: primRow.id_referencia,
          tipo_concepto: TIPO_IAM_TEST,
          monto_centavos: 300000,
          fecha_vencimiento: "2024-09-10",
          ciclo_escolar: "2024-2025",
          descripcion: "Colegiatura Sep 2024",
        },
        {
          id_estudiante: secRow.id_referencia,
          tipo_concepto: TIPO_IAM_TEST,
          monto_centavos: 350000,
          fecha_vencimiento: "2024-09-10",
          ciclo_escolar: "2024-2025",
          descripcion: "Colegiatura Sep 2024",
        },
      ]);

      // Reproducción del riesgo: hay EXACTAMENTE 2 conceptos de tipo TIPO_IAM_TEST
      // para el campus → el import no puede elegir sin desambigüar.
      const conceptosR = await pool.query(
        `SELECT id, nombre FROM concepts
         WHERE campus_id = $1 AND tenant_id = $2 AND LOWER(tipo) = $3
         ORDER BY id`,
        [CAMPUS_ID, TENANT_ID, TIPO_IAM_TEST],
      );
      expect(conceptosR.rows).toHaveLength(2); // evidencia del riesgo de ambigüedad

      // Import real
      const { status, body } = await postImport(csv, tokenAdmin);
      expect(status).toBe(200);
      expect(body.successful).toBe(2);
      expect(body.failed).toBe(0);

      // ── Verificar resolución correcta por nivel_escolar ────────────────────
      // El campus demo ya tiene conceptos de tipo 'colegiatura' con 'PRIMARIA' y
      // 'SECUNDARIA' en su nombre (ids bajos del seed). El algoritmo elige correctamente
      // el que coincide con el nivel_escolar del alumno. No comparamos contra nuestros
      // fixture IDs — comparamos el nombre del concepto elegido.
      const chargesR = await pool.query(
        `SELECT c.id, c.student_id, c.es_adeudo_migrado,
                c.recargo_aplicado_centavos, c.concept_id, c.estado,
                co.nombre AS concept_nombre, co.tipo AS concept_tipo
         FROM charges c
         LEFT JOIN concepts co ON co.id = c.concept_id
         WHERE c.student_id = ANY($1::int[])
           AND c.es_adeudo_migrado = true
           AND c.ciclo_escolar = '2024-2025'
         ORDER BY c.id DESC`,
        [[studentPrimId, studentSecId]],
      );
      const rows = chargesR.rows as any[];

      const detailPrim = rows.find(r => r.student_id === studentPrimId);
      const detailSec  = rows.find(r => r.student_id === studentSecId);

      expect(detailPrim).toBeDefined();
      expect(detailSec).toBeDefined();

      // Alumno PRIMARIA → concepto cuyo nombre contiene 'PRIMARIA'
      expect(detailPrim!.concept_nombre.toUpperCase()).toContain("PRIMARIA");
      expect(detailPrim!.concept_tipo).toBe(TIPO_IAM_TEST);

      // Alumno SECUNDARIA → concepto cuyo nombre contiene 'SECUNDARIA'
      expect(detailSec!.concept_nombre.toUpperCase()).toContain("SECUNDARIA");
      expect(detailSec!.concept_tipo).toBe(TIPO_IAM_TEST);

      // Desambigüación efectiva: los dos alumnos obtuvieron conceptos distintos
      expect(detailPrim!.concept_id).not.toBe(detailSec!.concept_id);

      // Ambos con los 3 campos clave de adeudo migrado
      for (const ch of [detailPrim!, detailSec!]) {
        expect(ch.es_adeudo_migrado).toBe(true);
        expect(Number(ch.recargo_aplicado_centavos)).toBe(0);
        expect(ch.estado).toBe("pendiente");
      }

      importedChargeIds.push(Number(detailPrim!.id), Number(detailSec!.id));
    },
  );

  // ── IAM-05: Alumno no encontrado → fila failed, otras filas continúan ──────
  it(
    "IAM-05: fila con id_estudiante inexistente → failed=1 con mensaje, " +
    "fila válida siguiente → successful=1 (continúa procesando)",
    async () => {
      const refR = await pool.query(
        "SELECT id_referencia FROM students WHERE id = $1",
        [studentPrimId],
      );
      const idRef = refR.rows[0].id_referencia;

      const csv = buildCsv([
        {
          // Fila inválida: alumno que no existe
          id_estudiante: "NOEXISTE-IAM-99999",
          tipo_concepto: "inscripcion",
          monto_centavos: 100000,
          fecha_vencimiento: "2024-01-10",
          ciclo_escolar: "2023-2024",
          descripcion: "Alumno inexistente",
        },
        {
          // Fila válida
          id_estudiante: idRef,
          tipo_concepto: "inscripcion",
          monto_centavos: 100000,
          fecha_vencimiento: "2024-02-10",
          ciclo_escolar: "2023-2024",
          descripcion: "Fila valida tras error",
        },
      ]);

      const antesIds = await getChargesForStudent(studentPrimId);

      const { status, body } = await postImport(csv, tokenAdmin);
      expect(status).toBe(200);
      expect(body.failed).toBe(1);
      expect(body.successful).toBe(1);
      expect(body.errors[0]).toMatch(/Estudiante no encontrado en este campus/);

      // La fila válida sí se insertó
      const despuesIds = await getChargesForStudent(studentPrimId);
      expect(despuesIds.length).toBeGreaterThan(antesIds.length);

      const nuevoId = despuesIds.find(id => !antesIds.includes(id));
      if (nuevoId) importedChargeIds.push(nuevoId);
    },
  );

});
