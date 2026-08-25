/**
 * Planes de Pago — evidencia completa UI → API → Neon → recarga.
 *
 * Las escrituras se disparan exclusivamente desde la interfaz. SQL sólo prepara
 * fixtures temporales, inspecciona Neon y limpia el ledger al finalizar.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { pool as db } from "../server/db";

const BASE = "http://localhost:5000";
const fixture = {
  tenantId: 0, campusA: 0, campusB: 0, userA: 0, userB: 0,
  studentA: 0, studentB: 0, conceptA: 0, conceptB: 0,
  sourceCharge: 0, campusBPlan: 0, modeBPlan: 0, modeAPlan: 0, modeBQuota: 0,
  studentAName: "", studentBName: "", tokenA: "", authUserA: "", tokenB: "", authUserB: "",
};

async function login(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${BASE}/api/auth/login`, { data: { email, password } });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ token: string; user: unknown }>;
}

async function openPlanes(page: Page, session = { token: fixture.tokenA, user: fixture.authUserA }) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", user);
  }, session);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.history.pushState({}, "", "/planes-pago");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: "Planes de Pago" })).toBeVisible();
}

async function reloadPlanes(page: Page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Planes de Pago" })).toBeVisible();
}

test.describe("Planes de Pago — flujos completos con Neon", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    const suffix = `${Date.now()}-${process.pid}`;
    const tenant = await db.query(
      "INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id",
      [`E2E Planes completos ${suffix}`, `EP${Date.now().toString().slice(-9)}`],
    );
    fixture.tenantId = Number(tenant.rows[0].id);
    const campuses = await db.query(
      `INSERT INTO campuses (tenant_id, nombre, onboarding_completado)
       VALUES ($1,$2,true), ($1,$3,true) RETURNING id`,
      [fixture.tenantId, `Campus A Planes ${suffix}`, `Campus B Planes ${suffix}`],
    );
    fixture.campusA = Number(campuses.rows[0].id);
    fixture.campusB = Number(campuses.rows[1].id);
    const [hashA, hashB] = await Promise.all([bcrypt.hash(`PlanesA${suffix}!`, 10), bcrypt.hash(`PlanesB${suffix}!`, 10)]);
    const users = await db.query(
      `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active)
       VALUES ($1,$2,'Admin Planes A',$3,$4,'administrador_campus',true),
              ($1,$5,'Admin Planes B',$6,$7,'administrador_campus',true)
       RETURNING id,email`,
      [fixture.tenantId, fixture.campusA, `planes.a.${suffix}@test.edupay.mx`, hashA,
        fixture.campusB, `planes.b.${suffix}@test.edupay.mx`, hashB],
    );
    fixture.userA = Number(users.rows[0].id);
    fixture.userB = Number(users.rows[1].id);
    fixture.studentAName = `Alumna Planes A ${suffix}`;
    fixture.studentBName = `Alumno Planes B ${suffix}`;
    const students = await db.query(
      `INSERT INTO students (tenant_id,campus_id,nombres,apellido_paterno,nombre_completo,id_referencia,status,grado)
       VALUES ($1,$2,'Alumna','Planes',$3,$4,'activo','1'),
              ($1,$5,'Alumno','Planes',$6,$7,'activo','1') RETURNING id`,
      [fixture.tenantId, fixture.campusA, fixture.studentAName, `EPA-${suffix}`,
        fixture.campusB, fixture.studentBName, `EPB-${suffix}`],
    );
    fixture.studentA = Number(students.rows[0].id);
    fixture.studentB = Number(students.rows[1].id);
    const concepts = await db.query(
      `INSERT INTO concepts (tenant_id,campus_id,nombre,tipo,periodicidad,monto_centavos)
       VALUES ($1,$2,$3,'colegiatura','mensual',90000),
              ($1,$4,$5,'colegiatura','mensual',80000) RETURNING id`,
      [fixture.tenantId, fixture.campusA, `Concepto futuro ${suffix}`, fixture.campusB, `Concepto B ${suffix}`],
    );
    fixture.conceptA = Number(concepts.rows[0].id);
    fixture.conceptB = Number(concepts.rows[1].id);
    const charge = await db.query(
      `INSERT INTO charges (tenant_id,student_id,concept_id,fecha_emision,fecha_vencimiento,monto_base_centavos,estado)
       VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,120000,'pendiente') RETURNING id`,
      [fixture.tenantId, fixture.studentA, fixture.conceptA],
    );
    fixture.sourceCharge = Number(charge.rows[0].id);
    const campusBPlan = await db.query(
      `INSERT INTO payment_plans
        (tenant_id,campus_id,student_id,total_adeudo_centavos,monto_inicial_centavos,numero_pagos,frecuencia,fecha_inicio,tipo_origen)
       VALUES ($1,$2,$3,80000,0,2,'mensual',CURRENT_DATE,'futuro') RETURNING id`,
      [fixture.tenantId, fixture.campusB, fixture.studentB],
    );
    fixture.campusBPlan = Number(campusBPlan.rows[0].id);
    const session = await login(request, String(users.rows[0].email), `PlanesA${suffix}!`);
    fixture.tokenA = session.token;
    fixture.authUserA = JSON.stringify(session.user);
    const campusBSession = await login(request, String(users.rows[1].email), `PlanesB${suffix}!`);
    fixture.tokenB = campusBSession.token;
    fixture.authUserB = JSON.stringify(campusBSession.user);
  });

  test.afterAll(async () => {
    await db.query("DELETE FROM payment_applications WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id = $1)", [fixture.tenantId]);
    await db.query("DELETE FROM payments WHERE tenant_id = $1", [fixture.tenantId]);
    await db.query("DELETE FROM charges WHERE tenant_id = $1", [fixture.tenantId]);
    await db.query("DELETE FROM payment_plans WHERE tenant_id = $1", [fixture.tenantId]);
    await db.query("DELETE FROM concepts WHERE tenant_id = $1", [fixture.tenantId]);
    await db.query("DELETE FROM students WHERE tenant_id = $1", [fixture.tenantId]);
    await db.query("DELETE FROM users WHERE tenant_id = $1", [fixture.tenantId]);
    await db.query("DELETE FROM campuses WHERE tenant_id = $1", [fixture.tenantId]);
    await db.query("DELETE FROM tenants WHERE id = $1", [fixture.tenantId]);
  });

  test("PPX-01: crea acuerdo futuro Modo B desde UI, persiste en Neon y sobrevive recarga", async ({ page }) => {
    await openPlanes(page);
    await page.getByRole("button", { name: "Nuevo convenio" }).click();
    const dialog = page.getByRole("dialog", { name: "Crear convenio de pago" });
    await dialog.getByRole("combobox", { name: "Estudiante del convenio" }).click();
    await page.getByRole("option", { name: fixture.studentAName }).click();
    await dialog.getByRole("combobox", { name: "Concepto del convenio" }).click();
    await page.getByRole("option", { name: new RegExp("Concepto futuro") }).click();
    await dialog.locator('input[type="number"]').fill("100.00");
    await dialog.getByRole("combobox", { name: "Número de cuotas del convenio" }).click();
    await page.getByRole("option", { name: "2 cuotas", exact: true }).click();
    await dialog.locator("textarea").fill("Acuerdo futuro verificado desde la interfaz");
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/planes-pago")),
      dialog.getByRole("button", { name: "Crear convenio y generar cuotas" }).click(),
    ]);
    expect(response.status()).toBe(200);
    fixture.modeBPlan = Number((await response.json()).id);
    const persisted = await db.query(
      `SELECT pp.tipo_origen, pp.total_adeudo_centavos, pp.monto_inicial_centavos, pp.numero_pagos,
              COUNT(c.id)::int AS cuotas
         FROM payment_plans pp LEFT JOIN charges c ON c.plan_id=pp.id
        WHERE pp.id=$1 GROUP BY pp.id`,
      [fixture.modeBPlan],
    );
    expect(persisted.rows[0]).toMatchObject({ tipo_origen: "futuro", total_adeudo_centavos: "90000", monto_inicial_centavos: "10000", numero_pagos: 2, cuotas: 2 });
    fixture.modeBQuota = Number((await db.query("SELECT id FROM charges WHERE plan_id=$1 ORDER BY id LIMIT 1", [fixture.modeBPlan])).rows[0].id);
    await expect(page.getByText("Alumna Planes", { exact: true }).first()).toBeVisible();
    await reloadPlanes(page);
    const reloadedCard = page.locator("div.space-y-3 > div").filter({ hasText: "Alumna Planes" }).first();
    await reloadedCard.locator("button").filter({ has: page.locator(".lucide-chevron-down") }).click();
    await expect(reloadedCard.getByText("Acuerdo futuro verificado desde la interfaz")).toBeVisible();
  });

  test("PPX-02: reestructura Modo A desde UI y confirma cargos de origen y cuotas en Neon", async ({ page }) => {
    await openPlanes(page);
    await page.getByRole("button", { name: "Reestructurar adeudo" }).click();
    const dialog = page.getByRole("dialog", { name: "Reestructurar adeudo" });
    await dialog.getByRole("combobox", { name: "Estudiante para reestructurar" }).click();
    await page.getByRole("option", { name: fixture.studentAName }).click();
    await dialog.getByRole("button", { name: new RegExp(`Cargo #${fixture.sourceCharge}`) }).click();
    await dialog.getByRole("combobox", { name: "Número de cuotas para reestructurar" }).click();
    await page.getByRole("option", { name: "2 cuotas", exact: true }).click();
    await dialog.locator("textarea").fill("Reestructuración creada desde la acción visual");
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/planes-pago")),
      dialog.getByRole("button", { name: "Crear reestructuración" }).click(),
    ]);
    expect(response.status()).toBe(200);
    fixture.modeAPlan = Number((await response.json()).id);
    const persisted = await db.query(
      `SELECT pp.tipo_origen, pp.total_adeudo_centavos, pp.numero_pagos,
              (SELECT estado FROM charges WHERE id=$2) AS origen_estado,
              (SELECT COUNT(*)::int FROM charges WHERE plan_id=pp.id AND estado='pendiente') AS cuotas
         FROM payment_plans pp WHERE pp.id=$1`,
      [fixture.modeAPlan, fixture.sourceCharge],
    );
    expect(persisted.rows[0]).toMatchObject({ tipo_origen: "reestructuracion", total_adeudo_centavos: "120000", numero_pagos: 2, origen_estado: "cancelado", cuotas: 2 });
    await expect(page.getByText("Reestructuración", { exact: true }).last()).toBeVisible();
    await reloadPlanes(page);
    const reloadedCard = page.locator(`[data-plan-card="${fixture.modeAPlan}"]`);
    await reloadedCard.locator("button").filter({ has: page.locator(".lucide-chevron-down") }).click();
    await expect(reloadedCard.getByText("Reestructuración creada desde la acción visual")).toBeVisible();
  });

  test("PPX-03: pago manual de cuota desde UI crea payment y application en Neon y persiste tras recarga", async ({ page }) => {
    await openPlanes(page);
    const card = page.locator(`[data-plan-card="${fixture.modeBPlan}"]`);
    await card.locator("button").filter({ has: page.locator(".lucide-chevron-down") }).click();
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes(`/api/admin/charges/${fixture.modeBQuota}/pagar-manual`)),
      card.getByRole("button", { name: "Marcar pagada" }).first().click(),
    ]);
    expect(response.status()).toBe(200);
    const ledger = await db.query(
      `SELECT p.estado, p.charge_id, p.monto_centavos, COUNT(pa.id)::int AS applications, c.estado AS charge_estado
         FROM payments p JOIN charges c ON c.id=p.charge_id
         LEFT JOIN payment_applications pa ON pa.payment_id=p.id
        WHERE p.charge_id=$1 GROUP BY p.id,c.id ORDER BY p.id DESC LIMIT 1`,
      [fixture.modeBQuota],
    );
    expect(ledger.rows[0]).toMatchObject({ estado: "exitoso", charge_id: fixture.modeBQuota, monto_centavos: "40000", applications: 1, charge_estado: "pagado" });
    await expect(card.getByText("Pagado", { exact: true }).first()).toBeVisible();
    await reloadPlanes(page);
    const reloaded = page.locator(`[data-plan-card="${fixture.modeBPlan}"]`);
    await reloaded.locator("button").filter({ has: page.locator(".lucide-chevron-down") }).click();
    await expect(reloaded.getByText("Pagado", { exact: true }).first()).toBeVisible();
  });

  test("PPX-04: cancela y reinstala desde UI, verifica charge independiente en Neon y recarga", async ({ page }) => {
    await openPlanes(page);
    await page.locator(`[data-plan-id="${fixture.modeAPlan}"]`).click();
    const dialog = page.getByRole("dialog", { name: "Cancelar reestructuración" });
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Reinstalar saldo como cargo pendiente" }).click();
    await dialog.getByLabel("Motivo de la cancelación").fill("Reinstalación de saldo comprobada desde prueba E2E");
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith(`/api/planes-pago/${fixture.modeAPlan}/cancelar`)),
      dialog.getByRole("button", { name: "Cancelar y reinstalar saldo" }).click(),
    ]);
    expect(response.status()).toBe(200);
    const payload = await response.json();
    const result = await db.query(
      `SELECT pp.estado AS plan_estado, c.plan_id, c.estado, c.monto_base_centavos
         FROM payment_plans pp JOIN charges c ON c.id=$2 WHERE pp.id=$1`,
      [fixture.modeAPlan, payload.nuevo_charge_id],
    );
    expect(result.rows[0]).toMatchObject({ plan_estado: "cancelado", plan_id: null, estado: "pendiente", monto_base_centavos: "120000" });
    await expect(page.getByText("Saldo reinstalado", { exact: true })).toBeVisible();
    await reloadPlanes(page);
    const planCard = page.locator(`[data-plan-card="${fixture.modeAPlan}"]`);
    await expect(planCard.getByText("Cancelado", { exact: true })).toBeVisible();
  });

  test("PPX-05: administrador de Campus A no ve ni puede accionar el plan de Campus B", async ({ page }) => {
    const plansResponse = page.waitForResponse(r => r.url().endsWith("/api/planes-pago") && r.request().method() === "GET");
    await openPlanes(page);
    const response = await plansResponse;
    const plans = await response.json() as Array<{ id: number; campus_id: number }>;
    expect(plans.some(plan => Number(plan.id) === fixture.campusBPlan || Number(plan.campus_id) === fixture.campusB)).toBe(false);
    await expect(page.getByText(fixture.studentBName)).toHaveCount(0);
    await expect(page.locator(`[data-plan-id="${fixture.campusBPlan}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-plan-card="${fixture.modeBPlan}"]`)).toBeVisible();

    const optionsResponse = page.waitForResponse(r => r.url().endsWith("/api/planes-pago/opciones-reestructuracion"));
    await page.getByRole("button", { name: "Reestructurar adeudo" }).click();
    const options = await (await optionsResponse).json() as { students: Array<{ id: number }>; charges: Array<{ student_id: number }> };
    expect(options.students.map(student => Number(student.id))).toContain(fixture.studentA);
    expect(options.students.map(student => Number(student.id))).not.toContain(fixture.studentB);
    expect(options.charges.every(charge => Number(charge.student_id) === fixture.studentA)).toBe(true);
    const dialog = page.getByRole("dialog", { name: "Reestructurar adeudo" });
    await dialog.getByRole("combobox", { name: "Estudiante para reestructurar" }).click();
    await expect(page.getByRole("option", { name: fixture.studentBName })).toHaveCount(0);

    const campusBPlansResponse = page.waitForResponse(r => r.url().endsWith("/api/planes-pago") && r.request().method() === "GET");
    await openPlanes(page, { token: fixture.tokenB, user: fixture.authUserB });
    const campusBPlans = await campusBPlansResponse;
    const campusBList = await campusBPlans.json() as Array<{ id: number; campus_id: number }>;
    expect(campusBList.some(plan => Number(plan.id) === fixture.campusBPlan && Number(plan.campus_id) === fixture.campusB)).toBe(true);
    expect(campusBList.some(plan => Number(plan.id) === fixture.modeBPlan)).toBe(false);
    await expect(page.getByText(fixture.studentAName)).toHaveCount(0);
  });
});