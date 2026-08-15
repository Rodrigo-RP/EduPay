---
name: Protocolo Auditoría — reglas de código
description: Reglas no negociables de docs/PROTOCOLO-AUDITORIA.md §5 que deben consultarse ANTES de escribir cualquier endpoint o mecanismo de test.
---

# Reglas §5 — PROTOCOLO-AUDITORIA.md (no negociables)

## Regla crítica: nunca ruta condicionada por NODE_ENV

NUNCA registrar una ruta HTTP condicionada por `process.env.NODE_ENV`:

```typescript
// ❌ PROHIBIDO — violación de §5
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test/algo', handler);
}

// ❌ TAMBIÉN PROHIBIDO
app.post('/api/test/algo', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({});
  // hacer algo peligroso
});
```

**Why:** Este patrón apareció cuatro veces en auditorías de seguridad. En modo development es alcanzable sin restricción por cualquier persona con acceso al dominio. No hay guard suficientemente estricto — la solución es que la ruta no exista.

**How to apply:** Si necesitas un mecanismo solo-para-test, expórtalo como función desde el módulo correspondiente e impórtalo directamente en los archivos de test. Nunca como ruta HTTP.

## Patrón correcto para reset de rate limiters en tests

```typescript
// ✅ CORRECTO — en tests/setup.ts (setupFiles de vitest)
import { resetApiAuthRateLimitStore, resetPaymentRateLimitStore, resetLoginRateLimitStore } from '../security-middleware';
beforeAll(() => {
  resetApiAuthRateLimitStore();
  resetPaymentRateLimitStore();
  resetLoginRateLimitStore();
});
```

## Otras reglas §5

- Todo endpoint que lea/escriba datos de otro usuario: verificar rol, no solo `authenticateToken`. Revisar también alias sin parámetro de campus.
- No confiar en `shared/schema.ts` como fuente de verdad de la DB — verificar con `information_schema`.
- Todo pago/cambio financiero debe ser atómico (`SELECT ... FOR UPDATE`).
- Nunca borrar tests que reproducen vulnerabilidades — invertirlos como regresión permanente.

## Procedimiento si el protocolo no está en contexto activo

Antes de implementar cualquier mecanismo "solo para tests" o "solo en development": buscar y leer `docs/PROTOCOLO-AUDITORIA.md` primero.
