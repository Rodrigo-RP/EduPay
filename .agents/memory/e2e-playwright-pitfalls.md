---
name: Playwright E2E pitfalls
description: Strict-mode violations, selector specificity y otros gotchas recurrentes en los tests E2E
---

## 1. Strict-mode violation con texto que aparece en múltiples nodos

`getByText(regex)` falla si el mismo texto aparece en el DOM en >1 nodo.
Causas comunes:
- El `ToastTitle` visible + el nodo `aria-live` del sistema de accesibilidad (mismo texto).
- Un `h3` en el fondo + el `DialogDescription` del modal abierto (mismo texto en el diálogo).

**Fix:** `.first()` en el locator, o scope al dialog:
```typescript
// Toast
await expect(page.getByText(/usuario creado exitosamente/i).first()).toBeVisible();

// Texto dentro del modal (evita capturar el h3 del fondo)
const dialog = page.getByRole("dialog");
await expect(
  dialog.getByText(new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first()
).toBeVisible();
```

## 2. Selectores genéricos capturan nodos del sidebar/layout

`page.locator("h3")` captura todos los `h3` de la página, incluidos headings del sidebar,
secciones de navegación, etc. Usar selectores con clase para aislar el contenido real:
```typescript
// En usuarios-unificado.tsx, las filas de usuario usan:
page.locator("h3.font-semibold.text-slate-900")
```

## 3. `test.use({ storageState: path })` requiere archivo existente en tiempo de creación de contexto

Playwright intenta leer el archivo de storage state cuando crea el browser context (antes de
que los tests corran, posiblemente antes del `beforeAll`). Si el `beforeAll` crea el archivo,
hay una race condition. Usar restauración manual vía `localStorage.setItem` en `beforeEach` en su lugar.

## 4. Rate limit de auth se agota en corridas consecutivas

Ver `e2e-auth-session-pattern.md` para el patrón completo.
Usar el endpoint `/api/test/reset-rate-limits` al inicio del `beforeAll`.

## 5. SPA wouter: navegación por pushState, no por goto

La app es SPA con wouter. `page.goto('/usuarios')` hace una petición HTTP real y puede
cargar sin auth. Usar:
```typescript
await page.goto('/');  // carga la SPA con la sesión
// luego:
await page.evaluate(() => window.history.pushState({}, "", "/usuarios"));
await page.waitForLoadState("networkidle");
```
