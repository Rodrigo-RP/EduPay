/**
 * Calendario de vencimientos por periodicidad.
 *
 * Evidencia: UI autenticada → API protegida → Neon → recarga visual.
 */
import { expect, test, type Page } from "@playwright/test";
import { pool as db } from "../server/db";
import { ADMIN_EMAIL, loginAsAdmin } from "./helpers/auth";

const suffix = Date.now().toString();
const conceptName = `Inscripción anual E2E ${suffix}`;
const schoolCycle = "2027-2028";
const startDate = "2027-08-01";
const endDate = "2028-07-31";
const dueDate = "2027-08-20";

let tenantId = 0;
let campusId = 0;
let conceptId = 0;
let authToken = "";
let authUser = "";

async function restoreSession(page: Page) {
  await page.goto("/");
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", user);
  }, { token: authToken, user: authUser });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

async function navigateToConfiguration(page: Page) {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/configuracion-pagos-completa");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: /configuración de pagos/i }).first()).toBeVisible();
  await page.getByRole("tab", { name: /fechas de vencimiento/i }).click();
  await expect(page.getByText("Calendario de periodos largos", { exact: true })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Calendario de vencimientos por periodicidad — E2E", () => {
  test.beforeAll(async ({ browser }) => {
    const scope = await db.query(
      "SELECT tenant_id, campus_id FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL],
    );
    tenantId = Number(scope.rows[0].tenant_id);
    campusId = Number(scope.rows[0].campus_id);
    conceptId = Number((await db.query(
      `INSERT INTO concepts (tenant_id,campus_id,nombre,tipo,periodicidad,monto_centavos)
       VALUES ($1,$2,$3,'inscripcion','anual',250000) RETURNING id`,
      [tenantId, campusId, conceptName],
    )).rows[0].id);

    const page = await browser.newPage();
    await loginAsAdmin(page);
    ({ authToken, authUser } = await page.evaluate(() => ({
      authToken: localStorage.getItem("auth_token") || "",
      authUser: localStorage.getItem("auth_user") || "",
    })));
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await restoreSession(page);
  });

  test.afterAll(async () => {
    await db.query("DELETE FROM payment_due_date_periods WHERE concept_id = $1", [conceptId]);
    await db.query("DELETE FROM concepts WHERE id = $1", [conceptId]);
  });

  test("crea, persiste, recarga y desactiva un periodo anual", async ({ page }) => {
    await navigateToConfiguration(page);
    const card = page.getByText("Calendario de periodos largos", { exact: true }).locator("xpath=../..");

    await card.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(conceptName) }).click();
    const textInputs = card.locator('input:not([type="date"])');
    await textInputs.nth(0).fill(schoolCycle);
    await expect(textInputs.nth(1)).toHaveValue("ANUAL");
    const dates = card.locator('input[type="date"]');
    await dates.nth(0).fill(startDate);
    await dates.nth(1).fill(endDate);
    await dates.nth(2).fill(dueDate);

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/payment-config/due-date-periods")
      && response.request().method() === "POST",
    );
    await card.getByRole("button", { name: "Guardar periodo" }).click();
    expect((await createResponsePromise).status()).toBe(201);

    const persisted = await db.query(
      `SELECT periodo_clave, fecha_vencimiento::text, activo
         FROM payment_due_date_periods
        WHERE concept_id = $1`,
      [conceptId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].periodo_clave).toBe("ANUAL");
    expect(String(persisted.rows[0].fecha_vencimiento).slice(0, 10)).toBe(dueDate);
    expect(persisted.rows[0].activo).toBe(true);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: /fechas de vencimiento/i }).click();
    await expect(page.getByText(`${conceptName} · ANUAL`)).toBeVisible();

    const toggleResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/payment-config/due-date-periods/")
      && response.request().method() === "PUT",
    );
    await page.getByText(`${conceptName} · ANUAL`).locator("xpath=../..").getByRole("button", { name: "Desactivar" }).click();
    expect((await toggleResponsePromise).status()).toBe(200);

    const deactivated = await db.query(
      "SELECT activo FROM payment_due_date_periods WHERE concept_id = $1",
      [conceptId],
    );
    expect(deactivated.rows[0].activo).toBe(false);
  });
});
