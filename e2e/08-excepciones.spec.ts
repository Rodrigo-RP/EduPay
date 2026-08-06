/**
 * E2E — Excepciones de Conciliación
 *
 * Cubre:
 *   - API: autenticación, estructura de respuesta, flujo descartar y aplicar
 *   - UI (sin datos): carga de página, botón Actualizar
 *   - UI (con datos): botón Resolver, modal con opciones, flujo completo descartar
 *
 * ARQUITECTURA DE LOS TESTS CON DATOS:
 *   Los tests que necesitan ver el botón "Resolver" en la UI crean la bank_tx
 *   vía API ANTES de navegar a /excepciones-conciliacion. Así el fetch inicial
 *   de la página ya incluye la excepción y no hay dependencia de timing del
 *   botón "Actualizar". El patrón de skip gracioso fue eliminado.
 *
 * BOTONES REALES DE LA UI (excepciones-conciliacion.tsx):
 *   Cada excepción tiene un único botón "Resolver". Al pulsarlo se abre un modal
 *   con un Select de acción: "Aplicar a un cargo existente" | "Descartar (no escolar)".
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const BASE = "http://localhost:5000";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAdminToken(request: any): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { email: "admin.campus@jfr.edu.mx", password: "Demo2025!" },
  });
  const body = await res.json();
  return body.token as string;
}

/** Crea una bank_transaction vía POST /api/conciliacion/importar y devuelve su ID. */
async function importTx(
  request: any,
  token: string,
  monto: number,
  ref: string
): Promise<number | null> {
  await request.post(`${BASE}/api/conciliacion/importar`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      transacciones: [
        {
          fecha: new Date().toISOString().slice(0, 10),
          descripcion: `TEST E2E ${ref}`,
          monto: (monto / 100).toFixed(2),
          tipo: "credito",
          referencia: ref,
        },
      ],
    },
  });

  // Recuperar el ID de la tx recién creada
  const listRes = await request.get(`${BASE}/api/conciliacion/excepciones`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await listRes.json();
  const tx = (body.excepciones as any[]).find((e: any) => e.referencia === ref);
  return tx?.id ?? null;
}

/** Descarta una tx por ID (cleanup). */
async function descartarTx(request: any, token: string, txId: number): Promise<void> {
  await request.post(`${BASE}/api/conciliacion/excepciones/${txId}/resolver`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { accion: "descartar", motivo: "Cleanup E2E" },
  });
}

/** Navega a /excepciones-conciliacion en una SPA wouter y espera el título. */
async function irAExcepciones(page: any): Promise<void> {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/excepciones-conciliacion");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  // Esperar el encabezado principal de la página
  await page.waitForSelector(
    "h1, h2, [class*='excep'], [class*='concili']",
    { timeout: 12_000 }
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOQUE 1 — Tests de API (sin browser)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("API — /api/conciliacion/excepciones", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
  });

  test("GET sin token → 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/conciliacion/excepciones`);
    expect(res.status()).toBe(401);
  });

  test("GET con token válido → 200 + estructura correcta", async ({ request }) => {
    const res = await request.get(`${BASE}/api/conciliacion/excepciones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.excepciones)).toBe(true);
    expect(Array.isArray(body.cargos_disponibles)).toBe(true);
    expect(typeof body.total_pendiente).toBe("number");
  });

  test("POST sin token → 401", async ({ request }) => {
    const res = await request.post(`${BASE}/api/conciliacion/excepciones/9999/resolver`, {
      data: { accion: "descartar", motivo: "test" },
    });
    expect(res.status()).toBe(401);
  });

  test("API descartar: POST → 200 + bank_tx ya no aparece en lista de excepciones", async ({ request }) => {
    const ref = `E2E-DESC-${Date.now()}`;
    const txId = await importTx(request, token, 12345, ref);
    expect(txId).not.toBeNull();

    const postRes = await request.post(
      `${BASE}/api/conciliacion/excepciones/${txId}/resolver`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { accion: "descartar", motivo: "E2E test — depósito no identificado" },
      }
    );
    expect(postRes.status()).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.message).toBeTruthy();

    // Verificar que ya no aparece como pendiente
    const listRes2 = await request.get(`${BASE}/api/conciliacion/excepciones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody2 = await listRes2.json();
    const stillPending = (listBody2.excepciones as any[]).some(
      (e: any) => e.referencia === ref
    );
    expect(stillPending).toBe(false);
  });

  test("API aplicar: monto que no coincide con ningún cargo → 422 o 404", async ({ request }) => {
    const ref = `E2E-APLIC-${Date.now()}`;
    const txId = await importTx(request, token, 1, ref);
    expect(txId).not.toBeNull();

    // Cargo real del campus 48, monto_neto = 280 000, bank_tx = 1 → diff enorme → 422
    const postRes = await request.post(
      `${BASE}/api/conciliacion/excepciones/${txId!}/resolver`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { accion: "aplicar", charge_id: 304 },
      }
    );
    expect([404, 422]).toContain(postRes.status());

    // Cleanup
    await descartarTx(request, token, txId!);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOQUE 2 — Tests de UI sin datos propios (browser)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("UI — /excepciones-conciliacion (sin datos propios)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await irAExcepciones(page);
  });

  test("página carga sin errores de servidor (sin 500 en consola)", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("500")) {
        errors.push(msg.text());
      }
    });
    await page.waitForTimeout(1500);
    expect(errors).toHaveLength(0);
  });

  test("botón Actualizar es visible y clickeable", async ({ page }) => {
    const btn = page.getByRole("button", { name: /actualizar/i });
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
    await page.waitForTimeout(600);
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    expect(errors.filter((e) => e.includes("500"))).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOQUE 3 — Tests de UI con datos propios (browser + datos reales)
//
// PATRÓN: cada test crea su bank_tx ANTES de navegar a la página.
// La página carga con el dato ya en la DB → el botón Resolver aparece de inmediato.
// No hay skip gracioso: si el botón no aparece, el test falla.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe("UI — /excepciones-conciliacion (con datos reales)", () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    // Sólo login — la navegación la hace cada test después de crear sus datos
    token = await getAdminToken(request);
    await loginAsAdmin(page);
  });

  test("botón Resolver abre el modal de resolución", async ({ page, request }) => {
    // 1. Crear la bank_tx ANTES de navegar
    const ref = `E2E-UI-MODAL-${Date.now()}`;
    const txId = await importTx(request, token, 33300, ref);
    expect(txId).not.toBeNull();

    // 2. Navegar a la página — la tx ya está en la DB
    await irAExcepciones(page);

    // 3. El botón Resolver debe aparecer sin necesidad de refrescar
    const resolverBtn = page.getByRole("button", { name: /resolver/i }).first();
    await expect(resolverBtn).toBeVisible({ timeout: 12_000 });

    // 4. Abrirlo y verificar el modal
    await resolverBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/resolver excepción/i)).toBeVisible();

    // Cleanup
    await page.keyboard.press("Escape");
    await descartarTx(request, token, txId!);
  });

  test("modal muestra las dos opciones reales: Aplicar a un cargo existente y Descartar", async ({
    page,
    request,
  }) => {
    // 1. Crear tx antes de navegar
    const ref = `E2E-UI-OPT-${Date.now()}`;
    const txId = await importTx(request, token, 44400, ref);
    expect(txId).not.toBeNull();

    // 2. Navegar con datos ya presentes
    await irAExcepciones(page);

    // 3. Abrir modal del primer botón Resolver visible
    const resolverBtn = page.getByRole("button", { name: /resolver/i }).first();
    await expect(resolverBtn).toBeVisible({ timeout: 12_000 });
    await resolverBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // 4. Abrir el Select de acción dentro del dialog y verificar las dos opciones
    const dialog = page.getByRole("dialog");
    const selectTrigger = dialog
      .locator("[role='combobox'], button[aria-haspopup='listbox']")
      .first();
    await expect(selectTrigger).toBeVisible({ timeout: 4_000 });
    await selectTrigger.click();
    await page.waitForTimeout(400);

    await expect(page.getByText(/aplicar a un cargo existente/i)).toBeVisible({ timeout: 4_000 });
    await expect(page.getByText(/descartar/i).first()).toBeVisible({ timeout: 4_000 });

    // Cleanup
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await descartarTx(request, token, txId!);
  });

  test("flujo completo UI — Descartar → confirmar → excepción desaparece de la lista", async ({
    page,
    request,
  }) => {
    // 1. Crear tx antes de navegar
    const ref = `E2E-UI-DESCFLOW-${Date.now()}`;
    const txId = await importTx(request, token, 55500, ref);
    expect(txId).not.toBeNull();

    // 2. Navegar con page.goto (carga completa), no con pushState.
    //    Si el test anterior terminó en /excepciones-conciliacion, el pushState al
    //    mismo URL no dispara un re-mount del componente → la lista no re-fetcha
    //    y nuestra tx recién creada no aparece. page.goto fuerza recarga completa.
    await page.goto("/excepciones-conciliacion", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1, h2, [class*='excep'], [class*='concili']", {
      timeout: 12_000,
    });

    // 3. Esperar que el span de referencia aparezca (confirma que los datos cargaron).
    //    El ref aparece en 2 nodos: <p> descripción y <span>Ref: {ref}</span>.
    //    Usamos .first() para evitar strict-mode violation de Playwright.
    await expect(page.getByText(ref).first()).toBeVisible({ timeout: 12_000 });

    // Filtrar el bloque de excepción por su clase CSS (div.border-red-*) y
    // dentro de él buscar el span con nuestro ref para identificar la fila correcta.
    const resolverBtn = page
      .locator("[class*='border-red']")
      .filter({ has: page.locator("span", { hasText: ref }) })
      .getByRole("button", { name: /resolver/i })
      .first();
    await expect(resolverBtn).toBeVisible({ timeout: 4_000 });

    // 4. Abrir modal
    await resolverBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // 5. Seleccionar "Descartar" en el primer Select del dialog
    const dialog = page.getByRole("dialog");
    const accionSelect = dialog
      .locator("[role='combobox'], button[aria-haspopup='listbox']")
      .first();
    await expect(accionSelect).toBeVisible({ timeout: 4_000 });
    await accionSelect.click();
    await page.waitForTimeout(300);

    const descartarOpt = page.getByRole("option", { name: /descartar/i });
    await expect(descartarOpt).toBeVisible({ timeout: 4_000 });
    await descartarOpt.click();
    await page.waitForTimeout(300);

    // 6. Seleccionar motivo (segundo Select)
    const motivoSelect = dialog
      .locator("[role='combobox'], button[aria-haspopup='listbox']")
      .nth(1);
    if (await motivoSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await motivoSelect.click();
      await page.waitForTimeout(300);
      const firstMotivo = page.getByRole("option").first();
      if (await firstMotivo.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await firstMotivo.click();
      }
      await page.waitForTimeout(200);
    }

    // 7. Confirmar descarte
    const confirmBtn = page.getByRole("button", { name: /confirmar descarte/i });
    await expect(confirmBtn).toBeVisible({ timeout: 4_000 });
    await confirmBtn.click();

    // 8. El modal debe cerrarse
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 6_000 });

    // 9. Verificar vía API que la excepción ya no está pendiente
    await page.waitForTimeout(800);
    const listRes = await request.get(`${BASE}/api/conciliacion/excepciones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listRes.json();
    const stillPending = (listBody.excepciones as any[]).some(
      (e: any) => e.referencia === ref
    );
    expect(stillPending).toBe(false);
  });
});
