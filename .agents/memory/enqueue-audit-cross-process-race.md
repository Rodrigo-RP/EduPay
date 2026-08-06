---
name: enqueueAuditLog cross-process race
description: Por qué ninguna estrategia de afterAll puede observar cuándo termina enqueueAuditLog cuando servidor y test son procesos separados, y el patrón correcto para limpiar sin contaminar audit_retry_queue.
---

# enqueueAuditLog — carrera cross-process en tests

## La regla
Cuando un test llama a un endpoint vía HTTP y ese endpoint dispara `enqueueAuditLog` (fire-and-forget), el `afterAll` **no puede** detectar de forma fiable cuándo el INSERT en `audit_retry_queue` completó. El sondeo debe hacerse **dentro del cuerpo del `it`** que provocó el enqueue, antes de que el bloque termine.

**Why:** `enqueueAuditLog` corre en el proceso del servidor (puerto 5000). Los tests son clientes HTTP. Cualquier variable del servidor (`_inflightEnqueueCount`, Promises pendientes) es invisible desde el proceso de test. Las tres estrategias de afterAll que se probaron fallaron:

| Estrategia | Fallo |
|---|---|
| Espera fija 300 ms | INSERT puede llegar después del await |
| Poll de estabilización DB (count igual 2×) | `0,0` no distingue "limpio" de "INSERT aún no llegó" |
| Contador `inflightEnqueueCount` exportado | Siempre 0 en proceso de test; no comparte memoria con servidor |

## How to apply
En cualquier `it` que llame a un endpoint que pueda disparar `enqueueAuditLog`, añadir al final del bloque:

```typescript
// Esperar a que enqueueAuditLog complete su INSERT (fire-and-forget del servidor)
const POLL_MS = 50;
const deadline = Date.now() + 2_000;
let found = false;
while (!found) {
  const qr = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_retry_queue
     WHERE (payload->>'tenant_id')::int = $1
       AND <condición específica del test>`,
    [tenantId]
  );
  found = (qr.rows[0] as any).n > 0;
  if (found) break;
  if (Date.now() >= deadline) break; // si FK no aplica, no habrá fila nunca
  await new Promise<void>(r => setTimeout(r, POLL_MS));
}
```

El `afterAll` solo necesita:
1. `DELETE FROM audit_retry_queue WHERE (payload->>'tenant_id')::int = $1`
2. Cleanup normal (audit_log, bank_transactions, users, campuses, tenants)
3. Segunda pasada DELETE (seguro) → si encuentra filas, `throw` explícito

## Archivo corregido
`server/tests/bug-audit-log-rollback.test.ts` — PASO 2 tiene el sondeo al final del `it`; afterAll tiene dos pasadas de DELETE + throw si la segunda encuentra algo.

## Validado con
10 corridas consecutivas del archivo — `Tests 3 passed (3)` en todas; `audit_retry_queue` vacía al final.
