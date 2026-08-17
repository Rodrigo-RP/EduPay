/**
 * TESTS — Stripe Connect Express onboarding de campus
 *
 * Usa un servidor Express local (puerto 5099) con mock de Stripe para evitar
 * dependencia de Stripe Connect en el entorno de test. El cliente real de Stripe
 * requiere que la cuenta tenga Connect habilitado — el mock permite probar toda
 * la lógica de rutas, DB y permisos sin esa dependencia externa.
 *
 * T1  Crear cuenta Express        → 200, onboarding_url, acct_, fila en DB;
 *                                   idempotency key enviada a Stripe; parámetros correctos
 * T2  Sub-caso incompleto         → mismo acct_, nuevo onboarding_url, SIN nueva cuenta Stripe
 * T3  Sub-caso completo           → charges_enabled=true → 409 sin llamar Stripe
 * T4  Guard 403                   → contador_general → 403
 * T5  refresh-link sin cuenta     → 400
 * T6  estado                      → null antes de T1, acct_ después; sincronización live
 * T7  Concurrencia (race-safe)    → dos requests simultáneos → un solo acct_, una sola fila
 * T8  Webhook account.updated     → DB actualizada con charges/payouts/details_submitted
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { db, pool } from "../db";
import { tenants, campuses } from "../../shared/schema";
import jwt from "jsonwebtoken";
import { registerCampusPaymentRoutes } from "../routes/campus-payment";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TEST_PORT  = 5099;
const TEST_BASE  = `http://localhost:${TEST_PORT}`;

// ── Mock Stripe ───────────────────────────────────────────────────────────────
const MOCK_ACCT_ID = "acct_test_mock123456789";
const MOCK_OB_URL  = "https://connect.stripe.com/mock/test-onboarding";

// accounts.create: siempre devuelve el mismo account (simula idempotency key de Stripe)
const mockAccountsCreate = vi.fn().mockResolvedValue({ id: MOCK_ACCT_ID });

// accounts.retrieve: simula el estado en vivo (charges_enabled=false por defecto)
const mockAccountsRetrieve = vi.fn().mockResolvedValue({
  id:                MOCK_ACCT_ID,
  charges_enabled:   false,
  payouts_enabled:   false,
  details_submitted: false,
});

// accountLinks.create: siempre devuelve un URL de onboarding válido
const mockAccountLinksCreate = vi.fn().mockResolvedValue({ url: MOCK_OB_URL });

// webhooks.constructEvent: parsea el body Buffer como JSON (simula verificación real)
const mockWebhooksConstructEvent = vi.fn((body: Buffer | string) => {
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
let campusId:  number;   // Campus principal (T1–T6)
let campus2Id: number;   // Campus sin campus_payment_config (T5)
let campus3Id: number;   // Campus para test de concurrencia (T7)
let testServer: Server;

function makeToken(cId: number, tId: number, role = "administrador_campus"): string {
  // Sin 'id' en JWT: evita FK en audit_log (memory: audit-log-fk-rollback.md)
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

// ── Helpers de HTTP ───────────────────────────────────────────────────────────
async function post(path: string, tok: string, body: object = {}): Promise<{ status: number; body: any }> {
  const r = await fetch(`${TEST_BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function postRaw(path: string, payload: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const r = await fetch(`${TEST_BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body:    payload,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function get(path: string, tok: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${TEST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const [t] = await db
    .insert(tenants)
    .values({ nombre_legal: `CampusPay ${ts}`, rfc: `CPT${ts}` })
    .returning();
  tenantId = t.id;

  // Campus principal
  const [c] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus CP ${ts}` })
    .returning();
  campusId = c.id;

  // Campus para T5 (sin campus_payment_config)
  const [c2] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus CP2 ${ts}` })
    .returning();
  campus2Id = c2.id;

  // Campus para T7 (concurrencia)
  const [c3] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus CP3 ${ts}` })
    .returning();
  campus3Id = c3.id;

  tokenAdmin    = makeToken(campusId,  tenantId, "administrador_campus");
  tokenContador = makeToken(campusId,  tenantId, "contador_general");
  tokenCampus2  = makeToken(campus2Id, tenantId, "administrador_campus");
  tokenCampus3  = makeToken(campus3Id, tenantId, "administrador_campus");

  // Servidor Express local con mock Stripe
  const testApp = express();
  // Webhook necesita raw body; otros endpoints necesitan JSON parseado.
  // Registrar express.raw para /api/webhooks/stripe ANTES de express.json.
  testApp.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
  testApp.use(express.json());
  registerCampusPaymentRoutes(testApp, mockStripe as any);

  await new Promise<void>((resolve, reject) => {
    testServer = testApp.listen(TEST_PORT, resolve);
    testServer.once("error", reject);
  });
});

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(
    `DELETE FROM campus_payment_config WHERE campus_id IN ($1, $2, $3)`,
    [campusId, campus2Id, campus3Id]
  );
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]);
  await new Promise<void>((resolve) => testServer.close(resolve));
});

// ═════════════════════════════════════════════════════════════════════════════
// T6a — Estado ANTES de conectar
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/campus-payment/estado", () => {
  it("T6a: estado antes de conectar → todo null/false (sin llamar Stripe retrieve)", async () => {
    const retrieveCallsBefore = mockAccountsRetrieve.mock.calls.length;

    const { status, body } = await get("/api/admin/campus-payment/estado", tokenAdmin);

    expect(status).toBe(200);
    expect(body.stripe_account_id).toBeNull();
    expect(body.charges_enabled).toBe(false);
    expect(body.payouts_enabled).toBe(false);
    expect(body.details_submitted).toBe(false);
    expect(body.conectado).toBe(false);

    // Sin stripe_account_id → no debe llamar retrieve (no hay qué sincronizar)
    expect(mockAccountsRetrieve.mock.calls.length).toBe(retrieveCallsBefore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T4 — Guard 403
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — Guard", () => {
  it("T4: contador_general → 403, sin llamar Stripe", async () => {
    const createsBefore = mockAccountsCreate.mock.calls.length;

    const { status } = await post("/api/admin/campus-payment/conectar-stripe", tokenContador);

    expect(status).toBe(403);
    expect(mockAccountsCreate.mock.calls.length).toBe(createsBefore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T5 — refresh-link sin cuenta (campus2 nunca conectado)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/refresh-link — sin cuenta", () => {
  it("T5: campus sin stripe_account_id → 400", async () => {
    const { status, body } = await post("/api/admin/campus-payment/refresh-link", tokenCampus2);
    expect(status).toBe(400);
    expect(body.message).toMatch(/conectar-stripe/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T1 — Crear cuenta Express (mock Stripe, sub-caso null)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso null", () => {
  it("T1: crear cuenta Express → 200, onboarding_url, acct_ en DB; idempotency key enviada", async () => {
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
    // Idempotency key obligatorio para seguridad ante requests repetidos
    expect(createOpts?.idempotencyKey).toBe(`campus-connect-${campusId}`);

    // Account link con return_url y refresh_url correctos
    expect(mockAccountLinksCreate).toHaveBeenCalledOnce();
    const [linkParams] = mockAccountLinksCreate.mock.calls[0];
    expect(linkParams.account).toBe(MOCK_ACCT_ID);
    expect(linkParams.type).toBe("account_onboarding");
    expect(linkParams.return_url).toContain("stripe=completado");
    expect(linkParams.refresh_url).toContain("stripe=refresco");

    // Fila en DB con datos correctos
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
// T2 — Sub-caso incompleto (reutiliza cuenta; no crea nueva)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso incompleto", () => {
  it("T2: mismo campus (stripe_account_id presente, !charges_enabled) → misma cuenta, nuevo link", async () => {
    const createsBefore = mockAccountsCreate.mock.calls.length;
    const linksBefore   = mockAccountLinksCreate.mock.calls.length;

    const { status, body } = await post("/api/admin/campus-payment/conectar-stripe", tokenAdmin);

    expect(status).toBe(200);
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\//);

    // No debe llamar accounts.create de nuevo (reutiliza la cuenta existente)
    expect(mockAccountsCreate.mock.calls.length).toBe(createsBefore);
    // Sí debe generar un nuevo Account Link
    expect(mockAccountLinksCreate.mock.calls.length).toBe(linksBefore + 1);

    // Sigue siendo una sola fila en DB
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total FROM campus_payment_config WHERE campus_id = $1`,
      [campusId]
    );
    expect(Number(rows[0].total)).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T3 — Sub-caso completo (charges_enabled=true → 409 sin llamar Stripe)
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

    // Cortocircuito antes de llamar Stripe
    expect(mockAccountsCreate.mock.calls.length).toBe(createsBefore);
    expect(mockAccountLinksCreate.mock.calls.length).toBe(linksBefore);

    // Revertir para no afectar los tests siguientes
    await pool.query(
      `UPDATE campus_payment_config SET charges_enabled = false WHERE campus_id = $1`,
      [campusId]
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T6b — Estado DESPUÉS de T1 (stripe_account_id presente; sincronización live)
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/campus-payment/estado — después de conectar", () => {
  it("T6b: stripe_account_id presente, mock.retrieve devuelve false → DB sin cambios", async () => {
    const retrievesBefore = mockAccountsRetrieve.mock.calls.length;

    const { status, body } = await get("/api/admin/campus-payment/estado", tokenAdmin);

    expect(status).toBe(200);
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.charges_enabled).toBe(false);
    expect(body.conectado).toBe(false);

    // Como stripe_account_id existe y charges_enabled=false, debe llamar retrieve
    expect(mockAccountsRetrieve.mock.calls.length).toBe(retrievesBefore + 1);
    const [retrievedId] = mockAccountsRetrieve.mock.calls[retrievesBefore];
    expect(retrievedId).toBe(MOCK_ACCT_ID);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T7 — Race condition (dos requests simultáneos → un solo acct_, una sola fila)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — concurrencia", () => {
  it("T7: dos requests simultáneos para campus3 → mismo acct_, una sola fila en DB", async () => {
    // campus3 no tiene fila en campus_payment_config (siempre fue virgen)
    const [p1, p2] = await Promise.all([
      post("/api/admin/campus-payment/conectar-stripe", tokenCampus3),
      post("/api/admin/campus-payment/conectar-stripe", tokenCampus3),
    ]);

    // Ambos deben tener éxito
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);

    // Ambos devuelven el mismo stripe_account_id (idempotency key + ON CONFLICT)
    expect(p1.body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(p2.body.stripe_account_id).toBe(MOCK_ACCT_ID);

    // Exactamente una fila en DB para campus3
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total, MAX(stripe_account_id) AS acct
       FROM campus_payment_config WHERE campus_id = $1`,
      [campus3Id]
    );
    expect(Number(rows[0].total)).toBe(1);
    expect(rows[0].acct).toBe(MOCK_ACCT_ID);

    // Ambos requests generan su propio Account Link (usuarios diferentes, links distintos son válidos)
    expect(p1.body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    expect(p2.body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\//);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8 — Webhook account.updated → actualiza flags en DB
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/webhooks/stripe — account.updated", () => {
  it("T8: webhook válido → charges_enabled, payouts_enabled, details_submitted actualizados en DB", async () => {
    // Evento account.updated que Stripe enviaría cuando el onboarding se completa
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

    // Sin STRIPE_WEBHOOK_SECRET en test → el handler parsea el body directamente
    const { status, body } = await postRaw("/api/webhooks/stripe", event);

    expect(status).toBe(200);
    expect(body.received).toBe(true);

    // Verificar que la DB fue actualizada
    const { rows } = await pool.query(
      `SELECT charges_enabled, payouts_enabled, details_submitted
       FROM campus_payment_config WHERE campus_id = $1`,
      [campusId]
    );
    expect(rows[0].charges_enabled).toBe(true);
    expect(rows[0].payouts_enabled).toBe(true);
    expect(rows[0].details_submitted).toBe(true);

    // El siguiente /estado debería reflejar charges_enabled=true sin llamar retrieve
    const { body: estadoBody } = await get("/api/admin/campus-payment/estado", tokenAdmin);
    expect(estadoBody.conectado).toBe(true);
    expect(estadoBody.charges_enabled).toBe(true);

    // Revertir para no contaminar otros tests
    await pool.query(
      `UPDATE campus_payment_config
          SET charges_enabled = false, payouts_enabled = false, details_submitted = false
        WHERE campus_id = $1`,
      [campusId]
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8b — Webhook con STRIPE_WEBHOOK_SECRET configurado (firma verificada)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/webhooks/stripe — verificación de firma", () => {
  it("T8b: secret configurado pero sin stripe-signature → 400", async () => {
    // Simular entorno con STRIPE_WEBHOOK_SECRET presente
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

    const event = JSON.stringify({ type: "account.updated", data: { object: {} } });
    // Sin header stripe-signature
    const { status, body } = await postRaw("/api/webhooks/stripe", event);

    expect(status).toBe(400);
    expect(body.message).toContain("stripe-signature");

    // Restaurar
    if (originalSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    }
  });
});
