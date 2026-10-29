import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, loginAsAdmin, loginAsSuperAdmin } from "./helpers/auth";
import { pool as db } from "../server/db";

let campusId = 0;
let onboarding = false;
test.beforeAll(async () => {
  const scope = await db.query("SELECT campus_id FROM users WHERE email = $1 LIMIT 1", [ADMIN_EMAIL]);
  campusId = Number(scope.rows[0].campus_id);
  const row = await db.query("SELECT onboarding_completado FROM campuses WHERE id = $1", [campusId]);
  onboarding = Boolean(row.rows[0].onboarding_completado);
  await db.query("UPDATE campuses SET onboarding_completado = true WHERE id = $1", [campusId]);
});
test.afterAll(async () => {
  if (campusId) await db.query("UPDATE campuses SET onboarding_completado = $1 WHERE id = $2", [onboarding, campusId]);
});

for (const [name, path, pattern] of [
  ["Tablero", "/admin", "**/api/admin/dashboard/*"],
  ["Caja", "/caja-conciliacion", "**/api/caja/estadisticas-conciliacion*"],
  ["Cargos", "/cargos", "**/api/admin/charges"],
  ["Fiscal", "/fiscal-contable", "**/api/fiscal/estadisticas-cfdi*"],
]) {
  test(`${name}: lectura 500 muestra error, oculta cifras y permite reintentar`, async ({ page }, info) => {
    await loginAsAdmin(page);
    let calls = 0;
    await page.route(pattern, async route => {
      calls++;
      await route.fulfill({
        status: 500, contentType: "application/json",
        body: JSON.stringify({ message: "No se pudieron cargar los datos" }),
      });
    });
    await page.evaluate(p => window.history.pushState({}, "", p), path);
    await page.reload();
    const alert = page.getByRole("alert").filter({ hasText: "No se pudieron cargar los datos" });
    await expect(alert).toBeVisible();
    await expect(page.getByTestId("data-read-content")).toBeHidden();
    const previous = calls;
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect.poll(() => calls).toBeGreaterThan(previous);
    await expect(alert).toBeVisible();
    await expect(page.getByTestId("data-read-content")).toBeHidden();
    await page.screenshot({ path: info.outputPath(`${name}-error-sin-cifras.png`) });
  });
}

test("/migracion deshabilitada: no consulta progreso ni descarga resultados ficticios", async ({ page }) => {
  await loginAsSuperAdmin(page);
  const requests: string[] = [];
  page.on("request", request => {
    if (/\/api\/migration\/(?:status|reset|progress|download)/.test(request.url())) requests.push(request.url());
  });
  await page.evaluate(() => window.history.pushState({}, "", "/migracion"));
  await expect(page.getByRole("status", { name: "Función no disponible" })).toBeVisible();
  await expect(page.getByRole("button", { name: "No disponible por ahora", exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
});
test("alias /migration-refeerence también está deshabilitado", async ({ page }) => {
  await loginAsAdmin(page);
  await page.evaluate(() => window.history.pushState({}, "", "/migration-refeerence"));
  await expect(page.getByRole("status", { name: "Función no disponible" })).toBeVisible();
});

