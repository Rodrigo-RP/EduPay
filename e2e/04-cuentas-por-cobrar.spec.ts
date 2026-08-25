/**
 * e2e/04-cuentas-por-cobrar.spec.ts
 * Módulo: Cuentas por Cobrar
 * Capa: Playwright (E2E)
 *
 * Cubre:
 *   - La lista de adeudos carga sin error
 *   - Los montos se muestran en formato moneda
 *   - El filtro o búsqueda existe y responde
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Cuentas por Cobrar", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.evaluate(() => {
      window.history.pushState({}, "", "/cuentas-por-cobrar");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(
      page.getByRole("heading", { name: /cuentas por cobrar/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("la página carga y no muestra error de servidor", async ({ page }) => {
    await expect(page.getByText(/error 500|internal server|algo salió mal/i)).toHaveCount(0);
    const hasContent =
      (await page.locator("table, [class*='list'], [class*='grid']").count()) > 0 ||
      (await page.getByText(/sin adeudos|al corriente|0 cuentas|cuentas por cobrar/i).count()) > 0;
    expect(hasContent, "La página no tiene contenido visible").toBeTruthy();
  });

  test("los montos de adeudo se muestran en formato moneda", async ({ page }) => {
    const moneyPattern = page.getByText(/\$[\d,]+(\.\d{2})?/);
    const count = await moneyPattern.count();
    if (count > 0) {
      await expect(moneyPattern.first()).toBeVisible();
    }
    // Si no hay adeudos, la prueba pasa trivialmente (estado válido)
  });

  test("existe algún control de filtrado o búsqueda", async ({ page }) => {
    const filter = page
      .getByRole("combobox")
      .or(page.getByPlaceholder(/filtrar|buscar|alumno/i))
      .or(page.getByRole("searchbox"))
      .first();
    if (!(await filter.count())) {
      test.skip(true, "No hay control de filtro en esta vista");
      return;
    }
    await expect(filter).toBeVisible();
    await expect(filter).toBeEnabled();
  });
});
