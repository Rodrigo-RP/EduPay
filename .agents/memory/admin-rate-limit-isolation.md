---
name: Admin rate-limit isolation
description: Regla para proteger el rate limit administrativo sin mezclar sesiones ni permitir bucles de tokens inválidos.
---

# Rate limit administrativo

Las rutas administrativas deben validar el JWT antes de aplicar su rate limit. El bucket se identifica por `tenant_id` y `user.id`; los rechazos de tokens vencidos o inválidos no deben consumir ese presupuesto.

**Why:** Un limiter basado en IP mezcla sesiones distintas detrás de un proxy. Además, un cliente con un JWT restaurado pero ya inválido puede repetir una consulta de arranque y convertir sus propios rechazos 401/403 en 429 para el panel.

**How to apply:** Mantener `authenticateToken` antes de `rateLimits.apiAuth` en los prefijos administrativos y conservar un fallback que nunca guarde el bearer token en texto plano. Los clientes que detecten 401/403 en la comprobación de onboarding deben limpiar su sesión local y volver al acceso.