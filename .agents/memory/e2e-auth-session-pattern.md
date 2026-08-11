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

test.beforeAll(async ({ browser, request }) => {
  // 1. Resetear rate-limit (endpoint test-only; gated en NODE_ENV !== 'production')
  await request.post("/api/test/reset-rate-limits", { failOnStatusCode: false });
  // 2. Login único
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsAdmin(page);
  adminToken    = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
  adminAuthUser = await page.evaluate(() => localStorage.getItem("auth_user")  ?? "");
  await ctx.close();
});

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

## Endpoint de reset (server/routes/auth.ts)

```typescript
if (process.env.NODE_ENV !== "production") {
  app.post("/api/test/reset-rate-limits", (_req, res) => {
    resetLoginRateLimitStore();
    resetPaymentRateLimitStore();
    res.json({ ok: true });
  });
}
```

El `_authLimiterStore` está declarado en `security-middleware.ts` junto a `_paymentLimiterStore`.
`resetLoginRateLimitStore()` hace `resetKey` para `::1`, `127.0.0.1`, `::ffff:127.0.0.1`.
