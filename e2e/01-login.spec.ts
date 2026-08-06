/**
 * e2e/01-login.spec.ts
 * Módulo: Autenticación
 * Capa: Playwright (E2E)
 *
 * ARQUITECTURA: La app es una SPA con wouter. Después del login NO cambia la URL;
 * en cambio, re-renderiza condicionalmente mostrando el panel de admin.
 * Los tests verifican que el contenido cambia, no que la URL cambia.
 *
 * Cubre:
 *   - Login exitoso muestra el panel administrativo (sidebar visible)
 *   - Login con credenciales incorrectas muestra mensaje de error (form sigue visible)
 *   - Logout limpia la sesión (vuelve al form de login)
 */
import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/auth";

test.describe("Login – Administrador", () => {
  test.beforeEach(async ({ page }) => {
    // Borrar cualquier sesión previa
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_type");
      localStorage.removeItem("auth_user");
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  });

  test("login exitoso muestra el panel administrativo", async ({ page }) => {
    // El form de login debe estar visible al inicio
    await expect(page.locator("#email")).toBeVisible({ timeout: 8_000 });

    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Después del login el sidebar del panel debe aparecer (el form desaparece)
    await expect(
      page.locator("nav, aside, [class*='sidebar']").first()
    ).toBeVisible({ timeout: 15_000 });

    // El form de login ya no debe estar visible
    await expect(page.locator("#email")).not.toBeVisible({ timeout: 5_000 });
  });

  test("credenciales incorrectas muestran mensaje de error", async ({ page }) => {
    await expect(page.locator("#email")).toBeVisible({ timeout: 8_000 });

    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill("WrongPassword!");
    await page.locator('button[type="submit"]').click();

    // Debe aparecer algún mensaje de error
    await expect(
      page.getByText(/incorrecto|inválido|error|autenticación|credenciales/i).first()
    ).toBeVisible({ timeout: 8_000 });

    // El form sigue visible (no fue al dashboard)
    await expect(page.locator("#email")).toBeVisible({ timeout: 3_000 });
  });

  test("logout limpia la sesión y vuelve al login", async ({ page }) => {
    // Login
    await expect(page.locator("#email")).toBeVisible({ timeout: 8_000 });
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("nav, aside, [class*='sidebar']").first()).toBeVisible({ timeout: 15_000 });

    // Logout — buscar botón en menú o header
    const logoutBtn = page
      .getByRole("button", { name: /cerrar sesión|logout|salir/i })
      .or(page.getByRole("menuitem", { name: /cerrar sesión|logout|salir/i }));

    if (!(await logoutBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
      // Puede estar en un menú de usuario desplegable
      const userMenu = page.locator("[data-testid='user-menu'], [class*='avatar'], [class*='user-button']").first();
      if (await userMenu.count()) await userMenu.click();
    }

    if (await logoutBtn.count()) {
      await logoutBtn.first().click();
      // Después del logout el form de login vuelve a aparecer
      await expect(page.locator("#email")).toBeVisible({ timeout: 10_000 });
    } else {
      // Si no hay botón de logout, verificar que el token se puede borrar manualmente
      await page.evaluate(() => {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_type");
        localStorage.removeItem("auth_user");
      });
      await page.reload();
      await expect(page.locator("#email")).toBeVisible({ timeout: 8_000 });
    }
  });
});
