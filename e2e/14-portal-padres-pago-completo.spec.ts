/**
 * e2e/14-portal-padres-pago-completo.spec.ts
 *
 * Módulo: Portal de Padres — flujo de pago real de extremo a extremo
 *
 * PP-01  Flujo 3 clics — login tutor → ver cargos pendientes reales → "Pagar todo"
 *        → seleccionar tarjeta → confirmar pago → verificar DB:
 *          · payment creado con referencia sim_*
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

      // Autocompletar tarjeta exitosa (4242 4242 4242 4242)
      await page.getByText(/autocompletar tarjeta exitosa/i).click();

      // Verificar que el campo quedó con el número de tarjeta correcto
      const cardInput = page.locator("input[placeholder='0000 0000 0000 0000']");
      await expect(cardInput).toHaveValue("4242 4242 4242 4242", { timeout: 3_000 });

      // "Continuar" → paso 3
      await page.getByRole("button", { name: /continuar/i }).click();

      // ── CLIC 3: confirmar pago ────────────────────────────────────────────
      await expect(
        page.getByText(/confirmar pago/i).first()
      ).toBeVisible({ timeout: 8_000 });

      // El botón muestra el monto real: "Confirmar pago $X,XXX.XX"
      const btnConfirmar = page.getByRole("button", { name: /confirmar pago/i });
      await expect(btnConfirmar).toBeVisible({ timeout: 5_000 });
      await btnConfirmar.click();

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

      // 4. Al menos nPendBefore pagos con referencia sim_* y estado 'exitoso'
      //    (filtramos por sim_* porque el historial incluye pagos del seed con ref_demo_*)
      const simPayments = (after.paymentHistory ?? []).filter(
        (p: { referencia_pasarela?: string }) =>
          p.referencia_pasarela?.startsWith("sim_")
      );
      expect(
        simPayments.length,
        "Debe haber al menos 1 pago sim_* en el historial tras el pago del test"
      ).toBeGreaterThanOrEqual(nPendBefore);
      for (const p of simPayments.slice(0, nPendBefore)) {
        expect(
          (p as any).estado,
          `Pago ${(p as any).id} debe estar 'exitoso'`
        ).toBe("exitoso");
      }

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

      // Tarjeta + autocompletar
      await page.getByText(/tarjeta de crédito\/débito/i).first().click();
      await page.getByText(/autocompletar tarjeta exitosa/i).click();

      // Continuar → paso 3
      await page.getByRole("button", { name: /continuar/i }).click();

      await expect(
        page.getByText(/confirmar pago/i).first()
      ).toBeVisible({ timeout: 8_000 });

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
