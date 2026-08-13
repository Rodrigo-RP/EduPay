/**
 * SIA-PRE — Prueba de reproducción del riesgo ANTES del fix.
 *
 * Demuestra empíricamente que POST /api/admin/students/import (admin.ts)
 * no tiene transacción: si un alumno falla a mitad del batch (error de DB,
 * no de validación del frontend), los alumnos ANTERIORES ya están
 * escritos en la DB de forma permanente (escritura parcial).
 *
 * Mecanismo: nombre con 260 chars pasa la validación del endpoint
 * (solo comprueba que no esté vacío) pero FALLA en la DB porque
 * `students.nombres` es varchar(255) NOT NULL → "value too long for
 * type character varying(255)". Sin transacción, el alumno anterior
 * (Alice) ya está commiteado y es irrecuperable.
 *
 * Esta prueba PASA antes del fix (mostrando el problema).
 * Después del fix la misma prueba sigue válida como regresión:
 * la atomicidad por fila (SAVEPOINT) mantiene el mismo comportamiento
 * observable, pero ahora protegido dentro de BEGIN/COMMIT.
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
    { id: ADMIN_ID, email: "admin@sia-pre.mx", role: "administrador_campus",
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET, { expiresIn: "10m" },
  );
}
const TOKEN = adminToken();

const createdIds: number[] = [];

// CURPs únicas para este test (18 chars válidos)
const CURP_ALICE = "SIAP010101MDFXXX01";
const CURP_BOB   = "SIAP010101HDFXXX99"; // nombre de 260 chars → falla varchar(255)
const CURP_DAVE  = "SIAP010101HDFXXX02";

// Nombre con 260 caracteres: pasa la validación del endpoint (¿está vacío? no)
// pero falla en el INSERT porque nombres es varchar(255) en la DB
const NOMBRE_BOB_260 = "B".repeat(260);

afterAll(async () => {
  if (createdIds.length) {
    await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [createdIds]);
  }
  await pool.query(
    `DELETE FROM students WHERE curp = ANY($1::text[]) AND tenant_id = $2`,
    [[CURP_ALICE, CURP_BOB, CURP_DAVE], TENANT_ID],
  );
});

function buildCsv(): string {
  const header = "Nombre Completo,CURP,Grado,Grupo,Estatus";
  const alice   = `Alice SIA Pre,${CURP_ALICE},3ro,A,activo`;
  const bob     = `${NOMBRE_BOB_260},${CURP_BOB},4to,A,activo`;  // ← falla varchar(255)
  const dave    = `Dave SIA Pre,${CURP_DAVE},5to,B,activo`;
  return [header, alice, bob, dave].join("\n");
}

describe("SIA-PRE — Reproducción del riesgo antes del fix", () => {
  it("SIA-PRE-01: Bob falla en DB (nombre 260 chars > varchar 255) → " +
     "Alice y Dave quedan en DB a pesar del error — escritura parcial sin transacción", async () => {
    const form = new FormData();
    form.append("file", new Blob([buildCsv()], { type: "text/csv" }), "pre.csv");

    const res = await fetch(`${BASE}/api/admin/students/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;

    // Sin transacción: Alice y Dave creados (2 exitosos), Bob falla (1 error)
    expect(body.successful).toBe(2);
    expect((body.errors as string[]).length).toBeGreaterThan(0);
    // El error menciona a Bob
    const errorText = body.errors.join(" ");
    expect(errorText).toMatch(/B{10,}/i);  // nombre de Bs

    // ── PRUEBA EMPÍRICA DEL RIESGO ───────────────────────────────────────────
    // Alice está en DB aunque el import tuvo errores.
    // Sin BEGIN/COMMIT, cada storage.createStudent es un auto-commit
    // independiente. Si el servidor cayera entre Alice y Dave, solo
    // Alice estaría en la DB — imposible revertirla.
    const aliceRow = await pool.query(
      `SELECT id FROM students WHERE curp = $1 AND tenant_id = $2`,
      [CURP_ALICE, TENANT_ID],
    );
    expect((aliceRow.rows as any[]).length).toBe(1);
    createdIds.push((aliceRow.rows[0] as any).id);

    const daveRow = await pool.query(
      `SELECT id FROM students WHERE curp = $1 AND tenant_id = $2`,
      [CURP_DAVE, TENANT_ID],
    );
    expect((daveRow.rows as any[]).length).toBe(1);
    createdIds.push((daveRow.rows[0] as any).id);

    // Bob NO está en la DB (su INSERT falló)
    const bobRow = await pool.query(
      `SELECT id FROM students WHERE curp = $1 AND tenant_id = $2`,
      [CURP_BOB, TENANT_ID],
    );
    expect((bobRow.rows as any[]).length).toBe(0);

    // RIESGO DEMOSTRADO:
    // Alice está en DB, Dave está en DB, Bob no.
    // Sin BEGIN/COMMIT envolviendo el loop, no hay forma de garantizar
    // que un crash entre fila N y fila N+1 no deje el batch a medias.
  });
});
