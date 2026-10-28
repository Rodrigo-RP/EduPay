import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, loginAsAdmin } from "./helpers/auth";
import { pool } from "../server/db";
import { reviewFixture } from "../server/tests/helpers/stripe-review-fixtures";

let fixture: Awaited<ReturnType<typeof reviewFixture>>;
let event: Awaited<ReturnType<Awaited<ReturnType<typeof reviewFixture>>["event"]>>;
let onboarding: boolean;
test.beforeAll(async () => {
  const user = (await pool.query(
    "SELECT tenant_id,campus_id FROM users WHERE email=$1", [ADMIN_EMAIL])).rows[0];
  fixture = await reviewFixture(user);
  onboarding = (await pool.query("SELECT onboarding_completado FROM campuses WHERE id=$1", [fixture.campus])).rows[0].onboarding_completado;
  await pool.query("UPDATE campuses SET onboarding_completado=true WHERE id=$1", [fixture.campus]);
  event = await fixture.event({ wrapper: true });
});
test.afterAll(async () => {
  if (fixture) {
    await pool.query("UPDATE campuses SET onboarding_completado=$1 WHERE id=$2", [onboarding, fixture.campus]);
    await fixture.cleanup();
  }
});

test("SR-01: revisa Stripe con doble confirmación, recarga y contador real, sin alterar dinero", async ({ page }) => {
  await page.route(/https:\/\/([^/]*\.)?stripe\.(com|network)\//, route => route.abort());
  await loginAsAdmin(page);
  const token = await page.evaluate(() => localStorage.getItem("auth_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const path = `/api/conciliacion/excepciones/stripe/${event.id}/resolver`;
  const before = await fixture.snapshot();
  const countBefore = await (await page.request.get("/api/conciliacion/excepciones/count", { headers })).json();
  await page.goto("/admin");
  const summary = page.getByRole("button").filter({ hasText: "Sin conciliar" });
  await expect(summary.locator("p").first()).toHaveText(String(countBefore.total_pendiente));
  expect((await page.request.post(path, { headers, data: {
    accion: "resolved_manual", justificacion: "", confirmacion_inicial: true, confirmacion_final: true,
  } })).status()).toBe(400);
  await page.goto("/excepciones-conciliacion");
  const card = page.getByTestId(`stripe-review-${event.id}`);
  await expect(card).toContainText(fixture.name);
  await expect(card).toContainText(event.pi.id);
  await expect(card).toContainText("123.45");
  await expect(card).toContainText("2026-10-28");
  await expect(card).toContainText("Stripe cobró, pero el pago no se pudo aplicar al cargo");
  await expect(card).toContainText("Saldo a favor no disponible");
  await card.getByRole("button", { name: "Resuelto fuera del sistema", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Primera confirmación" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar y continuar" })).toBeDisabled();
  await page.getByLabel("Justificación obligatoria").fill("Resolución acordada fuera del sistema y documentada");
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "Confirmación final" })).toBeVisible();
  expect((await pool.query("SELECT status FROM payment_events WHERE id=$1", [event.id])).rows[0].status).toBe("requires_review");
  await page.getByRole("button", { name: "Confirmar resolución fuera del sistema", exact: true }).click();
  await expect(page.getByText("Resolución guardada", { exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId(`stripe-review-${event.id}`)).toHaveCount(0);
  const afterCount = await (await page.request.get("/api/conciliacion/excepciones/count", { headers })).json();
  expect(afterCount.total_pendiente).toBe(countBefore.total_pendiente - 1);
  const retry = await page.request.post(path, { headers, data: {
    accion: "resolved_manual", justificacion: "Reintento", confirmacion_inicial: true, confirmacion_final: true,
  } });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).duplicate).toBe(true);
  const audit = (await pool.query(
    "SELECT COUNT(*)::int AS n FROM audit_log WHERE entity_type='payment_event' AND entity_id=$1 AND action='STRIPE_REVIEW_RESOLVED_MANUAL'", [event.id])).rows[0];
  expect(audit.n).toBe(1);
  expect(await fixture.snapshot()).toEqual(before);
});
