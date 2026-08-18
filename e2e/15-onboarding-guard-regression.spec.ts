/**
 * e2e/15-onboarding-guard-regression.spec.ts
 * OBG — Regresión: OnboardingGuard y /configuracion-pagos-completa
 *
 * Bug original: /configuracion-pagos-completa no estaba en UNGUARDED_PATHS.
 * Con onboarding incompleto, un administrador era redirigido al wizard antes de
 * poder configurar Stripe Connect → círculo vicioso: no podía cobrar porque el
 * onboarding nunca llegaba al paso de Stripe.
 *
 * Fix: agregar /configuracion-pagos-completa a UNGUARDED_PATHS en
 * client/src/components/OnboardingGuard.tsx
 *
 * Tres casos de regresión cubiertos:
 *   OBG-01 — Ruta del bug corregido: admin + completado=false SÍ renderiza /configuracion-pagos-completa
 *   OBG-02 — Regresión inversa: rutas NO listadas en UNGUARDED_PATHS siguen redirigiendo al wizard
 *   OBG-03 — Permisos: el guard de onboarding pasa la ruta, pero el backend rechaza
 *             operaciones de configuración para roles sin SETTINGS.CONFIGURE
 *
 * Estrategia: page.route() intercepta /api/admin/configuracion/onboarding-status
 * y devuelve { completado: false } sin tocar la DB. El intercept se instala ANTES
 * de page.goto() para capturar el primer fetch del hook useOnboardingStatus.
 */

import { test, expect } from "@playwright/test";

// ── Credenciales ──────────────────────────────────────────────────────────────
const ADMIN_EMAIL    = "admin.campus@jfr.edu.mx";
const ADMIN_PASSWORD = "Demo2025!";
// admisiones@jfr.edu.mx existe en el seed demo y solo tiene ADMISSIONS.READ
// (sin SETTINGS.CONFIGURE) → sirve como rol sin permisos de configuración.
const ADMISIONES_EMAIL    = "admisiones@jfr.edu.mx";
const ADMISIONES_PASSWORD = "Demo2025!";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Intercepta /api/admin/configuracion/onboarding-status para que toda petición
 * devuelva { completado: false }.  Debe llamarse ANTES de page.goto() para que
 * el primer fetch del hook quede controlado.
 */
async function mockOnboardingIncomplete(page: any): Promise<void> {
  await page.route(
    "**/api/admin/configuracion/onboarding-status",
    async (route: any) => {
      await route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ completado: false, campus_id: 1, steps: {} }),
      });
    },
  );
}

/**
 * Login genérico via formulario de la app.
 * Limpia localStorage primero para que no haya sesión previa de otro rol.
 */
async function loginAs(
  page: any,
  email: string,
  password: string,
): Promise<void> {
  // Abrir la página con la sesión completamente limpia
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // Si hay una sesión activa de otra cuenta, limpiarla y recargar
  const alreadyIn = page
    .locator("nav, aside, [class*='sidebar'], [class*='Sidebar']")
    .first();
  if (await alreadyIn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  }

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector("nav, aside, [class*='sidebar']", {
    timeout: 15_000,
  });
}

/**
 * Navega a una ruta dentro de la SPA (wouter) sin recargar la página.
 * Equivale a que el usuario haga clic en un Link del sidebar.
 */
async function spaNavigate(page: any, path: string): Promise<void> {
  await page.evaluate((p: string) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("OBG — OnboardingGuard regression: /configuracion-pagos-completa", () => {

  // ──────────────────────────────────────────────────────────────────────────
  // OBG-01: La ruta del bug corregido
  // Con onboarding incompleto, /configuracion-pagos-completa DEBE renderizarse
  // porque está en UNGUARDED_PATHS.  Antes del fix, la guard redirigía al wizard.
  // ──────────────────────────────────────────────────────────────────────────
  test(
    "OBG-01: admin + onboarding incompleto → /configuracion-pagos-completa SÍ renderiza (no redirige al wizard)",
    async ({ page }) => {
      // Instalar intercept ANTES de cargar la app
      await mockOnboardingIncomplete(page);
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      // Navegar a la ruta que era el bug
      await spaNavigate(page, "/configuracion-pagos-completa");

      // El h1 "Configuración de Pagos" debe aparecer — indica que la pantalla renderizó
      await expect(
        page.getByRole("heading", { name: /configuración de pagos/i }).first(),
      ).toBeVisible({ timeout: 10_000 });

      // Confirmación negativa: NO se redirigió al wizard
      expect(page.url()).not.toContain("/configuracion-inicial");
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // OBG-02: Regresión inversa — el guard sigue activo para rutas no exceptuadas
  // /cuentas-por-cobrar NO está en UNGUARDED_PATHS, por lo que con completado=false
  // el OnboardingGuard debe redirigir al wizard.
  // Verifica que el fix no desactivó el guard por completo.
  // ──────────────────────────────────────────────────────────────────────────
  test(
    "OBG-02: admin + onboarding incompleto → /cuentas-por-cobrar redirige a /configuracion-inicial",
    async ({ page }) => {
      await mockOnboardingIncomplete(page);
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      // Navegar a una ruta guarded que NO está en UNGUARDED_PATHS
      await spaNavigate(page, "/cuentas-por-cobrar");

      // El OnboardingGuard dispara navigate("/configuracion-inicial") via wouter,
      // que actualiza la URL con history.pushState → Playwright la detecta.
      await expect(page).toHaveURL(/configuracion-inicial/, { timeout: 8_000 });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // OBG-03: Guard de permisos — el OnboardingGuard pasa, el backend bloquea
  // admisiones (sin SETTINGS.CONFIGURE) puede llegar a /configuracion-pagos-completa
  // (porque está en UNGUARDED_PATHS), pero el backend rechaza cualquier operación
  // de configuración con 403.
  // ──────────────────────────────────────────────────────────────────────────
  test(
    "OBG-03: rol sin SETTINGS.CONFIGURE → llega a /configuracion-pagos-completa pero POST /api/concepts devuelve 403",
    async ({ page }) => {
      // Interceptar antes de cargar con las credenciales de admisiones
      await mockOnboardingIncomplete(page);
      await loginAs(page, ADMISIONES_EMAIL, ADMISIONES_PASSWORD);

      // Navegar: el OnboardingGuard ve completado=false pero la ruta está en
      // UNGUARDED_PATHS, así que NO redirige.
      await spaNavigate(page, "/configuracion-pagos-completa");

      // Esperar suficiente para que useEffect del guard haya corrido (si fuera a redirigir,
      // lo habría hecho en este tiempo)
      await page.waitForTimeout(3_000);
      expect(
        page.url(),
        "OBG-03: rol sin SETTINGS.CONFIGURE no debe ser redirigido por el OnboardingGuard",
      ).not.toContain("/configuracion-inicial");

      // La pantalla renderiza — el guard de onboarding la dejó pasar
      await expect(
        page.getByRole("heading", { name: /configuración de pagos/i }).first(),
      ).toBeVisible({ timeout: 8_000 });

      // ── Verificar que el guard de permisos REAL sigue activo en el backend ──
      // POST /api/concepts requiere SETTINGS.CONFIGURE (confirmado en CFC-01).
      // admisiones solo tiene ADMISSIONS.READ → debe recibir 403.
      const token = await page.evaluate(
        () => localStorage.getItem("auth_token") ?? "",
      );
      const res = await page.request.post("/api/concepts", {
        headers:          { Authorization: `Bearer ${token}` },
        data: {
          nombre:       "Regresión OBG-03 (debe fallar)",
          tipo:         "colegiatura",
          periodicidad: "mensual",
          monto_centavos: 1_000,
          iva:          false,
        },
        failOnStatusCode: false,
      });
      expect(
        res.status(),
        `POST /api/concepts: admisiones debería recibir 403 (sin SETTINGS.CONFIGURE), obtuvo ${res.status()}`,
      ).toBe(403);
    },
  );
});
