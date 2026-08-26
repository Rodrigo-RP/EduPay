/**
 * ISI — Importación incremental de estudiantes
 *
 * Escenario de cierre:
 * - campus con alumnos existentes
 * - archivo con 15 filas: 14 nuevas + 1 CURP ya existente
 * - dry_run: 14 successful, 1 skipped, cero escrituras
 * - commit: 14 successful, 1 skipped, verificación directa en PostgreSQL
 * - matrícula repetida: se omite aunque el CURP sea nuevo
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";
const TENANT_ID = 29;
const CAMPUS_ID = 48;
const ADMIN_ID = 80;
const RUN = Date.now();
const REFERENCE_PREFIX = `INC-${RUN}`;

function adminToken() {
  return jwt.sign({
    id: ADMIN_ID,
    email: "admin@incremental-import.test",
    role: "administrador_campus",
    tenant_id: TENANT_ID,
    campus_id: CAMPUS_ID,
  }, JWT_SECRET, { expiresIn: "15m" });
}

function makeCurp(prefix: string, offset: number): string {
  const yy = String((RUN + offset) % 100).padStart(2, "0");
  return `${prefix}${yy}0101HJCLLNA0`;
}

const EXISTING_CURP = makeCurp("RIZA", 0);
const EXISTING_REFERENCE = `${REFERENCE_PREFIX}-EXISTING`;
const NEW_ROWS = Array.from({ length: 14 }, (_, index) => ({
  nombre: `Alumno Incremental ${index + 1}`,
  curp: makeCurp(`RIC${String.fromCharCode(65 + index)}`, index + 1),
  referencia: `${REFERENCE_PREFIX}-${String(index + 1).padStart(2, "0")}`,
}));

function buildCsv(rows: Array<{ nombre: string; curp: string; referencia: string }>) {
  return [
    "nombre_completo,curp,id_referencia,grado,grupo,status",
    ...rows.map((row) =>
      `${row.nombre},${row.curp},${row.referencia},3ro,A,activo`
    ),
  ].join("\n");
}

async function postStudents(csv: string, dryRun: boolean) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "alumnos-incrementales.csv");
  const response = await fetch(
    `${BASE}/api/import/data/estudiantes/estudiantes${dryRun ? "?dry_run=true" : ""}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: form,
    },
  );
  return { status: response.status, body: await response.json() };
}

describe("ISI — importación incremental de estudiantes", () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO students
         (tenant_id, campus_id, id_referencia, nombres, nombre_completo, curp, grado, grupo, status)
       VALUES ($1, $2, $3, 'Alumno Existente', 'Alumno Existente', $4, '3ro', 'A', 'activo')`,
      [TENANT_ID, CAMPUS_ID, EXISTING_REFERENCE, EXISTING_CURP],
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia LIKE $3`,
      [TENANT_ID, CAMPUS_ID, `${REFERENCE_PREFIX}%`],
    );
  });

  it("ISI-01: preview de 14 nuevos + 1 CURP existente no escribe en DB", async () => {
    const csv = buildCsv([
      ...NEW_ROWS,
      {
        nombre: "Alumno Duplicado CURP",
        curp: EXISTING_CURP,
        referencia: `${REFERENCE_PREFIX}-DUP-CURP`,
      },
    ]);

    const { status, body } = await postStudents(csv, true);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      total: 15,
      successful: 14,
      skipped: 1,
      failed: 0,
      committed: false,
    });
    expect(body.skipped_details).toHaveLength(1);
    expect(body.skipped_details[0]).toContain("Alumno Duplicado CURP");
    expect(body.skipped_details[0]).toContain(`CURP ${EXISTING_CURP}`);

    const dbCount = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia LIKE $3
          AND id_referencia <> $4`,
      [TENANT_ID, CAMPUS_ID, `${REFERENCE_PREFIX}%`, EXISTING_REFERENCE],
    );
    expect((dbCount.rows[0] as any).total).toBe(0);
  });

  it("ISI-02: commit inserta exactamente 14 y omite el CURP existente", async () => {
    const csv = buildCsv([
      ...NEW_ROWS,
      {
        nombre: "Alumno Duplicado CURP",
        curp: EXISTING_CURP,
        referencia: `${REFERENCE_PREFIX}-DUP-CURP`,
      },
    ]);

    const { status, body } = await postStudents(csv, false);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      total: 15,
      successful: 14,
      skipped: 1,
      failed: 0,
      committed: true,
    });

    const inserted = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT curp)::int AS curps,
              COUNT(DISTINCT id_referencia)::int AS referencias
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia = ANY($3::text[])`,
      [TENANT_ID, CAMPUS_ID, NEW_ROWS.map((row) => row.referencia)],
    );
    expect(inserted.rows[0]).toMatchObject({
      total: 14,
      curps: 14,
      referencias: 14,
    });

    const existing = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND curp = $3`,
      [TENANT_ID, CAMPUS_ID, EXISTING_CURP],
    );
    expect((existing.rows[0] as any).total).toBe(1);
  });

  it("ISI-03: matrícula existente se omite aunque el CURP sea nuevo", async () => {
    const newCurp = makeCurp("RICO", 30);
    const csv = buildCsv([{
      nombre: "Alumno Duplicado Matrícula",
      curp: newCurp,
      referencia: EXISTING_REFERENCE,
    }]);

    const preview = await postStudents(csv, true);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      total: 1,
      successful: 0,
      skipped: 1,
      failed: 0,
      committed: false,
    });
    expect(preview.body.skipped_details[0]).toContain(`matrícula ${EXISTING_REFERENCE}`);

    const commit = await postStudents(csv, false);
    expect(commit.status).toBe(200);
    expect(commit.body).toMatchObject({
      successful: 0,
      skipped: 1,
      committed: true,
    });

    const duplicate = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND curp = $3`,
      [TENANT_ID, CAMPUS_ID, newCurp],
    );
    expect((duplicate.rows[0] as any).total).toBe(0);
  });

  it("ISI-04: dos imports concurrentes insertan una sola vez", async () => {
    const concurrentCurp = makeCurp("RICQ", 40);
    const concurrentReference = `${REFERENCE_PREFIX}-CONCURRENT`;
    const csv = buildCsv([{
      nombre: "Alumno Concurrente",
      curp: concurrentCurp,
      referencia: concurrentReference,
    }]);

    const [first, second] = await Promise.all([
      postStudents(csv, false),
      postStudents(csv, false),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.successful + second.body.successful).toBe(1);
    expect(first.body.skipped + second.body.skipped).toBe(1);
    expect(first.body.failed + second.body.failed).toBe(0);

    const inserted = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND curp = $3
          AND id_referencia = $4`,
      [TENANT_ID, CAMPUS_ID, concurrentCurp, concurrentReference],
    );
    expect((inserted.rows[0] as any).total).toBe(1);
  });

  it("ISI-05: archivos concurrentes en orden inverso no generan deadlock", async () => {
    const rows = [
      {
        nombre: "Alumno Concurrente Alfa",
        curp: makeCurp("RIRA", 50),
        referencia: `${REFERENCE_PREFIX}-REVERSE-A`,
      },
      {
        nombre: "Alumno Concurrente Beta",
        curp: makeCurp("RIRB", 51),
        referencia: `${REFERENCE_PREFIX}-REVERSE-B`,
      },
    ];

    const [forward, reverse] = await Promise.all([
      postStudents(buildCsv(rows), false),
      postStudents(buildCsv([...rows].reverse()), false),
    ]);

    expect(forward.status).toBe(200);
    expect(reverse.status).toBe(200);
    expect(forward.body.successful + reverse.body.successful).toBe(2);
    expect(forward.body.skipped + reverse.body.skipped).toBe(2);
    expect(forward.body.failed + reverse.body.failed).toBe(0);

    const inserted = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia = ANY($3::text[])`,
      [TENANT_ID, CAMPUS_ID, rows.map((row) => row.referencia)],
    );
    expect((inserted.rows[0] as any).total).toBe(2);
  });
});