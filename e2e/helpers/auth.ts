/**
 * e2e/helpers/auth.ts
 * Utilidades de autenticación compartidas entre tests E2E.
 */
import { type Page, type APIRequestContext, type APIResponse } from "@playwright/test";
import { staffTotpCodeForTest, enrollmentCodeForTest } from "../../server/test-support/staff-totp";

export const ADMIN_EMAIL = "admin.campus@jfr.edu.mx";
export const SUPERADMIN_EMAIL = "superadmin@edupay.mx";
export const ADMIN_PASSWORD = "Demo2025!";
export const GUARDIAN_EMAIL = "guardian@demo.edupay.mx";
export const GUARDIAN_PASSWORD = "Demo2025!";

/** Usa el flujo real: contraseña, TOTP o enrolamiento pendiente y después TOTP.
 * No omite la 2FA, no agrega rutas ni modifica cuentas mediante SQL.
 */
export async function staffApiLogin(request: APIRequestContext, email: string, password: string, base = ""): Promise<APIResponse> {
  let response = await request.post(`${base}/api/auth/login`, {
    data: { email, password, totp_code: await staffTotpCodeForTest(email) },
  });
  if (!response.ok()) return response;
  const login = await response.json();
  if (!login.user?.requires_twofa_setup) return response;
  const headers = { Authorization: `Bearer ${login.token}` };
  const setup = await request.post(`${base}/api/auth/2fa/setup`, { headers });
  if (!setup.ok()) throw new Error(`Registro 2FA de prueba falló: HTTP ${setup.status()}`);
  const pending = await setup.json();
  const confirm = await request.post(`${base}/api/auth/2fa/confirm`, {
    headers, data: { totp_code: enrollmentCodeForTest(pending.manual_code) },
  });
  if (!confirm.ok()) throw new Error(`Confirmación 2FA de prueba falló: HTTP ${confirm.status()}`);
  response = await request.post(`${base}/api/auth/login`, {
    data: { email, password, totp_code: await staffTotpCodeForTest(email) },
  });
  return response;
}

export async function completeStaffLogin(page: Page, email: string) {
  // Esperar uno de los estados reales del flujo, no tiempos arbitrarios.
  await page.locator("aside, nav, #totp, h1:has-text('Configura la autenticación'), h1:has-text('Cambia tu contraseña')").first().waitFor();
  if (await page.locator("#totp").isVisible()) {
    const code = await staffTotpCodeForTest(email);
    if (!code) throw new Error("La cuenta de prueba no tiene TOTP configurado");
    await page.locator("#totp").fill(code);
    await page.locator('button[type="submit"]').click();
  }
  if (await page.getByRole("heading", { name: "Configura la autenticación de dos factores" }).isVisible()) {
    await page.getByRole("button", { name: "Comenzar registro" }).click();
    const secret = await page.getByTestId("totp-manual-code").innerText();
    await page.getByLabel("Código de 6 dígitos de tu autenticador").fill(enrollmentCodeForTest(secret));
    await page.getByRole("button", { name: "Confirmar dos factores", exact: true }).click();
    await page.getByLabel("Ya guardé mis códigos").check();
    await page.getByRole("button", { name: "Continuar a EduPay" }).click();
  }
}

/** Inicia sesión como administrador y espera que aparezca el panel.
 *
 * ARQUITECTURA: La app es una SPA con wouter. Después del login NO cambia la URL,
 * sino que re-renderiza condicionalmente mostrando el dashboard en vez del form.
 * Por eso esperamos contenido del panel, no un cambio de URL.
 */
export async function loginAsAdmin(page: Page) {
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
  await completeStaffLogin(page, ADMIN_EMAIL);
  // Esperar a que desaparezca el form y aparezca el sidebar del panel
  await page.waitForSelector("nav, aside, [class*='sidebar']", { timeout: 15_000 });
}

export async function loginAsSuperAdmin(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  // Si ya hay sesión activa (token en localStorage) puede que el panel ya esté visible
  const alreadyIn = page.locator("nav, aside, [class*='sidebar'], [class*='Sidebar']").first();
  if (await alreadyIn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    return; // ya autenticado
  }
  // Llenar credenciales
  await page.locator("#email").fill(SUPERADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await completeStaffLogin(page, SUPERADMIN_EMAIL);
  // Esperar a que desaparezca el form y aparezca el sidebar del panel
  await page.waitForSelector("nav, aside, [class*='sidebar']", { timeout: 15_000 });
}

/** Inicia sesión como tutor/guardian y espera el portal de pagos. */
export async function loginAsGuardian(page: Page) {
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
