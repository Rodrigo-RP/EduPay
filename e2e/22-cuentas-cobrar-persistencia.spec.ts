/**
 * Cuentas por Cobrar — evidencia de persistencia real.
 *
 * Recorrido exigido: UI real → POST confirmado → consulta Neon directa →
 * recarga de la SPA → actividad aún visible.
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { pool as db } from "../server/db";

const BASE = "http://localhost:5000";
const evidence = `E2E persistencia cobranza ${Date.now()}`;
let chargeId = 0;
let onboardingWasComplete = false;

test.beforeAll(async ({ request }) => {
  await request.post(`${BASE}/api/test/reset-auth-rate-limit`);
  const login = await request.post(`${BASE}/api/auth/login`, {
    data: { email: "superadmin@edupay.mx", password: "Demo2025!" },
  });
  expect(login.status(), "El login de preparación debe funcionar").toBe(200);
  const { token } = await login.json();
  const seed = await request.post(`${BASE}/api/demo/seed`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(seed.status(), "El seed de datos reales debe funcionar").toBe(200);

  const campus = await db.query(
    "SELECT onboarding_completado FROM campuses WHERE id = 1",
  );
  onboardingWasComplete = Boolean(campus.rows[0]?.onboarding_completado);
  await db.query(
    "UPDATE campuses SET onboarding_completado = true WHERE id = 1",
  );

  const selected = await db.query(
    `SELECT c.id
       FROM charges c
       JOIN students s ON s.id = c.student_id
      WHERE s.campus_id = 1
      ORDER BY c.fecha_vencimiento DESC
      LIMIT 1`,
  );
  chargeId = Number(selected.rows[0]?.id);
  expect(chargeId, "Debe existir un cargo pendiente de la demo para completar la UI").toBeGreaterThan(0);
});

test.afterAll(async () => {
  if (chargeId) {
    await db.query(
      "DELETE FROM collection_activities WHERE descripcion = $1",
      [evidence],
    );
  }
  await db.query(
    "UPDATE campuses SET onboarding_completado = $1 WHERE id = 1",
    [onboardingWasComplete],
  );
  await db.end();
});

test("CX-01: registra una promesa en UI, existe en Neon y sobrevive la recarga", async ({ page }) => {
  await loginAsAdmin(page);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/cuentas-por-cobrar");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await page.getByRole("tab", { name: /seguimiento/i }).click();
  await page.getByRole("button", { name: /registrar promesa/i }).click();

  const dialog = page.getByRole("dialog", { name: /registrar promesa/i });
  const accountSelect = dialog.getByLabel(/estudiante/i);
  await accountSelect.click();
  await page.locator('[role="option"]:visible').first().click();
  await dialog.getByLabel(/fecha comprometida/i).fill("2026-12-15");
  await dialog.getByLabel(/monto comprometido/i).fill("123.45");
  await dialog.getByLabel(/observaciones/i).fill(evidence);
  const saved = page.waitForResponse("**/api/receivables/promises");
  await dialog.getByRole("button", { name: /registrar promesa/i }).click();
  const savedResponse = await saved;
  expect(savedResponse.status(), "La UI debe recibir una respuesta exitosa de persistencia").toBeLessThan(300);
  const savedActivity = await savedResponse.json() as { charge_id: number };

  // Neon directo, no un endpoint de lectura de la app.
  const persisted = await db.query(
    `SELECT charge_id, tipo, estado, fecha_programada, monto_centavos, descripcion
       FROM collection_activities
      WHERE descripcion = $1
      ORDER BY id DESC
      LIMIT 1`,
    [evidence],
  );
  expect(persisted.rows).toHaveLength(1);
  expect(Number(persisted.rows[0].charge_id)).toBe(Number(savedActivity.charge_id));
  expect(persisted.rows[0].tipo).toBe("promesa");
  expect(persisted.rows[0].estado).toBe("prometido");
  expect(Number(persisted.rows[0].monto_centavos)).toBe(12_345);
  expect(new Date(persisted.rows[0].fecha_programada).toISOString().slice(0, 10)).toBe("2026-12-15");

  await page.reload();
  await page.getByRole("tab", { name: /seguimiento/i }).click();
  await expect(page.getByText(evidence)).toBeVisible({ timeout: 10_000 });
});