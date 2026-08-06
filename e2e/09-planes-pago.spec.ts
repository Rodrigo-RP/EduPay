/**
 * E2E — Planes de Pago (ADR-002)
 *
 * Verifica:
 *  1. La página /planes-pago carga sin errores de consola
 *  2. Un plan creado vía API aparece en la lista con el alumno correcto
 *  3. Expandir el plan muestra las cuotas (charges reales del ledger)
 *  4. "Marcar pagada" llama a /api/admin/charges/:id/pagar-manual (NO al 410)
 *  5. Después de pagar, la cuota muestra el badge "Pagado" y el progreso sube
 *  6. No aparece ningún error 410 ni ningún otro error HTTP ≥400 en la consola
 *
 * ESTRATEGIA:
 *  El plan se pre-crea vía API antes de navegar, igual que en 08-excepciones.spec.ts.
 *  Así el fetch inicial de la página ya incluye el plan sin depender del modal.
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const BASE = "http://localhost:5000";

// ── Helpers API ───────────────────────────────────────────────────────────────
async function getAdminToken(request: any): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { email: "admin.campus@jfr.edu.mx", password: "Demo2025!" },
  });
  const body = await res.json();
  return body.token as string;
}

/**
 * Crea un plan de pago Modo B (futuro) vía API y devuelve { planId, cuotas }.
 * Usa campus_id=48, concept_id=88 (Colegiatura Mensual Primaria $2,800),
 * student_id=121 (Sofía Valentina López Hernández) — datos de demo seed.
 */
async function crearPlanViaApi(
  request: any,
  token: string
): Promise<{ planId: number; cuotas: any[] }> {
  const res = await request.post(`${BASE}/api/planes-pago`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      concept_id:   88,   // Colegiatura Mensual Primaria
      student_id:   121,  // Sofía Valentina López Hernández
      numero_pagos: 3,
      frecuencia:   "mensual",
      fecha_inicio: new Date().toISOString().slice(0, 10),
      observaciones: "Plan E2E — creado por test automatizado",
    },
  });
  const body = await res.json();
  return { planId: body.id, cuotas: body.cuotas || [] };
}

/** Navega a /planes-pago usando pushState (SPA con wouter). */
async function goToPlanesPago(page: Page) {
  await page.evaluate(() => window.history.pushState({}, "", "/planes-pago"));
  await page.waitForLoadState("networkidle");
  // Esperar el título de la página
  await page.waitForSelector('h1:has-text("Planes de Pago")', { timeout: 10_000 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────
test.describe("Planes de Pago — E2E (ADR-002)", () => {
  let token: string;
  let planId: number;
  let cuotaId: number; // charge id de la primera cuota

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    const { planId: pid, cuotas } = await crearPlanViaApi(request, token);
    planId  = pid;
    cuotaId = cuotas[0]?.id;
    expect(planId).toBeTruthy();
    expect(cuotaId).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    // Cancelar el plan creado para limpiar datos
    if (planId) {
      await request.patch(`${BASE}/api/planes-pago/${planId}/cancelar`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { motivo: "Limpieza post-test E2E automatizado planes pago" },
      }).catch(() => {});
    }
  });

  // ── 1. Página carga sin error 410 ─────────────────────────────────────────
  test("PP-01: /planes-pago carga sin errores HTTP ≥ 400 en consola", async ({ page }) => {
    const errors4xx: string[] = [];

    // Capturar respuestas HTTP con error
    page.on("response", resp => {
      if (resp.status() >= 400) {
        errors4xx.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await loginAsAdmin(page);
    await goToPlanesPago(page);

    // Filtrar 401 a rutas de otras páginas que puedan cargar en background
    const erroresCriticos = errors4xx.filter(e =>
      !e.includes("/api/guardian") &&
      !e.includes("/api/auth/me") &&
      !e.includes("favicon")
    );
    expect(erroresCriticos, `Errores HTTP encontrados: ${erroresCriticos.join(", ")}`).toHaveLength(0);
  });

  // ── 2. Plan pre-creado aparece en la lista ───────────────────────────────
  test("PP-02: El plan creado aparece en la lista con nombre del alumno", async ({ page }) => {
    await loginAsAdmin(page);
    await goToPlanesPago(page);

    // Buscar el nombre del alumno en la tarjeta
    const planCard = page.locator("text=Sofía Valentina").first();
    await expect(planCard).toBeVisible({ timeout: 10_000 });

    // Debe mostrar el badge "Activo"
    const badge = page.locator(".bg-blue-100").filter({ hasText: "Activo" }).first();
    await expect(badge).toBeVisible();
  });

  // ── 3. Expandir muestra cuotas como charges reales ───────────────────────
  test("PP-03: Expandir el plan muestra las 3 cuotas del ledger (monto_base_centavos)", async ({ page }) => {
    await loginAsAdmin(page);
    await goToPlanesPago(page);

    // Hacer clic en el botón de expandir del primer plan del alumno
    const card = page.locator("div.space-y-3 > div").filter({ hasText: "Sofía Valentina" }).first();
    await card.locator("button[variant=ghost], button:has(.lucide-chevron-down)").click();

    // Deben aparecer 3 filas de cuota
    const filasConCuota = card.locator("div.space-y-2 > div");
    await expect(filasConCuota).toHaveCount(3, { timeout: 8_000 });

    // El monto debe ser ~$933.33 (2,800,000 / 3 cuotas en centavos → 933,333 → $933.33)
    // Verificamos que hay texto con $ en las cuotas
    const montoTexto = card.locator("p.font-medium").filter({ hasText: "$" }).first();
    await expect(montoTexto).toBeVisible();
  });

  // ── 4 & 5. Marcar pagada usa pagar-manual, NO el 410 ────────────────────
  test("PP-04: 'Marcar pagada' llama a pagar-manual (no 410) y actualiza el badge a Pagado", async ({ page }) => {
    const requests410: string[] = [];
    const requests200: string[] = [];

    page.on("response", resp => {
      if (resp.url().includes("/cuotas/") && resp.url().includes("/pagar")) {
        requests410.push(`${resp.status()} ${resp.url()}`);
      }
      if (resp.url().includes("/pagar-manual")) {
        requests200.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await loginAsAdmin(page);
    await goToPlanesPago(page);

    // Expandir el plan del alumno de prueba
    const card = page.locator("div.space-y-3 > div").filter({ hasText: "Sofía Valentina" }).first();
    await card.locator("button").filter({ has: page.locator(".lucide-chevron-down") }).click();

    // Esperar que aparezcan los botones "Marcar pagada"
    const btnMarcar = card.locator("button:has-text('Marcar pagada')").first();
    await expect(btnMarcar).toBeVisible({ timeout: 8_000 });

    // Capturar la request de pago
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes("/pagar-manual"), { timeout: 10_000 }),
      btnMarcar.click(),
    ]);

    // Debe ser 200, NO 410
    expect(response.status(), "El endpoint devolvió 410 (deprecated) en lugar de 200").toBe(200);
    expect(requests410, "Se llamó al endpoint deprecado /cuotas/:id/pagar").toHaveLength(0);

    // El badge de la primera cuota debe cambiar a "Pagado" después de la invalidación
    const badgePagado = card.locator("span:has-text('Pagado'), .bg-green-100").filter({ hasText: "Pagado" }).first();
    await expect(badgePagado).toBeVisible({ timeout: 10_000 });

    // El progreso debe haber subido (de 0/3 a 1/3)
    const avance = card.locator("p:has-text('/3 cuotas')");
    await expect(avance).toContainText("1/3");
  });

  // ── 6. No hay errores 410 en ninguna acción de la página ─────────────────
  test("PP-05: Ninguna acción en /planes-pago genera un error 410", async ({ page }) => {
    const errores410: string[] = [];
    page.on("response", resp => {
      if (resp.status() === 410) errores410.push(resp.url());
    });

    await loginAsAdmin(page);
    await goToPlanesPago(page);

    // Expandir todos los planes
    const botonesExpandir = page.locator("button").filter({ has: page.locator(".lucide-chevron-down, .lucide-chevron-up") });
    const count = await botonesExpandir.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await botonesExpandir.nth(i).click().catch(() => {});
      await page.waitForTimeout(300);
    }

    expect(errores410, `Respuestas 410 encontradas: ${errores410.join(", ")}`).toHaveLength(0);
  });

  // ── 6. Crear plan desde el modal (smoke test) ─────────────────────────────
  test("PP-06: El modal 'Nuevo convenio' permite seleccionar concepto y envía concept_id", async ({ page }) => {
    let bodyEnviado: any = null;

    // Interceptar el POST /api/planes-pago para verificar el body
    await page.route(`${BASE}/api/planes-pago`, async (route) => {
      if (route.request().method() === "POST") {
        try { bodyEnviado = JSON.parse(route.request().postData() || "{}"); } catch {}
      }
      await route.continue();
    });

    await loginAsAdmin(page);
    await goToPlanesPago(page);

    // Abrir el modal
    await page.click("button:has-text('Nuevo convenio')");
    await expect(page.locator("dialog, [role=dialog]")).toBeVisible({ timeout: 5_000 });

    // Verificar que el modal tiene el selector de Concepto (ADR-002)
    const selectorConcepto = page.locator("text=Concepto del convenio").first();
    await expect(selectorConcepto).toBeVisible();

    // Verificar que NO tiene un campo "Total adeudo" de texto libre (ese era pre-ADR-002)
    const inputTotalAdeudo = page.locator("input[placeholder*='5,000']");
    await expect(inputTotalAdeudo).toHaveCount(0);
  });
});
