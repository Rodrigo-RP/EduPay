import { test, expect, type Page } from "@playwright/test";

const fixtures = [
  { id: 101, name: "Primaria Actual", ciclo: "2026-2027", nivel: "PRIMARIA", date: "2026-10-28T12:00:00" },
  { id: 102, name: "Secundaria Actual", ciclo: "2026-2027", nivel: "SECUNDARIA", date: "2026-10-28T12:00:00" },
  { id: 103, name: "Primaria Anterior", ciclo: "2025-2026", nivel: "PRIMARIA", date: "2026-10-28T12:00:00" },
  { id: 104, name: "Primaria OtroMes", ciclo: "2026-2027", nivel: "PRIMARIA", date: "2026-09-15T12:00:00" },
];

async function setup(page: Page) {
  await page.clock.install({ time: new Date(2026, 9, 28, 12) });
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "isolated-ui-not-a-real-token");
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", JSON.stringify({
      id: 1, role: "caja", name: "Prueba", email: "ui@example.test", campus_id: 48,
    }));
  });
  // Ninguna petición API alcanza un backend ni proveedores externos.
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname === "/api/admin/configuracion/onboarding-status") data = { completado: true, campus_id: 48 };
    if (url.pathname === "/api/concepts") data = [{ id: 1, nombre: "Colegiatura" }];
    if (url.pathname === "/api/admin/charges") {
      data = fixtures.filter(row =>
        row.ciclo === url.searchParams.get("ciclo") &&
        (url.searchParams.get("nivel") === "all" || row.nivel === url.searchParams.get("nivel")),
      ).map(row => ({
        id: row.id, estudiante: row.name, ciclo_escolar: row.ciclo, nivel_escolar: row.nivel,
        concept_id: 1, monto_base_centavos: 10000, estado: "pendiente",
        fecha_emision: row.date, fecha_vencimiento: row.date,
      }));
    }
    if (url.pathname === "/api/payments") {
      data = fixtures.map(row => ({
        id: row.id, fecha_pago: row.date, monto_centavos: 10000, metodo: "efectivo", estado: "exitoso",
        charge: { ciclo_escolar: row.ciclo, student: { nombre_completo: row.name, nivel_escolar: row.nivel },
          concept: { nombre: "Colegiatura" } },
      }));
    }
    if (url.pathname === "/api/accounts-receivable") {
      data = fixtures.map(row => ({
        id: row.id, student_id: row.id, estudiante: row.name, ciclo_escolar: row.ciclo,
        nivel_escolar: row.nivel, concepto: "Colegiatura", pendiente_pagar_centavos: 10000,
        estado_cobranza: "PENDIENTE", dias_vencido: 0, fecha_vencimiento: row.date,
      }));
    }
    if (url.pathname === "/api/payments/manual-options") data = { students: [], charges: [] };
    await route.fulfill({ json: data });
  });
}

const globalSelect = (page: Page, index: number) => page.locator("header").getByRole("combobox").nth(index);
async function select(page: Page, control: ReturnType<Page["getByRole"]>, label: string) {
  await control.click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function visible(page: Page, name: string) {
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}
async function absent(page: Page, name: string) {
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
}

for (const path of ["/cargos", "/pagos", "/cuentas-por-cobrar"]) {
  test(`${path}: ciclo, nivel global, sobrescritura local y restablecimiento`, async ({ page }) => {
    await setup(page);
    await page.goto(path);
    if (path === "/cuentas-por-cobrar") await page.getByRole("tab", { name: "Lista de cuentas", exact: true }).click();
    await visible(page, "Primaria Actual");
    await visible(page, "Secundaria Actual");
    await absent(page, "Primaria Anterior");
    await select(page, globalSelect(page, 1), "Primaria");
    await visible(page, "Primaria Actual");
    await absent(page, "Secundaria Actual");

    const local = page.getByRole("combobox", { name: "Nivel de esta página", exact: true });
    await select(page, local, "Secundaria");
    await visible(page, "Secundaria Actual");
    await absent(page, "Primaria Actual");
    await expect(globalSelect(page, 1)).toHaveText("Primaria");

    await select(page, globalSelect(page, 1), "Todos los niveles");
    await visible(page, "Primaria Actual");
    await visible(page, "Secundaria Actual");
    await expect(local).toHaveText("Todos los niveles");

    await select(page, globalSelect(page, 0), "2025-2026");
    await visible(page, "Primaria Anterior");
    await absent(page, "Primaria Actual");
    await absent(page, "Secundaria Actual");
  });
}

test("Pagos usa fecha de pago y combina período con fechas locales", async ({ page }) => {
  await setup(page);
  await page.goto("/pagos");
  await visible(page, "Primaria Actual");
  await absent(page, "Primaria OtroMes");
  await select(page, globalSelect(page, 2), "Este ciclo");
  await visible(page, "Primaria OtroMes");
  await select(page, globalSelect(page, 2), "Hoy");
  await absent(page, "Primaria OtroMes");
  await visible(page, "Primaria Actual");
  await page.locator('input[type="date"]').first().fill("2026-10-29");
  await absent(page, "Primaria Actual");
  await page.getByRole("button", { name: "Limpiar fechas" }).click();
  await visible(page, "Primaria Actual");
  await absent(page, "Primaria OtroMes");
});

test("Cargos y Cuentas por Cobrar ignoran período y conservan contexto al navegar", async ({ page }) => {
  await setup(page);
  await page.goto("/cargos");
  await select(page, globalSelect(page, 1), "Primaria");
  await select(page, globalSelect(page, 2), "Hoy");
  await visible(page, "Primaria OtroMes");
  await page.evaluate(() => {
    window.history.pushState({}, "", "/cuentas-por-cobrar");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("tab", { name: "Lista de cuentas", exact: true }).click();
  await visible(page, "Primaria OtroMes");
  await absent(page, "Secundaria Actual");
  await expect(page.getByRole("combobox", { name: "Nivel de esta página" })).toHaveText("Primaria");
});
