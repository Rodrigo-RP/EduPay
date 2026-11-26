/**
 * e2e/43-cerrar-sesion-dashboard.spec.ts
 * Cerrar sesión en EduPay regresa siempre al Dashboard, sin pasar por la pantalla de inicio de sesión de EduPay.
 *
 * El Dashboard de prueba es una ruta local (no existe en EduPay): solo se comprueba a dónde navega el navegador.
 * La configuración del SSO se simula con una intercepción para no depender de un servidor con SSO activo.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const DASHBOARD = "http://localhost:5000/__dashboard_e2e";
const logoutButton = (page: import("@playwright/test").Page) => page.locator('button[title="Cerrar sesión"]');

test("cerrar sesión con la URL del Dashboard guardada (entró por SSO) va directo al Dashboard", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);
  await page.evaluate((url) => localStorage.setItem("sso_dashboard_url", url), DASHBOARD);
  await expect(logoutButton(page)).toBeVisible({ timeout: 15_000 });
  await logoutButton(page).click();
  await expect(page).toHaveURL(DASHBOARD, { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
});

test("sin URL guardada, cerrar sesión consulta la configuración y va al Dashboard", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/api/auth/sso/config", (route) =>
    route.fulfill({ json: { enabled: true, dashboard_url: DASHBOARD } }));
  await loginAsAdmin(page);
  await page.evaluate(() => localStorage.removeItem("sso_dashboard_url"));
  await expect(logoutButton(page)).toBeVisible({ timeout: 15_000 });
  await logoutButton(page).click();
  await expect(page).toHaveURL(DASHBOARD, { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
});

test("sin Dashboard configurado, cerrar sesión conserva el comportamiento de siempre (pantalla de inicio de sesión)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/api/auth/sso/config", (route) =>
    route.fulfill({ json: { enabled: false, dashboard_url: null } }));
  await loginAsAdmin(page);
  await page.evaluate(() => localStorage.removeItem("sso_dashboard_url"));
  await expect(logoutButton(page)).toBeVisible({ timeout: 15_000 });
  await logoutButton(page).click();
  await expect(page.getByRole("button", { name: /iniciar sesión|ingresar|entrar/i }).first()).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
});
