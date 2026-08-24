/**
 * E2E — Condonación repetida desde Planes de Pago.
 * Usa datos aislados y un JWT de administrador_general para ejercer la UI real:
 * primera condonación → 409 real en la segunda → token → reintento exitoso.
 */
import { test, expect, type Page } from "@playwright/test";
import jwt from "jsonwebtoken";
import { pool } from "../server/db";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
let tenantId: number;
let campusId: number;
let studentId: number;
let firstPlanId: number;
let secondPlanId: number;
let campusPlanId: number;
let token: string;
let tokenCampus: string;

async function goToPlanesPago(page: Page, authToken = token, role = "super_admin") {
  await page.goto(BASE);
  await page.evaluate(({ authToken, user }) => {
    localStorage.setItem("auth_token", authToken);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", JSON.stringify(user));
  }, {
    authToken,
    user: { id: 0, email: "e2e-override@example.test", name: "E2E Override", role, campus_id: campusId },
  });
  await page.reload();
  await page.evaluate(() => window.history.pushState({}, "", "/planes-pago"));
  await expect(page.getByRole("heading", { name: "Planes de Pago" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar reestructuración" }).first()).toBeVisible();
}

async function fillCondonationForm(page: Page) {
  await page.getByLabel("Motivo de la cancelación").fill("Cancelación de convenio por situación extraordinaria");
  await page.getByLabel("Justificación de la condonación").fill("Familia acreditada sin capacidad de pago para continuar el convenio");
}

test.describe("Condonación repetida — UI de Planes de Pago", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const suffix = Date.now().toString().slice(-8);
    tenantId = (await pool.query(
      "INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id",
      [`E2E Override ${suffix}`, `EO${suffix}`],
    )).rows[0].id;
    campusId = (await pool.query(
      "INSERT INTO campuses (nombre, tenant_id) VALUES ($1, $2) RETURNING id",
      [`Campus Override ${suffix}`, tenantId],
    )).rows[0].id;
    studentId = (await pool.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
       VALUES ($1, $2, 'Alumna', 'Override', 'Alumna Override ${suffix}', 'activo') RETURNING id`,
      [tenantId, campusId],
    )).rows[0].id;
    const plans = await pool.query(
      `INSERT INTO payment_plans
        (campus_id, tenant_id, student_id, total_adeudo_centavos, monto_inicial_centavos,
         numero_pagos, frecuencia, fecha_inicio, tipo_origen, charge_ids_origen)
       VALUES
        ($1,$2,$3,0,0,1,'mensual',CURRENT_DATE,'reestructuracion','[]'),
        ($1,$2,$3,0,0,1,'mensual',CURRENT_DATE,'reestructuracion','[]'),
        ($1,$2,$3,0,0,1,'mensual',CURRENT_DATE,'reestructuracion','[]')
       RETURNING id`,
      [campusId, tenantId, studentId],
    );
    firstPlanId = plans.rows[0].id;
    secondPlanId = plans.rows[1].id;
    campusPlanId = plans.rows[2].id;
    await pool.query("UPDATE campuses SET onboarding_completado = true WHERE id = $1", [campusId]);
    token = jwt.sign(
      { role: "super_admin", tenant_id: tenantId, campus_id: campusId },
      JWT_SECRET,
      { expiresIn: "10m" },
    );
    tokenCampus = jwt.sign(
      { role: "administrador_campus", tenant_id: tenantId, campus_id: campusId },
      JWT_SECRET,
      { expiresIn: "10m" },
    );
  });

  test.afterAll(async () => {
    await pool.query("DELETE FROM audit_log WHERE tenant_id = $1", [tenantId]);
    await pool.query("DELETE FROM payment_plans WHERE tenant_id = $1", [tenantId]);
    await pool.query("DELETE FROM students WHERE id = $1", [studentId]);
    await pool.query("DELETE FROM campuses WHERE id = $1", [campusId]);
    await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  });

  test("condona, bloquea repetición, autoriza y reintenta desde el modal", async ({ page }) => {
    await goToPlanesPago(page);

    // Paso 1: primera condonación — no hay historial previo.
    const firstButton = page.locator(`[data-plan-id="${firstPlanId}"]`);
    await firstButton.click();
    await fillCondonationForm(page);
    const [firstPatch] = await Promise.all([
      page.waitForResponse(response =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/planes-pago/${firstPlanId}/cancelar`),
      ),
      page.getByRole("button", { name: "Condonar y cancelar plan" }).click(),
    ]);
    expect(firstPatch.status()).toBe(200);

    // Paso 2: la segunda condonación es bloqueada por el pre-check de 90 días.
    const secondButton = page.locator(`[data-plan-id="${secondPlanId}"]`);
    await expect(secondButton).toBeVisible();
    await secondButton.click();
    await fillCondonationForm(page);
    const [blockedPatch] = await Promise.all([
      page.waitForResponse(response =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/planes-pago/${secondPlanId}/cancelar`),
      ),
      page.getByRole("button", { name: "Condonar y cancelar plan" }).click(),
    ]);
    expect(blockedPatch.status()).toBe(409);
    await expect(page.getByRole("heading", { name: "Autorizar condonación repetida" })).toBeVisible();
    await expect(page.getByText(/condonación registrada en los últimos 90 días/i)).toBeVisible();

    // Paso 3: admin_general registra el motivo, obtiene el token y el navegador reintenta el PATCH.
    await page.getByLabel("Motivo de autorización").fill("Dirección general autorizó esta excepción documentada");
    const [tokenResponse, retriedPatch] = await Promise.all([
      page.waitForResponse(response =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/api/admin/alertas/condonaciones/${secondPlanId}/override-token`),
      ),
      page.waitForResponse(response =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/planes-pago/${secondPlanId}/cancelar`) &&
        response.request().postData()?.includes("override_token"),
      ),
      page.getByRole("button", { name: "Autorizar y aplicar condonación" }).click(),
    ]);
    expect(tokenResponse.status()).toBe(200);
    expect(retriedPatch.status()).toBe(200);
    await expect(page.getByText("Condonación autorizada y aplicada", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/condonacion-override-ui-completada.png", fullPage: true });

    const states = await pool.query(
      "SELECT id, estado FROM payment_plans WHERE id = ANY($1::int[]) ORDER BY id",
      [[firstPlanId, secondPlanId]],
    );
    expect(states.rows.map((row: any) => row.estado)).toEqual(["cancelado", "cancelado"]);
    const auditChain = await pool.query(
      `SELECT action FROM audit_log
        WHERE tenant_id = $1
          AND action IN ('ALERTA_CONDONACION_REPETIDA', 'generacion_override_condonacion', 'saldo_condonado')
        ORDER BY created_at`,
      [tenantId],
    );
    expect(auditChain.rows.map((row: any) => row.action)).toEqual(
      expect.arrayContaining(["ALERTA_CONDONACION_REPETIDA", "generacion_override_condonacion", "saldo_condonado"]),
    );
  });

  test("administrador_campus ve el bloqueo, sin control para generar token", async ({ page }) => {
    await goToPlanesPago(page, tokenCampus, "administrador_campus");
    await page.locator(`[data-plan-id="${campusPlanId}"]`).click();
    await fillCondonationForm(page);
    const [blockedPatch] = await Promise.all([
      page.waitForResponse(response =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/planes-pago/${campusPlanId}/cancelar`),
      ),
      page.getByRole("button", { name: "Condonar y cancelar plan" }).click(),
    ]);
    expect(blockedPatch.status()).toBe(409);
    await expect(page.getByText(/solicita a un administrador general o super administrador/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Autorizar condonación repetida" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Autorizar y aplicar condonación" })).toHaveCount(0);
  });
});