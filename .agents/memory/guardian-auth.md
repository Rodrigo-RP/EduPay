---
name: Guardian authentication details
description: Rutas y campos correctos para autenticación de tutores/padres de familia.
---

## Reglas

1. **Ruta de login de tutores**: `POST /api/auth/guardian-login` — NO `/api/guardian/login`.
2. **getGuardianByEmail** en `storage.ts` debe buscar PRIMERO por `guardians.email` y luego por `guardians.correo_institucional_familiar`. Ambos campos pueden contener el email de acceso.
3. **Middleware de tutor**: `authenticateGuardian` verifica `decoded.type === 'guardian'`.

**Why:** El schema tiene dos campos de email por compatibilidad histórica: `email` (campo legacy) y `correo_institucional_familiar` (campo nuevo obligatorio del sistema mexicano). Los guardians del seed demo se insertan con ambos campos iguales.

La sesión del padre tiene acceso y recuperación propios: un 401 o 403 en el
portal debe llevar al acceso de padres, nunca al acceso administrativo.

**Why:** Es una regla explícita de Rodrigo; los padres no son personal de la
escuela y no deben terminar en un flujo que les pida credenciales del personal.

**How to apply:** Preservar esa separación también en proveedores compartidos,
consultas auxiliares, expiración y nuevas pantallas del portal.
