/**
 * e2e/11-usuarios-unificado.spec.ts
 * Módulo: Gestión de Usuarios (client/src/pages/usuarios-unificado.tsx)
 * Ruta: /usuarios
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * INVENTARIO DE ACCIONES DE LA PANTALLA (con cobertura)
 * ──────────────────────────────────────────────────────────────────────────────
 * ✓ Crear usuario           → POST /api/users            (U09-01-A)
 * ✓ Editar usuario          → PUT  /api/users/:id         (U09-01-B)
 * ✓ Eliminar usuario        → DELETE /api/admin/users/:id  (U09-01-C)
 * ✓ Guard de visibilidad    → botones per-row ocultos para asistente (U09-02)
 *
 * ACCIONES SIN LLAMADA AL BACKEND (fuera del scope E2E):
 * ~ Regenerar credenciales  → CLIENT-SIDE ONLY: genera password localmente,
 *                             muestra modal. No persiste nada en la DB.
 * ~ Gestionar permisos      → "Guardar permisos" muestra un toast. No llama
 *                             al backend. Los custom_permissions no se persisten.
 * ~ Exportar Lista          → Botón visible sin handler implementado.
 * ~ Activar/Desactivar      → Switch is_active dentro del modal Editar;
 *                             cubierto implícitamente por U09-01-B.
 *
 * HALLAZGO UI DOCUMENTADO:
 *   El botón "Nuevo Usuario" NO tiene guard de rol en el componente — siempre
 *   es visible, incluyendo para asistente. Los botones per-fila (Key/Shield/
 *   Edit/Trash) SÍ usan canEditUser() y quedan ocultos.
 *
 * NOTAS DE IMPLEMENTACIÓN:
 *   – Login UNA SOLA VEZ en beforeAll (fixture browser). adminToken + authUser
 *     se guardan en memoria y se restauran en localStorage en cada beforeEach
 *     sin re-llamar a /api/auth/login (rate-limited: 10 req/15 min).
 *   – La API usa campo `password_hash` (nombre del componente; el backend
 *     recibe la contraseña en texto plano y la hashea internamente).
 *   – El modal de credenciales abre ANTES de que la mutación POST resuelva
 *     (estado síncrono → mutación asíncrona).
 *   – El botón "Eliminar usuario" del modal usa DELETE /api/admin/users/:id
 *     (handler inline), no deleteUserMutation que usa /api/users/:id.
 *   – Toast .first() evita la strict-mode violation: el sistema de accesibilidad
 *     crea un nodo aria-live duplicado con el mismo texto.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

// ── Datos únicos por corrida ────────────────────────────────────────────────
const TS = Date.now().toString().slice(-7);

const TEST_USER = {
  nombre:   `E2E Usuario ${TS}`,
  email:    `e2e.usr.${TS}@test.edupay.mx`,
  telefono: "55-1111-0001",
  role:     "asistente",   // bajo en la jerarquía → administrador_campus puede editarlo
};
const TEST_USER_NOMBRE_EDITADO = `E2E Editado ${TS}`;

const ASISTENTE = {
  nombre:   `E2E Asistente ${TS}`,
  email:    `e2e.asist.${TS}@test.edupay.mx`,
  password: `Asist${TS}E2e!`,
};

// ── Estado compartido entre tests ───────────────────────────────────────────
let adminToken    = "";
let adminAuthUser = "";   // JSON string de auth_user para restaurar la sesión
let createdUserId: number | null = null;
let asisteUserId: number | null  = null;

// ── beforeAll: login ÚNICO vía browser fixture ──────────────────────────────
// Evita múltiples llamadas a POST /api/auth/login (rate-limited: 10/15 min).
// Guarda token + auth_user en memoria; cada test los restaura en localStorage.
test.beforeAll(async ({ browser, request }) => {
  // Resetear los buckets de rate-limit antes de cualquier POST /api/auth/login.
  // El limiter de auth (10 req/15 min por IP) se agota en corridas manuales
  // consecutivas durante desarrollo; este endpoint está disponible sólo fuera
  // de producción (NODE_ENV !== 'production').
  await request.post("/api/test/reset-rate-limits", { failOnStatusCode: false });

  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await loginAsAdmin(page);

  // Capturar las tres claves de sesión que usa la app
  adminToken    = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
  adminAuthUser = await page.evaluate(() => localStorage.getItem("auth_user")  ?? "");

  expect(adminToken, "No se obtuvo auth_token tras loginAsAdmin en beforeAll").toBeTruthy();

  // Crear asistente para U09-02 usando Bearer (no llama a /api/auth/login)
  const createRes = await page.request.post("/api/users", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      name:          ASISTENTE.nombre,
      email:         ASISTENTE.email,
      password_hash: ASISTENTE.password,   // el backend hashea internamente
      role:          "asistente",
      is_active:     true,
    },
    failOnStatusCode: false,
  });
  if (createRes.ok()) {
    const body = await createRes.json();
    asisteUserId = body.id ?? body.user?.id ?? null;
  } else {
    const txt = await createRes.text().catch(() => "");
    console.warn(`[U09] No se pudo crear asistente: HTTP ${createRes.status()} — ${txt.slice(0, 200)}`);
  }

  await ctx.close();
});

// ── afterAll: limpiar usuarios creados ─────────────────────────────────────
test.afterAll(async ({ request }) => {
  for (const id of [createdUserId, asisteUserId]) {
    if (id) {
      await request.delete(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        failOnStatusCode: false,
      });
    }
  }
});

// ── Helper: restaurar sesión de admin en la page sin re-hacer login ─────────
async function restoreAdminSession(page: any) {
  await page.goto("/");
  await page.evaluate(
    ({ token, user }: { token: string; user: string }) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_type",  "user");
      localStorage.setItem("auth_user",  user);
    },
    { token: adminToken, user: adminAuthUser }
  );
  await page.reload();
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
}

// ── Helper: navegar a /usuarios y esperar el heading ───────────────────────
async function goToUsuarios(page: any) {
  await page.evaluate(() => window.history.pushState({}, "", "/usuarios"));
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: /gestión de usuarios/i })
  ).toBeVisible({ timeout: 10_000 });
}

// ── Helper: clicar botón de acción en la fila del usuario usando XPath ──────
async function clickAccionEnFila(page: any, nombre: string, actionTitle: string) {
  const xpath =
    `//h3[contains(normalize-space(text()),"${nombre}")]` +
    `/ancestor::div[.//button[@title="${actionTitle}"]][1]` +
    `//button[@title="${actionTitle}"]`;
  await page.locator(xpath).first().click();
}

// ── Helper: GET /api/users con admin token ──────────────────────────────────
async function getUsersViaApi(request: APIRequestContext): Promise<any[]> {
  const res = await request.get("/api/users", {
    headers: { Authorization: `Bearer ${adminToken}` },
    failOnStatusCode: true,
  });
  return res.json();
}

// ── Helper: obtener o crear usuario de prueba (fallback si U09-01-A falló) ──
async function obtenerOCrearUsuarioPrueba(
  request: APIRequestContext
): Promise<number | null> {
  // Buscar primero por email (la mutación pudo completarse aunque el test fallara)
  const users = await getUsersViaApi(request);
  const existing = users.find((u: any) => u.email === TEST_USER.email);
  if (existing) return existing.id;

  const res = await request.post("/api/users", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      name:          TEST_USER.nombre,
      email:         TEST_USER.email,
      password_hash: "TempPass123!",
      role:          "asistente",
      is_active:     true,
    },
    failOnStatusCode: false,
  });
  if (!res.ok()) return null;
  const b = await res.json();
  return b.id ?? b.user?.id ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// U09-01: CICLO COMPLETO ADMIN — Crear → Ver en lista → Editar → Eliminar
// ═══════════════════════════════════════════════════════════════════════════
test.describe("U09-01: Ciclo completo (crear / editar / eliminar)", () => {

  // Restaurar sesión sin re-llamar al endpoint de login
  test.beforeEach(async ({ page }) => {
    await restoreAdminSession(page);
    await goToUsuarios(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  test("U09-01-A: Crear usuario con el formulario y verificar en lista + API",
    async ({ page, request }) => {

    // 1. Abrir modal de creación
    await page.getByRole("button", { name: /nuevo usuario/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Crear nuevo usuario")).toBeVisible();

    const dialog = page.getByRole("dialog");

    // 2. Rellenar campos de texto
    await dialog.getByPlaceholder("Juan Pérez García").fill(TEST_USER.nombre);
    await dialog.getByPlaceholder("usuario@institutojfr.edu.mx").fill(TEST_USER.email);
    await dialog.getByPlaceholder("55-1234-5678").fill(TEST_USER.telefono);

    // 3. Elegir rol en Radix Select
    //    SelectTrigger renderiza como role="combobox"; las opciones se abren
    //    en un portal a nivel body (fuera del dialog DOM).
    await dialog.getByRole("combobox").click();
    await page.waitForSelector('[role="option"]', { timeout: 5_000 });
    await page.getByRole("option", { name: /^Asistente$/i }).click();

    // 4. "Generar contraseña automáticamente" ya está ON por defecto.

    // 5. Crear usuario.
    //    NOTA: el componente llama setShowCredentialsModal(true) ANTES de disparar
    //    la mutación. Ambos dialogs coexisten hasta que onSuccess cierra el de creación.
    await dialog.getByRole("button", { name: /crear usuario/i }).click();

    // 6. Modal de credenciales aparece inmediatamente (comprobamos el título)
    await expect(page.getByText("Credenciales generadas")).toBeVisible({ timeout: 8_000 });

    // 7. Cerrar modal de credenciales
    await page.getByRole("button", { name: /finalizar/i }).click();
    await expect(page.getByText("Credenciales generadas")).toBeHidden({ timeout: 5_000 });

    // 8. Esperar que la mutación complete y aparezca el toast de éxito.
    //    .first() resuelve la strict-mode violation: hay dos nodos con ese texto
    //    (el ToastTitle visible + el aria-live span del sistema de accesibilidad).
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await expect(
      page.getByText(/usuario creado exitosamente/i).first()
    ).toBeVisible({ timeout: 8_000 });

    // 9. El usuario nuevo aparece en la lista de la UI
    await expect(
      page.getByRole("heading", { name: TEST_USER.nombre, level: 3 })
    ).toBeVisible({ timeout: 8_000 });

    // 10. Verificar en la API que el usuario existe en DB con los datos correctos
    const users = await getUsersViaApi(request);
    const created = users.find((u: any) => u.email === TEST_USER.email);
    expect(created, `Usuario ${TEST_USER.email} no encontrado en GET /api/users`).toBeTruthy();
    expect(created.role).toBe("asistente");
    expect(created.is_active).not.toBe(false);
    createdUserId = created.id;
  });

  // ─────────────────────────────────────────────────────────────────────────
  test("U09-01-B: Editar nombre del usuario y verificar en lista + API",
    async ({ page, request }) => {

    // Fallback: la mutación de U09-01-A puede haberse completado aunque el test
    // fallara antes de guardar createdUserId.
    if (!createdUserId) {
      createdUserId = await obtenerOCrearUsuarioPrueba(request);
      expect(createdUserId, "No se pudo obtener/crear el usuario de prueba").toBeTruthy();
    }

    // 1. Usuario presente en la lista
    await expect(
      page.getByRole("heading", { name: TEST_USER.nombre, level: 3 })
    ).toBeVisible({ timeout: 8_000 });

    // 2. Clicar botón "Editar usuario" en la fila correcta
    await clickAccionEnFila(page, TEST_USER.nombre, "Editar usuario");

    // 3. Modal de edición
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Editar Usuario")).toBeVisible();
    const editDialog = page.getByRole("dialog");

    // 4. Cambiar nombre (fill() limpia el campo antes de escribir)
    await editDialog.getByPlaceholder("Nombre y apellidos completos").fill(TEST_USER_NOMBRE_EDITADO);

    // 5. Guardar cambios
    await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
    await expect(page.getByText("Editar Usuario")).toBeHidden({ timeout: 5_000 });

    // 6. Toast + refetch
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await expect(
      page.getByText(/usuario actualizado exitosamente/i).first()
    ).toBeVisible({ timeout: 8_000 });

    // 7. Nombre actualizado en la UI; el nombre anterior ya no existe
    await expect(
      page.getByRole("heading", { name: TEST_USER_NOMBRE_EDITADO, level: 3 })
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByRole("heading", { name: TEST_USER.nombre, level: 3 })
    ).toHaveCount(0);

    // 8. Verificar en la API
    const users = await getUsersViaApi(request);
    const updated = users.find((u: any) => u.id === createdUserId);
    expect(updated, "Usuario no encontrado en GET /api/users tras editar").toBeTruthy();
    expect(updated.name).toBe(TEST_USER_NOMBRE_EDITADO);
  });

  // ─────────────────────────────────────────────────────────────────────────
  test("U09-01-C: Eliminar usuario y verificar que desaparece de lista + API",
    async ({ page, request }) => {

    // Fallback
    if (!createdUserId) {
      createdUserId = await obtenerOCrearUsuarioPrueba(request);
      expect(createdUserId, "No se pudo obtener/crear el usuario de prueba").toBeTruthy();
    }

    // Obtener el nombre actual del usuario vía API (puede ser el editado o el original)
    const users = await getUsersViaApi(request);
    const targetUser = users.find((u: any) => u.id === createdUserId);
    expect(targetUser, "Usuario de prueba no encontrado en API para U09-01-C").toBeTruthy();
    const nombreActual: string = targetUser.name;

    // 1. Usuario presente en la lista
    await expect(
      page.getByRole("heading", { name: nombreActual, level: 3 })
    ).toBeVisible({ timeout: 8_000 });

    // 2. Clicar botón "Eliminar usuario" (icono Trash en la fila)
    await clickAccionEnFila(page, nombreActual, "Eliminar usuario");

    // 3. Modal de confirmación
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog.getByText("Confirmar eliminación")).toBeVisible();
    // El nombre aparece en el h3 de fondo Y en el DialogDescription — .first() evita strict-mode violation
    await expect(
      confirmDialog.getByText(new RegExp(nombreActual.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first()
    ).toBeVisible();

    // 4. Confirmar eliminación.
    //    El handler inline usa DELETE /api/admin/users/:id.
    await confirmDialog.getByRole("button", { name: /eliminar usuario/i }).click();
    await expect(page.getByText("Confirmar eliminación")).toBeHidden({ timeout: 5_000 });

    // 5. Refetch
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    // 6. El usuario ya NO aparece en la lista de la UI
    await expect(
      page.getByRole("heading", { name: nombreActual, level: 3 })
    ).toHaveCount(0, { timeout: 8_000 });

    // 7. Verificar en la API que fue eliminado
    const usersAfter = await getUsersViaApi(request);
    const deleted = usersAfter.find((u: any) => u.id === createdUserId);
    expect(deleted, "El usuario aún aparece en GET /api/users después de eliminarlo").toBeUndefined();
    createdUserId = null; // afterAll ya no necesita limpiarlo
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// U09-02: CAMINO NEGATIVO — Asistente no ve botones de acción por fila
// ═══════════════════════════════════════════════════════════════════════════
test.describe("U09-02: Asistente — visibilidad de botones de acción", () => {

  test("U09-02: asistente no ve Key/Shield/Edit/Trash; 'Nuevo Usuario' sí aparece (inconsistencia UI documentada)",
    async ({ page }) => {

    test.skip(!asisteUserId, "Usuario asistente no disponible (falló beforeAll)");

    // 1. Limpiar sesión de admin y hacer login fresco como asistente.
    //    Esta es la ÚNICA llamada a /api/auth/login en el test suite después
    //    del beforeAll (total: 2 llamadas por corrida, bien dentro del límite de 10).
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_type");
      localStorage.removeItem("auth_user");
    });
    await page.waitForLoadState("domcontentloaded");

    // 2. Login como asistente vía formulario de la UI
    await page.locator("#email").fill(ASISTENTE.email);
    await page.locator("#password").fill(ASISTENTE.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector("nav, aside, main", { timeout: 15_000 });

    // 3. Navegar directamente a /usuarios
    //    (el sidebar puede no mostrar esta ruta para asistente — "sidebar filtra")
    await goToUsuarios(page);

    // 4. ── HALLAZGO DOCUMENTADO ──────────────────────────────────────────────
    //    "Nuevo Usuario" NO tiene guard de rol: siempre visible para todos los roles.
    //    El backend rechazará el POST /api/users si un asistente lo intenta.
    await expect(
      page.getByRole("button", { name: /nuevo usuario/i })
    ).toBeVisible({ timeout: 5_000 });

    // 5. Los 4 botones de acción per-fila NO deben aparecer para asistente.
    //    El componente los envuelve en:
    //      {(currentUser?.role === 'super_admin' ||
    //        canEditUser(currentUser.role, user.role)) && (<>…</>)}
    //    canEditUser('asistente', cualquier_rol) → false siempre.
    await expect(page.getByTitle("Editar usuario")).toHaveCount(0);
    await expect(page.getByTitle("Eliminar usuario")).toHaveCount(0);
    await expect(page.getByTitle("Regenerar credenciales")).toHaveCount(0);
    await expect(page.getByTitle("Gestionar permisos")).toHaveCount(0);

    // 6. Verificar filas de usuario reales con un selector específico.
    //    El componente renderiza cada usuario en una tarjeta con h3.font-semibold.text-slate-900.
    //    (No usar "h3" a secas — el sidebar tiene muchos headings h3 no relacionados.)
    const filasUsuario = page.locator("h3.font-semibold.text-slate-900");
    const numFilas = await filasUsuario.count();

    if (numFilas > 0) {
      // Si hay filas visibles, "Solo lectura" debe aparecer para cada una.
      // El asistente (nivel 2) sólo puede ver y editar usuarios de nivel < 2 (admisiones).
      // Si ve usuarios que NO puede editar (mismo nivel u otro), el badge "Solo lectura" aparece.
      const numBadges = await page.getByText("Solo lectura").count();
      expect(
        numBadges,
        `Hay ${numFilas} filas de usuario visibles pero sin badges 'Solo lectura'`
      ).toBeGreaterThan(0);
    }
    // Si numFilas === 0, las aserciones de botones (count 0) ya cubren el caso.
  });
});
