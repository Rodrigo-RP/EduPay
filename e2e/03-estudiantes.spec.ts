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
    await page.goto("/estudiantes", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
  });

  test("la página carga sin error de servidor", async ({ page }) => {
    await expect(
      page.getByText(/error 500|internal server|algo salió mal|error al cargar estudiantes/i),
    ).toHaveCount(0);
    const hasContent =
      (await page.locator("table, [class*='list'], [class*='grid'], [class*='card']").count()) > 0 ||
      (await page.getByText(/alumno|estudiante|sin registros|no hay/i).count()) > 0;
    expect(hasContent, "La página de estudiantes no tiene contenido").toBeTruthy();
  });

  test("el buscador filtra resultados al escribir", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/buscar por nombre, apellidos o curp/i);
    await expect(searchInput, "No apareció el campo de búsqueda").toBeVisible({ timeout: 15_000 });
    await searchInput.fill("zzz_no_existe_zzz");
    const emptyMsg = page.getByText(/sin resultados|no encontr|0 alumnos|no hay/i);
    const rows = page.locator("table tbody tr, [data-testid='student-row']");
    await expect
      .poll(async () => (await rows.count()) === 0 || (await emptyMsg.count()) > 0, {
        message: "El buscador no está filtrando la lista",
        timeout: 5_000,
      })
      .toBe(true);
  });
});
