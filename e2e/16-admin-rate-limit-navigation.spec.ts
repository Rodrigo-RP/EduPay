/**
 * Regresión de consumo del bucket administrativo.
 *
 * Simula una única sesión normal (una pestaña): Dashboard → Estudiantes →
 * Configuración. No valida el valor del límite; garantiza que esta navegación
 * cotidiana no produzca 429 ni consuma una parte anormal del presupuesto.
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

async function navigateSpa(page: any, path: string) {
  await page.evaluate((nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForTimeout(700);
}

test("una sesión administrativa normal conserva un presupuesto saludable", async ({ page }) => {
  const observationMs = Number(process.env.ADMIN_RATE_LIMIT_OBSERVATION_MS ?? 0);
  if (observationMs > 0) {
    test.setTimeout(observationMs + 30_000);
  }
  const adminResponses: { path: string; status: number; remaining: number | null }[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/admin/") || path.startsWith("/api/super-admin/")) {
      const header = response.headers()["ratelimit-remaining"];
      adminResponses.push({
        path,
        status: response.status(),
        remaining: header === undefined ? null : Number(header),
      });
    }
  });

  await loginAsAdmin(page);
  await navigateSpa(page, "/estudiantes");
  await navigateSpa(page, "/configuracion");

  if (observationMs > 0) {
    await page.waitForTimeout(observationMs);
  }

  expect(adminResponses, "La navegación debe consultar rutas administrativas").not.toHaveLength(0);
  expect(
    adminResponses.filter(({ status }) => status === 429),
    `Respuestas administrativas: ${JSON.stringify(adminResponses)}`,
  ).toHaveLength(0);

  const remaining = adminResponses
    .map(({ remaining }) => remaining)
    .filter((value): value is number => value !== null);
  expect(remaining, "Las respuestas deben informar RateLimit-Remaining").not.toHaveLength(0);
  const consumedDuringNavigation = Math.max(...remaining) - Math.min(...remaining);
  expect(
    consumedDuringNavigation,
    `La sesión consumió ${consumedDuringNavigation} solicitudes administrativas: ${JSON.stringify(adminResponses)}`,
  ).toBeLessThan(50);

  if (observationMs > 0) {
    const dashboardRequests = adminResponses.filter(({ path }) => path.startsWith("/api/admin/dashboard/"));
    expect(
      dashboardRequests.length,
      "La barra lateral no debe volver a pedir el dashboard durante la observación",
    ).toBeLessThanOrEqual(1);
  }
});

test("un JWT administrativo inválido se descarta tras el primer rechazo de onboarding", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/admin/configuracion/onboarding-status") {
      requests.push(request.url());
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "jwt-administrativo-expirado");
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", JSON.stringify({
      id: 999,
      email: "stale-session@example.test",
      name: "Sesión expirada",
      role: "administrador_campus",
      campus_id: 48,
    }));
  });
  await page.goto("/");

  await expect(page.locator("#email")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(750);
  expect(requests, "Una sesión inválida no debe reintentar onboarding en bucle").toHaveLength(1);
});