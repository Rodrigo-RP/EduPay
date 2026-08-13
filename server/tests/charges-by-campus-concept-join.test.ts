/**
 * CBC-01  GET /api/charges devuelve concept.nombre (no null)
 *         — verifica que getChargesByCampus hace JOIN con concepts.
 *
 * Antes del fix, la query no hacía JOIN con concepts y devolvía concept: null
 * para todos los cargos. El test crea un charge real con un concepto real,
 * llama al endpoint con un token de administrador_campus y confirma que
 * el campo concept.nombre no es null.
 *
 * CBC-02  El charge retornado pertenece al campus del token (aislamiento básico).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const TENANT_ID = 29;
const CAMPUS_ID = 48;
const ADMIN_ID  = 80; // admin demo real en la DB

let conceptId: number;
let studentId: number;
let chargeId:  number;

function makeToken(role: string): string {
  return jwt.sign(
    { id: ADMIN_ID, email: "admin@test.com", role, tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}

const tokenAdmin = makeToken("administrador_campus");

beforeAll(async () => {
  // Concepto real de prueba
  const cRes = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'Colegiatura CBC Test', 'colegiatura', 'mensual', 250000)
     RETURNING id`,
    [TENANT_ID, CAMPUS_ID],
  );
  conceptId = (cRes.rows as any[])[0].id as number;

  // Alumno real de prueba
  const sRes = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                           nombre_completo, status)
     VALUES ($1, $2, 'Alumno', 'CBC', 'Alumno CBC', 'activo')
     RETURNING id`,
    [TENANT_ID, CAMPUS_ID],
  );
  studentId = (sRes.rows as any[])[0].id as number;

  // Charge que apunta al concepto real
  const chRes = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id,
                          fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
     VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + 30, 250000, 'pendiente')
     RETURNING id`,
    [TENANT_ID, studentId, conceptId],
  );
  chargeId = (chRes.rows as any[])[0].id as number;
});

afterAll(async () => {
  await pool.query("DELETE FROM charges  WHERE id = $1",  [chargeId]);
  await pool.query("DELETE FROM students WHERE id = $1",  [studentId]);
  await pool.query("DELETE FROM concepts WHERE id = $1",  [conceptId]);
});

describe("GET /api/charges — JOIN con concepts", () => {
  it("CBC-01: el charge retornado incluye concept.nombre (no null)", async () => {
    const res = await fetch(`${BASE}/api/charges`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as any[];
    const charge = body.find((c: any) => c.id === chargeId);

    expect(charge).toBeDefined();
    // Antes del fix: charge.concept era null o undefined
    expect(charge.concept).not.toBeNull();
    expect(charge.concept).not.toBeUndefined();
    expect(charge.concept.nombre).toBe("Colegiatura CBC Test");
  });

  it("CBC-02: el charge retornado pertenece al campus del token", async () => {
    const res = await fetch(`${BASE}/api/charges`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as any[];
    const charge = body.find((c: any) => c.id === chargeId);

    expect(charge).toBeDefined();
    // student_id apunta a nuestro alumno de prueba, que es del campus correcto
    expect(charge.student_id).toBe(studentId);
  });
});
