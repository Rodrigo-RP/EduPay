/**
 * Tests para POST /api/admin/cargos/extraordinario (charges.ts:181-235)
 *
 * EX-01  Camino feliz: student + monto sin concept_id → 201, charge creado con
 *         concepto ad-hoc de tipo 'extraordinario'.
 * EX-02  400 cuando falta student_id o monto.
 * EX-03a Concepto ad-hoc reutilizado si descripcion coincide con un concepto
 *         ya existente del tenant (sin duplicado).
 * EX-03b Concepto ad-hoc creado de tipo 'extraordinario' si no hay coincidencia.
 * EX-04  403 si concept_id pertenece a otro tenant.
 *
 * El 403 por alumno de otro tenant ya está en tenant-http.test.ts (T1).
 * JWT sin 'id' para evitar rollback silencioso por FK audit_log.user_id
 * (ver memoria: audit-log-fk-rollback.md).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  tenants, campuses, students, concepts,
} from "../../shared/schema";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ──────────────────────────────────────────────────────
let tenantAId:  number;
let tenantBId:  number;
let campusAId:  number;
let campusBId:  number;
let studentAId: number;
let conceptAId: number; // concepto existente en tenant A — para EX-03a y EX-04
let conceptBId: number; // concepto en tenant B — para EX-04
let tokenA:     string;

function makeToken(tenantId: number, campusId: number): string {
  return jwt.sign(
    { email: "extraordinario-test@test.internal",
      role: "administrador_campus",
      campus_id: campusId,
      tenant_id: tenantId,
      type: "user"
      // Sin 'id' — evita FK audit_log (audit-log-fk-rollback.md)
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function post(path: string, body: object, token: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup / Teardown ───────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // Tenant A
  const [tA] = await db.insert(tenants).values({
    nombre_legal: `ExtraordTest A ${ts}`,
    rfc: `EXA${ts}`,
  }).returning();
  tenantAId = tA.id;

  const [cA] = await db.insert(campuses).values({
    tenant_id: tenantAId,
    nombre: `Campus EXT A ${ts}`,
  }).returning();
  campusAId = cA.id;

  const [sA] = await db.insert(students).values({
    tenant_id: tenantAId,
    campus_id: campusAId,
    nombres: "Alumno",
    apellido_paterno: "ExtraTest",
    nombre_completo: `Alumno ExtraTest ${ts}`,
    status: "activo",
  }).returning();
  studentAId = sA.id;

  // Concepto ya existente en tenant A (para EX-03a y EX-04)
  const rConA = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Examen Reposicion','extraordinario','unica',50000) RETURNING id`,
    [tenantAId, campusAId]
  );
  conceptAId = (rConA.rows[0] as any).id;

  // Tenant B (para EX-04)
  const [tB] = await db.insert(tenants).values({
    nombre_legal: `ExtraordTest B ${ts}`,
    rfc: `EXB${ts}`,
  }).returning();
  tenantBId = tB.id;

  const [cB] = await db.insert(campuses).values({
    tenant_id: tenantBId,
    nombre: `Campus EXT B ${ts}`,
  }).returning();
  campusBId = cB.id;

  // Concepto en tenant B
  const rConB = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Material B','colegiatura','mensual',80000) RETURNING id`,
    [tenantBId, campusBId]
  );
  conceptBId = (rConB.rows[0] as any).id;

  tokenA = makeToken(tenantAId, campusAId);
});

afterAll(async () => {
  if (!tenantAId && !tenantBId) return;
  const tIds = [tenantAId, tenantBId].filter(Boolean);
  const tList = tIds.join(",");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM payment_applications WHERE charge_id IN
         (SELECT id FROM charges WHERE tenant_id IN (${tList}))`,
    );
    await client.query(`DELETE FROM payments WHERE tenant_id IN (${tList})`);
    await client.query(`DELETE FROM charges   WHERE tenant_id IN (${tList})`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await pool.query(`DELETE FROM students WHERE tenant_id IN (${tList})`).catch(() => {});
  await pool.query(`DELETE FROM concepts WHERE tenant_id IN (${tList})`).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id IN (${tList})`).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id IN (${tList})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/cargos/extraordinario", () => {

  // ── EX-01: camino feliz ─────────────────────────────────────────────────
  it("EX-01: student_id + monto sin concept_id → 201, charge creado con concepto ad-hoc tipo 'extraordinario'", async () => {
    const r = await post("/api/admin/cargos/extraordinario", {
      student_id: studentAId,
      monto: "750",          // 750 pesos → 75 000 centavos
      descripcion: "Certificado de estudios extraordinario",
    }, tokenA);

    expect(r.status).toBe(201);
    expect(r.body.charge).toBeDefined();
    expect(Number(r.body.charge.monto_base_centavos)).toBe(75_000);
    expect(r.body.charge.student_id).toBe(studentAId);
    expect(r.body.charge.estado).toBe("pendiente");

    // El concepto creado ad-hoc debe ser de tipo 'extraordinario'
    const conceptRow = await pool.query(
      `SELECT tipo FROM concepts WHERE id = $1`,
      [r.body.charge.concept_id]
    );
    expect((conceptRow.rows[0] as any).tipo).toBe("extraordinario");
  });

  // ── EX-02: 400 por campos faltantes ────────────────────────────────────
  it("EX-02a: sin student_id → 400", async () => {
    const r = await post("/api/admin/cargos/extraordinario", {
      monto: "500",
    }, tokenA);
    expect(r.status).toBe(400);
  });

  it("EX-02b: sin monto → 400", async () => {
    const r = await post("/api/admin/cargos/extraordinario", {
      student_id: studentAId,
    }, tokenA);
    expect(r.status).toBe(400);
  });

  // ── EX-03a: descripción coincide con concepto existente → reutiliza ────
  it("EX-03a: descripcion coincide con un concepto ya existente del tenant → reutiliza; sin duplicado", async () => {
    // Contar conceptos con ese nombre antes
    const before = await pool.query(
      `SELECT COUNT(*) AS n FROM concepts WHERE campus_id = $1 AND nombre = 'Examen Reposicion'`,
      [campusAId]
    );
    const countBefore = Number((before.rows[0] as any).n);
    expect(countBefore).toBe(1); // solo el que creamos en beforeAll

    const r = await post("/api/admin/cargos/extraordinario", {
      student_id: studentAId,
      monto: "200",
      descripcion: "Examen Reposicion", // coincide exactamente con conceptAId
    }, tokenA);

    expect(r.status).toBe(201);

    // No se creó un concepto duplicado
    const after = await pool.query(
      `SELECT COUNT(*) AS n FROM concepts WHERE campus_id = $1 AND nombre = 'Examen Reposicion'`,
      [campusAId]
    );
    expect(Number((after.rows[0] as any).n)).toBe(countBefore);

    // El charge usa el concepto ya existente
    expect(r.body.charge.concept_id).toBe(conceptAId);
  });

  // ── EX-03b: descripción nueva → crea concepto ad-hoc tipo 'extraordinario'
  it("EX-03b: descripcion sin coincidencia → crea concepto nuevo de tipo 'extraordinario'", async () => {
    const nombreNuevo = `Constancia especial ${Date.now()}`;

    // Verificar que no existe antes
    const before = await pool.query(
      `SELECT COUNT(*) AS n FROM concepts WHERE campus_id = $1 AND nombre = $2`,
      [campusAId, nombreNuevo]
    );
    expect(Number((before.rows[0] as any).n)).toBe(0);

    const r = await post("/api/admin/cargos/extraordinario", {
      student_id: studentAId,
      monto: "300",
      descripcion: nombreNuevo,
    }, tokenA);

    expect(r.status).toBe(201);

    // Concepto nuevo creado con tipo 'extraordinario'
    const conceptRow = await pool.query(
      `SELECT tipo, nombre FROM concepts WHERE id = $1`,
      [r.body.charge.concept_id]
    );
    expect((conceptRow.rows[0] as any).tipo).toBe("extraordinario");
    expect((conceptRow.rows[0] as any).nombre).toBe(nombreNuevo);
  });

  // ── EX-04: concept_id de otro tenant → 403 ─────────────────────────────
  it("EX-04: concept_id pertenece a tenant B, token de tenant A → 403", async () => {
    // tokenA tiene tenant_id = tenantAId; conceptBId pertenece a tenantBId
    const r = await post("/api/admin/cargos/extraordinario", {
      student_id: studentAId,
      monto: "500",
      concept_id: conceptBId,
    }, tokenA);

    expect(r.status).toBe(403);
    expect((r.body as any).message).toMatch(/acceso denegado|concepto/i);

    // Ningún charge fue creado
    const ch = await pool.query(
      `SELECT COUNT(*) AS n FROM charges
       WHERE student_id = $1 AND concept_id = $2`,
      [studentAId, conceptBId]
    );
    expect(Number((ch.rows[0] as any).n)).toBe(0);
  });
});
