import { test, expect, type Page } from "@playwright/test";
import { pool } from "../server/db";
import { assertTestDatabase } from "../server/lib/database-safety";
import { ADMIN_PASSWORD, SUPERADMIN_EMAIL } from "./helpers/auth";
import { scholarshipDashboard } from "../shared/scholarship-dashboard";
import { readFile } from "node:fs/promises";
import { SCHOOL_TODAY_SQL } from "../shared/school-date";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { await assertTestDatabase(pool); });
test.afterAll(async () => { await pool.end(); });

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator("#email")).not.toBeVisible();
}

async function navigate(page: Page, path: string) {
  await page.evaluate((url) => {
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test("el seed desde /demo-setup confirma hogares y becas reales", async ({ page }) => {
  await login(page, SUPERADMIN_EMAIL);
  await navigate(page, "/demo-setup");
  const response = page.waitForResponse(r => r.url().endsWith("/api/demo/seed") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Cargar datos demo", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText("Completado", { exact: true })).toBeVisible();
  await page.screenshot({ path: "generated-artifacts/becas-demo-setup.jpg", fullPage: true });
});

for (const campusName of ["Campus Norte", "Campus Sur"]) {
  test(`${campusName}: panel, nivel, modal, reporte y asistente coinciden`, async ({ page }) => {
    const { rows: [account] } = await pool.query(
      `SELECT u.email, c.id AS campus_id, c.tenant_id FROM users u
       JOIN campuses c ON c.id = u.campus_id
       WHERE c.nombre = $1 AND u.role IN ('administrador_campus','admisiones') LIMIT 1`,
      [campusName],
    );
    expect(account).toBeDefined();
    await login(page, account.email);
    await navigate(page, "/becas");
    const api = await page.evaluate(async () => {
      const r = await fetch("/api/scholarships", {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    const dashboard = scholarshipDashboard(api);
    const { rows: [expected] } = await pool.query(
      `SELECT COUNT(DISTINCT sh.student_id)::int AS beneficiaries, COUNT(*)::int AS assignments
       FROM scholarships sh JOIN students s ON s.id = sh.student_id
       WHERE s.campus_id=$1 AND sh.tenant_id=$2 AND s.status='activo'
         AND COALESCE(sh.estado,'activa')='activa'
         AND sh.vigencia_inicio <= ${SCHOOL_TODAY_SQL}
         AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= ${SCHOOL_TODAY_SQL})`,
      [account.campus_id, account.tenant_id],
    );
    expect(dashboard.beneficiaries).toBe(expected.beneficiaries);
    await expect(page.getByTestId("scholarship-beneficiaries")).toHaveText(String(expected.beneficiaries));
    if (campusName === "Campus Sur") {
      await expect(page.getByRole("button", { name: "Asignar Beca", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Nuevo Tipo de Beca", exact: true })).toBeDisabled();
    }
    await page.getByRole("button", { name: "Ver Estudiantes", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const names = dashboard.vigente.map((a) => a.alumno);
    const modalText = await page.getByRole("dialog").innerText();
    expect(names.some(name => modalText.includes(name))).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Estudiantes con Becas" }).click();
    for (const level of ["Kinder", "Primaria", "Secundaria", "Bachillerato"]) {
      await page.getByRole("combobox", { name: "Nivel educativo" }).click();
      await page.getByRole("option", { name: level, exact: true }).click();
      const levelNames = dashboard.vigente.filter(a => a.nivel_escolar === level).map(a => a.alumno);
      expect(levelNames.length).toBeGreaterThan(0);
      for (const name of levelNames) await expect(page.getByRole("tabpanel").getByText(name, { exact: true })).toBeVisible();
    }
    await page.getByRole("tab", { name: "Reportes y Control" }).click();
    await page.getByRole("button", { name: "Reporte de becas vigentes" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Descargar CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const csv = await readFile((await file.path())!, "utf8");
    expect(csv).toContain(`"Alumnos beneficiados","${expected.beneficiaries}"`);
    expect(csv).toContain(`"Asignaciones vigentes","${expected.assignments}"`);
    const answer = await page.evaluate(async () => {
      const r = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify({ message: "cuántos becados tengo", currentPath: "/becas" }),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(answer.status).toBe(200);
    expect(Number(answer.body.actionResult.rows.find((r: any) => r.label === "Alumnos beneficiados").value)).toBe(expected.beneficiaries);
    expect(Number(answer.body.actionResult.rows.find((r: any) => r.label === "Asignaciones vigentes").value)).toBe(expected.assignments);
    await navigate(page, "/becas");
    await page.screenshot({ path: `generated-artifacts/becas-${account.campus_id}.jpg`, fullPage: true });
    // Failed reads are explicit, not a false zero-beneficiary result.
    await page.route("**/api/scholarships", route => route.fulfill({ status: 500, body: '{"message":"Error de consulta"}', contentType: "application/json" }));
    await page.reload();
    await expect(page.getByText("No se pudieron consultar las becas. No hay cifras disponibles.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("scholarship-beneficiaries")).not.toBeVisible();
  });
}
