/**
 * e2e/helpers/auth.ts
 * Utilidades de autenticación compartidas entre tests E2E.
 */
import { type Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin.campus@jfr.edu.mx";
export const ADMIN_PASSWORD = "Demo2025!";
export const GUARDIAN_EMAIL = "guardian@demo.edupay.mx";
export const GUARDIAN_PASSWORD = "Demo2025!";

/** Inicia sesión como administrador y espera que aparezca el panel.
 *
 * ARQUITECTURA: La app es una SPA con wouter. Después del login NO cambia la URL,
 * sino que re-renderiza condicionalmente mostrando el dashboard en vez del form.
 * Por eso esperamos contenido del panel, no un cambio de URL.
 */
export async function loginAsAdmin(page: Page) {
  const reset = await page.request.post("/api/test/reset-auth-rate-limit", {
    failOnStatusCode: false,
  });
  if (!reset.ok()) {
    throw new Error(`No se pudo reiniciar el rate limiter de login: HTTP ${reset.status()}`);
  }
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  // Si ya hay sesión activa (token en localStorage) puede que el panel ya esté visible
  const alreadyIn = page.locator("nav, aside, [class*='sidebar'], [class*='Sidebar']").first();
  if (await alreadyIn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    return; // ya autenticado
  }
  // Llenar credenciales
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Esperar a que desaparezca el form y aparezca el sidebar del panel
  await page.waitForSelector("nav, aside, [class*='sidebar']", { timeout: 15_000 });
}

/** Inicia sesión como tutor/guardian y espera el portal de pagos. */
export async function loginAsGuardian(page: Page) {
  const reset = await page.request.post("/api/test/reset-auth-rate-limit", {
    failOnStatusCode: false,
  });
  if (!reset.ok()) {
    throw new Error(`No se pudo reiniciar el rate limiter de login: HTTP ${reset.status()}`);
  }
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  // El portal de padres reutiliza el mismo form — usar guardianLogin
  // Por ahora no hay forma directa en la UI: usar la API directamente
  const res = await page.request.post("/api/auth/guardian-login", {
    data: { email: GUARDIAN_EMAIL, password: GUARDIAN_PASSWORD },
    failOnStatusCode: false,
  });
  if (res.status() !== 200) {
    throw new Error(`El login de tutor falló: HTTP ${res.status()} — ${await res.text()}`);
  }
  const body = await res.json();
  await page.evaluate((token) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "guardian");
  }, body.token);
  await page.reload();
  await page.waitForSelector("[class*='portal'], [class*='Portal'], main", { timeout: 10_000 });
}
