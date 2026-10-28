import { expect, test, Page } from "@playwright/test";

const ciclos = (date = new Date()) => {
  const year = date.getFullYear() - (date.getMonth() < 7 ? 1 : 0);
  return [`${year}-${year + 1}`, `${year - 1}-${year}`];
};

function filtro(page: Page, label: string) {
  return page.locator("main label").filter({ hasText: new RegExp(`^${label}$`) })
    .locator("..").getByRole("combobox");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("auth_user", JSON.stringify({ campus_id: 1 })));
  const [actual, anterior] = ciclos();
  const students = [
    { id: 1, nombre_completo: "Alumno Primaria Actual", nivel_escolar: "Primaria", ciclo_escolar: actual },
    { id: 2, nombre_completo: "Alumno Primaria Anterior", nivel_escolar: "Primaria", ciclo_escolar: anterior },
    { id: 3, nombre_completo: "Alumno Kinder Actual", nivel_escolar: "Kinder", ciclo_escolar: actual },
    { id: 4, nombre_completo: "Alumno Preparatoria Actual", nivel_escolar: "Preparatoria", ciclo_escolar: actual },
  ].map(s => ({ ...s, nombres: s.nombre_completo, status: "activo", grado: "1", grupo: "A" }));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/students") return route.fulfill({ json: students });
    if (path === "/api/families/1") return route.fulfill({
      json: students.map(s => ({
        id: s.id, nombre: `Familia ${s.id}`,
        estudiantes: [{ id: s.id, nombre_completo: s.nombre_completo, grado: s.grado, grupo: s.grupo, nivel_escolar: s.nivel_escolar }],
        tutores: [],
      })),
    });
    return route.abort(); // No permite que una petición imprevista llegue al servidor.
  });
  await page.goto("/e2e/isolated/academic-filters.html");
});

for (const pagina of ["alumnos", "familias"]) {
  test(`${pagina}: hereda ciclo y nivel al entrar y sigue cambios compartidos`, async ({ page }) => {
    await page.getByLabel("Nivel compartido").selectOption("PRIMARIA");
    await page.getByRole("button", { name: pagina, exact: true }).click();
    await expect(filtro(page, "Nivel")).toHaveText("Primaria");
    await expect(filtro(page, "Ciclo Escolar")).toHaveText(pagina === "alumnos" ? ciclos()[0] : "Todos los ciclos");
    const name = (id: number) => pagina === "familias" ? `FAM${String(id).padStart(3, "0")}` : [
      "", "Alumno Primaria Actual", "Alumno Primaria Anterior", "Alumno Kinder Actual", "Alumno Preparatoria Actual",
    ][id];
    await expect(page.locator("main").getByText(name(1), { exact: true }).first()).toBeVisible();
    if (pagina === "alumnos") await expect(page.locator("main").getByText(name(2), { exact: true })).toHaveCount(0);
    await page.getByLabel("Ciclo compartido").selectOption(ciclos()[1]);
    await expect(filtro(page, "Ciclo Escolar")).toHaveText(pagina === "alumnos" ? ciclos()[1] : "Todos los ciclos");
    await expect(page.locator("main").getByText(name(2), { exact: true }).first()).toBeVisible();
    if (pagina === "alumnos") await expect(page.locator("main").getByText(name(1), { exact: true })).toHaveCount(0);
    await page.getByLabel("Ciclo compartido").selectOption(ciclos()[0]);
    for (const [nivel, label] of [["KINDER", "Kinder"], ["SECUNDARIA", "Secundaria"], ["BACHILLERATO", "Preparatoria"], ["all", "Todas las secciones"]]) {
      await page.getByLabel("Nivel compartido").selectOption(nivel);
      await expect(filtro(page, "Nivel")).toHaveText(label);
      if (nivel === "BACHILLERATO") {
        await expect(page.locator("main").getByText(name(4), { exact: true }).first()).toBeVisible();
      }
    }
    // Las selecciones locales siguen funcionando sin alterar el header.
    await filtro(page, "Nivel").click();
    await page.getByRole("option", { name: "Primaria", exact: true }).click();
    await expect(filtro(page, "Nivel")).toHaveText("Primaria");
    await expect(page.getByLabel("Nivel compartido")).toHaveValue("all");
    await page.getByLabel("Nivel compartido").selectOption("BACHILLERATO");
    await expect(filtro(page, "Nivel")).toHaveText("Preparatoria");
    await page.getByRole("button", { name: "inicio", exact: true }).click();
    await page.getByRole("button", { name: pagina, exact: true }).click();
    await expect(filtro(page, "Nivel")).toHaveText("Preparatoria");
  });
}
