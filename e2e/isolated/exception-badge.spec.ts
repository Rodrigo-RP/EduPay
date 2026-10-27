import { expect, test, type Page } from "@playwright/test";

const fixture = (id: number) => ({
  id, fecha: "2026-10-01", descripcion: `Excepción de prueba ${id}`,
  monto_centavos: 10000, tipo: "credito", referencia: `BADGE-TEST-${id}`,
  clabe_ordenante: null, nombre_ordenante: null, estado_conciliacion: "pendiente",
  nota_conciliacion: null, dias_sin_conciliar: 2,
});

const badge = (page: Page) =>
  page.locator('a[href="/excepciones-conciliacion"] .bg-red-500');

async function navigate(page: Page, path: string) {
  await page.evaluate((value) => window.history.pushState({}, "", value), path);
}

async function resolve(page: Page, action: "descartar" | "aplicar" = "descartar") {
  await page.getByRole("button", { name: "Resolver", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", {
    name: action === "descartar" ? "Descartar (no escolar)" : "Aplicar a un cargo existente",
  }).click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", {
    name: action === "descartar" ? "Duplicado confirmado" : /Alumno de prueba/,
  }).click();
  await dialog.getByRole("button", {
    name: action === "descartar" ? "Confirmar descarte" : "Aplicar pago",
  }).click();
}

test.describe("Badge de excepciones — UI real, API simulada sin base", () => {
  let pending: ReturnType<typeof fixture>[];
  let countRequests: number;
  let failResolution: boolean;
  let failCount: boolean;

  test.beforeEach(async ({ page }) => {
    pending = [fixture(1), fixture(2)];
    countRequests = 0;
    failResolution = false;
    failCount = false;
    await page.clock.install();
    await page.route("**/api/**", async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/api/auth/login") {
        return route.fulfill({ json: {
          token: "isolated-browser-fixture-not-a-real-token",
          user: { id: 1, email: "badge-admin@example.invalid", name: "Admin de prueba",
            role: "administrador_campus", campus_id: 48 },
        } });
      }
      if (pathname === "/api/institutional-info") return route.fulfill({ json: {} });
      if (pathname === "/api/conciliacion/excepciones/count") {
        countRequests++;
        return route.fulfill(failCount
          ? { status: 503, json: { message: "Conteo no disponible" } }
          : { json: { total_pendiente: pending.length } });
      }
      if (pathname === "/api/conciliacion/excepciones") {
        return route.fulfill({ json: {
          excepciones: pending, total_pendiente: pending.length,
          cargos_disponibles: [{ id: 10, fecha_vencimiento: "2026-10-01",
            alumno: "Alumno de prueba", grado: "1", monto_neto: 10000, concepto: "Cuota" }],
        } });
      }
      const match = pathname.match(/^\/api\/conciliacion\/excepciones\/(\d+)\/resolver$/);
      if (match && route.request().method() === "POST") {
        if (failResolution) return route.fulfill({
          status: 500, json: { message: "No se pudo resolver la excepción" },
        });
        pending = pending.filter((row) => row.id !== Number(match[1]));
        return route.fulfill({ json: { message: "Resolución confirmada por API simulada" } });
      }
      // A new request must be deliberately mocked, never forwarded to a backend.
      throw new Error(`Petición inesperada en prueba aislada: ${pathname}`);
    });
    await page.goto("/e2e/isolated/exception-badge.html");
    await page.locator("#email").fill("badge-admin@example.invalid");
    // Arbitrary input accepted only by the intercepted login; not a credential.
    await page.locator("#password").fill("isolated-input");
    await page.getByRole("button", { name: "Ingresar al Sistema" }).click();
    await expect(badge(page)).toHaveText("2");
    await navigate(page, "/excepciones-conciliacion");
    await expect(page.getByRole("button", { name: "Resolver", exact: true })).toHaveCount(2);
  });

  test("resolver todas oculta el badge inmediatamente y al volver sin pendientes", async ({ page }) => {
    await resolve(page);
    await expect(badge(page)).toHaveText("1");
    await expect(page.getByRole("button", { name: "Resolver", exact: true })).toHaveCount(1);
    await resolve(page);
    await expect(page.getByText("Sin excepciones pendientes")).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    await navigate(page, "/admin");
    await navigate(page, "/excepciones-conciliacion");
    await expect(badge(page)).toHaveCount(0);
    // Restore a session in a fresh document, without trying a real API.
    await page.goto("/e2e/isolated/exception-badge.html");
    await expect.poll(() => countRequests).toBeGreaterThan(2);
    await expect(badge(page)).toHaveCount(0);
  });

  test("el polling de 60 segundos elimina el badge sin recargar", async ({ page }) => {
    const initial = countRequests;
    pending = [];
    await page.clock.fastForward(59_000);
    expect(countRequests).toBe(initial);
    await expect(badge(page)).toHaveText("2");
    await page.clock.fastForward(1_000);
    await expect.poll(() => countRequests).toBe(initial + 1);
    await expect(badge(page)).toHaveCount(0);
  });

  test("nuevas excepciones reaparecen al siguiente polling y al reingresar", async ({ page }) => {
    pending = [];
    await page.clock.fastForward(60_000);
    await expect(badge(page)).toHaveCount(0);
    await navigate(page, "/admin");
    pending = [fixture(3)];
    await page.clock.fastForward(60_000);
    await expect(badge(page)).toHaveText("1");
    await navigate(page, "/excepciones-conciliacion");
    await page.goto("/e2e/isolated/exception-badge.html");
    await expect(badge(page)).toHaveText("1");
    await navigate(page, "/excepciones-conciliacion");
    await expect(page.getByText("Excepción de prueba 3", { exact: true })).toBeVisible();
  });

  test("aplicar la última excepción también elimina el badge", async ({ page }) => {
    await resolve(page);
    await expect(badge(page)).toHaveText("1");
    await expect(page.getByRole("button", { name: "Resolver", exact: true })).toHaveCount(1);
    await resolve(page, "aplicar");
    await expect(badge(page)).toHaveCount(0);
    await expect(page.getByText("Sin excepciones pendientes")).toBeVisible();
  });

  test("una resolución fallida no oculta pendientes ni muestra éxito", async ({ page }) => {
    failResolution = true;
    await resolve(page);
    await expect(page.getByText("No se pudo resolver la excepción").first()).toBeVisible();
    await expect(badge(page)).toHaveText("2");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Excepción resuelta", { exact: true })).toHaveCount(0);
    expect(pending).toHaveLength(2);
  });

  test("fallar el conteo no se interpreta como cero y el siguiente polling recupera", async ({ page }) => {
    failCount = true;
    await page.clock.fastForward(60_000);
    await expect.poll(() => countRequests).toBe(2);
    await expect(badge(page)).toHaveText("2");
    failCount = false;
    pending = [];
    await page.clock.fastForward(60_000);
    await expect(badge(page)).toHaveCount(0);
  });
});
