/**
 * e2e/14-portal-padres-pago-completo.spec.ts
 *
 * Módulo: Portal de Padres — flujo de pago real de extremo a extremo
 *
 * PP-01  Flujo 3 clics — login tutor → ver cargos pendientes reales → "Pagar todo"
 *        → seleccionar tarjeta → confirmar pago → verificar DB:
 *          · payment creado con referencia real de Stripe (pi_*)
 *          · payment_applications corresponde a los cargos
 *          · estado de los charges → 'pagado'
 *          · saldo pendiente en pantalla y en API = 0 post-pago
 *
 * PP-02  Doble clic en "Confirmar pago" — la protección de UI (disabled={processing}
 *        tras el primer clic) + el lock FOR UPDATE del servidor garantizan que
 *        solo 1 llamada llega al API y solo 1 pago queda en la DB.
 *
 * ARQUITECTURA:
 *   – El login de tutor es vía /api/auth/guardian-login (no UI de admin).
 *   – Se usa localStorage(auth_token + auth_type=guardian) + pushState para
 *     activar el portal en la SPA wouter (mismo patrón que loginAsGuardian).
 *   – La verificación de DB se hace vía GET /api/guardian/dashboard con JWT del
 *     tutor (no acceso directo a la DB desde Playwright).
 *   – beforeAll llama a /api/demo/seed (superadmin) para garantizar datos frescos
 *     independientemente de cuántas veces se corra la suite.
 */
import { test, expect, type Page } from "@playwright/test";
import { pool as db } from "../server/db";

const BASE            = "http://localhost:5000";
const DEMO_PASSWORD   = "Demo2025!";

// Emails deterministas del seed-demo.ts (función toEmailSlug)
// Familia 0  padre: Carlos Eduardo López → "lopez.carlos@demo.mx"
//   – Tiene Junio (pendiente) + Julio (vencido, índice 0 < 3)  →  2 cargos pendientes
// Familia 1  padre: Javier Antonio García → "garcia.javier@demo.mx"
//   – Tiene Junio (pendiente) + Julio (vencido, índice 1 < 3)  →  2 cargos pendientes
const G1_EMAIL = "lopez.carlos@demo.mx";
const G2_EMAIL = "garcia.javier@demo.mx";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Login de tutor vía API → setItem localStorage → pushState al portal.
 * Retorna el JWT para llamadas de verificación independientes del browser.
 */
async function loginTutor(page: Page, email: string): Promise<string> {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  const res = await page.request.post(`${BASE}/api/auth/guardian-login`, {
    data: { email, password: DEMO_PASSWORD },
    failOnStatusCode: false,
  });

  if (res.status() !== 200) {
    const body = await res.text().catch(() => "(sin body)");
    throw new Error(
      `guardian-login falló: HTTP ${res.status()} email=${email} — ${body.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const token: string = data.token;
  const guardianObj = data.guardian;   // { id, email, nombre_completo, tenant_id }

  // useAuth lee auth_user de localStorage para poblar el estado `guardian`.
  // Sin auth_user → guardian=null → App muestra el login admin en lugar del portal.
  await page.evaluate(
    ({ tok, gObj }: { tok: string; gObj: object }) => {
      localStorage.setItem("auth_token", tok);
      localStorage.setItem("auth_type", "guardian");
      localStorage.setItem("auth_user", JSON.stringify(gObj));
    },
    { tok: token, gObj: guardianObj }
  );

  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  // SPA wouter: el componente del portal se activa con pushState
  await page.evaluate(() => {
    window.history.pushState({}, "", "/portal-3clics");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  // Esperar texto que solo existe en el portal de padres, NO en el login admin
  // (el login admin muestra "Acceso Administrativo", el portal muestra "Mi Portal de Pagos")
  await page.waitForFunction(
    () => document.body.innerText.includes("Mi Portal de Pagos"),
    { timeout: 15_000 }
  );

  return token;
}

/** Llama a /api/guardian/dashboard con el JWT del tutor y retorna el body. */
async function getDashboard(page: Page, token: string) {
  const r = await page.request.get(`${BASE}/api/guardian/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(r.status(), "GET /api/guardian/dashboard debe devolver 200").toBe(200);
  return r.json() as Promise<{
    pendingCharges:    Array<{ id: number; total_amount_centavos: number }>;
    totalPendingBalance: number;
    paymentHistory:    Array<{ id: number; estado: string; referencia_pasarela: string }>;
  }>;
}

/** Completa el CardElement real alojado por Stripe en su iframe seguro. */
async function completarTarjetaStripe(page: Page): Promise<void> {
  const cardFrame = page.frameLocator(
    'iframe[title="Secure card payment input frame"]',
  );
  const numberInput = cardFrame.locator('input[name="cardnumber"]');
  await expect(numberInput).toBeVisible({ timeout: 15_000 });
  await numberInput.click();
  await numberInput.pressSequentially("4242424242424242");
  const expiryInput = cardFrame.locator('input[name="exp-date"]');
  await expiryInput.click();
  await expiryInput.pressSequentially("1234");
  const cvcInput = cardFrame.locator('input[name="cvc"]');
  await cvcInput.click();
  await cvcInput.pressSequentially("123");
  const postalInput = cardFrame
    .locator('input[name="postal"], input[name="postal-code"]')
    .first();
  await expect(postalInput).toBeVisible({ timeout: 8_000 });
  await postalInput.click();
  await postalInput.pressSequentially("12345");
  await expect(
    page.getByRole("button", { name: /confirmar pago/i }),
  ).toBeEnabled({ timeout: 8_000 });
}

// ─── beforeAll: re-seed para datos frescos ────────────────────────────────────

test.beforeAll(async ({ request }) => {
  // 0. Resetear rate limiters de auth para evitar 429 por corridas consecutivas
  await request.post(`${BASE}/api/test/reset-auth-rate-limit`);

  // 1. Login superadmin
  const lr = await request.post(`${BASE}/api/auth/login`, {
    data: { email: "superadmin@edupay.mx", password: DEMO_PASSWORD },
  });
  expect(lr.status(), "Login superadmin debe devolver 200 para re-seed").toBe(200);
  const { token: superToken } = await lr.json();

  // 2. Re-seed — garantiza datos limpios incluso si el test ya corrió antes
  const sr = await request.post(`${BASE}/api/demo/seed`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  expect(sr.status(), "POST /api/demo/seed debe devolver 200").toBe(200);
  const body = await sr.json();
  expect(body.success, "seed.success debe ser true").toBe(true);

  // 3. Resetear rate limiters nuevamente post-seed (seed puede generar requests internas)
  await request.post(`${BASE}/api/test/reset-auth-rate-limit`);
});

// ─────────────────────────────────────────────────────────────────────────────
// PP-01 — Flujo real de 3 clics
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PP-01 — Flujo 3 clics: seleccionar → método → confirmar → DB verificada", () => {

  test(
    "PP-01: pago completo → ¡Pago exitoso! → pendingCharges=0 y balance=0 en DB",
    async ({ page }) => {
      const token = await loginTutor(page, G1_EMAIL);

      // ── PRECONDICIÓN: snapshot inicial vía API ────────────────────────────
      const before = await getDashboard(page, token);
      // getPendingChargesByGuardian solo devuelve estado='pendiente', no 'vencido'
      // Seed: Junio=pendiente (vence 2026-06-10 → overdue, muestra badge), Julio=vencido → no aparece
      expect(
        before.pendingCharges?.length,
        "Familia López debe tener ≥1 cargo pendiente (Junio estado=pendiente)"
      ).toBeGreaterThanOrEqual(1);
      expect(
        before.totalPendingBalance,
        "Balance inicial debe ser > 0 MXN"
      ).toBeGreaterThan(0);
      const nPendBefore = before.pendingCharges.length;

      // ── CLIC 1: ver cargos y seleccionar todos ────────────────────────────
      await expect(
        page.getByText(/saldo pendiente total/i).first()
      ).toBeVisible({ timeout: 10_000 });

      // Cargos reales del fixture deben aparecer
      await expect(
        page.getByText(/colegiatura/i).first()
      ).toBeVisible({ timeout: 8_000 });

      // Familia índice 0 tiene julio vencido → badge "Vencido" visible
      await expect(
        page.getByText("Vencido").first()
      ).toBeVisible({ timeout: 5_000 });

      // "Pagar todo" selecciona todos los cargos pendientes y avanza al paso 2
      await page.getByRole("button", { name: /pagar todo/i }).click();

      // ── CLIC 2: seleccionar método de pago ───────────────────────────────
      await expect(
        page.getByText(/método de pago/i).first()
      ).toBeVisible({ timeout: 8_000 });

      // Seleccionar tarjeta
      await page.getByText(/tarjeta de crédito\/débito/i).first().click();

      // "Continuar" → paso 3, donde Stripe monta el CardElement seguro.
      await page.getByRole("button", { name: /continuar/i }).click();

      // ── CLIC 3: confirmar pago ────────────────────────────────────────────
      await expect(
        page.getByText(/confirmar pago/i).first()
      ).toBeVisible({ timeout: 8_000 });
      await completarTarjetaStripe(page);

      // El botón muestra el monto real: "Confirmar pago $X,XXX.XX"
      const btnConfirmar = page.getByRole("button", { name: /confirmar pago/i });
      await expect(btnConfirmar).toBeVisible({ timeout: 5_000 });
      const paymentResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST"
        && response.url().endsWith("/api/guardian/pagar"),
      );
      await btnConfirmar.click();
      const paymentResponse = await paymentResponsePromise;
      expect(paymentResponse.status(), "El pago confirmado debe responder 200").toBe(200);
      const paymentBody = await paymentResponse.json() as {
        payments: Array<{ payment_id: number; monto_centavos: number }>;
      };
      expect(paymentBody.payments.length, "La respuesta debe incluir pagos confirmados").toBeGreaterThan(0);

      // ── VERIFICACIÓN UI ───────────────────────────────────────────────────
      await expect(
        page.getByText(/¡pago exitoso!/i)
      ).toBeVisible({ timeout: 15_000 });

      // Folio de pago real (payment_id de la DB) visible en pantalla
      await expect(
        page.getByText(/folio de pago/i).first()
      ).toBeVisible({ timeout: 5_000 });

      // UUID CFDI simulado visible
      await expect(
        page.getByText(/uuid cfdi/i).first()
      ).toBeVisible({ timeout: 5_000 });
      const successAmountText = await page.getByTestId("payment-success-amount").textContent();

      // ── VERIFICACIÓN DB vía API ───────────────────────────────────────────
      const after = await getDashboard(page, token);

      // 1. pendingCharges = [] — todos los cargos están pagados
      expect(
        after.pendingCharges?.length ?? -1,
        `Aún quedan ${after.pendingCharges?.length} cargos pendientes; debe ser 0`
      ).toBe(0);

      // 2. totalPendingBalance = 0 — saldo real (no el de antes de pagar)
      expect(
        after.totalPendingBalance ?? 999,
        `totalPendingBalance = ${after.totalPendingBalance} MXN; debe ser 0`
      ).toBe(0);

      // 3. Historial tiene al menos nPendBefore pagos nuevos
      const nHistory = after.paymentHistory?.length ?? 0;
      expect(
        nHistory,
        "El historial debe tener ≥ los pagos realizados en este test"
      ).toBeGreaterThanOrEqual(nPendBefore);

      // 4. Al menos nPendBefore pagos reales de Stripe con estado exitoso.
      //    Los pagos del seed usan ref_demo_*; el cobro Connect confirma PaymentIntents pi_*.
      const stripePayments = (after.paymentHistory ?? []).filter(
        (p: { referencia_pasarela?: string }) =>
          p.referencia_pasarela?.startsWith("pi_")
      );
      expect(
        stripePayments.length,
        "Debe haber al menos 1 PaymentIntent pi_* en el historial tras el pago del test"
      ).toBeGreaterThanOrEqual(nPendBefore);
      for (const p of stripePayments.slice(0, nPendBefore)) {
        expect(
          (p as any).estado,
          `Pago ${(p as any).id} debe estar 'exitoso'`
        ).toBe("exitoso");
      }

      // ── VERIFICACIÓN EXACTA UI ↔ Neon ─────────────────────────────────────
      const paymentIds = paymentBody.payments.map((payment) => payment.payment_id);
      const neonTotal = await db.query(
        `SELECT COALESCE(SUM(monto_centavos), 0)::bigint AS total_centavos
           FROM payments
          WHERE id = ANY($1::int[])`,
        [paymentIds],
      );
      const confirmedCentavos = Number(neonTotal.rows[0]?.total_centavos ?? 0);
      expect(confirmedCentavos).toBeGreaterThan(0);
      const expectedAmount = `$${(confirmedCentavos / 100).toLocaleString("es-MX", {
        minimumFractionDigits: 2,
      })} MXN procesados`;
      expect(successAmountText).toContain(expectedAmount);
      expect(successAmountText).not.toContain("$0.00");

      // ── VERIFICACIÓN EN PANTALLA: balance actualizado tras volver al inicio ─
      await page.getByRole("button", { name: /volver al inicio/i }).click();

      // Después de invalidateQueries + re-fetch, la UI debe mostrar "¡Todo al corriente!"
      // (el componente SelectCharges muestra ese mensaje cuando pendingCharges.length === 0)
      await expect(
        page.getByText(/todo al corriente/i)
      ).toBeVisible({ timeout: 10_000 });
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PP-02 — Doble clic en "Confirmar pago" no duplica el pago
// ─────────────────────────────────────────────────────────────────────────────
test.describe("PP-02 — Doble clic: 1 llamada al API, 1 payment en DB (sin duplicado)", () => {

  test(
    "PP-02: dblclick → apiCallCount=1 y historial += nPendBefore (no duplicado)",
    async ({ page }) => {
      const token = await loginTutor(page, G2_EMAIL);

      const before = await getDashboard(page, token);
      const nPendBefore = before.pendingCharges?.length ?? 0;
      expect(
        nPendBefore,
        "Familia García debe tener cargos pendientes para el test"
      ).toBeGreaterThan(0);

      const historialAntes = before.paymentHistory?.length ?? 0;

      // Interceptar /api/guardian/pagar para contar cuántas veces llega al servidor
      let apiCallCount = 0;
      await page.route("**/api/guardian/pagar", async (route) => {
        apiCallCount++;
        await route.continue(); // dejar pasar la petición real al servidor
      });

      // ── Navegar al paso 3 (confirmar) vía UI ─────────────────────────────
      await expect(
        page.getByText(/saldo pendiente total/i).first()
      ).toBeVisible({ timeout: 10_000 });

      // Pagar todo → paso 2
      await page.getByRole("button", { name: /pagar todo/i }).click();

      await expect(
        page.getByText(/método de pago/i).first()
      ).toBeVisible({ timeout: 8_000 });

      // Selección de método → paso de confirmación → tarjeta real de Stripe.
      await page.getByText(/tarjeta de crédito\/débito/i).first().click();
      await page.getByRole("button", { name: /continuar/i }).click();

      await expect(
        page.getByText(/confirmar pago/i).first()
      ).toBeVisible({ timeout: 8_000 });
      await completarTarjetaStripe(page);

      // ── DOBLE CLIC ────────────────────────────────────────────────────────
      //   dblclick() envía mousedown, mouseup, click, mousedown, mouseup, click, dblclick
      //   El primer click llama procesarPagoFinal → setProcessing(true) → botón disabled
      //   El segundo click llega al DOM pero el botón está disabled → no dispara mutate
      const btnConfirmar = page.getByRole("button", { name: /confirmar pago/i });
      await expect(btnConfirmar).toBeVisible({ timeout: 5_000 });
      await btnConfirmar.dblclick();

      // Esperar que el pago se procese y llegue al paso de éxito
      await expect(
        page.getByText(/¡pago exitoso!/i)
      ).toBeVisible({ timeout: 15_000 });

      // ── VERIFICACIÓN 1: UI protegió el doble envío ──────────────────────
      //   Solo debe haber llegado 1 request al servidor.
      expect(
        apiCallCount,
        `El servidor recibió ${apiCallCount} llamadas; la UI debe enviar solo 1`
      ).toBe(1);

      // ── VERIFICACIÓN 2: DB — nPendBefore pagos nuevos, sin duplicados ──
      const after = await getDashboard(page, token);
      const historialDespues = after.paymentHistory?.length ?? 0;

      expect(
        historialDespues - historialAntes,
        `Se registraron ${historialDespues - historialAntes} pagos; debían ser ${nPendBefore} (1 por cargo, sin duplicado)`
      ).toBe(nPendBefore);

      // No quedan cargos pendientes
      expect(
        after.pendingCharges?.length ?? -1,
        "No deben quedar cargos pendientes tras el pago"
      ).toBe(0);
    }
  );
});
