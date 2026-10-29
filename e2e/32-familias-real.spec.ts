import { test, expect } from "@playwright/test";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { assertTestDatabase } from "../server/lib/database-safety";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";

const stamp = Date.now().toString();
let studentId = 0, familyId = 0, guardianIds: number[] = [];
let campusId = 0, tenantId = 0, originalOnboarding = false;

test.beforeAll(async () => {
  await assertTestDatabase(pool);
  const scope = (await pool.query(
    "SELECT u.tenant_id,u.campus_id,c.onboarding_completado FROM users u JOIN campuses c ON c.id=u.campus_id WHERE u.email=$1",
    [ADMIN_EMAIL],
  )).rows[0];
  expect(scope).toBeTruthy();
  tenantId = scope.tenant_id; campusId = scope.campus_id; originalOnboarding = scope.onboarding_completado;
  await pool.query("UPDATE campuses SET onboarding_completado=true WHERE id=$1", [campusId]);
  const student = await storage.createStudent({
    nombres: `Alumno Familia E2E ${stamp}`, apellido_paterno: "Prueba",
    id_referencia: `FE2E${stamp}`, tenant_id: tenantId, campus_id: campusId,
    nivel_educativo: "Primaria", grado: "1", grupo: "FR",
  } as any);
  studentId = student.id;
});
test.afterAll(async () => {
  await assertTestDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM student_guardian WHERE student_id=$1", [studentId]);
    await client.query("DELETE FROM family_students WHERE student_id=$1", [studentId]);
    if (familyId) await client.query("DELETE FROM families WHERE id=$1", [familyId]);
    if (guardianIds.length) await client.query("DELETE FROM guardians WHERE id=ANY($1::int[])", [guardianIds]);
    if (studentId) await client.query("DELETE FROM students WHERE id=$1", [studentId]);
    if (campusId) await client.query("UPDATE campuses SET onboarding_completado=$1 WHERE id=$2", [originalOnboarding, campusId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

test("familia real: alta con madre sola, recarga, edición y archivado con motivo y dos confirmaciones", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAsAdmin(page);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/familias");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("button", { name: /^(Agregar|Nueva) familia$/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre de la familia", { exact: true }).fill(`Familia E2E ${stamp}`);
  await dialog.getByLabel("IDs de alumnos vinculados").fill(String(studentId));
  await dialog.getByLabel("Tipo de tutor").selectOption("madre");
  for (const [label, value] of [
    ["Nombres *", `Tutora E2E ${stamp}`], ["Primer apellido *", "Prueba"], ["Segundo apellido", "Familia"],
    ["CURP", "TEAT040501HDFRRSA0"], ["RFC persona física", "TEAT040501001"],
    ["Celular *", "55 1234 5678"],
    ["Teléfono de casa u oficina", "55 8765 4321"], ["Calle", "Calle original"],
    ["Número exterior", "12"], ["Número interior", "3"], ["Colonia", "Prueba"],
    ["Código postal", "01000"], ["Municipio", "Prueba"], ["Estado", "Ciudad de México"],
    ["Contacto de emergencia", "Contacto E2E"], ["Teléfono de emergencia", "55 1122 3344"],
    ["Relación del contacto", "Otra"],
  ]) await dialog.getByLabel(label, { exact: true }).fill(value);
  await expect(dialog.getByLabel("Correo (opcional)", { exact: true })).not.toHaveAttribute("required", "");
  await expect(dialog.getByLabel("Celular *", { exact: true })).toHaveAttribute("required", "");
  const created = page.waitForResponse(r => r.url().endsWith("/api/admin/families") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Guardar familia", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const data = await response.json();
  familyId = data.family_id; guardianIds = data.guardians_created.map((g: any) => g.id);
  const contact = await pool.query("SELECT email,correo_institucional_familiar FROM guardians WHERE id=$1", [guardianIds[0]]);
  expect(contact.rows[0]).toEqual({ email: null, correo_institucional_familiar: null });
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const card = page.getByTestId(`family-${familyId}`);
  await expect(card).toBeVisible();
  await card.getByTitle(/Editar/).click();
  await page.getByRole("dialog").getByLabel("Calle", { exact: true }).fill("Calle actualizada E2E");
  const edited = page.waitForResponse(r => r.url().endsWith(`/api/admin/families/${familyId}`) && r.request().method() === "PATCH");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
  expect((await edited).status()).toBe(200);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await card.getByTitle(/Editar/).click();
  await expect(page.getByRole("dialog").getByLabel("Calle", { exact: true })).toHaveValue("Calle actualizada E2E");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await card.getByTitle("Archivar familia", { exact: true }).click();
  await page.getByLabel("Motivo obligatorio").fill("Archivo E2E autorizado");
  await page.getByRole("button", { name: "Continuar con archivado" }).click();
  const archived = page.waitForResponse(r => r.url().endsWith(`/api/admin/families/${familyId}/status`) && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Confirmar archivado", exact: true }).click();
  expect((await archived).status()).toBe(200);
  await expect(card).not.toBeVisible();
  await page.getByRole("button", { name: "Ver archivadas", exact: true }).click();
  await expect(card).toBeVisible();
  const saved = (await pool.query("SELECT status,archived_at,archived_by FROM families WHERE id=$1", [familyId])).rows[0];
  expect(saved.status).toBe("archivada"); expect(saved.archived_at).toBeTruthy(); expect(saved.archived_by).toBeTruthy();
  expect((await pool.query("SELECT count(*) AS n FROM guardians WHERE id=ANY($1::int[])", [guardianIds])).rows[0].n).toBe("1");
  expect((await pool.query("SELECT count(*) AS n FROM students WHERE id=$1", [studentId])).rows[0].n).toBe("1");
});
