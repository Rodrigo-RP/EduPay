/**
 * Tests dedicados para POST /api/admin/charges/:chargeId/pagar-manual
 *
 * PM-01  cargo pendiente → 200, payment + payment_application creados, charge='pagado'
 * PM-02  cargo ya pagado → 409
 * PM-03  cargo cancelado → 422
 *
 * El caso cross-tenant (admin de otro tenant → 403) vive en tenant-http.test.ts (T14).
 *
 * JWT sin campo 'id' para evitar rollback silencioso por FK audit_log.user_id
 * (ver memoria: audit-log-fk-rollback.md).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  tenants, campuses, students, concepts,
} from "../../shared/schema";
import jwt from "jsonwebtoken";
import { markChargeAsPaidForTest } from "./test-helpers";
import { resetApiAuthRateLimitStore } from "../security-middleware";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ──────────────────────────────────────────────────────
let tenantId:    number;
let campusId:    number;
let studentId:   number;
let conceptId:   number;
let adminToken:  string;

// Charges por caso — se crean en beforeAll para no tener dependencias de orden
let chargeHappyId:      number;  // PM-01: pendiente → endpoint lo paga
let chargeAlreadyPaidId: number; // PM-02: ya pagado antes de llegar
let chargeCancelledId:  number;  // PM-03: cancelado

// ── Helpers ────────────────────────────────────────────────────────────────
function makeToken(): string {
  // Sin 'id': evita FK audit_log.user_id (ver audit-log-fk-rollback.md)
  return jwt.sign(
    { email: "pagar-manual-test@test.internal", role: "administrador_campus",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function post(path: string, body: object): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function mkCharge(estado: "pendiente" | "cancelado"): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
        monto_base_centavos, estado)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE+30,80000,$4) RETURNING id`,
    [tenantId, studentId, conceptId, estado]
  );
  return (r.rows[0] as any).id as number;
}

// ── Setup / Teardown ───────────────────────────────────────────────────────
beforeAll(async () => {
  resetApiAuthRateLimitStore(); // Evita 429 por acumulación entre corridas consecutivas
  const ts = Date.now().toString().slice(-7);

  const [t] = await db.insert(tenants).values({
    nombre_legal: `PagarManual ${ts}`,
    rfc: `PM${ts}`,
  }).returning();
  tenantId = t.id;

  const [c] = await db.insert(campuses).values({
    tenant_id: tenantId,
    nombre: `Campus PM ${ts}`,
  }).returning();
  campusId = c.id;

  const [s] = await db.insert(students).values({
    tenant_id: tenantId, campus_id: campusId,
    nombres: "Alumno", apellido_paterno: "PagarManual",
    nombre_completo: `Alumno PagarManual ${ts}`, status: "activo",
  }).returning();
  studentId = s.id;

  const r = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Cuota PM Test','colegiatura','mensual',80000) RETURNING id`,
    [tenantId, campusId]
  );
  conceptId = (r.rows[0] as any).id;

  adminToken = makeToken();

  // Crear los tres charges
  chargeHappyId       = await mkCharge("pendiente");
  chargeAlreadyPaidId = await mkCharge("pendiente");
  chargeCancelledId   = await mkCharge("cancelado");

  // Marcar chargeAlreadyPaidId como pagado ANTES del test (respetando invariante)
  await markChargeAsPaidForTest(pool, chargeAlreadyPaidId, 80000, tenantId);
});

afterAll(async () => {
  if (!tenantId) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM payment_applications WHERE charge_id IN
         (SELECT id FROM charges WHERE tenant_id = $1)`,
      [tenantId]
    );
    await client.query(`DELETE FROM payments WHERE tenant_id = $1`, [tenantId]);
    await client.query(`DELETE FROM charges  WHERE tenant_id = $1`, [tenantId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await pool.query(`DELETE FROM students  WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM concepts  WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses  WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants   WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/charges/:chargeId/pagar-manual", () => {

  // ── PM-01: happy path ────────────────────────────────────────────────────
  it("PM-01: cargo pendiente → 200, payment + payment_application creados, charge queda 'pagado'", async () => {
    const r = await post(
      `/api/admin/charges/${chargeHappyId}/pagar-manual`,
      { metodo: "efectivo", observaciones: "Test PM-01" }
    );

    expect(r.status).toBe(200);
    expect(r.body.payment_id).toBeDefined();
    expect(r.body.saldo_pagado_centavos).toBe(80000);

    // Verificar en DB: payment creado
    const pay = await pool.query(
      `SELECT id, monto_centavos, estado FROM payments WHERE id = $1`,
      [r.body.payment_id]
    );
    expect(pay.rows.length).toBe(1);
    expect(Number((pay.rows[0] as any).monto_centavos)).toBe(80000);
    expect((pay.rows[0] as any).estado).toBe("exitoso");

    // Verificar payment_application
    const pa = await pool.query(
      `SELECT amount_centavos FROM payment_applications WHERE charge_id = $1 AND payment_id = $2`,
      [chargeHappyId, r.body.payment_id]
    );
    expect(pa.rows.length).toBe(1);
    expect(Number((pa.rows[0] as any).amount_centavos)).toBe(80000);

    // Verificar charge queda pagado
    const ch = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeHappyId]);
    expect((ch.rows[0] as any).estado).toBe("pagado");
  });

  // ── PM-02: ya pagado → 409 ───────────────────────────────────────────────
  it("PM-02: cargo que ya está 'pagado' → 409 sin crear payment ni payment_application nuevos", async () => {
    // Contar aplicaciones antes
    const paBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM payment_applications WHERE charge_id = $1`,
      [chargeAlreadyPaidId]
    );
    const countBefore = Number((paBefore.rows[0] as any).n);

    const r = await post(
      `/api/admin/charges/${chargeAlreadyPaidId}/pagar-manual`,
      { metodo: "efectivo" }
    );

    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/ya está pagado/i);

    // No se creó ninguna aplicación nueva
    const paAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM payment_applications WHERE charge_id = $1`,
      [chargeAlreadyPaidId]
    );
    expect(Number((paAfter.rows[0] as any).n)).toBe(countBefore);
  });

  // ── PM-03: cancelado → 422 ──────────────────────────────────────────────
  it("PM-03: cargo 'cancelado' → 422 sin crear payment ni payment_application", async () => {
    const r = await post(
      `/api/admin/charges/${chargeCancelledId}/pagar-manual`,
      { metodo: "transferencia" }
    );

    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/cancelado/i);

    // Sin pagos creados para este charge
    const pay = await pool.query(
      `SELECT COUNT(*) AS n FROM payments WHERE charge_id = $1`,
      [chargeCancelledId]
    );
    expect(Number((pay.rows[0] as any).n)).toBe(0);
  });
});
