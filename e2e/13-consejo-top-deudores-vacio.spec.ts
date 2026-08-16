/**
 * e2e/13-consejo-top-deudores-vacio.spec.ts
 * Módulo: Reporte Consejo Directivo — renderizado con top_deudores vacío
 *
 * PROPÓSITO:
 *   Confirmar que cuando la API devuelve top_deudores: [] el componente
 *   ReporteConsejo muestra "Sin deudores en este período" y nunca las
 *   cinco familias ficticias que existían antes del fix.
 *
 * ESTRATEGIA:
 *   page.route() intercepta /api/reportes/consejo* y devuelve una respuesta
 *   con top_deudores: []. Esto desacopla el test del estado real de la DB
 *   demo (el campus demo tiene deudores reales) y prueba la rama de render
 *   que antes mostraba datos inventados.
 *
 * ARQUITECTURA SPA (wouter):
 *   - Login no cambia URL → esperar sidebar visible.
 *   - Navegación interna vía pushState + popstate (no page.goto a sub-ruta).
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

// ── Helper: navegar a /reporte-consejo en la SPA ──────────────────────────────
async function irReporteConsejo(page: any): Promise<void> {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/reporte-consejo");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  // Esperar el título H1 de la pantalla del consejo
  await page.waitForFunction(
    () => {
      const h1s = Array.from(document.querySelectorAll("h1, h2"));
      return h1s.some((el) => /consejo/i.test(el.textContent || ""));
    },
    { timeout: 12_000 },
  );
}

// ── Helper: esperar que el spinner desaparezca ────────────────────────────────
async function esperarCarga(page: any): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector(".animate-spin") === null,
    { timeout: 15_000 },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
test.describe("Reporte Consejo — top_deudores vacío (fix datos ficticios)", () => {

  test(
    "CDV-01: top_deudores:[] → muestra 'Sin deudores en este período', nunca 'Familia Demo'",
    async ({ page }) => {
      // ── 1. Interceptar la llamada al API ANTES de navegar ─────────────────
      //   Dejamos pasar la primera llamada para obtener la estructura real del
      //   payload y reemplazamos solo top_deudores con [].
      await page.route("**/api/reportes/consejo**", async (route) => {
        // Dejar que la petición llegue al servidor real
        const response = await route.fetch();
        const json = await response.json().catch(() => ({}));

        // Forzar top_deudores a array vacío, mantener el resto intacto
        const patched = { ...json, top_deudores: [] };

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(patched),
        });
      });

      // ── 2. Login y navegación ─────────────────────────────────────────────
      await loginAsAdmin(page);
      await irReporteConsejo(page);
      await esperarCarga(page);

      // ── 3. Verificar que el mensaje correcto aparece en el DOM ────────────
      await expect(
        page.getByText(/sin deudores en este período/i),
      ).toBeVisible({ timeout: 10_000 });

      // ── 4. Verificar que los datos ficticios NO están en el DOM ───────────
      //   El texto "Familia Demo" era producido exclusivamente por el Array.from
      //   fallback eliminado. Su presencia indicaría regresión.
      await expect(
        page.getByText(/familia demo/i),
      ).not.toBeVisible({ timeout: 3_000 });
    },
  );

  test(
    "CDV-02: con top_deudores reales (sin interceptar) la sección muestra deudores, no el mensaje vacío",
    async ({ page }) => {
      // Sin page.route → el campus demo devuelve sus deudores reales
      await loginAsAdmin(page);
      await irReporteConsejo(page);
      await esperarCarga(page);

      // El campus demo (campus_id:48) tiene deudores reales → la lista debe
      // tener al menos un elemento; el mensaje vacío NO debe aparecer.
      await expect(
        page.getByText(/sin deudores en este período/i),
      ).not.toBeVisible({ timeout: 5_000 });

      // Al menos un nombre de familia real debe estar visible en la lista
      // (el componente renderiza d.nombre_familia por cada deudor)
      const deudoresVisible = await page
        .locator("[class*='border-b']")
        .count();
      expect(
        deudoresVisible,
        "Se esperaban filas de deudores reales pero el DOM no las tiene",
      ).toBeGreaterThan(0);
    },
  );
});
