/**
 * Caja — efectivo y cierre diario.
 *
 * Evidencia requerida: UI real → API → Neon → recarga. No usa JWT fabricados:
 * inicia sesión una sola vez en la interfaz y restaura esa sesión por test.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";
import { pool as db } from "../server/db";

const fechaHoy = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Mexico_City",
}).format(new Date());
const suffix = `${Date.now()}`;

let authToken = "";
let authUser = "";
let tenantId = 0;
let campusId = 0;
let studentId = 0;
let conceptId = 0;
let chargeId = 0;
let paymentId = 0;
let closureId = 0;
let onboardingWasComplete = false;
const studentName = `Alumno E2E Caja ${suffix}`;
const conceptName = `Colegiatura E2E Caja ${suffix}`;
const amountCentavos = 12_345;

async function irACaja(page: Page) {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/caja-conciliacion");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText(/caja y conciliación/i).first()).toBeVisible();
}

async function restaurarSesion(page: Page) {
  await page.goto("/");
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", user);
  }, { token: authToken, user: authUser });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

test.describe.configure({ mode: "serial" });

test.describe("Caja — efectivo y cierre con persistencia", () => {
  test.beforeAll(async ({ browser }) => {
    const scope = await db.query(
      "SELECT id, tenant_id, campus_id FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL],
    );
    expect(scope.rows).toHaveLength(1);
    tenantId = Number(scope.rows[0].tenant_id);
    campusId = Number(scope.rows[0].campus_id);

    const campus = await db.query(
      "SELECT onboarding_completado FROM campuses WHERE id = $1",
      [campusId],
    );
    onboardingWasComplete = Boolean(campus.rows[0]?.onboarding_completado);
    await db.query("UPDATE campuses SET onboarding_completado = true WHERE id = $1", [campusId]);

    const concept = await db.query(
      `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,$3,'colegiatura','mensual',$4) RETURNING id`,
      [tenantId, campusId, conceptName, amountCentavos],
    );
    conceptId = Number(concept.rows[0].id);

    const student = await db.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, id_referencia, status)
       VALUES ($1,$2,'Alumno','Caja',$3,$4,'activo') RETURNING id`,
      [tenantId, campusId, studentName, `E2E-CAJA-${suffix}`],
    );
    studentId = Number(student.rows[0].id);

    const charge = await db.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,$4,'pendiente') RETURNING id`,
      [tenantId, studentId, conceptId, amountCentavos],
    );
    chargeId = Number(charge.rows[0].id);

    const existingClosure = await db.query(
      `SELECT id, observaciones FROM cash_closures
        WHERE tenant_id = $1 AND campus_id = $2 AND fecha = $3::date`,
      [tenantId, campusId, fechaHoy],
    );
    for (const closure of existingClosure.rows) {
      if (String(closure.observaciones || "").startsWith("Cierre E2E ")) {
        await db.query("DELETE FROM cash_closures WHERE id = $1", [closure.id]);
      }
    }
    const foreignClosure = await db.query(
      `SELECT id FROM cash_closures
        WHERE tenant_id = $1 AND campus_id = $2 AND fecha = $3::date`,
      [tenantId, campusId, fechaHoy],
    );
    expect(foreignClosure.rows, "El fixture no puede sobrescribir un cierre ajeno del día").toHaveLength(0);

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);
    authToken = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
    authUser = await page.evaluate(() => localStorage.getItem("auth_user") ?? "");
    expect(authToken).not.toBe("");
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await restaurarSesion(page);
    await irACaja(page);
  });

  test.afterAll(async () => {
    if (closureId) await db.query("DELETE FROM cash_closures WHERE id = $1", [closureId]);
    if (paymentId) {
      await db.query("DELETE FROM payment_applications WHERE payment_id = $1", [paymentId]);
      await db.query("DELETE FROM payments WHERE id = $1", [paymentId]);
    }
    if (chargeId) await db.query("DELETE FROM charges WHERE id = $1", [chargeId]);
    if (studentId) await db.query("DELETE FROM students WHERE id = $1", [studentId]);
    if (conceptId) await db.query("DELETE FROM concepts WHERE id = $1", [conceptId]);
    await db.query("UPDATE campuses SET onboarding_completado = $1 WHERE id = $2", [
      onboardingWasComplete,
      campusId,
    ]);
  });

  test("CE-01: efectivo por UI persiste pago, aplicación, cargo y lista tras recarga", async ({ page }) => {
    await page.getByRole("tab", { name: /registro de pagos manual/i }).click();

    const studentSelect = page
      .getByText("Estudiante", { exact: true })
      .locator("xpath=following-sibling::button");
    const chargeSelect = page
      .getByText("Concepto a pagar", { exact: true })
      .locator("xpath=following-sibling::button");
    await studentSelect.click();
    await page.getByRole("option", { name: new RegExp(studentName) }).click();
    await chargeSelect.click();
    await page.getByRole("option", { name: new RegExp(conceptName) }).click();
    await page.getByLabel(/monto recibido/i).fill((amountCentavos / 100).toFixed(2));
    await page.getByLabel(/recibido por/i).fill("Operador E2E");
    await page.getByLabel(/observaciones/i).fill(`Cobro efectivo ${suffix}`);

    const saved = page.waitForResponse((response) =>
      response.url().includes("/api/caja/pago-efectivo") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /registrar pago y emitir recibo/i }).click();
    const savedResponse = await saved;
    expect(savedResponse.status()).toBe(200);
    const savedBody = await savedResponse.json() as { payment_id: number; charge_nuevo_estado: string };
    paymentId = Number(savedBody.payment_id);
    expect(paymentId).toBeGreaterThan(0);
    expect(savedBody.charge_nuevo_estado).toBe("pagado");

    await expect(page.getByText("Pago registrado", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("dialog", { name: /opciones de recibo fiscal/i })).toBeVisible();

    const persisted = await db.query(
      `SELECT p.id, p.charge_id, p.monto_centavos, p.metodo, p.estado,
              COUNT(pa.id)::int AS applications, MAX(pa.amount_centavos)::bigint AS applied_centavos,
              c.estado AS charge_estado
         FROM payments p
         JOIN charges c ON c.id = p.charge_id
         LEFT JOIN payment_applications pa ON pa.payment_id = p.id
        WHERE p.id = $1
        GROUP BY p.id, c.id`,
      [paymentId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(Number(persisted.rows[0].charge_id)).toBe(chargeId);
    expect(Number(persisted.rows[0].monto_centavos)).toBe(amountCentavos);
    expect(persisted.rows[0].metodo).toBe("efectivo");
    expect(persisted.rows[0].estado).toBe("exitoso");
    expect(Number(persisted.rows[0].applications)).toBe(1);
    expect(Number(persisted.rows[0].applied_centavos)).toBe(amountCentavos);
    expect(persisted.rows[0].charge_estado).toBe("pagado");

    await page.getByRole("dialog", { name: /opciones de recibo fiscal/i })
      .getByRole("button", { name: /cerrar/i }).click();
    await page.reload();
    await page.getByRole("tab", { name: /registro de pagos manual/i }).click();
    await expect(page.getByText(studentName, { exact: true })).toBeVisible();
    await expect(page.getByText("Pago confirmado", { exact: true }).first()).toBeVisible();
  });

  test("CE-02: cierre por UI persiste snapshot; segundo POST da 409 y la UI conserva el cierre", async ({ page }) => {
    await page.getByRole("tab", { name: /conciliación automática/i }).click();
    await expect(page.getByText(/cierre de caja diario/i).first()).toBeVisible();
    const expectedSnapshot = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN p.metodo = 'efectivo' THEN p.monto_centavos ELSE 0 END), 0)::bigint
           AS efectivo_registrado_centavos,
         COUNT(*)::int AS pagos_procesados
       FROM payments p
       JOIN charges c ON c.id = p.charge_id
       JOIN students s ON s.id = c.student_id
       WHERE s.campus_id = $1
         AND p.estado = 'exitoso'
         AND DATE(p.created_at) = $2::date`,
      [campusId, fechaHoy],
    );
    const expectedCashCentavos = Number(expectedSnapshot.rows[0].efectivo_registrado_centavos);
    const expectedPayments = Number(expectedSnapshot.rows[0].pagos_procesados);
    expect(expectedCashCentavos).toBeGreaterThanOrEqual(amountCentavos);

    await page.getByLabel(/efectivo contado en caja/i).fill((amountCentavos / 100).toFixed(2));
    await page.getByLabel(/observaciones del corte/i).fill(`Cierre E2E ${suffix}`);
    const closed = page.waitForResponse((response) =>
      response.url().includes("/api/caja/cerrar-dia") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /cerrar caja del día/i }).click();
    const closedResponse = await closed;
    const closedBody = await closedResponse.json() as { cierre: { id: number; pagos_procesados: number } };
    closureId = Number(closedBody.cierre.id);
    expect(closedResponse.status()).toBe(201);
    expect(closureId).toBeGreaterThan(0);

    const neonClosure = await db.query(
      `SELECT fecha, efectivo_capturado_centavos, efectivo_registrado_centavos,
              pagos_procesados, observaciones
         FROM cash_closures WHERE id = $1`,
      [closureId],
    );
    expect(neonClosure.rows).toHaveLength(1);
    expect(Number(neonClosure.rows[0].efectivo_capturado_centavos)).toBe(amountCentavos);
    expect(Number(neonClosure.rows[0].efectivo_registrado_centavos)).toBe(expectedCashCentavos);
    expect(Number(neonClosure.rows[0].pagos_procesados)).toBe(expectedPayments);
    expect(neonClosure.rows[0].observaciones).toBe(`Cierre E2E ${suffix}`);

    const secondAttempt = await page.request.post("/api/caja/cerrar-dia", {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        fecha: fechaHoy,
        efectivo_capturado_centavos: amountCentavos,
        observaciones: "No debe persistir",
      },
    });
    expect(secondAttempt.status()).toBe(409);
    const duplicate = await secondAttempt.json() as { cierre?: { id?: number } };
    expect(Number(duplicate.cierre?.id)).toBe(closureId);

    await page.reload();
    await page.getByRole("tab", { name: /conciliación automática/i }).click();
    await expect(page.getByText(new RegExp(`Caja cerrada para el ${fechaHoy}`))).toBeVisible();
    await expect(page.getByRole("button", { name: /caja ya cerrada/i })).toBeDisabled();
  });
});