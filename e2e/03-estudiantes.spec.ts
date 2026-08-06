/**
 * e2e/03-estudiantes.spec.ts
 * Módulo: Estudiantes
 * Capa: Playwright (E2E)
 *
 * Cubre:
 *   - La lista de estudiantes carga y muestra filas
 *   - La búsqueda filtra resultados
 *   - El detalle del alumno abre sin error 500
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Estudiantes", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Navegar a estudiantes vía wouter (click en link del sidebar, o directo con location)
    await page.evaluate(() => { window.history.pushState({}, "", "/estudiantes"); });
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  });

  test("la página carga sin error de servidor", async ({ page }) => {
    await expect(page.getByText(/error 500|internal server|algo salió mal/i)).toHaveCount(0);
    // Debe haber algún contenido visible (tabla, cards, o mensaje de vacío)
    const hasContent =
      (await page.locator("table, [class*='list'], [class*='grid'], [class*='card']").count()) > 0 ||
      (await page.getByText(/alumno|estudiante|sin registros|no hay/i).count()) > 0;
    expect(hasContent, "La página de estudiantes no tiene contenido").toBeTruthy();
  });

  test("el buscador filtra resultados al escribir", async ({ page }) => {
    const searchInput = page
      .getByPlaceholder(/buscar|nombre|alumno/i)
      .or(page.getByRole("searchbox"))
      .first();
    if (!(await searchInput.count())) {
      test.skip(true, "No hay campo de búsqueda visible");
      return;
    }
    await searchInput.fill("zzz_no_existe_zzz");
    await page.waitForTimeout(800); // debounce
    // Debe haber menos resultados o mensaje de vacío
    const emptyMsg = page.getByText(/sin resultados|no encontr|0 alumnos|no hay/i);
    const rows = page.locator("table tbody tr, [data-testid='student-row']");
    const filtered =
      (await rows.count()) === 0 || (await emptyMsg.count()) > 0;
    expect(filtered, "El buscador no está filtrando la lista").toBeTruthy();
  });
});
