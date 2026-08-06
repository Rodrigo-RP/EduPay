---
name: Vitest fileParallelism
description: Tests comparten una DB real — fileParallelism:false previene contaminación entre archivos de test.
---

## Regla

`server/vitest.config.ts` debe tener `fileParallelism: false`.

**Why:** Los tests usan la misma base de datos PostgreSQL. Sin serialización de archivos, el `audit_retry_queue` y otras tablas de estado global reciben entradas de un test file mientras otro las procesa, produciendo falsos positivos (ej. `auditInsertCalls = 3` cuando se esperan 2).

**How to apply:** Ya está configurado. Si se agrega un nuevo test file que use `processAuditRetries()` directamente, también llamar `stopAuditRetryWorker()` en su `beforeAll` (ver audit-retry-race.md).
