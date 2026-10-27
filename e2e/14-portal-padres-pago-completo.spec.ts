/**
 * PP-01/PP-02 ya no usan tarjetas ni cobros de Stripe reales.
 * La confirmación y concurrencia con Stripe simulado en su frontera están en
 * guardian-stripe-transfer.test.ts. Aquí se verifica que el portal no inventa
 * pagos ni reduce saldos cuando falta el método validado por el proveedor.
 */
import { test, expect, type Page } from "@playwright/test";
import { pool } from "../server/db";
import { ADMIN_PASSWORD, SUPERADMIN_EMAIL } from "./helpers/auth";

const G1_EMAIL = "lopez.carlos@demo.mx";
const G2_EMAIL = "garcia.javier@demo.mx";

test.beforeAll(async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: SUPERADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const seed = await request.post("/api/demo/seed", { headers: { Authorization: `Bearer ${token}` } });
  expect(seed.status()).toBe(200);
  expect((await seed.json()).success).toBe(true);
});

async function loginTutor(page: Page, email: string) {
  // Bloquea en el navegador la API del proveedor; estas pruebas no tokenizan tarjetas.
  await page.route("https://api.stripe.com/**", route => route.abort());
  const login = await page.request.post("/api/auth/guardian-login", {
    data: { email, password: ADMIN_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const { token, guardian } = await login.json();
  await page.goto("/");
  await page.evaluate(({ token, guardian }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "guardian");
    localStorage.setItem("auth_user", JSON.stringify(guardian));
  }, { token, guardian });
  await page.reload();
  await expect(page.getByText("Mi Portal de Pagos", { exact: true })).toBeVisible();
  return token as string;
}

async function dashboard(page: Page, token: string) {
  const response = await page.request.get("/api/guardian/dashboard", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

async function ledger(chargeIds: number[]) {
  const result = await pool.query(
    `SELECT c.id, c.estado, c.updated_at,
       (SELECT COUNT(*)::int FROM payments p WHERE p.charge_id=c.id) AS payments,
       (SELECT COUNT(*)::int FROM payment_applications pa WHERE pa.charge_id=c.id) AS applications,
       (SELECT COUNT(*)::int FROM invoices i JOIN payments p ON p.id=i.payment_id WHERE p.charge_id=c.id) AS invoices
      FROM charges c WHERE c.id=ANY($1::int[]) ORDER BY c.id`, [chargeIds],
  );
  return result.rows;
}

test("PP-01: sin método Stripe no hay éxito, factura ni reducción del saldo", async ({ page }) => {
  const token = await loginTutor(page, G1_EMAIL);
  const before = await dashboard(page, token);
  const ids = before.pendingCharges.map((charge: { id: number }) => charge.id);
  expect(ids.length).toBeGreaterThan(0);
  const beforeLedger = await ledger(ids);
  await page.getByRole("button", { name: /pagar todo/i }).click();
  await expect(page.getByText(/método de pago/i).first()).toBeVisible();
  const response = await page.request.post("/api/guardian/pagar", {
    headers: { Authorization: `Bearer ${token}` },
    data: { charge_ids: ids, metodo_pago: "tarjeta" },
  });
  expect(response.status()).toBe(422);
  expect((await response.json()).message).toMatch(/no disponible/i);
  expect(await ledger(ids)).toEqual(beforeLedger);
  const after = await dashboard(page, token);
  expect(after.pendingCharges).toEqual(before.pendingCharges);
  expect(after.paymentHistory).toEqual(before.paymentHistory);
  await expect(page.getByText(/¡pago exitoso!/i)).toHaveCount(0);
});

test("PP-02: dos reintentos sin método Stripe dan 422 y cero acreditaciones", async ({ page }) => {
  const token = await loginTutor(page, G2_EMAIL);
  const before = await dashboard(page, token);
  const ids = before.pendingCharges.map((charge: { id: number }) => charge.id);
  expect(ids.length).toBeGreaterThan(0);
  const beforeLedger = await ledger(ids);
  const send = () => page.request.post("/api/guardian/pagar", {
    headers: { Authorization: `Bearer ${token}` },
    data: { charge_ids: ids, metodo_pago: "tarjeta" },
  });
  const responses = await Promise.all([send(), send()]);
  expect(responses.map(response => response.status())).toEqual([422, 422]);
  expect(await ledger(ids)).toEqual(beforeLedger);
  const after = await dashboard(page, token);
  expect(after.pendingCharges).toEqual(before.pendingCharges);
  expect(after.paymentHistory).toEqual(before.paymentHistory);
  await expect(page.getByText(/¡pago exitoso!/i)).toHaveCount(0);
});
