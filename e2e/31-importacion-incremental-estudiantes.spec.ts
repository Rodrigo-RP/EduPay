/**
 * Importación incremental de estudiantes desde la UI real.
 *
 * El navegador selecciona un archivo con 14 alumnos nuevos + 1 CURP existente,
 * exige preview dry-run, confirma y después consulta PostgreSQL como evidencia.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";
import { pool as db } from "../server/db";
import { uniqueTestCurp } from "../server/test-support/test-curp";

const run = Date.now();
const referencePrefix = `E2E-INC-${run}`;
let tenantId = 0;
let campusId = 0;
let onboardingWasComplete = false;

const existingCurp = uniqueTestCurp("EIZA");
const existingReference = `${referencePrefix}-EXISTING`;
const newRows = Array.from({ length: 14 }, (_, index) => ({
  name: `Alumno E2E Incremental ${index + 1}`,
  curp: uniqueTestCurp(`EIC${String.fromCharCode(65 + index)}`),
  reference: `${referencePrefix}-${String(index + 1).padStart(2, "0")}`,
}));

function buildCsv(): Buffer {
  return Buffer.from([
    "nombre_completo,curp,id_referencia,grado,grupo,status",
    ...newRows.map((row) =>
      `${row.name},${row.curp},${row.reference},3ro,A,activo`
    ),
    `Alumno E2E Duplicado,${existingCurp},${referencePrefix}-DUP,3ro,A,activo`,
  ].join("\n"), "utf8");
}

test.describe.configure({ mode: "serial" });

test.describe("Importación incremental de estudiantes", () => {
  test.beforeAll(async () => {
    const scope = await db.query(
      "SELECT tenant_id, campus_id FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL],
    );
    expect(scope.rows).toHaveLength(1);
    tenantId = Number(scope.rows[0].tenant_id);
    campusId = Number(scope.rows[0].campus_id);

    const campus = await db.query(
      "SELECT onboarding_completado FROM campuses WHERE id = $1",
      [campusId],
    );
    onboardingWasComplete = Boolean(campus.rows[0]?.onboarding_completado);
    await db.query(
      "UPDATE campuses SET onboarding_completado = true WHERE id = $1",
      [campusId],
    );

    await db.query(
      `INSERT INTO students
         (tenant_id, campus_id, id_referencia, nombres, nombre_completo, curp, grado, grupo, status)
       VALUES ($1, $2, $3, 'Alumno E2E Existente', 'Alumno E2E Existente', $4, '3ro', 'A', 'activo')`,
      [tenantId, campusId, existingReference, existingCurp],
    );
  });

  test.afterAll(async () => {
    await db.query(
      `DELETE FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia LIKE $3`,
      [tenantId, campusId, `${referencePrefix}%`],
    );
    await db.query(
      "UPDATE campuses SET onboarding_completado = $1 WHERE id = $2",
      [onboardingWasComplete, campusId],
    );
  });

  test("ISI-E2E-01: UI importa 14 y omite 1 duplicado con evidencia en Neon", async ({ page }) => {
    const retiredRequests: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/api/migration/status")) retiredRequests.push(request.url());
    });
    await loginAsAdmin(page);
    await page.goto("/importacion-datos", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Importación de Datos" })).toBeVisible();

    const card = page.getByTestId("template-card-estudiantes-estudiantes");
    await card.getByRole("button", { name: "Importar Datos" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "alumnos-incrementales.csv",
      mimeType: "text/csv",
      buffer: buildCsv(),
    });

    const beforePreview = await db.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia = ANY($3::text[])`,
      [tenantId, campusId, newRows.map((row) => row.reference)],
    );
    expect(Number(beforePreview.rows[0].total)).toBe(0);

    await dialog.getByRole("button", { name: "Generar vista previa" }).click();
    await expect(dialog.getByText("Vista previa real — sin cambios")).toBeVisible();
    await expect(dialog.getByTestId("import-successful")).toHaveText("14");
    await expect(dialog.getByTestId("import-skipped")).toHaveText("1");
    await expect(dialog.getByTestId("import-failed")).toHaveText("0");
    await expect(dialog.getByText(/Alumno E2E Duplicado omitido/)).toBeVisible();

    const afterPreview = await db.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia = ANY($3::text[])`,
      [tenantId, campusId, newRows.map((row) => row.reference)],
    );
    expect(Number(afterPreview.rows[0].total)).toBe(0);

    // Retener únicamente la respuesta de la importación real para comprobar
    // el indicador mientras llega; no se modifica el resultado del servidor.
    await page.route("**/api/import/data/estudiantes/estudiantes", async route => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 1_000));
      await route.fulfill({ response });
    }, { times: 1 });
    await dialog.getByRole("button", { name: "Confirmar Importación" }).click();
    await expect(dialog.getByText("Importando…", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/^\d+%$/)).toHaveCount(0);
    await expect(dialog.getByText("Resultado de importación")).toBeVisible();
    await expect(dialog.getByTestId("import-successful")).toHaveText("14");
    await expect(dialog.getByTestId("import-skipped")).toHaveText("1");
    await expect(dialog.getByTestId("import-failed")).toHaveText("0");
    expect(retiredRequests).toEqual([]);

    const inserted = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT curp)::int AS curps,
              COUNT(DISTINCT id_referencia)::int AS referencias
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND id_referencia = ANY($3::text[])`,
      [tenantId, campusId, newRows.map((row) => row.reference)],
    );
    expect(inserted.rows[0]).toMatchObject({
      total: 14,
      curps: 14,
      referencias: 14,
    });

    const existing = await db.query(
      `SELECT COUNT(*)::int AS total
         FROM students
        WHERE tenant_id = $1
          AND campus_id = $2
          AND curp = $3`,
      [tenantId, campusId, existingCurp],
    );
    expect(Number(existing.rows[0].total)).toBe(1);
  });
});