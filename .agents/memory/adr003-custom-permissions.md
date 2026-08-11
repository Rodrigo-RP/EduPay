---
name: ADR-003 custom_permissions migration
description: Implementación de permisos por usuario (hasPermissionForUser) — qué cambió, patrones, y trampas de test.
---

## Qué se hizo

- `authenticateToken` y `requireAuth` en `server/routes/shared.ts` hacen un SELECT de `custom_permissions` de la DB en cada request (Decisión 1 ADR-003). La revocación tiene efecto inmediato sin re-login.
- `hasPermissionForUser(user, module, action, scope?)` exportado desde `server/routes/shared.ts`: evalúa `hasPermission(user.role, ...)` primero; solo si falla busca `${module}.${action}` en `user.custom_permissions`.
- **88 llamadas** a `hasPermission(role/user.role/req.user?.role/actor.role, ...)` en 9 archivos de rutas migradas mecánicamente a `hasPermissionForUser(user/req.user/(req as any).user/actor, ...)`.

## Clave del módulo

- `custom_permissions` es `text[]` en la tabla `users`. Clave del permiso: `"${MODULES.X}.${ACTIONS.Y}"` (e.g., `"charges.create"`).
- `hasPermissionForUser` vive en `server/routes/shared.ts`, importa `hasPermission` de `@shared/permissions`.
- Los archivos de rutas ahora importan `{ MODULES, ACTIONS }` de `@shared/permissions` y `{ hasPermissionForUser }` de `"./shared"` (ya NO importan `hasPermission` directamente).

## Rate limit y tests

**Por qué:** `rateLimits.apiAuth` (300 req/5min para `/api/admin`) usa un `MemoryStore` compartido. Corridas consecutivas de la suite dentro de la misma ventana acumulan el contador y generan 429 en tests posteriores.

**Patrón correcto:** cualquier archivo de test que añada peticiones a `/api/admin` debe llamar `resetApiAuthRateLimitStore()` (importado de `../security-middleware`) en su `beforeAll` y `afterAll`. El mismo patrón ya existía para `resetPaymentRateLimitStore` y `resetLoginRateLimitStore`.

**Trampa de comparación JSON:** si el reporter JSON se corre como corrida extra (luego de la suite verbose), el bucket del rate limiter ya tiene carga acumulada → aparecen "regresiones" falsas (PM-01/02/03, STC-02/03/05). La corrida definitiva debe hacerse con el servidor recién reiniciado (bucket vacío).

## Why

Decisión 1 del ADR-003: la fuente de verdad son los permisos en DB, no el JWT. El JWT no caduca al revocar permisos; si custom_permissions viajan en el JWT, un admin que revoca el permiso solo tiene efecto al expirar el token. Con la DB como fuente de verdad, la revocación es inmediata.
