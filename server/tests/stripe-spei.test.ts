/**
 * SPEI Stripe Connect — creación asíncrona + liquidación por webhook firmado.
 *
 * SPEI-01: crea/reutiliza Customer, PI customer_balance+card y payments pendientes.
 * SPEI-02: payment_intent.succeeded aplica el ledger solo al confirmar Stripe.
 * SPEI-03: mismo webhook no duplica payment_applications ni pagos.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { pool, db } from "../db";
import { campuses, tenants } from "../../shared/schema";
import { registerGuardianRoutes, type StripeGuardianClient } from "../routes/guardian";
import { registerStripeWebhookRoute, type StripeClient } from "../routes/campus-payment";

import { JWT_SECRET } from "../routes/shared";
// Puerto de pruebas ya declarado en .replit; fileParallelism:false garantiza
// que no coincide con campus-payment.test.ts, que también lo usa y lo cierra.
const TEST_PORT = 5099;
const TEST_BASE = `http://localhost:${TEST_PORT}`;
const CONNECT_ACCOUNT = "acct_spei_test_connected";
const CUSTOMER_ID = "cus_spei_test_guardian";
const PAYMENT_INTENT_ID = "pi_spei_test_001";

const mockCustomerCreate = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
const mockPiCreate = vi.fn().mockResolvedValue({
  id: PAYMENT_INTENT_ID,
  status: "requires_payment_method",
  client_secret: `${PAYMENT_INTENT_ID}_secret_test`,
});
const mockPiCancel = vi.fn().mockResolvedValue({ id: PAYMENT_INTENT_ID });

const guardianStripe: StripeGuardianClient = {
  customers: { create: mockCustomerCreate },
  paymentIntents: { create: mockPiCreate, cancel: mockPiCancel },
};

const webhookStripe: StripeClient = {
  accounts: {
    create: vi.fn(),
    retrieve: vi.fn(),
  },
  accountLinks: { create: vi.fn() },
  webhooks: {
    constructEvent: (body) => JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : body) as any,
  },
};

let server: Server;
let tenantId: number;
let campusId: number;
let guardianId: number;
let chargeId: number;
let token: string;
let previousWebhookSecret: string | undefined;

async function post(path: string, body: unknown, auth = true): Promise<{ status: number; body: any }> {
  const response = await fetch(`${TEST_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      ...(path === "/api/webhooks/stripe" ? { "stripe-signature": "sig_test" } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

beforeAll(async () => {
  const suffix = String(Date.now()).slice(-8);
  const [tenant] = await db.insert(tenants).values({
    nombre_legal: `SPEI ${suffix}`,
    rfc: `SPE${suffix}`,
  }).returning();
  tenantId = tenant.id;
  const [campus] = await db.insert(campuses).values({
    tenant_id: tenantId,
    nombre: `Campus SPEI ${suffix}`,
  }).returning();
  campusId = campus.id;

  await pool.query(
    `INSERT INTO campus_payment_config
       (campus_id, tenant_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
     VALUES ($1, $2, $3, true, true, true)`,
    [campusId, tenantId, CONNECT_ACCOUNT],
  );
  const { rows: guardians } = await pool.query(
    `INSERT INTO guardians (nombre_completo, email)
     VALUES ($1, $2) RETURNING id`,
    [`Tutor SPEI ${suffix}`, `tutor-spei-${suffix}@test.invalid`],
  );
  guardianId = guardians[0].id;
  const { rows: students } = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, grado, id_referencia)
     VALUES ($1, $2, $3, '1', $4) RETURNING id`,
    [campusId, tenantId, `Alumno SPEI ${suffix}`, `SPEI-${suffix}`],
  );
  const { rows: concepts } = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, $3, 'colegiatura', 'mensual', 25800) RETURNING id`,
    [campusId, tenantId, `Colegiatura SPEI ${suffix}`],
  );
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1, $2)`,
    [students[0].id, guardianId],
  );
  const { rows: charges } = await pool.query(
    `INSERT INTO charges
       (student_id, tenant_id, concept_id, monto_base_centavos, estado, fecha_emision, fecha_vencimiento)
     VALUES ($1, $2, $3, 25800, 'pendiente', CURRENT_DATE, CURRENT_DATE + 30)
     RETURNING id`,
    [students[0].id, tenantId, concepts[0].id],
  );
  chargeId = charges[0].id;
  token = jwt.sign(
    { id: guardianId, campus_id: campusId, tenant_id: tenantId, type: "guardian" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

  previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_spei_test";
  const app = express();
  app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
  app.use(express.json());
  await registerGuardianRoutes(app, guardianStripe);
  registerStripeWebhookRoute(app, webhookStripe);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(TEST_PORT, resolve);
    server.once("error", reject);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(resolve));
  if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;

  await pool.query(
    `DELETE FROM payment_applications
      WHERE payment_id IN (SELECT id FROM payments WHERE tenant_id = $1)`,
    [tenantId],
  );
  await pool.query(`DELETE FROM payment_events WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payments WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
  await pool.query(
    `DELETE FROM student_guardian
      WHERE guardian_id = $1`,
    [guardianId],
  );
  await pool.query(`DELETE FROM guardians WHERE id = $1`, [guardianId]);
  await pool.query(`DELETE FROM concepts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campus_payment_config WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("POST /api/guardian/spei-intent", () => {
  it("SPEI-01 crea Customer + PI Connect y deja el cargo pendiente", async () => {
    const result = await post("/api/guardian/spei-intent", { charge_ids: [chargeId] });

    expect(result.status).toBe(201);
    expect(result.body.payment_intent_id).toBe(PAYMENT_INTENT_ID);
    expect(result.body.client_secret).toBe(`${PAYMENT_INTENT_ID}_secret_test`);
    expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
    expect(mockPiCreate).toHaveBeenCalledTimes(1);
    expect(mockPiCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 25800,
      currency: "mxn",
      customer: CUSTOMER_ID,
      payment_method_types: ["customer_balance", "card"],
      application_fee_amount: 0,
      transfer_data: { destination: CONNECT_ACCOUNT },
      payment_method_options: {
        customer_balance: {
          funding_type: "bank_transfer",
          bank_transfer: { type: "mx_bank_transfer" },
        },
      },
    }));

    const guardian = await pool.query(
      `SELECT stripe_customer_id FROM guardians WHERE id = $1`,
      [guardianId],
    );
    expect(guardian.rows[0].stripe_customer_id).toBe(CUSTOMER_ID);

    const payment = await pool.query(
      `SELECT estado, metodo, referencia_pasarela, monto_centavos
         FROM payments WHERE charge_id = $1`,
      [chargeId],
    );
    expect(payment.rows).toEqual([expect.objectContaining({
      estado: "pendiente",
      metodo: "spei",
      referencia_pasarela: PAYMENT_INTENT_ID,
      monto_centavos: "25800",
    })]);
    const charge = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    expect(charge.rows[0].estado).toBe("pendiente");
  });
});

describe("payment_intent.succeeded", () => {
  const event = {
    id: "evt_spei_succeeded_001",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: PAYMENT_INTENT_ID,
        metadata: { edupay_payment_flow: "spei_bank_transfer" },
      },
    },
  };

  it("SPEI-02 liquida el ledger solo cuando el webhook firmado confirma el PI", async () => {
    const result = await post("/api/webhooks/stripe", event, false);
    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);

    const payment = await pool.query(`SELECT estado FROM payments WHERE charge_id = $1`, [chargeId]);
    expect(payment.rows[0].estado).toBe("exitoso");
    const applications = await pool.query(
      `SELECT amount_centavos FROM payment_applications WHERE charge_id = $1`,
      [chargeId],
    );
    expect(applications.rows).toEqual([{ amount_centavos: "25800" }]);
    const charge = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    expect(charge.rows[0].estado).toBe("pagado");
  });

  it("SPEI-03 ignora el reintento del mismo evento sin duplicar el ledger", async () => {
    const result = await post("/api/webhooks/stripe", event, false);
    expect(result.status).toBe(200);

    const applications = await pool.query(
      `SELECT COUNT(*)::int AS total FROM payment_applications WHERE charge_id = $1`,
      [chargeId],
    );
    expect(applications.rows[0].total).toBe(1);
    const events = await pool.query(
      `SELECT COUNT(*)::int AS total FROM payment_events WHERE provider_event_id = $1`,
      [event.id],
    );
    expect(events.rows[0].total).toBe(1);
  });
});