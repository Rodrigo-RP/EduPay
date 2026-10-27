import { test, expect } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";
import { pool as db } from "../server/db";

let campusId = 0;
let onboardingWasComplete = false;
test.beforeAll(async () => {
  const scope = await db.query("SELECT campus_id FROM users WHERE email = $1 LIMIT 1", [ADMIN_EMAIL]);
  expect(scope.rows).toHaveLength(1);
  campusId = Number(scope.rows[0].campus_id);
  const campus = await db.query("SELECT onboarding_completado FROM campuses WHERE id = $1", [campusId]);
  onboardingWasComplete = Boolean(campus.rows[0]?.onboarding_completado);
  await db.query("UPDATE campuses SET onboarding_completado = true WHERE id = $1", [campusId]);
});
test.afterAll(async () => {
  await db.query("UPDATE campuses SET onboarding_completado = $1 WHERE id = $2", [onboardingWasComplete, campusId]);
});

test("SAT-UI-01: error HTTP se muestra sin convertirlo en métricas cero", async ({ page }, testInfo) => {
  await page.route("**/api/fiscal/estadisticas-sat*", route => route.fulfill({
    status: 500, contentType: "application/json",
    body: JSON.stringify({ message: "No se pudieron obtener las estadísticas SAT" }),
  }));
  await loginAsAdmin(page);
  await page.evaluate(() => window.history.pushState({}, "", "/fiscal-contable"));
  await page.getByRole("tab", { name: "Reportes SAT", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No hay cifras disponibles" })).toBeVisible();
  await expect(page.getByText("Facturas emitidas", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sat-error-visible.png"), fullPage: true });
});

test("SAT-UI-02: muestra modo sin configurar y nunca conexión activa", async ({ page }) => {
  await page.route("**/api/fiscal/estadisticas-sat*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      total_cfdis: 0, emitidos: 0, cancelados: 0, pendientes: 0,
      pac: null, modo: "sin configurar", conexion_verificada: false, operacion_habilitada: false,
    }),
  }));
  await loginAsAdmin(page);
  await page.evaluate(() => window.history.pushState({}, "", "/fiscal-contable"));
  await page.getByRole("tab", { name: "Reportes SAT", exact: true }).click();
  await expect(page.getByText("Proveedor: Sin configurar", { exact: true })).toBeVisible();
  await expect(page.getByText("Modo configurado: sin configurar", { exact: true })).toBeVisible();
  await expect(page.getByText(/Conexión no verificada/)).toBeVisible();
  await expect(page.getByText("Facturas emitidas", { exact: true })).toBeVisible();
});
