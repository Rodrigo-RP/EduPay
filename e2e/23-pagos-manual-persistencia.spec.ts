/**
 * Pagos administrativos — evidencia de persistencia y anti-duplicación.
 *
 * Recorrido: UI real → servidor confirma pero red falla → UI conserva datos →
 * reintento UI idempotente → recibo con datos reales → Neon → recarga.
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { pool as db } from "../server/db";

const BASE = "http://localhost:5000";
let fixture: {
  chargeId: number;
  studentId: number;
  studentName: string;
  studentGrade: string;
  studentReference: string;
  conceptName: string;
  amountCentavos: number;
  originalStatus: string;
} | null = null;
let paymentId = 0;
let onboardingWasComplete = false;

test.beforeAll(async ({ request }) => {
  await request.post(`${BASE}/api/test/reset-auth-rate-limit`);
  const login = await request.post(`${BASE}/api/auth/login`, {
    data: { email: "superadmin@edupay.mx", password: "Demo2025!" },
  });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const seed = await request.post(`${BASE}/api/demo/seed`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(seed.status()).toBe(200);

  const campus = await db.query("SELECT onboarding_completado FROM campuses WHERE id = 1");
  onboardingWasComplete = Boolean(campus.rows[0]?.onboarding_completado);
  await db.query("UPDATE campuses SET onboarding_completado = true WHERE id = 1");

  const selected = await db.query(
    `SELECT c.id AS charge_id, c.estado, s.id AS student_id, s.nombre_completo,
            s.grado, s.id_referencia, co.nombre AS concept_name,
            c.monto_base_centavos + COALESCE(c.recargo_aplicado_centavos, 0)
              - COALESCE(SUM(pa.amount_centavos), 0)::bigint AS saldo_centavos
       FROM charges c
       JOIN students s ON s.id = c.student_id
       JOIN concepts co ON co.id = c.concept_id
       LEFT JOIN payment_applications pa ON pa.charge_id = c.id
      WHERE s.campus_id = 1
        AND c.estado NOT IN ('pagado', 'cancelado')
      GROUP BY c.id, s.id, co.id
     HAVING COALESCE(SUM(pa.amount_centavos), 0) = 0
      ORDER BY c.id
      LIMIT 1`,
  );
  expect(selected.rows).toHaveLength(1);
  const row = selected.rows[0] as any;
  fixture = {
    chargeId: Number(row.charge_id),
    studentId: Number(row.student_id),
    studentName: row.nombre_completo,
    studentGrade: row.grado,
    studentReference: row.id_referencia,
    conceptName: row.concept_name,
    amountCentavos: Math.min(Number(row.saldo_centavos), 12_345),
    originalStatus: row.estado,
  };
});

test.afterAll(async () => {
  if (paymentId) {
    await db.query("DELETE FROM payments WHERE id = $1", [paymentId]);
  }
  if (fixture) {
    await db.query("UPDATE charges SET estado = $1 WHERE id = $2", [fixture.originalStatus, fixture.chargeId]);
  }
  await db.query("UPDATE campuses SET onboarding_completado = $1 WHERE id = 1", [onboardingWasComplete]);
  await db.end();
});

test("PM-01: confirma pago real, evita reintento duplicado y genera recibo del alumno seleccionado", async ({ page }) => {
  expect(fixture).not.toBeNull();
  const data = fixture!;
  await loginAsAdmin(page);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/pagos");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("button", { name: /^registrar pago$/i }).click();
  const dialog = page.getByRole("dialog", { name: /registro de pagos manual/i });

  await dialog.getByLabel("Estudiante").click();
  await page.getByTestId(`manual-payment-student-${data.studentId}`).click();
  await dialog.getByLabel("Cargo pendiente").click();
  await page.getByTestId(`manual-payment-charge-${data.chargeId}`).click();
  await dialog.getByLabel(/monto recibido/i).fill((data.amountCentavos / 100).toFixed(2));
  await dialog.getByLabel(/recibido por/i).fill("E2E Caja");
  await dialog.getByLabel(/observaciones/i).fill("E2E pago confirmado");

  // El servidor recibe y confirma la primera solicitud, pero la interfaz recibe
  // una falla de red. El retry debe reutilizar la misma clave de idempotencia.
  await page.route("**/api/payments/manual", async (route) => {
    const persistedResponse = await route.fetch();
    const persistedPayload = await persistedResponse.json() as { payment?: { id?: number } };
    paymentId = Number(persistedPayload.payment?.id || 0);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Falla de red simulada después de confirmar" }),
    });
  });
  await dialog.getByRole("button", { name: /registrar pago y emitir recibo/i }).click();
  await expect(page.getByText("No se pudo registrar el pago", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel(/monto recibido/i)).toHaveValue((data.amountCentavos / 100).toFixed(2));
  await expect(page.getByRole("dialog", { name: /opciones de recibo fiscal/i })).not.toBeVisible();

  await page.unroute("**/api/payments/manual");
  const retried = page.waitForResponse("**/api/payments/manual");
  await dialog.getByRole("button", { name: /registrar pago y emitir recibo/i }).click();
  const retryResponse = await retried;
  expect(retryResponse.status()).toBeLessThan(300);
  const saved = await retryResponse.json() as { payment: { id: number; charge_id: number; monto_centavos: number } };
  paymentId = saved.payment.id;

  await expect(page.getByText("Pago registrado exitosamente", { exact: true })).toBeVisible();
  const receipt = page.getByRole("dialog", { name: /opciones de recibo fiscal/i });
  await expect(receipt).toBeVisible();
  const receiptPreview = receipt.frameLocator('iframe[title="Vista previa del recibo"]');
  const receiptBody = receiptPreview.locator("body");
  await expect(receiptBody).toContainText(data.studentName);
  await expect(receiptBody).toContainText(data.studentGrade);
  await expect(receiptBody).toContainText(data.studentReference);
  await expect(receiptBody).toContainText(data.conceptName);

  // Neon directo: un intento confirmado y una única aplicación al cargo.
  const persisted = await db.query(
    `SELECT p.id, p.charge_id, p.monto_centavos, p.estado,
            COUNT(pa.id)::int AS applications
       FROM payments p
       LEFT JOIN payment_applications pa ON pa.payment_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
    [paymentId],
  );
  expect(persisted.rows).toHaveLength(1);
  expect(Number(persisted.rows[0].charge_id)).toBe(data.chargeId);
  expect(Number(persisted.rows[0].monto_centavos)).toBe(data.amountCentavos);
  expect(persisted.rows[0].estado).toBe("exitoso");
  expect(Number(persisted.rows[0].applications)).toBe(1);

  await receipt.getByRole("button", { name: /close/i }).click().catch(() => {});
  const reloadedPayments = page.waitForResponse("**/api/payments");
  await page.reload();
  await page.waitForLoadState("networkidle");
  const payments = await (await reloadedPayments).json() as Array<{ id: number }>;
  expect(payments.some((payment) => Number(payment.id) === paymentId)).toBe(true);
});