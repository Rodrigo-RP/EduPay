# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 11-usuarios-unificado.spec.ts >> U09-02: Asistente — visibilidad de botones de acción >> U09-02: asistente no ve Key/Shield/Edit/Trash; 'Nuevo Usuario' sí aparece (inconsistencia UI documentada)
- Location: e2e/11-usuarios-unificado.spec.ts:370:3

# Error details

```
TimeoutError: page.waitForLoadState: Timeout 15000ms exceeded.
```

# Test source

```ts
  40  |  */
  41  | 
  42  | import { test, expect, type APIRequestContext } from "@playwright/test";
  43  | import { loginAsAdmin } from "./helpers/auth";
  44  | 
  45  | // ── Datos únicos por corrida ────────────────────────────────────────────────
  46  | const TS = Date.now().toString().slice(-7);
  47  | 
  48  | const TEST_USER = {
  49  |   nombre:   `E2E Usuario ${TS}`,
  50  |   email:    `e2e.usr.${TS}@test.edupay.mx`,
  51  |   telefono: "55-1111-0001",
  52  |   role:     "asistente",   // bajo en la jerarquía → administrador_campus puede editarlo
  53  | };
  54  | const TEST_USER_NOMBRE_EDITADO = `E2E Editado ${TS}`;
  55  | 
  56  | const ASISTENTE = {
  57  |   nombre:   `E2E Asistente ${TS}`,
  58  |   email:    `e2e.asist.${TS}@test.edupay.mx`,
  59  |   password: `Asist${TS}E2e!`,
  60  | };
  61  | 
  62  | // ── Estado compartido entre tests ───────────────────────────────────────────
  63  | let adminToken    = "";
  64  | let adminAuthUser = "";   // JSON string de auth_user para restaurar la sesión
  65  | let createdUserId: number | null = null;
  66  | let asisteUserId: number | null  = null;
  67  | 
  68  | // ── beforeAll: login ÚNICO vía browser fixture ──────────────────────────────
  69  | // Evita múltiples llamadas a POST /api/auth/login (rate-limited: 10/15 min).
  70  | // Guarda token + auth_user en memoria; cada test los restaura en localStorage.
  71  | test.beforeAll(async ({ browser }) => {
  72  |   // Login UNA SOLA VEZ. Total de llamadas a /api/auth/login por corrida: 2
  73  |   // (aquí como admin + U09-02 como asistente). Límite: 10/15 min → no se agota
  74  |   // en uso normal. No se usa ningún endpoint de reset: la ruta no existe en el
  75  |   // servidor y nunca debe existir.
  76  |   const ctx  = await browser.newContext();
  77  |   const page = await ctx.newPage();
  78  | 
  79  |   await loginAsAdmin(page);
  80  | 
  81  |   // Capturar las tres claves de sesión que usa la app
  82  |   adminToken    = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
  83  |   adminAuthUser = await page.evaluate(() => localStorage.getItem("auth_user")  ?? "");
  84  | 
  85  |   expect(adminToken, "No se obtuvo auth_token tras loginAsAdmin en beforeAll").toBeTruthy();
  86  | 
  87  |   // Crear asistente para U09-02 usando Bearer (no llama a /api/auth/login)
  88  |   const createRes = await page.request.post("/api/users", {
  89  |     headers: { Authorization: `Bearer ${adminToken}` },
  90  |     data: {
  91  |       name:          ASISTENTE.nombre,
  92  |       email:         ASISTENTE.email,
  93  |       password_hash: ASISTENTE.password,   // el backend hashea internamente
  94  |       role:          "asistente",
  95  |       is_active:     true,
  96  |     },
  97  |     failOnStatusCode: false,
  98  |   });
  99  |   if (createRes.ok()) {
  100 |     const body = await createRes.json();
  101 |     asisteUserId = body.id ?? body.user?.id ?? null;
  102 |   } else {
  103 |     const txt = await createRes.text().catch(() => "");
  104 |     console.warn(`[U09] No se pudo crear asistente: HTTP ${createRes.status()} — ${txt.slice(0, 200)}`);
  105 |   }
  106 | 
  107 |   await ctx.close();
  108 | });
  109 | 
  110 | // ── afterAll: limpiar usuarios creados ─────────────────────────────────────
  111 | test.afterAll(async ({ request }) => {
  112 |   for (const id of [createdUserId, asisteUserId]) {
  113 |     if (id) {
  114 |       await request.delete(`/api/admin/users/${id}`, {
  115 |         headers: { Authorization: `Bearer ${adminToken}` },
  116 |         failOnStatusCode: false,
  117 |       });
  118 |     }
  119 |   }
  120 | });
  121 | 
  122 | // ── Helper: restaurar sesión de admin en la page sin re-hacer login ─────────
  123 | async function restoreAdminSession(page: any) {
  124 |   await page.goto("/");
  125 |   await page.evaluate(
  126 |     ({ token, user }: { token: string; user: string }) => {
  127 |       localStorage.setItem("auth_token", token);
  128 |       localStorage.setItem("auth_type",  "user");
  129 |       localStorage.setItem("auth_user",  user);
  130 |     },
  131 |     { token: adminToken, user: adminAuthUser }
  132 |   );
  133 |   await page.reload();
  134 |   await page.waitForLoadState("networkidle", { timeout: 15_000 });
  135 | }
  136 | 
  137 | // ── Helper: navegar a /usuarios y esperar el heading ───────────────────────
  138 | async function goToUsuarios(page: any) {
  139 |   await page.evaluate(() => window.history.pushState({}, "", "/usuarios"));
> 140 |   await page.waitForLoadState("networkidle", { timeout: 15_000 });
      |              ^ TimeoutError: page.waitForLoadState: Timeout 15000ms exceeded.
  141 |   await expect(
  142 |     page.getByRole("heading", { name: /gestión de usuarios/i })
  143 |   ).toBeVisible({ timeout: 10_000 });
  144 | }
  145 | 
  146 | // ── Helper: clicar botón de acción en la fila del usuario usando XPath ──────
  147 | async function clickAccionEnFila(page: any, nombre: string, actionTitle: string) {
  148 |   const xpath =
  149 |     `//h3[contains(normalize-space(text()),"${nombre}")]` +
  150 |     `/ancestor::div[.//button[@title="${actionTitle}"]][1]` +
  151 |     `//button[@title="${actionTitle}"]`;
  152 |   await page.locator(xpath).first().click();
  153 | }
  154 | 
  155 | // ── Helper: GET /api/users con admin token ──────────────────────────────────
  156 | async function getUsersViaApi(request: APIRequestContext): Promise<any[]> {
  157 |   const res = await request.get("/api/users", {
  158 |     headers: { Authorization: `Bearer ${adminToken}` },
  159 |     failOnStatusCode: true,
  160 |   });
  161 |   return res.json();
  162 | }
  163 | 
  164 | // ── Helper: obtener o crear usuario de prueba (fallback si U09-01-A falló) ──
  165 | async function obtenerOCrearUsuarioPrueba(
  166 |   request: APIRequestContext
  167 | ): Promise<number | null> {
  168 |   // Buscar primero por email (la mutación pudo completarse aunque el test fallara)
  169 |   const users = await getUsersViaApi(request);
  170 |   const existing = users.find((u: any) => u.email === TEST_USER.email);
  171 |   if (existing) return existing.id;
  172 | 
  173 |   const res = await request.post("/api/users", {
  174 |     headers: { Authorization: `Bearer ${adminToken}` },
  175 |     data: {
  176 |       name:          TEST_USER.nombre,
  177 |       email:         TEST_USER.email,
  178 |       password_hash: "TempPass123!",
  179 |       role:          "asistente",
  180 |       is_active:     true,
  181 |     },
  182 |     failOnStatusCode: false,
  183 |   });
  184 |   if (!res.ok()) return null;
  185 |   const b = await res.json();
  186 |   return b.id ?? b.user?.id ?? null;
  187 | }
  188 | 
  189 | // ═══════════════════════════════════════════════════════════════════════════
  190 | // U09-01: CICLO COMPLETO ADMIN — Crear → Ver en lista → Editar → Eliminar
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
```