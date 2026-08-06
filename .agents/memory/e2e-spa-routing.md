---
name: E2E SPA routing – wouter
description: Cómo navegar y verificar autenticación en Playwright cuando la app usa wouter (sin cambio de URL al hacer login).
---

# E2E con SPA wouter

## Regla
La app usa wouter para el routing. El login **NO cambia la URL** — en cambio re-renderiza condicionalmente. `waitForURL(/\/admin/)` nunca se cumplirá después del login.

**Why:** App.tsx renderiza `<Login>` cuando `!user && !guardian`, y el dashboard cuando hay sesión. El state change es en React, no en la URL.

## Cómo aplicarlo

- **Verificar login exitoso:** esperar que el sidebar aparezca y que `#email` desaparezca
  ```ts
  await page.waitForSelector("nav, aside, [class*='sidebar']", { timeout: 15_000 });
  ```

- **Navegar entre rutas en tests:** usar pushState (wouter responde a history API)
  ```ts
  await page.evaluate(() => { window.history.pushState({}, "", "/estudiantes"); });
  await page.waitForLoadState("networkidle");
  ```

- **Verificar que el logout funciona:** esperar que `#email` vuelva a ser visible

- **Borrar sesión entre tests:**
  ```ts
  await page.evaluate(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_type");
    localStorage.removeItem("auth_user");
  });
  await page.reload();
  ```

## Selectores del form de login (login.tsx)
- Email: `#email` (Input con `id="email"`)
- Password: `#password` (Input con `id="password"`)
- Submit: `button[type="submit"]` (texto: "Ingresar al Sistema")
