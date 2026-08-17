/**
 * TESTS — Stripe Connect Express onboarding de campus
 *
 * Usa un servidor Express local (puerto 5099) con mock de Stripe para evitar
 * dependencia de Stripe Connect en el entorno de test. El cliente real de Stripe
 * requiere que la cuenta tenga Connect habilitado — el mock permite probar toda
 * la lógica de rutas, DB y permisos sin esa dependencia externa.
 *
 * T1  Crear cuenta Express       → 200, onboarding_url con https://connect.stripe.com/,
 *                                   stripe_account_id con acct_, fila en DB
 * T2  Sub-caso incompleto        → mismo stripe_account_id en DB, nuevo onboarding_url, 200
 * T3  Sub-caso completo          → charges_enabled=true en DB → 409
 * T4  Guard 403                  → rol contador_general → 403
 * T5  refresh-link sin cuenta    → campus sin fila en campus_payment_config → 400
 * T6  estado antes y después     → campos correctos, null antes / acct_ después
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
// Simula stripe.accounts.create y stripe.accountLinks.create sin llamar Stripe real.
// El acct_ prefix respeta el contrato de la API de Stripe Connect.
const MOCK_ACCT_ID   = "acct_test_mock123456789";
const MOCK_OB_URL    = "https://connect.stripe.com/mock/test-onboarding";
const MOCK_OB_URL_2  = "https://connect.stripe.com/mock/test-onboarding-refresh";

const mockAccountsCreate = vi.fn()
  .mockResolvedValueOnce({ id: MOCK_ACCT_ID })   // T1: primera llamada crea la cuenta
  .mockResolvedValue(   { id: "acct_should_not_create_again" }); // nunca debería llamarse de nuevo en T2

const mockAccountLinksCreate = vi.fn()
  .mockResolvedValueOnce({ url: MOCK_OB_URL   }) // T1
  .mockResolvedValueOnce({ url: MOCK_OB_URL_2 }) // T2 (sub-caso incompleto)
  .mockResolvedValue(   { url: MOCK_OB_URL   }); // T para refresh-link etc.

const mockStripe = {
  accounts: {
    create: mockAccountsCreate,
  },
  accountLinks: {
    create: mockAccountLinksCreate,
  },
};

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;   // Campus principal (T1-T4, T6)
let campus2Id: number;   // Campus sin campus_payment_config (T5)
let testServer: Server;

function makeToken(cId: number, tId: number, role = "administrador_campus"): string {
  // Sin 'id' en JWT: evita FK en audit_log (ver memory: audit-log-fk-rollback.md)
  return jwt.sign(
    { email: `cp-test-${cId}@test.com`, role, campus_id: cId, tenant_id: tId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

let tokenAdmin:    string;
let tokenContador: string;
let tokenCampus2:  string;

// ── Helpers de HTTP ───────────────────────────────────────────────────────────
async function post(path: string, tok: string, body: object = {}): Promise<{ status: number; body: any }> {
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

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // Crear fixtures reales en DB para que checkCampusTenant pueda verificarlos
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

  tokenAdmin    = makeToken(campusId,  tenantId, "administrador_campus");
  tokenContador = makeToken(campusId,  tenantId, "contador_general");
  tokenCampus2  = makeToken(campus2Id, tenantId, "administrador_campus");

  // Servidor Express local con mock Stripe — NO usa el servidor de producción (5000)
  // Esto permite aislar los tests de Stripe sin necesitar Connect habilitado.
  const testApp = express();
  testApp.use(express.json());
  registerCampusPaymentRoutes(testApp, mockStripe as any);

  await new Promise<void>((resolve, reject) => {
    testServer = testApp.listen(TEST_PORT, resolve);
    testServer.once("error", reject);
  });
});

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  // Limpiar campus_payment_config (fila creada en T1)
  await pool.query(
    `DELETE FROM campus_payment_config WHERE campus_id IN ($1, $2)`,
    [campusId, campus2Id]
  );

  // Limpiar fixtures de DB
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]);

  // Cerrar servidor de test
  await new Promise<void>((resolve) => testServer.close(resolve));
});

// ═════════════════════════════════════════════════════════════════════════════
// T6a — Estado ANTES de conectar
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/campus-payment/estado", () => {
  it("T6a: estado antes de conectar → todo null/false", async () => {
    const { status, body } = await get("/api/admin/campus-payment/estado", tokenAdmin);
    expect(status).toBe(200);
    expect(body.stripe_account_id).toBeNull();
    expect(body.charges_enabled).toBe(false);
    expect(body.payouts_enabled).toBe(false);
    expect(body.details_submitted).toBe(false);
    expect(body.conectado).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T4 — Guard 403 (rol sin SETTINGS.CONFIGURE)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — Guard", () => {
  it("T4: contador_general → 403", async () => {
    const { status } = await post(
      "/api/admin/campus-payment/conectar-stripe",
      tokenContador
    );
    expect(status).toBe(403);
    // Verificar que el mock de Stripe NO fue llamado
    expect(mockAccountsCreate).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T5 — refresh-link sin stripe_account_id (campus2 nunca conectado)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/refresh-link — sin cuenta", () => {
  it("T5: campus sin stripe_account_id → 400", async () => {
    const { status, body } = await post(
      "/api/admin/campus-payment/refresh-link",
      tokenCampus2
    );
    expect(status).toBe(400);
    expect(body.message).toMatch(/conectar-stripe/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T1 — Crear cuenta Express (mock Stripe)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso null", () => {
  it("T1: crear cuenta Express → 200, onboarding_url con connect.stripe.com, acct_ en DB", async () => {
    const { status, body } = await post(
      "/api/admin/campus-payment/conectar-stripe",
      tokenAdmin
    );

    expect(status).toBe(200);
    expect(body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    expect(body.stripe_account_id).toMatch(/^acct_/);
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.expires_in).toBe(300);

    // Verificar que stripe.accounts.create fue llamado con los parámetros correctos
    expect(mockAccountsCreate).toHaveBeenCalledOnce();
    const createArgs = mockAccountsCreate.mock.calls[0][0];
    expect(createArgs.type).toBe("express");
    expect(createArgs.country).toBe("MX");
    expect(createArgs.metadata.campus_id).toBe(campusId.toString());

    // Verificar que stripe.accountLinks.create fue llamado
    expect(mockAccountLinksCreate).toHaveBeenCalledOnce();
    const linkArgs = mockAccountLinksCreate.mock.calls[0][0];
    expect(linkArgs.account).toBe(MOCK_ACCT_ID);
    expect(linkArgs.type).toBe("account_onboarding");
    expect(linkArgs.return_url).toContain("stripe=completado");
    expect(linkArgs.refresh_url).toContain("stripe=refresco");

    // Verificar que la fila existe en DB
    const { rows } = await pool.query(
      `SELECT stripe_account_id, charges_enabled
       FROM campus_payment_config WHERE campus_id = $1`,
      [campusId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(rows[0].charges_enabled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T2 — Sub-caso incompleto (reutiliza cuenta existente)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso incompleto", () => {
  it("T2: mismo campus (incompleto) → mismo acct_, nuevo onboarding_url, SIN nueva cuenta Stripe", async () => {
    const { status, body } = await post(
      "/api/admin/campus-payment/conectar-stripe",
      tokenAdmin
    );

    expect(status).toBe(200);
    // Debe usar la cuenta ya creada — NO llamar accounts.create de nuevo
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.onboarding_url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    // El nuevo URL es diferente al de T1 (simula link fresco)
    expect(body.onboarding_url).toBe(MOCK_OB_URL_2);

    // accounts.create sigue en 1 llamada (la de T1); no se creó cuenta nueva
    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);

    // accountLinks.create fue llamado una segunda vez (T1 + T2)
    expect(mockAccountLinksCreate).toHaveBeenCalledTimes(2);

    // Verificar que no se duplicó la fila en DB
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total FROM campus_payment_config WHERE campus_id = $1`,
      [campusId]
    );
    expect(Number(rows[0].total)).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T3 — Sub-caso completo (charges_enabled = true → 409, sin llamar Stripe)
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/campus-payment/conectar-stripe — sub-caso completo", () => {
  it("T3: charges_enabled=true → 409 sin llamar Stripe", async () => {
    // Simular que el webhook de Stripe ya actualizó charges_enabled
    await pool.query(
      `UPDATE campus_payment_config SET charges_enabled = true WHERE campus_id = $1`,
      [campusId]
    );

    const callsBeforeT3 = mockAccountsCreate.mock.calls.length;

    const { status, body } = await post(
      "/api/admin/campus-payment/conectar-stripe",
      tokenAdmin
    );

    expect(status).toBe(409);
    expect(body.estado?.charges_enabled).toBe(true);
    expect(body.estado?.stripe_account_id).toBe(MOCK_ACCT_ID);

    // Stripe NO debe haberse llamado (cortocircuito en el 409)
    expect(mockAccountsCreate).toHaveBeenCalledTimes(callsBeforeT3);

    // Revertir para no afectar T6b
    await pool.query(
      `UPDATE campus_payment_config SET charges_enabled = false WHERE campus_id = $1`,
      [campusId]
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T6b — Estado DESPUÉS de T1 (stripe_account_id presente)
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/admin/campus-payment/estado — después de conectar", () => {
  it("T6b: estado después de T1 → stripe_account_id = MOCK_ACCT_ID, charges_enabled false", async () => {
    const { status, body } = await get("/api/admin/campus-payment/estado", tokenAdmin);
    expect(status).toBe(200);
    expect(body.stripe_account_id).toBe(MOCK_ACCT_ID);
    expect(body.charges_enabled).toBe(false);    // webhook aún no llegó
    expect(body.conectado).toBe(false);
    expect(body.payouts_enabled).toBe(false);
  });
});
