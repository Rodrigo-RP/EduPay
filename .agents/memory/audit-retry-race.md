---
name: Audit retry race condition en tests
description: El worker de audit-retry debe detenerse en beforeAll de tests que llamen processAuditRetries() directamente.
---

# Audit Retry — Race Condition en Tests

## Regla
Los tests que importan `processAuditRetries` de `audit-retry.ts` deben llamar `stopAuditRetryWorker()` en `beforeAll`, justo después de `initAuditRetryQueue()`.

## Why
`initAuditRetryQueue()` inicia un `setInterval` de 30 segundos en el proceso de tests. Si ese timer dispara mientras el test tiene un `vi.spyOn(pool, 'query')` activo, el worker del proceso de tests puede procesar la fila antes de que el test la verifique, causando falla intermitente ("expected 'pending', received 'done'").

## How to apply
```typescript
beforeAll(async () => {
  await initAuditRetryQueue();
  stopAuditRetryWorker(); // evita race con el setInterval del proceso de test
  ...
});
```

La exportación `stopAuditRetryWorker` ya existe en `server/audit-retry.ts`.
