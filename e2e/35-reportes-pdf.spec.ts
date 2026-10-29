import { test, expect } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";
import { pool } from "../server/db";
import { assertTestDatabase } from "../server/lib/database-safety";

let campusSnapshot: { id: number; tenant_id: number; onboarding_completado: boolean } | undefined;

test.beforeAll(async () => {
  await assertTestDatabase(pool);
  const { rows } = await pool.query<{
    id: number;
    tenant_id: number;
    onboarding_completado: boolean;
  }>(
    `SELECT c.id, c.tenant_id, c.onboarding_completado
     FROM campuses c JOIN users u ON u.campus_id = c.id AND u.tenant_id = c.tenant_id
     WHERE u.email = $1`,
    [ADMIN_EMAIL],
  );
  expect(rows).toHaveLength(1);
  campusSnapshot = rows[0];
  // La suite carga demo antes: preparar el acceso y restaurar el valor original.
  await pool.query(
    "UPDATE campuses SET onboarding_completado = true WHERE id = $1 AND tenant_id = $2",
    [campusSnapshot.id, campusSnapshot.tenant_id],
  );
});

test.afterAll(async () => {
  if (!campusSnapshot) return;
  await assertTestDatabase(pool);
  await pool.query(
    "UPDATE campuses SET onboarding_completado = $1 WHERE id = $2 AND tenant_id = $3",
    [campusSnapshot.onboarding_completado, campusSnapshot.id, campusSnapshot.tenant_id],
  );
});

test("PDF-01: Reportes no genera documentos sin datos y explica la indisponibilidad", async ({ page }) => {
  const downloads: string[] = [];
  page.on("download", download => downloads.push(download.suggestedFilename()));
  await loginAsAdmin(page);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/reportes");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await page.getByText("-- Seleccionar Tipo de Reporte --", { exact: true }).click();
  await page.getByRole("option", { name: "Ingresos por Colegiaturas", exact: true }).click();
  for (const label of ["Generar Reporte", "Exportar CSV", "Exportar PDF"]) {
    const button = page.getByRole("button", { name: `${label} — No disponible por ahora`, exact: true });
    await expect(button).toBeDisabled();
    // Incluso un evento sintético no debe activar un generador retirado.
    await button.dispatchEvent("click");
  }
  await expect(page.getByText(/se genera con los datos reales del sistema|Ejemplo Familia|IJF123456789/)).toHaveCount(0);
  expect(downloads).toEqual([]);
});

for (const report of [
  { name: "Reporte de cobranza", path: "/cargos", heading: "Gestión de Cargos" },
  { name: "Antigüedad de saldos", path: "/reporte-antiguedad-saldos", heading: "Antigüedad de Saldos" },
  { name: "Reportes contables", path: "/fiscal-contable", heading: "Fiscal y contable" },
]) {
  test(`REP: el enlace ${report.name} abre su módulo real`, async ({ page }) => {
    await loginAsAdmin(page);
    await page.evaluate(() => {
      window.history.pushState({}, "", "/reportes");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const link = page.getByRole("link", { name: report.name, exact: true });
    await expect(link).toHaveAttribute("href", report.path);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${report.path}$`));
    await expect(page.getByRole("heading", { name: report.heading, exact: true })).toBeVisible();
    if (report.path === "/fiscal-contable") {
      await page.getByRole("tab", { name: "Contadores Externos", exact: true }).click();
      await expect(page.getByText("Reportes contables disponibles", { exact: true })).toBeVisible();
    }
  });
}
