/**
 * e2e/10-caja-onerror.spec.ts
 * Módulo: Caja y Conciliación — comportamiento de onError en el frontend
 *
 * Confirma que cuando /api/caja/cerrar-dia devuelve un error:
 *   1. El toast "Error al cerrar caja" aparece visible en el DOM.
 *   2. El toast de éxito "Caja cerrada" NO aparece (onSuccess no corrió).
 *
 * Usa page.route() para interceptar la petición y forzar un 500
 * sin necesidad de provocar el error real en el servidor.
 *
 * ARQUITECTURA:
 *   - La app es SPA con wouter: login no cambia URL; navegación via pushState.
 *   - El botón "Cerrar caja del día" vive en el sub-componente ConciliacionAutomatica,
 *     que se monta al activar el tab value="conciliacion".
 *   - El sistema de toast es shadcn/ui: renderiza en [data-radix-toast-viewport]
 *     o con role="region"; el título está en [data-title] o en texto directo.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

// ── Helper: navegar a /caja-conciliacion en la SPA ───────────────────────────
async function irACaja(page: any): Promise<void> {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/caja-conciliacion");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  // Esperar el título de la página
  await page.waitForSelector(
    "h1, [class*='green-600']",
    { timeout: 12_000 }
  );
  await expect(
    page.getByText(/caja y conciliación/i).first()
  ).toBeVisible({ timeout: 8_000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────
test.describe("Caja — onError: toast de error aparece, onSuccess no corre", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await irACaja(page);
  });

  test(
    "cerrar-dia: intercepta 500, muestra toast de error, NO muestra toast de éxito",
    async ({ page }) => {

      // ── 1. Interceptar /api/caja/cerrar-dia antes de hacer clic ─────────
      //      page.route() es sticky: intercepta TODAS las llamadas que haga
      //      la app a esa ruta desde este momento hasta el final del test.
      await page.route("**/api/caja/cerrar-dia", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Error interno del servidor" }),
        });
      });
      await page.route("**/api/caja/cierre-dia?*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ cierre: null }),
        });
      });

      // ── 2. Activar el tab "Conciliación automática" ──────────────────────
      //      El botón "Cerrar caja del día" vive en ConciliacionAutomatica,
      //      que solo se monta cuando este tab está activo.
      const tabConciliacion = page.getByRole("tab", { name: /conciliación automática/i });
      await expect(tabConciliacion).toBeVisible({ timeout: 8_000 });
      await tabConciliacion.click();

      // Esperar que el contenido del tab sea visible
      await expect(
        page.getByText(/cierre de caja diario/i).first()
      ).toBeVisible({ timeout: 8_000 });

      // ── 3. Hacer clic en el botón real "Cerrar caja del día" ─────────────
      const btnCerrar = page.getByRole("button", { name: /cerrar caja del día/i });
      await expect(btnCerrar).toBeVisible({ timeout: 6_000 });
      await page.getByLabel(/efectivo contado en caja/i).fill("100.00");
      await btnCerrar.click();

      // ── 4. El toast de error debe aparecer ───────────────────────────────
      //      shadcn/ui Toast renderiza en un viewport con role="region"
      //      y el texto del título en el DOM directo.
      await expect(
        page.getByText("Error al cerrar caja", { exact: true })
      ).toBeVisible({ timeout: 8_000 });

      // ── 5. El toast de éxito NO debe aparecer ────────────────────────────
      //      Si onSuccess hubiera corrido, aparecería "Caja cerrada".
      //      Esperamos 2 s para dar tiempo a que cualquier efecto secundario
      //      se manifieste — si en ese plazo no aparece, confirmamos ausencia.
      await expect(
        page.getByText("Caja cerrada", { exact: true })
      ).not.toBeVisible({ timeout: 2_000 });
    }
  );
});
