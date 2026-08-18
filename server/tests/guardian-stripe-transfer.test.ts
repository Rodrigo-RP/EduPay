/**
 * TESTS — Stripe Connect routing en POST /api/guardian/pagar
 *
 * Cubre los tres casos de falla documentados en la tarea #207:
 *
 * T1  Campus sin Connect → pago procede (simulación), needs_liquidacion_manual=true,
 *                           Stripe NO invocado, DB actualizada correctamente.
 * T2  Campus con Connect + payment_method_id → PaymentIntent creado con
 *                           transfer_data.destination = stripe_account_id del campus;
 *                           referencia_pasarela = pi_...; cargo marcado 'pagado'.
 * T3  Stripe rechaza el cargo (card_declined) → HTTP 402, charges.estado sigue
 *                           'pendiente', no hay row en payments — DB intacta.
 *
 * Nota sobre application_fee_amount:
 *   T2 verifica que el parámetro vale 0. No existe aún una decisión de negocio
 *   sobre la tarifa de plataforma Refereence. Cuando se defina, actualizar tanto
 *   el código (campus-payment.ts TODO) como este test.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { pool, db } from "../db";
import { tenants, campuses } from "../../shared/schema";
import jwt from "jsonwebtoken";
import { registerGuardianRoutes } from "../routes/guardian";
import type { StripeGuardianClient } from "../routes/guardian";

const JWT_SECRET      = process.env.JWT_SECRET || "fallback-secret-key";
const TEST_PORT       = 5098;
const TEST_BASE       = `http://localhost:${TEST_PORT}`;
const MOCK_STRIPE_ACCT = "acct_test_guardian_stripe_mock";
const MOCK_PI_ID       = "pi_test_mock_succeeded_001";

// ── Mocks de Stripe ───────────────────────────────────────────────────────────
const mockPICreate = vi.fn().mockResolvedValue({ id: MOCK_PI_ID, status: "succeeded" });
const mockPICancel = vi.fn().mockResolvedValue({ id: MOCK_PI_ID });

const mockStripe: StripeGuardianClient = {
  paymentIntents: { create: mockPICreate, cancel: mockPICancel },
};

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;

// Campus A: sin Connect activo (T1)
let campusNoConnectId: number;
// Campus B: con Connect activo → campus_payment_config con charges_enabled=true (T2, T3)
let campusConnectedId: number;

let guardianNoConnectId: number;
let guardianConnectedId: number;

let chargeNoConnectId:  number; // para T1
let chargeConnectedId:  number; // para T2
let chargeConnectedId2: number; // para T3 (diferente al de T2 que quedará 'pagado')

let testServer: Server;

function makeGuardianToken(gId: number, cId: number, tId: number): string {
  // Sin 'type': StripeGuardian usa type="guardian"
  return jwt.sign(
    { id: gId, campus_id: cId, tenant_id: tId, type: "guardian" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

let tokenNoConnect: string;
let tokenConnected:  string;

// ── Helper HTTP ───────────────────────────────────────────────────────────────
async function pagar(
  tok: string,
  chargeIds: number[],
  paymentMethodId?: string
): Promise<{ status: number; body: any }> {
  const body: Record<string, unknown> = { charge_ids: chargeIds };
  if (paymentMethodId) body.payment_method_id = paymentMethodId;
  const r = await fetch(`${TEST_BASE}/api/guardian/pagar`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // Tenant
  const [t] = await db
    .insert(tenants)
    .values({ nombre_legal: `GST ${ts}`, rfc: `GST${ts}` })
    .returning();
  tenantId = t.id;

  // Campus A (sin Connect)
  const [cA] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `NoConn ${ts}` })
    .returning();
  campusNoConnectId = cA.id;

  // Campus B (con Connect) — insertar fila en campus_payment_config
  const [cB] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Conn ${ts}` })
    .returning();
  campusConnectedId = cB.id;
  await pool.query(
    `INSERT INTO campus_payment_config
       (campus_id, tenant_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
     VALUES ($1, $2, $3, true, true, true)`,
    [campusConnectedId, tenantId, MOCK_STRIPE_ACCT]
  );

  // Concepts (necesario como FK para charges)
  const { rows: conA } = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'ColegiaturaGST', 'colegiatura', 'mensual', 60000) RETURNING id`,
    [campusNoConnectId, tenantId]
  );
  const conceptNoConnectId = conA[0].id;

  const { rows: conB } = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'ColegiaturaGST', 'colegiatura', 'mensual', 60000) RETURNING id`,
    [campusConnectedId, tenantId]
  );
  const conceptConnectedId = conB[0].id;

  // Students
  const { rows: stA } = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, grado, id_referencia)
     VALUES ($1, $2, 'Alumno NoConn', '1', $3) RETURNING id`,
    [campusNoConnectId, tenantId, `NC${ts}`]
  );
  const studentNoConnectId: number = stA[0].id;

  const { rows: stB } = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, grado, id_referencia)
     VALUES ($1, $2, 'Alumno Conn', '1', $3) RETURNING id`,
    [campusConnectedId, tenantId, `CO${ts}`]
  );
  const studentConnectedId: number = stB[0].id;

  // Guardians (la tabla NO tiene campus_id/tenant_id — esos van en el JWT)
  const { rows: gA } = await pool.query(
    `INSERT INTO guardians (nombre_completo, email) VALUES ($1, $2) RETURNING id`,
    [`Guardian NoConn ${ts}`, `gnc${ts}@gst.test`]
  );
  guardianNoConnectId = gA[0].id;

  const { rows: gB } = await pool.query(
    `INSERT INTO guardians (nombre_completo, email) VALUES ($1, $2) RETURNING id`,
    [`Guardian Conn ${ts}`, `gc${ts}@gst.test`]
  );
  guardianConnectedId = gB[0].id;

  // student_guardian (la tabla usa student_id + guardian_id; sin tipo_guardian)
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1, $2)`,
    [studentNoConnectId, guardianNoConnectId]
  );
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1, $2)`,
    [studentConnectedId, guardianConnectedId]
  );

  // Charges
  const { rows: chA } = await pool.query(
    `INSERT INTO charges (student_id, tenant_id, concept_id, monto_base_centavos, estado,
                          fecha_emision, fecha_vencimiento)
     VALUES ($1, $2, $3, 60000, 'pendiente', CURRENT_DATE, CURRENT_DATE + 30) RETURNING id`,
    [studentNoConnectId, tenantId, conceptNoConnectId]
  );
  chargeNoConnectId = chA[0].id;

  const { rows: chB1 } = await pool.query(
    `INSERT INTO charges (student_id, tenant_id, concept_id, monto_base_centavos, estado,
                          fecha_emision, fecha_vencimiento)
     VALUES ($1, $2, $3, 60000, 'pendiente', CURRENT_DATE, CURRENT_DATE + 30) RETURNING id`,
    [studentConnectedId, tenantId, conceptConnectedId]
  );
  chargeConnectedId = chB1[0].id;

  const { rows: chB2 } = await pool.query(
    `INSERT INTO charges (student_id, tenant_id, concept_id, monto_base_centavos, estado,
                          fecha_emision, fecha_vencimiento)
     VALUES ($1, $2, $3, 60000, 'pendiente', CURRENT_DATE, CURRENT_DATE + 30) RETURNING id`,
    [studentConnectedId, tenantId, conceptConnectedId]
  );
  chargeConnectedId2 = chB2[0].id;

  // JWTs de guardian (campus_id y tenant_id vienen del token, no de la tabla)
  tokenNoConnect = makeGuardianToken(guardianNoConnectId, campusNoConnectId, tenantId);
  tokenConnected  = makeGuardianToken(guardianConnectedId, campusConnectedId, tenantId);

  // Servidor Express mínimo que replica la cadena relevante para este endpoint
  const testApp = express();
  testApp.use(express.json());
  await registerGuardianRoutes(testApp, mockStripe);

  await new Promise<void>((resolve, reject) => {
    testServer = testApp.listen(TEST_PORT, resolve);
    testServer.once("error", reject);
  });
});

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await new Promise<void>((resolve) => testServer.close(resolve));

  // Limpiar en orden FK-safe
  await pool.query(
    `DELETE FROM payment_applications
      WHERE payment_id IN (SELECT id FROM payments WHERE tenant_id = $1)`,
    [tenantId]
  );
  await pool.query(`DELETE FROM invoices WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payments WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
  await pool.query(
    `DELETE FROM student_guardian
      WHERE student_id IN (SELECT id FROM students WHERE tenant_id = $1)`,
    [tenantId]
  );
  await pool.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM guardians WHERE id IN ($1, $2)`, [guardianNoConnectId, guardianConnectedId]);
  await pool.query(`DELETE FROM concepts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(
    `DELETE FROM campus_payment_config WHERE campus_id IN ($1, $2)`,
    [campusNoConnectId, campusConnectedId]
  );
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ═════════════════════════════════════════════════════════════════════════════
// T1 — Campus sin Connect: pago procede, marcado para liquidación manual
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/guardian/pagar — campus sin Stripe Connect", () => {
  it("T1: campus sin Connect → 200, via_stripe_connect=false, needs_liquidacion_manual=true, Stripe NO invocado", async () => {
    const piCreatesBefore = mockPICreate.mock.calls.length;

    const { status, body } = await pagar(tokenNoConnect, [chargeNoConnectId]);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const result = body.payments?.[0];
    expect(result?.charge_id).toBe(chargeNoConnectId);
    expect(result?.via_stripe_connect).toBe(false);
    expect(result?.needs_liquidacion_manual).toBe(true);
    expect(result?.payment_id).toBeTypeOf("number");

    // Stripe NO debe ser invocado (campus no tiene Connect activo)
    expect(mockPICreate.mock.calls.length).toBe(piCreatesBefore);

    // El cargo quedó marcado como 'pagado' en DB
    const { rows: chargeRows } = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`,
      [chargeNoConnectId]
    );
    expect(chargeRows[0].estado).toBe("pagado");

    // El pago existe en DB con referencia simulada (prefijo sim_)
    const { rows: payRows } = await pool.query(
      `SELECT referencia_pasarela FROM payments WHERE charge_id = $1`,
      [chargeNoConnectId]
    );
    expect(payRows).toHaveLength(1);
    expect(payRows[0].referencia_pasarela).toMatch(/^sim_/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T2 — Campus con Connect: transfer_data presente en el PaymentIntent
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/guardian/pagar — campus con Stripe Connect activo", () => {
  it("T2: campus activo + payment_method_id → PI creado con transfer_data.destination correcto", async () => {
    const piCreatesBefore = mockPICreate.mock.calls.length;

    const { status, body } = await pagar(
      tokenConnected,
      [chargeConnectedId],
      "pm_test_mock_visa_4242"
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const result = body.payments?.[0];
    expect(result?.charge_id).toBe(chargeConnectedId);
    expect(result?.via_stripe_connect).toBe(true);
    expect(result?.needs_liquidacion_manual).toBe(false);

    // Stripe invocado exactamente una vez más
    expect(mockPICreate.mock.calls.length).toBe(piCreatesBefore + 1);
    const [piParams] = mockPICreate.mock.calls[piCreatesBefore];

    // Verificar parámetros críticos del PaymentIntent
    expect(piParams.amount).toBe(60000);               // centavos del cargo
    expect(piParams.currency).toBe("mxn");
    expect(piParams.payment_method).toBe("pm_test_mock_visa_4242");
    expect(piParams.confirm).toBe(true);
    expect(piParams.transfer_data?.destination).toBe(MOCK_STRIPE_ACCT);
    // application_fee_amount=0 (sin decisión de negocio tomada aún)
    expect(piParams.application_fee_amount).toBe(0);

    // El pago en DB usa el PI ID como referencia_pasarela (no sim_)
    const { rows: payRows } = await pool.query(
      `SELECT referencia_pasarela FROM payments WHERE charge_id = $1`,
      [chargeConnectedId]
    );
    expect(payRows).toHaveLength(1);
    expect(payRows[0].referencia_pasarela).toBe(MOCK_PI_ID);

    // El cargo quedó pagado
    const { rows: chargeRows } = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`,
      [chargeConnectedId]
    );
    expect(chargeRows[0].estado).toBe("pagado");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T3 — Stripe rechaza: 402, DB intacta
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/guardian/pagar — Stripe rechaza la transferencia", () => {
  it("T3: Stripe.create lanza error → 402, charges.estado='pendiente', sin payment en DB", async () => {
    // Configurar mock para fallar una sola vez (T3 no debe afectar a T2)
    mockPICreate.mockRejectedValueOnce(
      Object.assign(new Error("Your card has insufficient funds."), {
        code: "card_declined",
        decline_code: "insufficient_funds",
      })
    );

    const { status, body } = await pagar(
      tokenConnected,
      [chargeConnectedId2],
      "pm_test_mock_declined_card"
    );

    expect(status).toBe(402);
    expect(body.message).toMatch(/rechazado/i);
    expect(body.detalle).toMatch(/insufficient funds/i);
    expect(body.charge_id).toBe(chargeConnectedId2);

    // El cargo NO fue modificado — sigue pendiente
    const { rows: chargeRows } = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`,
      [chargeConnectedId2]
    );
    expect(chargeRows[0].estado).toBe("pendiente");

    // No hay payment creado para este cargo — DB completamente intacta
    const { rows: payRows } = await pool.query(
      `SELECT id FROM payments WHERE charge_id = $1`,
      [chargeConnectedId2]
    );
    expect(payRows).toHaveLength(0);
  });
});
