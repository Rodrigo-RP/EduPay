import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../server/db";
import { JWT_SECRET } from "../server/routes/shared";
import { reviewFixture } from "../server/tests/helpers/stripe-review-fixtures";
import { encryptTotp } from "../server/lib/totp-crypto";
import { SCHOOL_TODAY_SQL } from "../shared/school-date";

const require = createRequire(import.meta.url);
const speakeasy: typeof import("speakeasy") = require("speakeasy");
let fixture: Awaited<ReturnType<typeof reviewFixture>>;
let actor: number;
let credit: number;
let payment: number;
let token: string;
const secret = speakeasy.generateSecret({ length: 20 }).base32;
test.beforeAll(async () => {
  fixture = await reviewFixture();
  await pool.query("UPDATE campuses SET onboarding_completado=true WHERE id=$1", [fixture.campus]);
  actor = (await pool.query(
    `INSERT INTO users (tenant_id,campus_id,email,password_hash,role,is_active)
     VALUES ($1,$2,$3,$4,'administrador_general',true) RETURNING id`,
    [fixture.tenant, fixture.campus, `${randomUUID()}@test.invalid`, await bcrypt.hash(randomUUID(), 4)])).rows[0].id;
  await pool.query("UPDATE users SET twofa_secret=$1 WHERE id=$2", [encryptTotp(secret, actor), actor]);
  payment = (await pool.query(
    `INSERT INTO payments (tenant_id,metodo,monto_centavos,fecha_pago,estado)
     VALUES ($1,'efectivo',100000,${SCHOOL_TODAY_SQL},'exitoso') RETURNING id`, [fixture.tenant])).rows[0].id;
  credit = (await pool.query(
    `INSERT INTO family_credits (tenant_id,campus_id,student_id,payment_id,amount_centavos,origen)
     VALUES ($1,$2,$3,$4,100000,'excedente_caja') RETURNING id`,
    [fixture.tenant, fixture.campus, fixture.student, payment])).rows[0].id;
  token = jwt.sign({ id: actor, role: "administrador_general", tenant_id: fixture.tenant, campus_id: fixture.campus,
    password_version: 0, twofa_verified: true, session_started_at: Math.floor(Date.now() / 1000) },
    JWT_SECRET, { expiresIn: "1h" });
});
test.afterAll(async () => {
  if (!fixture) return;
  await pool.query("DELETE FROM credit_refund_events WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM credit_refunds WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM audit_log WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM audit_retry_queue WHERE payload->>'tenant_id'=$1", [String(fixture.tenant)]);
  await pool.query("DELETE FROM family_credits WHERE payment_id=$1", [payment]);
  await pool.query("DELETE FROM payments WHERE id=$1", [payment]);
  await pool.query("DELETE FROM users WHERE id=$1", [actor]);
  await fixture.cleanup();
});
test("devolución en efectivo: dos confirmaciones, TOTP y evidencia escolar sin verificación bancaria", async ({ page }) => {
  await page.addInitScript(value => {
    localStorage.setItem("auth_token", value);
    localStorage.setItem("auth_type", "user");
  }, token);
  await page.goto("/excepciones-conciliacion");
  const promedio = page.getByText("Días promedio sin conciliar", { exact: true }).locator("..");
  await expect(page.getByText("Saldo a favor sin familia asignada", { exact: false }).first()).toBeVisible();
  await expect(promedio).toContainText("—");
  await expect(promedio).not.toContainText("NaN");
  const panel = page.locator("#devoluciones");
  await expect(panel.getByText(`Crédito #${credit}`, { exact: false })).toBeVisible();
  await panel.getByRole("button", { name: "Devolver", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Método: Efectivo", { exact: true })).toBeVisible();
  await dialog.getByLabel("Monto en pesos").fill("500.00");
  await dialog.getByLabel("Motivo", { exact: true }).fill("Excedente entregado al tutor en caja");
  await dialog.getByRole("button", { name: "Revisar devolución" }).click();
  await expect(dialog.getByRole("heading", { name: "Segunda confirmación" })).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Confirmar devolución", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Confirmo nuevamente esta operación").check();
  await dialog.getByLabel("Declaro que ya entregué o transferí este dinero").check();
  await dialog.getByLabel("Código de autenticación vigente").fill(speakeasy.totp({ secret, encoding: "base32" }));
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expect(panel.getByText("Registrada por la escuela", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Confirmada por webhook de Stripe/)).toHaveCount(0);
  const refund = (await pool.query(
    "SELECT method,status,amount_centavos::text FROM credit_refunds WHERE credit_id=$1", [credit])).rows;
  expect(refund).toEqual([{ method: "efectivo", status: "exitosa", amount_centavos: "50000" }]);
  const remainder = (await pool.query(
    "SELECT amount_centavos::text,origen FROM family_credits WHERE payment_id=$1 AND status='activo'", [payment])).rows;
  expect(remainder).toEqual([{ amount_centavos: "50000", origen: "excedente_caja" }]);
  await page.screenshot({ path: "test-results/devolucion-efectivo.png", fullPage: true });
});

test("promedio de días: excluye créditos sin días y valores no numéricos", async ({ page }) => {
  await page.addInitScript(value => {
    localStorage.setItem("auth_token", value);
    localStorage.setItem("auth_type", "user");
  }, token);
  await page.route("**/api/conciliacion/excepciones", async route => {
    const response = await route.fetch();
    const body = await response.json();
    const credito = body.excepciones.find((item: { origen: string }) => item.origen === "orphan_credit");
    expect(credito).toBeTruthy();
    await route.fulfill({ response, json: { ...body, excepciones: [
      credito,
      { ...credito, id: -101, dias_sin_conciliar: 4 },
      { ...credito, id: -102, dias_sin_conciliar: 8 },
      { ...credito, id: -103, dias_sin_conciliar: null },
      { ...credito, id: -104, dias_sin_conciliar: "100" },
    ] } });
  });
  await page.goto("/excepciones-conciliacion");
  const promedio = page.getByText("Días promedio sin conciliar", { exact: true }).locator("..");
  await expect(promedio).toContainText("6d");
  await expect(promedio).not.toContainText("NaN");
});
