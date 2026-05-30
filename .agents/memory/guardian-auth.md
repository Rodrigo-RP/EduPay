---
name: Guardian authentication details
description: Rutas y campos correctos para autenticación de tutores/padres de familia.
---

## Reglas

1. **Ruta de login de tutores**: `POST /api/auth/guardian-login` — NO `/api/guardian/login`.
2. **getGuardianByEmail** en `storage.ts` debe buscar PRIMERO por `guardians.email` y luego por `guardians.correo_institucional_familiar`. Ambos campos pueden contener el email de acceso.
3. **Middleware de tutor**: `authenticateGuardian` verifica `decoded.type === 'guardian'`.

**Why:** El schema tiene dos campos de email por compatibilidad histórica: `email` (campo legacy) y `correo_institucional_familiar` (campo nuevo obligatorio del sistema mexicano). Los guardians del seed demo se insertan con ambos campos iguales.
