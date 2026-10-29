import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
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

test("PDF-01: Reportes descarga un PDF con título y contenido usando jsPDF 4", async ({ page }) => {
  await loginAsAdmin(page);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/reportes");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await page.getByText("-- Seleccionar Tipo de Reporte --", { exact: true }).click();
  await page.getByRole("option", { name: "Ingresos por Colegiaturas", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.getByRole("button", { name: "Exportar PDF", exact: true }).click(),
  ]);

  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/^JFR_ingresos_colegiaturas_.+\.pdf$/);
  const path = await download.path();
  if (!path) throw new Error("La descarga no produjo un archivo PDF");
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(1_000);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  // jsPDF exporta aquí texto sin compresión: comprobar contenido, no solo extensión.
  const content = bytes.toString("latin1");
  expect(content).toContain("(INSTITUTO JFR)");
  expect(content).toContain("(INGRESOS POR COLEGIATURAS)");
  expect(content).toMatch(/\/Type\s*\/Page\b/);
  expect(content.trimEnd().endsWith("%%EOF")).toBe(true);
});
