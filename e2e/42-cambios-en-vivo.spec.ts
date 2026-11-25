/**
 * e2e/42-cambios-en-vivo.spec.ts
 * Cambios en vivo: un cambio hecho por otra conexión (otra persona, otra instancia o el Job de sincronización) aparece en una
 * pantalla ya abierta SIN recargar la página. La cadena completa: LISTEN/NOTIFY de PostgreSQL → WebSocket → navegador.
 *
 * El alta se hace directo en la base y el aviso se publica con la misma función que usan el servicio y el Job, es decir,
 * exactamente lo que ocurre cuando el cambio lo origina otro proceso.
 */
import { test, expect } from "@playwright/test";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { assertTestDatabase } from "../server/lib/database-safety";
import { publishDataChange } from "../server/lib/realtime-bus";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";

const stamp = Date.now().toString();
const token = `RT${stamp}`;
let studentId = 0, campusId = 0, tenantId = 0, originalOnboarding = false;

test.beforeAll(async () => {
  await assertTestDatabase(pool);
  const scope = (await pool.query(
    "SELECT u.tenant_id,u.campus_id,c.onboarding_completado FROM users u JOIN campuses c ON c.id=u.campus_id WHERE u.email=$1",
    [ADMIN_EMAIL],
  )).rows[0];
  expect(scope).toBeTruthy();
  tenantId = scope.tenant_id; campusId = scope.campus_id; originalOnboarding = scope.onboarding_completado;
  await pool.query("UPDATE campuses SET onboarding_completado=true WHERE id=$1", [campusId]);
});

test.afterAll(async () => {
  await assertTestDatabase(pool);
  if (studentId) await pool.query("DELETE FROM students WHERE id=$1", [studentId]);
  if (campusId) await pool.query("UPDATE campuses SET onboarding_completado=$1 WHERE id=$2", [originalOnboarding, campusId]);
});

test("un alta hecha por otra conexión aparece en la lista abierta sin recargar", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);
  await page.goto("/estudiantes", { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder(/buscar por nombre, apellidos o curp/i);
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill(token);
  // El apellido "EnVivo" solo existe en el alumno que se crea después (el filtro activo repite el texto buscado).
  await expect(page.getByText(/EnVivo/)).toHaveCount(0);

  // Espera a que el navegador tenga la conexión en vivo abierta antes de provocar el cambio.
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => { (window as any).__sinRecarga = true; });

  const student = await storage.createStudent({
    nombres: `Alumno ${token}`, apellido_paterno: "EnVivo",
    id_referencia: `EV${stamp}`, tenant_id: tenantId, campus_id: campusId,
    nivel_educativo: "Primaria", grado: "1", grupo: "EV",
  } as any);
  studentId = student.id;
  await publishDataChange(pool, { tenantId, source: "api" });

  await expect(page.getByText(/EnVivo/).first()).toBeVisible({ timeout: 15_000 });
  // La página no se recargó: la marca puesta antes del cambio sigue ahí.
  expect(await page.evaluate(() => (window as any).__sinRecarga === true)).toBe(true);
});

test("un aviso de otra escuela no recarga esta pantalla", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);
  await page.goto("/estudiantes", { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder(/buscar por nombre, apellidos o curp/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible({ timeout: 15_000 });

  let reads = 0;
  page.on("request", (r) => { if (r.method() === "GET" && new URL(r.url()).pathname.startsWith("/api/")) reads++; });
  await publishDataChange(pool, { tenantId: tenantId + 100000, source: "api" });
  await page.waitForTimeout(2500);
  expect(reads).toBe(0);
});

test("una escritura real de la API provoca la recarga de la pantalla abierta (middleware + LISTEN/NOTIFY)", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);
  await page.goto("/usuarios", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Usuarios del Sistema/)).toBeVisible({ timeout: 15_000 });
  const token = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
  expect(token).toBeTruthy();

  // La escritura va por la API pero NO por la interfaz: la pantalla no invalida nada por su cuenta, así que si la fila
  // aparece es por la cadena completa (middleware → pg_notify → LISTEN → WebSocket → recarga).
  let created = 0;
  try {
    const res = await page.request.post("/api/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `Usuario En Vivo ${stamp}`, email: `en.vivo.${stamp}@example.invalid`, password_hash: "ClaveTemporal#2025x", role: "asistente", is_active: true },
      failOnStatusCode: false,
    });
    expect(res.ok(), `crear usuario: HTTP ${res.status()}`).toBe(true);
    const body = await res.json();
    created = body.id ?? body.user?.id ?? 0;
    // La fila nueva aparece en la lista abierta sin recargar la página.
    await expect(page.getByText(`en.vivo.${stamp}@example.invalid`)).toBeVisible({ timeout: 15_000 });
  } finally {
    if (created) await page.request.delete(`/api/admin/users/${created}`, { headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false });
  }
});
