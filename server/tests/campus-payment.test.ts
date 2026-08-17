/**
 * TESTS — Stripe Connect Express onboarding de campus
 *
 * El servidor de test replica la cadena de middleware de producción:
 *   express.raw()  para /api/webhooks/stripe  (ANTES de express.json)
 *   registerStripeWebhookRoute(app, mockStripe)   (ANTES de express.json)
 *   express.json()
 *   registerCampusPaymentRoutes(app, mockStripe)  (DESPUÉS de express.json)
 *
 * STRIPE_WEBHOOK_SECRET es OBLIGATORIO en los tests — igual que en producción.
 * Se configura en beforeAll con un valor de prueba y el mock de constructEvent
 * acepta cualquier firma (no verifica HMAC real).
 *
 * T1  Crear cuenta Express        → 200, onboarding_url, acct_, fila en DB;
 *                                   idempotency key enviada a Stripe
 * T2  Sub-caso incompleto         → mismo acct_, nuevo link, SIN nueva cuenta Stripe
 * T3  Sub-caso completo           → charges_enabled=true → 409 sin llamar Stripe
 * T4  Guard 403                   → contador_general → 403
 * T5  refresh-link sin cuenta     → 400
 * T6  estado                      → null antes de T1, acct_ después + sync live
 * T7  Concurrencia (race-safe)    → dos requests simultáneos → un solo acct_, una fila
 * T8  Webhook account.updated     → Buffer crudo + firma → DB actualizada
 * T8b Webhook sin firma           → 400
 * T8c Webhook sin secret          → 503
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { db, pool } from "../db";
import { tenants, campuses } from "../../shared/schema";
import jwt from "jsonwebtoken";
import {
  registerStripeWebhookRoute,
  registerCampusPaymentRoutes,
} from "../routes/campus-payment";

const JWT_SECRET     = process.env.JWT_SECRET || "fallback-secret-key";
const TEST_PORT      = 5099;
const TEST_BASE      = `http://localhost:${TEST_PORT}`;
const WEBHOOK_SECRET = "whsec_test_secret_for_campus_payment";

// ── Mock Stripe ───────────────────────────────────────────────────────────────
const MOCK_ACCT_ID = "acct_test_mock123456789";
const MOCK_OB_URL  = "https://connect.stripe.com/mock/test-onboarding";

// accounts.create: siempre devuelve el mismo account (simula Stripe idempotency key)
const mockAccountsCreate   = vi.fn().mockResolvedValue({ id: MOCK_ACCT_ID });

// accounts.retrieve: simula estado en vivo (charges_enabled=false por defecto)
const mockAccountsRetrieve = vi.fn().mockResolvedValue({
  id:                MOCK_ACCT_ID,
  charges_enabled:   false,
  payouts_enabled:   false,
  details_submitted: false,
});

// accountLinks.create: siempre devuelve un URL válido
const mockAccountLinksCreate = vi.fn().mockResolvedValue({ url: MOCK_OB_URL });

// webhooks.constructEvent: en tests, parsea el Buffer como JSON.
// No verifica la firma HMAC real (es un mock), pero requiere sig+secret para llegar aquí.
const mockWebhooksConstructEvent = vi.fn((body: Buffer | string, _sig: string, _secret: string) => {
  const raw = Buffer.isBuffer(body) ? body.toString() : body;
  return JSON.parse(raw);
});

const mockStripe = {
  accounts:     { create: mockAccountsCreate, retrieve: mockAccountsRetrieve },
  accountLinks: { create: mockAccountLinksCreate },
  webhooks:     { constructEvent: mockWebhooksConstructEvent },
};

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;   // Campus principal (T1-T6, T8)
let campus2Id: number;   // Campus sin campus_payment_config (T5)
let campus3Id: number;   // Campus para T7 (concurrencia)
let testServer: Server;

function makeToken(cId: number, tId: number, role = "administrador_campus"): string {
  // Sin 'id': evita FK en audit_log (memory: audit-log-fk-rollback.md)
  return jwt.sign(
    { email: `cp-test-${cId}@test.com`, role, campus_id: cId, tenant_id: tId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

let tokenAdmin:    string;
let tokenContador: string;
let tokenCampus2:  string;
let tokenCampus3:  string;

// ── Helpers HTTP ──────────────────────────────────────────────────────────────
async function post(
  path: string,
  tok: string,
  body: object = {}
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${TEST_BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function get(path: string, tok: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${TEST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Envía un webhook simulado con body raw y headers configurables. */
async function webhook(
  payload: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${TEST_BASE}/api/webhooks/stripe`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body:    payload,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // STRIPE_WEBHOOK_SECRET es OBLIGATORIO. Configurar antes de montar el servidor.
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  // Crear fixtures en DB
  const [t] = await db
    .insert(tenants)
    .values({ nombre_legal: `CampusPay ${ts}`, rfc: `CPT${ts}` })
    .returning();
  tenantId = t.id;

  const [c] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus CP ${ts}` })
    .returning();
  campusId = c.id;

  const [c2] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus CP2 ${ts}` })
    .returning();
  campus2Id = c2.id;

  const [c3] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus CP3 ${ts}` })
    .returning();
  campus3Id = c3.id;

  tokenAdmin    = makeToken(campusId,  tenantId, "administrador_campus");
  tokenContador = makeToken(campusId,  tenantId, "contador_general");
  tokenCampus2  = makeToken(campus2Id, tenantId, "administrador_campus");
  tokenCampus3  = makeToken(campus3Id, tenantId, "administrador_campus");

  // Servidor Express que replica la cadena de middleware de producción:
  const testApp = express();

  // 1. express.raw para /api/webhooks/stripe — ANTES de express.json (igual que server/index.ts)
  testApp.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));

  // 2. Ruta del webhook — ANTES de express.json (igual que routes.ts, antes de sanitizeInput)
  registerStripeWebhookRoute(testApp, mockStripe as any);

  // 3. express.json para el resto de endpoints
  testApp.use(express.json());

  // 4. Rutas admin — DESPUÉS de express.json (igual que routes.ts, después de sanitizeInput)
  registerCampusPaymentRoutes(testApp, mockStripe as any);

  await new Promise<void>((resolve, reject) => {
    testServer = testApp.listen(TEST_PORT, resolve);
    testServer.once("error", reject);
  });
});

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;

  await pool.query(
    `DELETE FROM campus_payment_config WHERE campus_id IN ($1, $2, $3)`,
    [campusId, campus2Id, campus3Id]
  );
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]);

  await new Promise<void>((resolve) => testServer.close(resolve));
});

// ═════════════════════════════════════════════════════════════════════════════
// T8c — Webhook sin secret configurado → 503
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/webhooks/stripe — secret no configurado", () => {
  it("T8c: sin STRIPE_WEBHOOK_SECRET → 503 (endpoint deshabilitado)", async () => {
    // Temporalmente sin secret
    const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const { status } = await webhook(
      JSON.stringify({ type: "account.updated", data: { object: {} } }),
      { "stripe-signature": "t=1,v1=abc" }
    );
    expect(status).toBe(503);

    // Restaurar
    process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8b — Webhook sin stripe-signature → 400
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/webhooks/stripe — sin header de firma", () => {
  it("T8b: STRIPE_WEBHOOK_SECRET configurado pero sin stripe-signature → 400", async () => {
    // Secret está configurado (beforeAll)
    const { status, body } = await webhook(
      JSON.stringify({ type: "account.updated", data: { object: {} } })
      // Sin stripe-signature header
    );
    expect(status).toBe(400);
    expect(body.message).toMatch(/stripe-signature/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T6a — Estado ANTES de conectar
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/campus-payment/estado", () => {
  it("T6a: estado antes de conectar → todo null/false; retrieve NO llamada", async () => {
    const retrievesBefore = mockAccountsRetrieve.mock.calls.length;

    const { status, body } = await get("/api/admin/campus-payment/estado", tokenAdmin);

    expect(status).toBe(200);
    expect(body.stripe_account_id).toBeNull();
    expect(body.charges_enabled).toBe(false);
    expect(body.payouts_enabled).toBe(false);
    expect(body.details_submitted).toBe(false);
    expect(body.conectado).toBe(false);

    // Sin stripe_account_id en DB → no debe llamar retrieve
    expect(mockAccountsRetrieve.mock.calls.length).toBe(retrievesBefore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T4 — Guard 403
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — Guard", () => {
  it("T4: contador_general → 403; Stripe NO llamada", async () => {
    const createsBefore = mockAccountsCreate.mock.calls.length;
    const { status } = await post("/api/admin/campus-payment/conectar-stripe", tokenContador);
    expect(status).toBe(403);
    expect(mockAccountsCreate.mock.calls.length).toBe(createsBefore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T5 — refresh-link sin cuenta → 400
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/refresh-link — sin cuenta", () => {
  it("T5: campus sin stripe_account_id → 400", async () => {
    const { status, body } = await post("/api/admin/campus-payment/refresh-link", tokenCampus2);
    expect(status).toBe(400);
    expect(body.message).toMatch(/conectar-stripe/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T1 — Crear cuenta Express (sub-caso null)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso null", () => {
  it("T1: crear cuenta → 200, onboarding_url, acct_ en DB; idempotency key presente", async () => {
    const { status, body } = await post("/api/admin/campus-payment/conectar-stripe", tokenAdmin);

    expect(status).toBe(200);
    expect(body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.expires_in).toBe(300);

    // Verificar parámetros enviados a Stripe
    expect(mockAccountsCreate).toHaveBeenCalledOnce();
    const [createParams, createOpts] = mockAccountsCreate.mock.calls[0];
    expect(createParams.type).toBe("express");
    expect(createParams.country).toBe("MX");
    expect(createParams.metadata.campus_id).toBe(campusId.toString());
    expect(createOpts?.idempotencyKey).toBe(`campus-connect-${campusId}`);

    // Verificar Account Link
    expect(mockAccountLinksCreate).toHaveBeenCalledOnce();
    const [linkParams] = mockAccountLinksCreate.mock.calls[0];
    expect(linkParams.account).toBe(MOCK_ACCT_ID);
    expect(linkParams.type).toBe("account_onboarding");
    expect(linkParams.return_url).toContain("stripe=completado");
    expect(linkParams.refresh_url).toContain("stripe=refresco");

    // Fila en DB
    const { rows } = await pool.query(
      `SELECT stripe_account_id, charges_enabled FROM campus_payment_config WHERE campus_id = $1`,
      [campusId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(rows[0].charges_enabled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T2 — Sub-caso incompleto
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso incompleto", () => {
  it("T2: mismo campus (acct_ existente, !charges_enabled) → mismo acct_, nuevo link, SIN nueva cuenta", async () => {
    const createsBefore = mockAccountsCreate.mock.calls.length;
    const linksBefore   = mockAccountLinksCreate.mock.calls.length;

    const { status, body } = await post("/api/admin/campus-payment/conectar-stripe", tokenAdmin);

    expect(status).toBe(200);
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\//);

    // NO crea nueva cuenta
    expect(mockAccountsCreate.mock.calls.length).toBe(createsBefore);
    // SÍ genera nuevo Account Link
    expect(mockAccountLinksCreate.mock.calls.length).toBe(linksBefore + 1);

    // Una sola fila en DB
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total FROM campus_payment_config WHERE campus_id = $1`,
      [campusId]
    );
    expect(Number(rows[0].total)).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T3 — Sub-caso completo → 409
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso completo", () => {
  it("T3: charges_enabled=true → 409 cortocircuito; Stripe NO llamada", async () => {
    await pool.query(
      `UPDATE campus_payment_config SET charges_enabled = true WHERE campus_id = $1`,
      [campusId]
    );

    const createsBefore = mockAccountsCreate.mock.calls.length;
    const linksBefore   = mockAccountLinksCreate.mock.calls.length;

    const { status, body } = await post("/api/admin/campus-payment/conectar-stripe", tokenAdmin);

    expect(status).toBe(409);
    expect(body.estado?.charges_enabled).toBe(true);
    expect(body.estado?.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(mockAccountsCreate.mock.calls.length).toBe(createsBefore);
    expect(mockAccountLinksCreate.mock.calls.length).toBe(linksBefore);

    // Revertir
    await pool.query(
      `UPDATE campus_payment_config SET charges_enabled = false WHERE campus_id = $1`,
      [campusId]
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T6b — Estado DESPUÉS de T1 (sync live via retrieve)
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/campus-payment/estado — después de conectar", () => {
  it("T6b: stripe_account_id presente, retrieve devuelve false → estado cacheado devuelto", async () => {
    const retrievesBefore = mockAccountsRetrieve.mock.calls.length;

    const { status, body } = await get("/api/admin/campus-payment/estado", tokenAdmin);

    expect(status).toBe(200);
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.charges_enabled).toBe(false);
    expect(body.conectado).toBe(false);

    // accounts.retrieve llamada (sync activa cuando charges_enabled=false)
    expect(mockAccountsRetrieve.mock.calls.length).toBe(retrievesBefore + 1);
    expect(mockAccountsRetrieve.mock.calls[retrievesBefore][0]).toBe(MOCK_ACCT_ID);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T7 — Concurrencia (race condition safe)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — concurrencia", () => {
  it("T7: dos requests simultáneos (campus3) → mismo acct_, una sola fila en DB", async () => {
    const [p1, p2] = await Promise.all([
      post("/api/admin/campus-payment/conectar-stripe", tokenCampus3),
      post("/api/admin/campus-payment/conectar-stripe", tokenCampus3),
    ]);

    // Ambos con éxito
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);

    // Mismo stripe_account_id (idempotency key + ON CONFLICT)
    expect(p1.body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(p2.body.stripe_account_id).toBe(MOCK_ACCT_ID);

    // Una sola fila en DB para campus3
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total FROM campus_payment_config WHERE campus_id = $1`,
      [campus3Id]
    );
    expect(Number(rows[0].total)).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8 — Webhook account.updated (Buffer crudo + firma requerida)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/webhooks/stripe — account.updated con firma", () => {
  it("T8: evento firmado → DB actualiza charges/payouts/details_submitted", async () => {
    const event = JSON.stringify({
      type: "account.updated",
      data: {
        object: {
          id:                MOCK_ACCT_ID,
          charges_enabled:   true,
          payouts_enabled:   true,
          details_submitted: true,
          metadata:          { campus_id: campusId.toString() },
        },
      },
    });

    // Enviar con stripe-signature (cualquier valor: mock no verifica HMAC real)
    const { status, body } = await webhook(event, {
      "stripe-signature": `t=1234567890,v1=mock_valid_signature`,
    });

    expect(status).toBe(200);
    expect(body.received).toBe(true);

    // constructEvent llamado con el Buffer y la firma correcta
    expect(mockWebhooksConstructEvent).toHaveBeenCalled();
    const [rawBody, sig, secret] = mockWebhooksConstructEvent.mock.calls.at(-1)!;
    expect(Buffer.isBuffer(rawBody)).toBe(true);  // Body llegó como Buffer
    expect(sig).toContain("v1=mock_valid_signature");
    expect(secret).toBe(WEBHOOK_SECRET);

    // DB actualizada con los tres flags
    const { rows } = await pool.query(
      `SELECT charges_enabled, payouts_enabled, details_submitted
       FROM campus_payment_config WHERE campus_id = $1`,
      [campusId]
    );
    expect(rows[0].charges_enabled).toBe(true);
    expect(rows[0].payouts_enabled).toBe(true);
    expect(rows[0].details_submitted).toBe(true);

    // /estado refleja inmediatamente el nuevo estado (charges_enabled=true)
    const { body: estadoBody } = await get("/api/admin/campus-payment/estado", tokenAdmin);
    expect(estadoBody.conectado).toBe(true);
    expect(estadoBody.charges_enabled).toBe(true);

    // Limpiar para no afectar otros tests
    await pool.query(
      `UPDATE campus_payment_config
          SET charges_enabled = false, payouts_enabled = false, details_submitted = false
        WHERE campus_id = $1`,
      [campusId]
    );
  });
});
