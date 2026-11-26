/**
 * e2e/44-sso-only.spec.ts
 * SSO_ONLY: EduPay sin inicio de sesión propio; todo acceso directo lleva al Dashboard.
 *
 * Necesita un servidor arrancado con SSO_ONLY=true, EMERGENCY_LOGIN_ENABLED=true y un SSO válido de PRUEBA
 * (SSO_DASHBOARD_URL = http://localhost:5000/__dashboard_e2e). Se activa con SSO_ONLY_E2E=1; sin ella se omite,
 * así que no afecta al CI normal (que corre con la bandera apagada, porque los demás e2e entran con contraseña).
 * El "Dashboard" de prueba es una ruta local que no existe en EduPay: solo se comprueba a dónde navega el navegador.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/auth";

const DASHBOARD = "http://localhost:5000/__dashboard_e2e";

test.skip(process.env.SSO_ONLY_E2E !== "1", "SSO_ONLY_E2E no está definida: se omite la suite de SSO_ONLY.");

test("la configuración pública anuncia SSO_ONLY y el acceso de emergencia", async ({ request }) => {
  const cfg = await (await request.get("/api/auth/sso/config")).json();
  expect(cfg).toMatchObject({ enabled: true, sso_only: true, emergency_login: true, dashboard_url: DASHBOARD });
});

test("abrir EduPay sin sesión lleva al Dashboard, sin mostrar el formulario de inicio de sesión", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(DASHBOARD, { timeout: 15_000 });
});

test("la ruta de emergencia sí muestra el formulario de inicio de sesión", async ({ page }) => {
  await page.goto("/acceso-emergencia");
  await expect(page).toHaveURL(/\/acceso-emergencia$/);
  await expect(page.locator("input[type='password']").first()).toBeVisible({ timeout: 15_000 });
});

test("el acceso de tutores lleva al Dashboard al intentar entrar", async ({ page }) => {
  await page.goto("/acceso-padres");
  await page.locator("input[type='email'], input[name='email']").first().fill("tutor@example.invalid");
  await page.locator("input[type='password']").first().fill("ClaveCualquiera#1");
  await page.getByRole("button", { name: /entrar|ingresar|iniciar/i }).first().click();
  await expect(page).toHaveURL(DASHBOARD, { timeout: 15_000 });
});

test("un enlace mágico lleva al Dashboard", async ({ page }) => {
  await page.goto("/pagar/token-de-prueba");
  await expect(page).toHaveURL(DASHBOARD, { timeout: 15_000 });
});

test("la API rechaza el acceso directo: personal, tutores y enlaces mágicos", async ({ request }) => {
  // Con acceso de emergencia habilitado, un usuario que no es superadministrador recibe el mismo error que una credencial inválida.
  const staff = await request.post("/api/auth/login", { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, failOnStatusCode: false });
  expect(staff.status()).toBe(401);
  for (const [method, path] of [["POST", "/api/auth/guardian-login"], ["GET", "/api/auth/magic/abc"]] as const) {
    const res = await request.fetch(path, { method, data: method === "POST" ? { email: "a@example.invalid", password: "x" } : undefined, failOnStatusCode: false });
    expect(res.status(), path).toBe(403);
    expect((await res.json()).code).toBe("LOGIN_DISABLED");
  }
});
