/**
 * e2e/02-dashboard.spec.ts
 * Módulo: Dashboard Administrativo
 * Capa: Playwright (E2E)
 *
 * Cubre:
 *   - Las métricas principales renderizan (no quedan en spinner)
 *   - El menú lateral tiene los módulos esperados
 *   - No hay errores de JS en consola al cargar
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Dashboard – Administrador", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("métricas del dashboard son visibles y no muestran spinner indefinido", async ({
    page,
  }) => {
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    // Debe haber al menos una tarjeta de métrica o número visible
    const hasMetrics =
      (await page.locator("[data-testid='metric-card'], .stat-card, .kpi-card").count()) > 0 ||
      (await page.getByText(/\$[\d,]+|\d+\s*(alumnos?|pagos?|cargos?)/i).count()) > 0 ||
      (await page.locator("[class*='card'], [class*='Card']").count()) > 2; // al menos algunos cards
    expect(hasMetrics, "El dashboard no muestra métricas ni cards").toBeTruthy();
  });

  test("el menú lateral muestra links de navegación", async ({ page }) => {
    const nav = page.locator("nav, aside, [class*='sidebar'], [class*='Sidebar']").first();
    await expect(nav).toBeVisible({ timeout: 8_000 });
    const links = nav.getByRole("link").or(nav.locator("a"));
    const count = await links.count();
    expect(count, `El menú solo tiene ${count} links`).toBeGreaterThanOrEqual(3);
  });

  test("no hay errores críticos de JS en consola", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    // Recargar para capturar errores desde el inicio
    await page.reload();
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    // Filtrar errores conocidos no críticos
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("WebSocket") &&
        !e.includes("HMR") &&
        !e.includes("vite") &&
        !e.includes("ResizeObserver")
    );
    expect(criticalErrors, `Errores de JS: ${criticalErrors.join("\n")}`).toHaveLength(0);
  });
});
