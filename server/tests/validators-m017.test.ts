/**
 * server/tests/validators-m017.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * VLD — validators.ts (unit puro, sin DB ni HTTP)
 * M17 — migración 017: CHECK constraints en invoices, students, payments
 * CE  — CURP bloqueante: PATCH /api/admin/students/:id
 * CB  — CURP no-bloqueante: POST /api/import/data/estudiantes/estudiantes
 *
 * Orden de cobertura:
 *  VLD-01..06  → validarCurp(), normalizarCurp(), CLAVE_PROD_SERV
 *  M17-01..06  → CHECK constraints de la migración; M17-01 es el caso más crítico
 *                (forma_pago='01' / efectivo debe ser aceptado — la restricción de
 *                 deducibilidad D10 la gestiona la capa de aplicación, no el CHECK)
 *  CE-01..02   → PATCH individual: CURP inválida → 400, válida → 200
 *  CB-01..02   → Bulk import: CURP inválida en errors[] sin abortar el batch
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import {
  validarCurp,
  normalizarCurp,
  CLAVE_PROD_SERV,
} from "../lib/validators";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const TS         = Date.now().toString().slice(-7);

// ── Fixtures compartidos ──────────────────────────────────────────────────────
let tenantId   = 0;
let campusId   = 0;
let studentId  = 0;   // alumno para tests CE (PATCH)
let tokenAdmin = "";

beforeAll(async () => {
  // ── Tenant + Campus ──────────────────────────────────────────────────────
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`VLD M17 Tenant ${TS}`, `VLD${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
    [tenantId, `Campus-VLD-${TS}`]
  );
  campusId = cRow.rows[0].id;

  // ── Admin user (administrador_campus) ────────────────────────────────────
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestVLD2025!", 10);
  const uRow   = await pool.query(
    `INSERT INTO users
       (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
     VALUES ($1, $2, 'Admin VLD', $3, $4, 'administrador_campus', true, '{}') RETURNING id`,
    [tenantId, campusId, `admin.vld.${TS}@vld.test`, hash]
  );
  const adminId = uRow.rows[0].id as number;

  tokenAdmin = jwt.sign(
    {
      id: adminId,
      email: `admin.vld.${TS}@vld.test`,
      role: "administrador_campus",
      campus_id: campusId,
      tenant_id: tenantId,
      type: "user",
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // ── Alumno para tests CE ─────────────────────────────────────────────────
  // El PATCH verifica que el alumno pertenezca al campus del token,
  // así que debe estar en campus_id correcto.
  const sRow = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombre_completo, status)
     VALUES ($1, $2, 'Alumno VLD Test', 'activo') RETURNING id`,
    [tenantId, campusId]
  );
  studentId = sRow.rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM students WHERE id = $1`,        [studentId]);
  await pool.query(`DELETE FROM users     WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses  WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants   WHERE id = $1`,        [tenantId]);
});

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

const PATCH = (path: string, body: Record<string, unknown>) =>
  fetch(`${BASE}${path}`, {
    method:  "PATCH",
    headers: {
      Authorization: `Bearer ${tokenAdmin}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

async function importEstudiantes(
  csv: string
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "alumnos.csv");
  const r = await fetch(`${BASE}/api/import/data/estudiantes/estudiantes`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${tokenAdmin}` },
    body:    form,
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

// ─────────────────────────────────────────────────────────────────────────────
// VLD — unit puro de validators.ts (sin red ni DB)
// ─────────────────────────────────────────────────────────────────────────────
describe("VLD — validators.ts (unit, sin DB ni HTTP)", () => {

  // ── VLD-01: CURPs de formato válido ──────────────────────────────────────
  it("VLD-01: validarCurp() acepta cinco CURPs con formato oficial SAT", () => {
    const validos: [string, string][] = [
      ["JUGM900101HDFXXX01",  "hombre, estado DF, consonantes XXX"],
      ["GOLM051215MDFNPR03",  "mujer, dígito dif. 0, verificador 3"],
      ["SIAA010101MDFXXX01",  "CURP de control usada en suite"],
      ["TEAT000101HNENNNA0",  "CURP generada por helper de tests de rollback"],
      ["MARG850614HMCLVS08",  "ejemplo de documentación SAT"],
    ];
    for (const [curp, desc] of validos) {
      expect(validarCurp(curp), `esperaba válido [${desc}]: ${curp}`).toBe(true);
    }
  });

  // ── VLD-02: CURP no binaria — actualización SAT mayo 2024 ─────────────────
  // Antes de mayo 2024 solo se aceptaban H (hombre) y M (mujer) en posición 11.
  // La actualización del RENAPO permite X para personas no binarias.
  it("VLD-02: validarCurp() acepta sexo 'X' en posición 11 (no binario, SAT mayo 2024)", () => {
    const curpNoBinario = "GOLM051215XDFNPR03"; // idéntica a la anterior pero sexo=X
    expect(validarCurp(curpNoBinario)).toBe(true);
  });

  // ── VLD-03: formatos inválidos ────────────────────────────────────────────
  it("VLD-03: validarCurp() rechaza ocho formatos incorrectos con motivo específico", () => {
    const invalidos: [string, string][] = [
      ["",                     "cadena vacía"],
      ["GOLM051215MDFNPR0",    "17 chars — falta el dígito verificador"],
      ["GOLM051215MDFNPR033",  "19 chars — carácter extra al final"],
      ["GBLM051215MDFNPR03",   "posición 2 'B' — no es vocal [AEIOUX]"],
      ["GOLM052015MDFNPR03",   "mes '20' — primer dígito '2' > '1' de [0-1]"],
      ["GOLM051299MDFNPR03",   "día '99' — primer dígito '9' > '3' de [0-3]"],
      ["GOLM051215ADFNPR03",   "posición 11 'A' — no es [HMX]"],
      ["1OLM051215MDFNPR03",   "posición 1 dígito '1' — no es [A-Z]"],
    ];
    for (const [curp, motivo] of invalidos) {
      expect(validarCurp(curp), `esperaba inválido (${motivo}): "${curp}"`).toBe(false);
    }
  });

  // ── VLD-04: CLAVE_PROD_SERV educación básica ──────────────────────────────
  it("VLD-04: CLAVE_PROD_SERV devuelve '86121500' para Preescolar, Primaria y Secundaria", () => {
    expect(CLAVE_PROD_SERV["Preescolar"]).toBe("86121500");
    expect(CLAVE_PROD_SERV["Primaria"]).toBe("86121500");
    expect(CLAVE_PROD_SERV["Secundaria"]).toBe("86121500");
  });

  // ── VLD-05: CLAVE_PROD_SERV educación media superior ─────────────────────
  it("VLD-05: CLAVE_PROD_SERV devuelve '86121600' para Bachillerato y Profesional técnico", () => {
    expect(CLAVE_PROD_SERV["Bachillerato o su equivalente"]).toBe("86121600");
    expect(CLAVE_PROD_SERV["Profesional técnico"]).toBe("86121600");
  });

  // ── VLD-06: normalizarCurp ────────────────────────────────────────────────
  it("VLD-06: normalizarCurp() convierte a mayúsculas y elimina espacios extremos", () => {
    expect(normalizarCurp("  golm051215mdfnpr03  ")).toBe("GOLM051215MDFNPR03");
    expect(normalizarCurp("GOLM051215MDFNPR03")).toBe("GOLM051215MDFNPR03");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M17 — CHECK constraints de la migración 017
// ─────────────────────────────────────────────────────────────────────────────
describe("M17 — migración 017: CHECK constraints en DB", () => {

  // ── M17-01: forma_pago '01' (efectivo) acepta INSERT ─────────────────────
  //
  // Este es el caso más crítico de esta ronda.
  // El CHECK solo valida el catálogo SAT; la restricción de deducibilidad D10
  // (efectivo no es deducible) la gestiona la CAPA DE APLICACIÓN (aviso al tutor,
  // no bloqueo). El INSERT con '01' debe persistir sin excepción.
  it("M17-01: invoices.forma_pago='01' (efectivo) — INSERT exitoso, valor persistido en DB", async () => {
    const { rows } = await pool.query(
      `INSERT INTO invoices (tenant_id, forma_pago)
       VALUES ($1, '01') RETURNING id, forma_pago`,
      [tenantId]
    );
    try {
      expect(rows[0].forma_pago).toBe("01");
    } finally {
      await pool.query(`DELETE FROM invoices WHERE id = $1`, [rows[0].id]);
    }
  });

  // ── M17-02: forma_pago acepta valores representativos del catálogo ────────
  it("M17-02: invoices.forma_pago acepta '03' (SPEI), '04' (tarjeta crédito) y '99' (por definir)", async () => {
    const formas = ["03", "04", "99"];
    const ids: number[] = [];
    for (const forma of formas) {
      const { rows } = await pool.query(
        `INSERT INTO invoices (tenant_id, forma_pago) VALUES ($1, $2) RETURNING id`,
        [tenantId, forma]
      );
      ids.push(rows[0].id as number);
    }
    try {
      const { rows: found } = await pool.query(
        `SELECT forma_pago FROM invoices WHERE id = ANY($1::int[]) ORDER BY forma_pago`,
        [ids]
      );
      expect(found.map((r: any) => r.forma_pago)).toEqual(["03", "04", "99"]);
    } finally {
      await pool.query(`DELETE FROM invoices WHERE id = ANY($1::int[])`, [ids]);
    }
  });

  // ── M17-03: forma_pago rechaza valor fuera del catálogo ───────────────────
  // '07' no existe en el catálogo incluido en la migración 017.
  it("M17-03: invoices.forma_pago='07' — viola CHECK, INSERT rechazado por DB", async () => {
    await expect(
      pool.query(
        `INSERT INTO invoices (tenant_id, forma_pago) VALUES ($1, '07')`,
        [tenantId]
      )
    ).rejects.toThrow(/violates check constraint/);
  });

  // ── M17-04: students.nivel_educativo acepta los 5 valores SAT ────────────
  it("M17-04: students.nivel_educativo acepta los 5 valores del catálogo SAT sin excepción", async () => {
    const niveles = [
      "Preescolar",
      "Primaria",
      "Secundaria",
      "Profesional técnico",
      "Bachillerato o su equivalente",
    ];
    const ids: number[] = [];
    for (const nivel of niveles) {
      const { rows } = await pool.query(
        `INSERT INTO students (tenant_id, campus_id, nombre_completo, nivel_educativo)
         VALUES ($1, $2, 'Alumno M17 Nivel', $3) RETURNING id`,
        [tenantId, campusId, nivel]
      );
      ids.push(rows[0].id as number);
    }
    try {
      const { rows: found } = await pool.query(
        `SELECT nivel_educativo FROM students WHERE id = ANY($1::int[])`,
        [ids]
      );
      expect(found).toHaveLength(5);
    } finally {
      await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [ids]);
    }
  });

  // ── M17-05: students.nivel_educativo rechaza valor fuera del catálogo ─────
  it("M17-05: students.nivel_educativo='Universidad' — viola CHECK, INSERT rechazado", async () => {
    await expect(
      pool.query(
        `INSERT INTO students (tenant_id, campus_id, nombre_completo, nivel_educativo)
         VALUES ($1, $2, 'Alumno M17 Bad', 'Universidad')`,
        [tenantId, campusId]
      )
    ).rejects.toThrow(/violates check constraint/);
  });

  // ── M17-06: payments.subtipo_tarjeta acepta 'credito', 'debito' y NULL ────
  // charge_id es nullable en payments — INSERT mínimo válido sin FK.
  it("M17-06: payments.subtipo_tarjeta acepta 'credito', 'debito' y NULL (tres INSERTs)", async () => {
    const casos: Array<string | null> = ["credito", "debito", null];
    const ids: number[] = [];
    for (const sub of casos) {
      const { rows } = await pool.query(
        `INSERT INTO payments (tenant_id, monto_centavos, metodo, subtipo_tarjeta)
         VALUES ($1, 1000, 'tarjeta', $2) RETURNING id, subtipo_tarjeta`,
        [tenantId, sub]
      );
      expect(rows[0].subtipo_tarjeta).toBe(sub);
      ids.push(rows[0].id as number);
    }
    await pool.query(`DELETE FROM payments WHERE id = ANY($1::int[])`, [ids]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE — CURP bloqueante en edición individual (PATCH /api/admin/students/:id)
// ─────────────────────────────────────────────────────────────────────────────
describe("CE — CURP bloqueante: PATCH /api/admin/students/:id", () => {

  // ── CE-01: CURP inválida → 400 ────────────────────────────────────────────
  // La validación es BLOQUEANTE: el endpoint devuelve 400 antes de hacer UPDATE.
  it("CE-01: CURP de formato incorrecto → 400, mensaje de error SAT, curp del alumno no cambia", async () => {
    const r    = await PATCH(`/api/admin/students/${studentId}`, { curp: "FORMATO-INVALIDO" });
    const body = await r.json() as any;

    expect(r.status, `body: ${JSON.stringify(body)}`).toBe(400);
    expect(body.message).toMatch(/CURP inválida/i);

    // El alumno se creó sin CURP — debe seguir siendo NULL
    const { rows } = await pool.query(
      `SELECT curp FROM students WHERE id = $1`, [studentId]
    );
    expect(rows[0].curp).toBeNull();
  });

  // ── CE-02: CURP válida → 200, valor guardado ──────────────────────────────
  it("CE-02: CURP de formato correcto → 200, CURP actualizada en DB", async () => {
    const curpValida = "JUGM900101HDFXXX01";
    const r    = await PATCH(`/api/admin/students/${studentId}`, { curp: curpValida });
    const body = await r.json() as any;

    expect(r.status, `body: ${JSON.stringify(body)}`).toBe(200);

    const { rows } = await pool.query(
      `SELECT curp FROM students WHERE id = $1`, [studentId]
    );
    expect(rows[0].curp).toBe(curpValida);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CB — CURP no-bloqueante en bulk import CSV
// ─────────────────────────────────────────────────────────────────────────────
describe("CB — CURP no-bloqueante: POST /api/import/data/estudiantes/estudiantes", () => {

  const createdCurps: string[] = [];

  afterAll(async () => {
    if (createdCurps.length) {
      await pool.query(
        `DELETE FROM students WHERE curp = ANY($1::text[]) AND tenant_id = $2`,
        [createdCurps, tenantId]
      );
    }
  });

  // ── CB-01: una fila inválida + una fila válida ────────────────────────────
  // La CURP inválida va a errors[] (no aborta el batch) y la fila no se inserta.
  // La CURP válida se inserta normalmente — successful=1.
  it("CB-01: CSV con una CURP inválida y una válida → 200, failed=1, successful=1, fila inválida ausente en DB", async () => {
    const tsCb1   = Date.now();
    // Prefijo CUBO: C(A-Z), U(vocal), B(A-Z), O(A-Z) — formato CURP válido
    const curpOk  = `CUBO${String(tsCb1 % 100).padStart(2, "0")}0101HNENNNA${tsCb1 % 10}`;
    createdCurps.push(curpOk);

    const csv = [
      "nombre_completo,curp",
      `Alumno CB Invalido,FORMATO-INVALIDO-001`,  // CURP inválida → errors[]
      `Alumno CB Valido,${curpOk}`,               // CURP válida   → successful
    ].join("\n");

    const { status, body } = await importEstudiantes(csv);

    expect(status).toBe(200);
    expect(body.failed, `body: ${JSON.stringify(body)}`).toBe(1);
    expect(body.successful).toBe(1);

    // errors[] describe el fallo (campo y motivo)
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body.errors)).toMatch(/CURP|curp|formato/i);

    // Fila inválida NO insertada
    const { rows: bad } = await pool.query(
      `SELECT id FROM students
       WHERE nombre_completo = 'Alumno CB Invalido' AND tenant_id = $1`,
      [tenantId]
    );
    expect(bad.length).toBe(0);

    // Fila válida SÍ insertada
    const { rows: good } = await pool.query(
      `SELECT id FROM students WHERE curp = $1 AND tenant_id = $2`,
      [curpOk, tenantId]
    );
    expect(good.length).toBe(1);
  });

  // ── CB-02: todas las filas con CURP inválida ──────────────────────────────
  // El batch termina con 200 (no 500): la validación no-bloqueante acumula en
  // errors[] pero no lanza excepción. successful=0, nada en DB.
  it("CB-02: CSV con dos CURPs inválidas → 200, failed=2, successful=0, ninguna fila en DB", async () => {
    const csv = [
      "nombre_completo,curp",
      `Alumno CB Bad A,AAAA-MAL-FORMATO`,   // contiene guiones y < 18 chars
      `Alumno CB Bad B,123456789012345AB`,   // empieza con dígito y 17 chars
    ].join("\n");

    const { status, body } = await importEstudiantes(csv);

    expect(status).toBe(200);
    expect(body.successful).toBe(0);
    expect(body.failed).toBe(2);

    const { rows } = await pool.query(
      `SELECT id FROM students
       WHERE nombre_completo IN ('Alumno CB Bad A', 'Alumno CB Bad B') AND tenant_id = $1`,
      [tenantId]
    );
    expect(rows.length).toBe(0);
  });
});
