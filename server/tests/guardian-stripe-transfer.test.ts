import { SCHOOL_TODAY_SQL } from "../../shared/school-date";
/**
 * TESTS — Stripe Connect routing en POST /api/guardian/pagar
 *
 * Stripe simulado en su SDK; firmas HMAC verificadas localmente, sin red externa.
 *
 * T1  Campus sin Connect → 422, Stripe NO invocado y DB intacta.
 * T2  Campus con Connect + payment_method_id → PaymentIntent creado con
 *                           transfer_data.destination = stripe_account_id del campus;
 *                           referencia_pasarela = pi_...; cargo marcado 'pagado'.
 * T3  Stripe rechaza el cargo (card_declined) → HTTP 402, charges.estado sigue
 *                           'pendiente', no hay row en payments — DB intacta.
 *
 * Nota sobre application_fee_amount:
 *   T2 conserva la comisión de plataforma cero del flujo existente.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { pool, db } from "../db";
import { tenants, campuses } from "../../shared/schema";
import jwt from "jsonwebtoken";
import { registerGuardianRoutes } from "../routes/guardian";
import { registerStripeWebhookRoute } from "../routes/campus-payment";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { settleStripeCardPaymentIntent, type StripePaymentIntentResult } from "../lib/stripe-card-settlement";
import type { StripeGuardianClient } from "../routes/guardian";

import { JWT_SECRET } from "../routes/shared";
const TEST_PORT       = 5098;
const TEST_BASE       = `http://localhost:${TEST_PORT}`;
const MOCK_STRIPE_ACCT = "acct_test_guardian_stripe_mock";
const MOCK_PI_ID       = "pi_test_mock_succeeded_001";

// ── Mocks de Stripe ───────────────────────────────────────────────────────────
const mockPICreate = vi.fn().mockImplementation(async (params) => ({
  ...params, id: MOCK_PI_ID, status: "succeeded", amount_received: params.amount,
}));
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
const offlineStripe = new Stripe("offline-fixture-no-network");
const webhookFixtureSecret = randomUUID();

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
     VALUES ($1, $2, $3, 60000, 'pendiente', ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL} + 30) RETURNING id`,
    [studentNoConnectId, tenantId, conceptNoConnectId]
  );
  chargeNoConnectId = chA[0].id;

  const { rows: chB1 } = await pool.query(
    `INSERT INTO charges (student_id, tenant_id, concept_id, monto_base_centavos, estado,
                          fecha_emision, fecha_vencimiento)
     VALUES ($1, $2, $3, 60000, 'pendiente', ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL} + 30) RETURNING id`,
    [studentConnectedId, tenantId, conceptConnectedId]
  );
  chargeConnectedId = chB1[0].id;

  const { rows: chB2 } = await pool.query(
    `INSERT INTO charges (student_id, tenant_id, concept_id, monto_base_centavos, estado,
                          fecha_emision, fecha_vencimiento)
     VALUES ($1, $2, $3, 60000, 'pendiente', ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL} + 30) RETURNING id`,
    [studentConnectedId, tenantId, conceptConnectedId]
  );
  chargeConnectedId2 = chB2[0].id;

  // JWTs de guardian (campus_id y tenant_id vienen del token, no de la tabla)
  tokenNoConnect = makeGuardianToken(guardianNoConnectId, campusNoConnectId, tenantId);
  tokenConnected  = makeGuardianToken(guardianConnectedId, campusConnectedId, tenantId);

  // Servidor Express mínimo que replica la cadena relevante para este endpoint
  const testApp = express();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookFixtureSecret);
  testApp.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
  registerStripeWebhookRoute(testApp, { webhooks: offlineStripe.webhooks } as any);
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
  await pool.query(`DELETE FROM payment_events WHERE tenant_id = $1`, [tenantId]);
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
  vi.unstubAllEnvs();
});

// ═════════════════════════════════════════════════════════════════════════════
// T1 — Campus sin Connect: se rechaza antes de escribir o llamar al proveedor
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/guardian/pagar — campus sin Stripe Connect", () => {
  it("T1: campus sin Connect → 422 sin acreditar, Stripe NO invocado", async () => {
    const piCreatesBefore = mockPICreate.mock.calls.length;

    const before = await snapshot(chargeNoConnectId);
    const { status, body } = await pagar(tokenNoConnect, [chargeNoConnectId], "pm_offline_no_connect");
    expect(status).toBe(422);
    expect(body.message).toMatch(/no disponible/i);
    expect(await snapshot(chargeNoConnectId)).toEqual(before);

    // Stripe NO debe ser invocado (campus no tiene Connect activo)
    expect(mockPICreate.mock.calls.length).toBe(piCreatesBefore);

    // El cargo sigue pendiente.
    const { rows: chargeRows } = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`,
      [chargeNoConnectId]
    );
    expect(chargeRows[0].estado).toBe("pendiente");

    // No se crea ningún pago ni referencia simulada.
    const { rows: payRows } = await pool.query(
      `SELECT referencia_pasarela FROM payments WHERE charge_id = $1`,
      [chargeNoConnectId]
    );
    expect(payRows).toHaveLength(0);
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
    // application_fee_amount=0 (modelo existente sin comisión por transacción)
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
    const state = await snapshot(chargeConnectedId);
    expect(state.payments).toBe(1);
    expect(state.applications).toBe(1);
    expect(state.invoices).toBe(0);
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
    expect(body.detalle).toBeUndefined();
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

async function snapshot(chargeId: number) {
  const { rows } = await pool.query(
    `SELECT c.estado, c.updated_at,
      (SELECT COUNT(*)::int FROM payments p WHERE p.charge_id=c.id) AS payments,
      (SELECT COUNT(*)::int FROM payment_applications pa WHERE pa.charge_id=c.id) AS applications,
      (SELECT COUNT(*)::int FROM invoices i JOIN payments p ON p.id=i.payment_id WHERE p.charge_id=c.id) AS invoices,
      (SELECT COUNT(*)::int FROM payment_events e WHERE e.tenant_id=c.tenant_id) AS events,
      (SELECT COUNT(*)::int FROM audit_log a WHERE a.tenant_id=c.tenant_id) AS audits
     FROM charges c WHERE c.id=$1`, [chargeId],
  );
  return rows[0];
}

async function newCardCharge(): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO charges (student_id, tenant_id, concept_id, monto_base_centavos, estado, fecha_emision, fecha_vencimiento)
     SELECT student_id, tenant_id, concept_id, 60000, 'pendiente', ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL}+30
       FROM charges WHERE id=$1 RETURNING id`, [chargeConnectedId],
  );
  return Number(rows[0].id);
}

async function signedWebhook(pi: StripePaymentIntentResult, eventId: string, badSignature = false) {
  const payload = JSON.stringify({ id: eventId, type: "payment_intent.succeeded", data: { object: pi } });
  const signature = offlineStripe.webhooks.generateTestHeaderString({ payload, secret: webhookFixtureSecret });
  return fetch(`${TEST_BASE}/api/webhooks/stripe`, {
    method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": badSignature ? "invalid" : signature }, body: payload,
  });
}

describe("Confirmación Stripe en la frontera del proveedor, sin llamadas externas", () => {
  it("sin payment_method_id responde 422 y no escribe en ninguna tabla del flujo", async () => {
    const before = await snapshot(chargeConnectedId2);
    const calls = mockPICreate.mock.calls.length;
    expect((await pagar(tokenConnected, [chargeConnectedId2])).status).toBe(422);
    expect(await snapshot(chargeConnectedId2)).toEqual(before);
    expect(mockPICreate.mock.calls.length).toBe(calls);
  });

  for (const status of ["requires_action", "processing"]) {
    it(`${status}: cero escrituras; webhook firmado posterior liquida una sola vez`, async () => {
      const chargeId = await newCardCharge();
      let pi!: StripePaymentIntentResult;
      mockPICreate.mockImplementationOnce(async params => {
        pi = { ...params, id: `pi_offline_${chargeId}`, status, amount_received: 0 };
        return pi;
      });
      const before = await snapshot(chargeId);
      const result = await pagar(tokenConnected, [chargeId], "pm_offline_pending");
      expect(result.status).toBe(202);
      expect(result.body.status).toBe(status);
      expect(result.body.success).toBe(false);
      expect(result.body.payments[0].payment_id).toBeNull();
      expect(await snapshot(chargeId)).toEqual(before);
      const confirmed = { ...pi, status: "succeeded", amount_received: pi.amount };
      expect((await signedWebhook(confirmed, `evt_offline_${chargeId}`)).status).toBe(200);
      expect((await signedWebhook(confirmed, `evt_offline_${chargeId}`)).status).toBe(200);
      expect((await signedWebhook(confirmed, `evt_offline_other_${chargeId}`)).status).toBe(200);
      const after = await snapshot(chargeId);
      expect(after.payments).toBe(1);
      expect(after.applications).toBe(1);
      expect(after.estado).toBe("pagado");
      expect(after.invoices).toBe(0);
    });
  }

  it("respuesta inmediata succeeded + webhook duplicado y concurrente → un solo pago", async () => {
    const chargeId = await newCardCharge();
    let pi!: StripePaymentIntentResult;
    mockPICreate.mockImplementationOnce(async params => {
      pi = { ...params, id: `pi_offline_${chargeId}`, status: "succeeded", amount_received: params.amount };
      return pi;
    });
    expect((await pagar(tokenConnected, [chargeId], "pm_offline_success")).status).toBe(200);
    const responses = await Promise.all([
      signedWebhook(pi, `evt_offline_a_${chargeId}`), signedWebhook(pi, `evt_offline_b_${chargeId}`),
    ]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const after = await snapshot(chargeId);
    expect(after.payments).toBe(1);
    expect(after.applications).toBe(1);
    expect(after.estado).toBe("pagado");
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM payment_events WHERE provider='stripe' AND provider_event_id=$1`, [pi.id],
    );
    expect(rows[0].count).toBe(1);
  });

  it("dos confirmaciones HTTP concurrentes usan la misma clave y acreditan una sola vez", async () => {
    const chargeId = await newCardCharge();
    const firstCall = mockPICreate.mock.calls.length;
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const create: StripeGuardianClient["paymentIntents"]["create"] = async params => {
      if (++arrived === 2) release();
      await barrier;
      return { ...params, id: `pi_offline_${chargeId}`, status: "succeeded", amount_received: params.amount };
    };
    mockPICreate.mockImplementationOnce(create).mockImplementationOnce(create);
    const responses = await Promise.all([
      pagar(tokenConnected, [chargeId], "pm_offline_concurrent"),
      pagar(tokenConnected, [chargeId], "pm_offline_concurrent"),
    ]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const calls = mockPICreate.mock.calls.slice(firstCall);
    expect(calls).toHaveLength(2);
    expect(calls[0][1].idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[1][1].idempotencyKey).toBe(calls[0][1].idempotencyKey);
    const after = await snapshot(chargeId);
    expect(after.payments).toBe(1);
    expect(after.applications).toBe(1);
  });

  it("webhook que llega antes de la respuesta inmediata usa el mismo ledger", async () => {
    const chargeId = await newCardCharge();
    mockPICreate.mockImplementationOnce(async params => {
      const pi = { ...params, id: `pi_offline_${chargeId}`, status: "succeeded", amount_received: params.amount };
      expect((await signedWebhook(pi, `evt_offline_first_${chargeId}`)).status).toBe(200);
      return pi;
    });
    expect((await pagar(tokenConnected, [chargeId], "pm_offline_webhook_first")).status).toBe(200);
    const after = await snapshot(chargeId);
    expect(after.payments).toBe(1);
    expect(after.applications).toBe(1);
    expect(after.estado).toBe("pagado");
  });

  it("succeeded sobre cargo pagado conserva un solo evento requires_review y propaga el error en ambos intentos", async () => {
    const { rows: charges } = await pool.query(
      `INSERT INTO charges (student_id, tenant_id, concept_id, monto_base_centavos, estado, fecha_emision, fecha_vencimiento)
       SELECT student_id, tenant_id, concept_id, 60000, 'pagado', ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL}+30
         FROM charges WHERE id=$1 RETURNING id`, [chargeConnectedId],
    );
    const chargeId = Number(charges[0].id);
    const pi: StripePaymentIntentResult = {
      id: `pi_offline_closed_${chargeId}`, status: "succeeded",
      amount: 60000, amount_received: 60000, currency: "mxn",
      transfer_data: { destination: MOCK_STRIPE_ACCT },
      metadata: {
        tenant_id: String(tenantId), guardian_id: String(guardianConnectedId),
        campus_id: String(campusConnectedId), charge_id: String(chargeId),
        stripe_account_id: MOCK_STRIPE_ACCT, edupay_payment_flow: "guardian_card",
      },
    };
    const before = await snapshot(chargeId);
    expect(before).toMatchObject({ estado: "pagado", payments: 0, applications: 0, invoices: 0 });
    let firstPayload = "";
    let reviewId: number | undefined;
    for (const [attempt, error] of [
      "Cargo cerrado antes de la confirmación Stripe",
      "PaymentIntent ya registrado con otro alcance",
    ].entries()) {
      const eventId = `evt_offline_closed_${chargeId}_${attempt}`;
      const payload = JSON.stringify({ id: eventId, type: "payment_intent.succeeded", data: { object: pi } });
      if (!attempt) firstPayload = payload;
      await expect(settleStripeCardPaymentIntent(pi, eventId, payload)).rejects.toThrow(error);
      expect(await snapshot(chargeId)).toEqual({ ...before, events: before.events + 1 });
      const { rows } = await pool.query(
        `SELECT id, status, payload FROM payment_events
          WHERE tenant_id=$1 AND provider='stripe' AND provider_event_id=$2`,
        [tenantId, pi.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "requires_review", payload: firstPayload });
      if (attempt) expect(rows[0].id).toBe(reviewId);
      else reviewId = rows[0].id;
    }
    expect((await signedWebhook(pi, `evt_offline_closed_${chargeId}_signed_retry`)).status).toBe(500);
    expect(await snapshot(chargeId)).toEqual({ ...before, events: before.events + 1 });
  });

  it("firma inválida o metadatos de otro tenant no acreditan cargos", async () => {
    const chargeId = await newCardCharge();
    let pi!: StripePaymentIntentResult;
    mockPICreate.mockImplementationOnce(async params => {
      pi = { ...params, id: `pi_offline_${chargeId}`, status: "processing", amount_received: 0 };
      return pi;
    });
    await pagar(tokenConnected, [chargeId], "pm_offline_scope");
    const before = await snapshot(chargeId);
    const confirmed = { ...pi, status: "succeeded", amount_received: pi.amount };
    expect((await signedWebhook(confirmed, `evt_invalid_${chargeId}`, true)).status).toBe(400);
    const foreign = { ...confirmed, metadata: { ...confirmed.metadata!, tenant_id: String(tenantId + 999999) } };
    expect((await signedWebhook(foreign, `evt_foreign_${chargeId}`)).status).toBe(500);
    expect(await snapshot(chargeId)).toEqual(before);
  });
});
