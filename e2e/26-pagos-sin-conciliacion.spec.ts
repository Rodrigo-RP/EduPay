/**
 * Regresión: /pagos no debe reintroducir importación ni conciliación simuladas.
 * La única ruta permitida para esas operaciones es /caja-conciliacion.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

let authToken = "";
let authUser = "";

async function restaurarSesion(page: Page) {
  await page.goto("/");
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", user);
  }, { token: authToken, user: authUser });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

test.describe("Pagos — sin controles de conciliación simulados", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);
    authToken = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
    authUser = await page.evaluate(() => localStorage.getItem("auth_user") ?? "");
    expect(authToken).not.toBe("");
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await restaurarSesion(page);
    await page.evaluate(() => {
      window.history.pushState({}, "", "/pagos");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByText(/pagos/i).first()).toBeVisible();
  });

  test("PG-01: no muestra importador/conciliación propia y dirige a Caja", async ({ page }) => {
    await page.getByRole("tab", { name: "Conciliación", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /ejecutar conciliación automática/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /importar estado de cuenta/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: /importar estado de cuenta/i }),
    ).toHaveCount(0);

    const link = page.getByRole("link", { name: /ir a caja y conciliación/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe("/caja-conciliacion");
    await expect(page.getByText(/caja y conciliación/i).first()).toBeVisible();
  });
});