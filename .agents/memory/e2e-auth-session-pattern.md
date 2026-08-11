---
name: E2E auth session pattern
description: Cómo estructurar beforeAll/beforeEach en E2E para evitar rate-limit en /api/auth/login
---

## Regla

El rate-limiter de `/api/auth/login` es 10 req / 15 min por IP. Con corridas iterativas
durante desarrollo se agota fácilmente. Los tests E2E deben:

1. **Login UNA SOLA VEZ** en `test.beforeAll` usando la fixture `browser` (no `request`).
2. **Capturar las tres keys de sesión** de `localStorage` después del login:
   - `auth_token` (JWT)
   - `auth_type` (`"user"` para staff, `"guardian"` para tutores)
   - `auth_user` (JSON del usuario)
3. **Restaurar la sesión** en cada `test.beforeEach` vía `page.evaluate()` + `page.reload()`,
   sin re-llamar al endpoint de login.
4. Para variantes con otro rol (e.g. asistente en U09-02): `localStorage.removeItem(...)` +
   login UI del nuevo usuario (una sola llamada extra al endpoint).

**Why:** `test.use({ storageState: file })` falla si el archivo no existe antes de que
Playwright intente leerlo al crear el contexto del navegador — incluso si `beforeAll` lo crea
justo antes. La restauración manual vía `localStorage.setItem` en `beforeEach` es más fiable.

## Patrón de código

```typescript
let adminToken    = "";
let adminAuthUser = "";

// beforeAll: fixture 'browser' (no 'request') — login UI una sola vez
test.beforeAll(async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsAdmin(page);
  adminToken    = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
  adminAuthUser = await page.evaluate(() => localStorage.getItem("auth_user")  ?? "");
  await ctx.close();
});

// beforeEach: restaurar sesión sin re-llamar al endpoint de login
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type",  "user");
    localStorage.setItem("auth_user",  user);
  }, { token: adminToken, user: adminAuthUser });
  await page.reload();
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
});
```

## Por qué NO hay endpoint HTTP de reset

Un endpoint `POST /api/test/reset-rate-limits` gateado en `NODE_ENV !== 'production'` es
inseguro: el servidor siempre corre en `development` en este entorno (Replit), así que la
ruta quedaría pública y funcional sin token. El mismo resultado con `NODE_ENV === 'test'`
sería inútil porque los tests E2E corren contra el servidor en modo `development`.

La solución correcta es no necesitar el endpoint: con 2 llamadas a `/api/auth/login` por
corrida (1 admin en beforeAll + 1 asistente en U09-02), el límite de 10/15 min no se agota
en uso normal.

`resetLoginRateLimitStore()` existe en `security-middleware.ts` para uso directo desde
Vitest tests (mismo proceso que el servidor) — no requiere HTTP.

## SPA catch-all y rutas inexistentes

Esta app sirve `index.html` con HTTP 200 para cualquier path desconocido (client-side routing).
POST a una ruta no registrada en Express devuelve 200 + HTML, no 404. Para distinguir si
una ruta existe: verificar `Content-Type: text/html` (SPA) vs `application/json` (Express).
