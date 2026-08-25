# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 11-usuarios-unificado.spec.ts >> U09-01: Ciclo completo (crear / editar / eliminar) >> U09-01-B: Editar nombre del usuario y verificar en lista + API
- Location: e2e/11-usuarios-unificado.spec.ts:260:3

# Error details

```
TimeoutError: page.waitForLoadState: Timeout 10000ms exceeded.
```

# Test source

```ts
  191 | // ═══════════════════════════════════════════════════════════════════════════
  192 | test.describe("U09-01: Ciclo completo (crear / editar / eliminar)", () => {
  193 | 
  194 |   // Restaurar sesión sin re-llamar al endpoint de login
  195 |   test.beforeEach(async ({ page }) => {
  196 |     await restoreAdminSession(page);
  197 |     await goToUsuarios(page);
  198 |   });
  199 | 
  200 |   // ─────────────────────────────────────────────────────────────────────────
  201 |   test("U09-01-A: Crear usuario con el formulario y verificar en lista + API",
  202 |     async ({ page, request }) => {
  203 | 
  204 |     // 1. Abrir modal de creación
  205 |     await page.getByRole("button", { name: /nuevo usuario/i }).click();
  206 |     await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  207 |     await expect(page.getByText("Crear nuevo usuario")).toBeVisible();
  208 | 
  209 |     const dialog = page.getByRole("dialog");
  210 | 
  211 |     // 2. Rellenar campos de texto
  212 |     await dialog.getByPlaceholder("Juan Pérez García").fill(TEST_USER.nombre);
  213 |     await dialog.getByPlaceholder("usuario@institutojfr.edu.mx").fill(TEST_USER.email);
  214 |     await dialog.getByPlaceholder("55-1234-5678").fill(TEST_USER.telefono);
  215 | 
  216 |     // 3. Elegir rol en Radix Select
  217 |     //    SelectTrigger renderiza como role="combobox"; las opciones se abren
  218 |     //    en un portal a nivel body (fuera del dialog DOM).
  219 |     await dialog.getByRole("combobox").click();
  220 |     await page.waitForSelector('[role="option"]', { timeout: 5_000 });
  221 |     await page.getByRole("option", { name: /^Asistente$/i }).click();
  222 | 
  223 |     // 4. "Generar contraseña automáticamente" ya está ON por defecto.
  224 | 
  225 |     // 5. Crear usuario.
  226 |     //    NOTA: el componente llama setShowCredentialsModal(true) ANTES de disparar
  227 |     //    la mutación. Ambos dialogs coexisten hasta que onSuccess cierra el de creación.
  228 |     await dialog.getByRole("button", { name: /crear usuario/i }).click();
  229 | 
  230 |     // 6. Modal de credenciales aparece inmediatamente (comprobamos el título)
  231 |     await expect(page.getByText("Credenciales generadas")).toBeVisible({ timeout: 8_000 });
  232 | 
  233 |     // 7. Cerrar modal de credenciales
  234 |     await page.getByRole("button", { name: /finalizar/i }).click();
  235 |     await expect(page.getByText("Credenciales generadas")).toBeHidden({ timeout: 5_000 });
  236 | 
  237 |     // 8. Esperar que la mutación complete y aparezca el toast de éxito.
  238 |     //    .first() resuelve la strict-mode violation: hay dos nodos con ese texto
  239 |     //    (el ToastTitle visible + el aria-live span del sistema de accesibilidad).
  240 |     await page.waitForLoadState("networkidle", { timeout: 10_000 });
  241 |     await expect(
  242 |       page.getByText(/usuario creado exitosamente/i).first()
  243 |     ).toBeVisible({ timeout: 8_000 });
  244 | 
  245 |     // 9. El usuario nuevo aparece en la lista de la UI
  246 |     await expect(
  247 |       page.getByRole("heading", { name: TEST_USER.nombre, level: 3 })
  248 |     ).toBeVisible({ timeout: 8_000 });
  249 | 
  250 |     // 10. Verificar en la API que el usuario existe en DB con los datos correctos
  251 |     const users = await getUsersViaApi(request);
  252 |     const created = users.find((u: any) => u.email === TEST_USER.email);
  253 |     expect(created, `Usuario ${TEST_USER.email} no encontrado en GET /api/users`).toBeTruthy();
  254 |     expect(created.role).toBe("asistente");
  255 |     expect(created.is_active).not.toBe(false);
  256 |     createdUserId = created.id;
  257 |   });
  258 | 
  259 |   // ─────────────────────────────────────────────────────────────────────────
  260 |   test("U09-01-B: Editar nombre del usuario y verificar en lista + API",
  261 |     async ({ page, request }) => {
  262 | 
  263 |     // Fallback: la mutación de U09-01-A puede haberse completado aunque el test
  264 |     // fallara antes de guardar createdUserId.
  265 |     if (!createdUserId) {
  266 |       createdUserId = await obtenerOCrearUsuarioPrueba(request);
  267 |       expect(createdUserId, "No se pudo obtener/crear el usuario de prueba").toBeTruthy();
  268 |     }
  269 | 
  270 |     // 1. Usuario presente en la lista
  271 |     await expect(
  272 |       page.getByRole("heading", { name: TEST_USER.nombre, level: 3 })
  273 |     ).toBeVisible({ timeout: 8_000 });
  274 | 
  275 |     // 2. Clicar botón "Editar usuario" en la fila correcta
  276 |     await clickAccionEnFila(page, TEST_USER.nombre, "Editar usuario");
  277 | 
  278 |     // 3. Modal de edición
  279 |     await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  280 |     await expect(page.getByText("Editar Usuario")).toBeVisible();
  281 |     const editDialog = page.getByRole("dialog");
  282 | 
  283 |     // 4. Cambiar nombre (fill() limpia el campo antes de escribir)
  284 |     await editDialog.getByPlaceholder("Nombre y apellidos completos").fill(TEST_USER_NOMBRE_EDITADO);
  285 | 
  286 |     // 5. Guardar cambios
  287 |     await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
  288 |     await expect(page.getByText("Editar Usuario")).toBeHidden({ timeout: 5_000 });
  289 | 
  290 |     // 6. Toast + refetch
> 291 |     await page.waitForLoadState("networkidle", { timeout: 10_000 });
      |                ^ TimeoutError: page.waitForLoadState: Timeout 10000ms exceeded.
  292 |     await expect(
  293 |       page.getByText(/usuario actualizado exitosamente/i).first()
  294 |     ).toBeVisible({ timeout: 8_000 });
  295 | 
  296 |     // 7. Nombre actualizado en la UI; el nombre anterior ya no existe
  297 |     await expect(
  298 |       page.getByRole("heading", { name: TEST_USER_NOMBRE_EDITADO, level: 3 })
  299 |     ).toBeVisible({ timeout: 8_000 });
  300 |     await expect(
  301 |       page.getByRole("heading", { name: TEST_USER.nombre, level: 3 })
  302 |     ).toHaveCount(0);
  303 | 
  304 |     // 8. Verificar en la API
  305 |     const users = await getUsersViaApi(request);
  306 |     const updated = users.find((u: any) => u.id === createdUserId);
  307 |     expect(updated, "Usuario no encontrado en GET /api/users tras editar").toBeTruthy();
  308 |     expect(updated.name).toBe(TEST_USER_NOMBRE_EDITADO);
  309 |   });
  310 | 
  311 |   // ─────────────────────────────────────────────────────────────────────────
  312 |   test("U09-01-C: Eliminar usuario y verificar que desaparece de lista + API",
  313 |     async ({ page, request }) => {
  314 | 
  315 |     // Fallback
  316 |     if (!createdUserId) {
  317 |       createdUserId = await obtenerOCrearUsuarioPrueba(request);
  318 |       expect(createdUserId, "No se pudo obtener/crear el usuario de prueba").toBeTruthy();
  319 |     }
  320 | 
  321 |     // Obtener el nombre actual del usuario vía API (puede ser el editado o el original)
  322 |     const users = await getUsersViaApi(request);
  323 |     const targetUser = users.find((u: any) => u.id === createdUserId);
  324 |     expect(targetUser, "Usuario de prueba no encontrado en API para U09-01-C").toBeTruthy();
  325 |     const nombreActual: string = targetUser.name;
  326 | 
  327 |     // 1. Usuario presente en la lista
  328 |     await expect(
  329 |       page.getByRole("heading", { name: nombreActual, level: 3 })
  330 |     ).toBeVisible({ timeout: 8_000 });
  331 | 
  332 |     // 2. Clicar botón "Eliminar usuario" (icono Trash en la fila)
  333 |     await clickAccionEnFila(page, nombreActual, "Eliminar usuario");
  334 | 
  335 |     // 3. Modal de confirmación
  336 |     await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  337 |     const confirmDialog = page.getByRole("dialog");
  338 |     await expect(confirmDialog.getByText("Confirmar eliminación")).toBeVisible();
  339 |     // El nombre aparece en el h3 de fondo Y en el DialogDescription — .first() evita strict-mode violation
  340 |     await expect(
  341 |       confirmDialog.getByText(new RegExp(nombreActual.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first()
  342 |     ).toBeVisible();
  343 | 
  344 |     // 4. Confirmar eliminación.
  345 |     //    El handler inline usa DELETE /api/admin/users/:id.
  346 |     await confirmDialog.getByRole("button", { name: /eliminar usuario/i }).click();
  347 |     await expect(page.getByText("Confirmar eliminación")).toBeHidden({ timeout: 5_000 });
  348 | 
  349 |     // 5. Refetch
  350 |     await page.waitForLoadState("networkidle", { timeout: 10_000 });
  351 | 
  352 |     // 6. El usuario ya NO aparece en la lista de la UI
  353 |     await expect(
  354 |       page.getByRole("heading", { name: nombreActual, level: 3 })
  355 |     ).toHaveCount(0, { timeout: 8_000 });
  356 | 
  357 |     // 7. Verificar en la API que fue eliminado
  358 |     const usersAfter = await getUsersViaApi(request);
  359 |     const deleted = usersAfter.find((u: any) => u.id === createdUserId);
  360 |     expect(deleted, "El usuario aún aparece en GET /api/users después de eliminarlo").toBeUndefined();
  361 |     createdUserId = null; // afterAll ya no necesita limpiarlo
  362 |   });
  363 | });
  364 | 
  365 | // ═══════════════════════════════════════════════════════════════════════════
  366 | // U09-02: CAMINO NEGATIVO — Asistente no ve botones de acción por fila
  367 | // ═══════════════════════════════════════════════════════════════════════════
  368 | test.describe("U09-02: Asistente — visibilidad de botones de acción", () => {
  369 | 
  370 |   test("U09-02: asistente no ve Key/Shield/Edit/Trash; 'Nuevo Usuario' sí aparece (inconsistencia UI documentada)",
  371 |     async ({ page }) => {
  372 | 
  373 |     test.skip(!asisteUserId, "Usuario asistente no disponible (falló beforeAll)");
  374 | 
  375 |     // 1. Limpiar sesión de admin y hacer login fresco como asistente.
  376 |     //    Esta es la ÚNICA llamada a /api/auth/login en el test suite después
  377 |     //    del beforeAll (total: 2 llamadas por corrida, bien dentro del límite de 10).
  378 |     await page.goto("/");
  379 |     await page.evaluate(() => {
  380 |       localStorage.removeItem("auth_token");
  381 |       localStorage.removeItem("auth_type");
  382 |       localStorage.removeItem("auth_user");
  383 |     });
  384 |     await page.waitForLoadState("domcontentloaded");
  385 | 
  386 |     // 2. Login como asistente vía formulario de la UI
  387 |     await page.locator("#email").fill(ASISTENTE.email);
  388 |     await page.locator("#password").fill(ASISTENTE.password);
  389 |     await page.locator('button[type="submit"]').click();
  390 |     await page.waitForSelector("nav, aside, main", { timeout: 15_000 });
  391 | 
```