import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { pool } from "../server/db";
import { reviewFixture } from "../server/tests/helpers/stripe-review-fixtures";
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin } from "./helpers/auth";
import { assertTestDatabase } from "../server/lib/database-safety";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";

test.describe.configure({ mode: "serial" });

let fixture: Awaited<ReturnType<typeof reviewFixture>>;
let familyId: number;
let target: number;
let guardianId: number;
let onboarding: boolean;
let campusId: number;
let eventId: number;
let guardianCreditBefore = 0;
const guardianEmail = `credit.${randomUUID()}@test.invalid`;

test.beforeAll(async () => {
  await assertTestDatabase(pool);
  const admin = (await pool.query(
    "SELECT u.tenant_id,u.campus_id,c.onboarding_completado FROM users u JOIN campuses c ON c.id=u.campus_id WHERE u.email=$1",
    [ADMIN_EMAIL])).rows[0];
  campusId = admin.campus_id;
  onboarding = admin.onboarding_completado;
  await pool.query("UPDATE campuses SET onboarding_completado=true WHERE id=$1", [campusId]);
  fixture = await reviewFixture(admin);
  guardianId = (await pool.query(
    `INSERT INTO guardians (nombre_completo,email,password_hash,tenant_id,campus_id)
     VALUES ('Tutor saldo E2E',$1,$2,$3,$4) RETURNING id`,
    [guardianEmail, await bcrypt.hash(ADMIN_PASSWORD, 4), fixture.tenant, campusId])).rows[0].id;
  guardianCreditBefore = Number((await pool.query(
    `SELECT COALESCE(SUM(fc.amount_centavos),0) AS n FROM family_credits fc
     WHERE fc.tenant_id=$1 AND fc.campus_id=$2 AND fc.status='activo'
       AND fc.family_id IN (SELECT fs.family_id FROM family_students fs
         JOIN student_guardian sg ON sg.student_id=fs.student_id WHERE sg.guardian_id=$3)`,
    [fixture.tenant, campusId, guardianId])).rows[0].n);
  familyId = (await pool.query(
    "INSERT INTO families (tenant_id,campus_id,nombre) VALUES ($1,$2,'Familia saldo E2E') RETURNING id",
    [fixture.tenant, campusId])).rows[0].id;
  await pool.query("INSERT INTO family_students (family_id,student_id) VALUES ($1,$2)", [familyId, fixture.student]);
  await pool.query("INSERT INTO student_guardian (student_id,guardian_id,es_responsable_pago) VALUES ($1,$2,true)", [fixture.student, guardianId]);
  await pool.query("UPDATE charges SET estado='pagado' WHERE id=$1", [fixture.charge]);
  target = (await pool.query(
    `INSERT INTO charges (tenant_id,student_id,concept_id,monto_base_centavos,beca_aplicada,fecha_emision,fecha_vencimiento,estado)
     SELECT tenant_id,student_id,concept_id,100000,50,fecha_emision,fecha_vencimiento,'pendiente' FROM charges WHERE id=$1 RETURNING id`,
    [fixture.charge])).rows[0].id;
  const event = await fixture.event();
  eventId = event.id;
  await pool.query("UPDATE payment_events SET payload=$1 WHERE id=$2", [
    JSON.stringify({ ...event.pi, amount: 100000, amount_received: 100000 }), event.id]);
});

test.afterAll(async () => {
  if (fixture) {
    const payments = (await pool.query("SELECT DISTINCT payment_id FROM family_credits WHERE family_id=$1", [familyId])).rows.map(r => r.payment_id);
    await pool.query("DELETE FROM audit_log WHERE tenant_id=$1 AND entity_type='family_credit' AND entity_id IN (SELECT id FROM family_credits WHERE family_id=$2)",
      [fixture.tenant, familyId]);
    await pool.query("DELETE FROM family_credits WHERE family_id=$1", [familyId]);
    await pool.query("DELETE FROM payment_applications WHERE charge_id=$1", [target]);
    await pool.query("DELETE FROM payments WHERE id=ANY($1::int[])", [payments]);
    await pool.query("DELETE FROM charges WHERE id=$1", [target]);
    await pool.query("DELETE FROM student_guardian WHERE student_id=$1", [fixture.student]);
    await pool.query("DELETE FROM family_students WHERE family_id=$1", [familyId]);
    await pool.query("DELETE FROM families WHERE id=$1", [familyId]);
    await pool.query("DELETE FROM guardians WHERE id=$1", [guardianId]);
    await fixture.cleanup();
  }
  if (campusId) await pool.query("UPDATE campuses SET onboarding_completado=$1 WHERE id=$2", [onboarding, campusId]);
});

test("saldo familiar: dos confirmaciones, propuesta de $500 y aplicación explícita con $500 de remanente", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/excepciones-conciliacion");
  const stripe = page.getByTestId(`stripe-review-${eventId}`);
  await expect(stripe).toBeVisible();
  await stripe.getByRole("button", { name: "Registrar como saldo a favor" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Cobro confirmado por la escuela");
  await dialog.getByRole("button", { name: "Confirmar y continuar" }).click();
  await dialog.getByRole("button", { name: "Confirmar saldo a favor", exact: true }).click();
  const proposal = page.getByTestId(`family-credit-credit:${familyId}`);
  await expect(proposal).toContainText("Aplicar $500.00");
  expect((await pool.query("SELECT id FROM payment_applications WHERE charge_id=$1", [target])).rows).toHaveLength(0);
  await proposal.getByRole("button", { name: "Aplicar como sugiere" }).click();
  await expect(proposal).not.toBeVisible();
  const rows = await pool.query("SELECT amount_centavos,origen FROM family_credits WHERE family_id=$1 AND status='activo'", [familyId]);
  expect(rows.rows).toHaveLength(1);
  expect(Number(rows.rows[0].amount_centavos)).toBe(50000);
  expect(rows.rows[0].origen).toBe("stripe_no_aplicado");
  await page.goto("/familias");
  await expect(page.getByTestId(`family-credit-balance-${familyId}`)).toHaveText("A tu favor: $500.00");
  await page.screenshot({ path: "test-results/saldo-a-favor-admin.png", fullPage: true });
});

async function loginFixtureGuardian(page: Page) {
  await page.goto("/");
  const login = await page.request.post("/api/auth/guardian-login", {
    data: { email: guardianEmail, password: ADMIN_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  await page.evaluate(({ token, guardian }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "guardian");
    localStorage.setItem("auth_user", JSON.stringify(guardian));
  }, session);
  await page.reload({ waitUntil: "domcontentloaded" });
}
test("el padre ve crédito separado y no tiene botón para aplicarlo", async ({ page }) => {
  const nonGuardianRequests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/") && !path.startsWith("/api/guardian/") && path !== "/api/auth/guardian-login") {
      nonGuardianRequests.push(path);
    }
  });
  const institutionResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/guardian/institutional-info" && response.status() === 200);
  await loginFixtureGuardian(page);
  const institution = await (await institutionResponse).json();
  await expect(page.getByTestId("guardian-institution-name")).toHaveText(institution.nombre_legal);
  await expect(page.getByTestId("guardian-institution-name")).not.toContainText("Ciclo");
  const expected = ((guardianCreditBefore + 50000) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 });
  await expect(page.getByText(`A tu favor: $${expected}`, { exact: false })).toBeVisible();
  await expect(page.getByText("La escuela lo aplicará a tu próximo cargo", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar como sugiere" })).toHaveCount(0);
  expect(nonGuardianRequests).toEqual([]);
  const token = await page.evaluate(() => localStorage.getItem("auth_token"));
  const denied = await page.request.post("/api/admin/family-credits/aplicar-propuesta", {
    headers: { Authorization: `Bearer ${token}` },
    data: { credit_ids: [1], charge_id: target, monto_centavos: 1 },
  });
  expect(denied.status()).toBe(403);
  await page.screenshot({ path: "test-results/saldo-a-favor-padre.png", fullPage: true });
});

for (const status of [401, 403]) {
  test(`sesión del padre: ${status} lleva a acceso de padres, nunca al administrativo`, async ({ page }) => {
    await page.route("**/api/guardian/dashboard", route => route.fulfill({
      status, json: { message: "Sesión no disponible" },
    }));
    await loginFixtureGuardian(page);
    await expect(page).toHaveURL(/\/acceso-padres$/);
    await expect(page.getByRole("heading", { name: "Acceso de padres", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Ingresa de nuevo al portal de padres");
    await expect(page.getByText("Acceso Administrativo", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
  });
}
