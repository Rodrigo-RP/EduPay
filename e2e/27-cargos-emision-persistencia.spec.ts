/**
 * Cargos y emisión.
 *
 * Evidencia: UI real → endpoint → Neon → recarga visual.
 * El preview nunca puede escribir; el cargo extraordinario se crea para un
 * alumno temporal y se elimina junto con su concepto al terminar.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";
import { pool as db } from "../server/db";

const suffix = `${Date.now()}`;
const futureDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

let authToken = "";
let authUser = "";
let tenantId = 0;
let campusId = 0;
let studentId = 0;
let conceptId = 0;

const studentName = `Alumno E2E Emisión ${suffix}`;
const conceptName = `Colegiatura E2E Emisión ${suffix}`;
const extraordinaryName = `Excursión E2E Emisión ${suffix}`;
const regularAmount = 123_456;
const extraordinaryAmount = 54_321;

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

async function navigateTo(page: Page, path: string, heading: RegExp) {
  await page.evaluate((destination) => {
    window.history.pushState({}, "", destination);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Cargos y Emisión — persistencia real", () => {
  test.beforeAll(async ({ browser }) => {
    const scope = await db.query(
      "SELECT tenant_id, campus_id FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL],
    );
    expect(scope.rows).toHaveLength(1);
    tenantId = Number(scope.rows[0].tenant_id);
    campusId = Number(scope.rows[0].campus_id);

    const student = await db.query(
      `INSERT INTO students
         (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, id_referencia, grado, grupo, status)
       VALUES ($1,$2,'Alumno','Emisión',$3,$4,'3° PRIMARIA','E2E','activo')
       RETURNING id`,
      [tenantId, campusId, studentName, `E2E-EMISION-${suffix}`],
    );
    studentId = Number(student.rows[0].id);

    const concept = await db.query(
      `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,$3,'colegiatura','mensual',$4) RETURNING id`,
      [tenantId, campusId, conceptName, regularAmount],
    );
    conceptId = Number(concept.rows[0].id);
    await db.query(
      `INSERT INTO payment_due_dates
        (tenant_id, campus_id, concept_id, concepto, dia_vencimiento, mes_aplicacion, activo)
       VALUES ($1,$2,$3,$4,$5,'todos',true)`,
      [tenantId, campusId, conceptId, conceptName, Number(futureDate.slice(8, 10))],
    );

    const page = await browser.newPage();
    await loginAsAdmin(page);
    ({ authToken, authUser } = await page.evaluate(() => ({
      authToken: localStorage.getItem("auth_token") || "",
      authUser: localStorage.getItem("auth_user") || "",
    })));
    await page.close();
    expect(authToken).not.toBe("");
  });

  test.beforeEach(async ({ page }) => {
    await restoreSession(page);
  });

  test.afterAll(async () => {
    await db.query("DELETE FROM charges WHERE concept_id = $1 OR student_id = $2", [conceptId, studentId]);
    await db.query("DELETE FROM payment_due_dates WHERE concept_id = $1", [conceptId]);
    await db.query("DELETE FROM concepts WHERE id = $1 OR (campus_id = $2 AND nombre = $3)", [
      conceptId,
      campusId,
      extraordinaryName,
    ]);
    await db.query("DELETE FROM students WHERE id = $1", [studentId]);
  });

  test("EM-01: el preview no escribe y la confirmación desde Cargos persiste", async ({ page }) => {
    await navigateTo(page, "/cargos", /gestión de cargos/i);
    await page.getByRole("button", { name: /generar cargos/i }).click();

    const dialog = page.getByRole("dialog");
    const selects = dialog.getByRole("combobox");
    await selects.nth(0).click();
    await page.getByRole("option", { name: new RegExp(conceptName) }).click();
    await selects.nth(1).click();
    await page.getByRole("option", { name: /primaria/i }).click();
    await dialog.locator('input[type="date"]').nth(0).fill(futureDate);
    await dialog.locator('input[type="date"]').nth(1).fill(futureDate);

    const previewRequest = page.waitForResponse((response) =>
      response.url().includes("/api/charges/generate") &&
      response.request().method() === "POST" &&
      response.request().postData()?.includes('"dry_run":true'),
    );
    await dialog.getByRole("button", { name: /previsualizar/i }).click();
    const previewResponse = await previewRequest;
    expect(previewResponse.status()).toBe(200);
    const preview = await previewResponse.json() as { dry_run: boolean; summary: Array<{ student_id: number; total_centavos: number }> };
    expect(preview.dry_run).toBe(true);
    expect(preview.summary.some((row) => Number(row.student_id) === studentId)).toBe(true);

    const beforeConfirm = await db.query(
      "SELECT COUNT(*)::int AS count FROM charges WHERE student_id = $1 AND concept_id = $2",
      [studentId, conceptId],
    );
    expect(Number(beforeConfirm.rows[0].count)).toBe(0);
    await expect(dialog.getByText(studentName, { exact: true })).toBeVisible();

    const confirmationRequest = page.waitForResponse((response) =>
      response.url().includes("/api/charges/generate") &&
      response.request().method() === "POST" &&
      response.request().postData()?.includes('"dry_run":false'),
    );
    await dialog.getByRole("button", { name: /confirmar y generar/i }).click();
    const confirmationResponse = await confirmationRequest;
    expect(confirmationResponse.status()).toBe(201);

    const persisted = await db.query(
      `SELECT monto_base_centavos, estado, fecha_vencimiento::text AS fecha_vencimiento
         FROM charges WHERE student_id = $1 AND concept_id = $2`,
      [studentId, conceptId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(Number(persisted.rows[0].monto_base_centavos)).toBe(regularAmount);
    expect(persisted.rows[0].estado).toBe("pendiente");
    expect(String(persisted.rows[0].fecha_vencimiento).slice(0, 10)).toBe(futureDate);

    const reloadedCharges = page.waitForResponse((response) =>
      response.url().includes("/api/admin/charges") && response.request().method() === "GET",
    );
    await page.reload();
    expect((await reloadedCharges).status()).toBe(200);
    await page.getByPlaceholder(/buscar alumno o concepto/i).fill(studentName);
    await expect(page.getByText(studentName, { exact: true })).toBeVisible();
    await expect(page.getByText(conceptName, { exact: true })).toBeVisible();
  });

  test("EM-02: Emisión crea un extraordinario para un alumno real y lo muestra tras recargar", async ({ page }) => {
    await navigateTo(page, "/emision-cargos", /emisión de cargos/i);
    await page.getByRole("tab", { name: /cargos extraordinarios/i }).click();
    const extraordinaryPanel = page.getByRole("tabpanel", { name: /cargos extraordinarios/i });
    await extraordinaryPanel.getByLabel("Concepto").fill(extraordinaryName);
    await extraordinaryPanel.getByLabel(/monto \(mxn\)/i).fill((extraordinaryAmount / 100).toFixed(2));
    await extraordinaryPanel.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(studentName) }).click();
    await page.locator("#fecha_vencimiento").fill(futureDate);

    const createdRequest = page.waitForResponse((response) =>
      response.url().includes("/api/charges/generate") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^crear cargo extraordinario$/i }).click();
    const createdResponse = await createdRequest;
    expect(createdResponse.status()).toBe(201);

    const persisted = await db.query(
      `SELECT c.monto_base_centavos, c.estado, con.nombre
         FROM charges c
         JOIN concepts con ON con.id = c.concept_id
        WHERE c.student_id = $1 AND con.nombre = $2`,
      [studentId, extraordinaryName],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(Number(persisted.rows[0].monto_base_centavos)).toBe(extraordinaryAmount);
    expect(persisted.rows[0].estado).toBe("pendiente");

    await page.reload();
    await page.getByRole("tab", { name: /cargos extraordinarios/i }).click();
    await expect(page.getByText(extraordinaryName, { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(studentName))).toBeVisible();
  });
});