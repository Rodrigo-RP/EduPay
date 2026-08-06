---
name: audit_retry_queue — fuente de contaminación por tests con tenants efímeros
description: Qué archivo causa filas dead/pending permanentes en audit_retry_queue, cómo identificarlas, y cómo limpiarlas.
---

# audit_retry_queue — contaminación por tests con tenants efímeros

## La fuente
`server/tests/bug-audit-log-rollback.test.ts` — PASO 2 crea un usuario, lo elimina, y llama al endpoint descartar con su JWT. El endpoint encola el fallo de audit en `audit_retry_queue`. Si el tenant se borra antes de que el retry worker procese la fila → `audit_log_tenant_id_fkey` violation → fila queda `dead`.

## Identificar filas contaminadas
```sql
-- Filas cuyo tenant ya no existe (irrecuperables)
SELECT id, status, payload->>'tenant_id' AS tid, payload->'metadata'
FROM audit_retry_queue
WHERE (payload->>'tenant_id')::int NOT IN (SELECT id FROM tenants)
ORDER BY id;
```

Patrón en metadata: `referencia: "ref-deleted-user-{timestamp}"`, `motivo: "Usuario ya no existe en la DB"`.

## Limpiar filas huérfanas
```sql
DELETE FROM audit_retry_queue
WHERE (payload->>'tenant_id')::int NOT IN (SELECT id FROM tenants);
```

`audit_retry_queue` NO tiene FK sobre `tenant_id` (está en JSONB), así que el DELETE funciona aunque el tenant ya no exista.

## Limpiar tenants que quedaron sin borrar (afterAll abortó por throw)
```sql
-- Verificar si existen
SELECT id FROM tenants WHERE id IN (<lista de tenant_ids de las filas dead>);

-- Si existen, limpiar en orden FK:
DELETE FROM audit_retry_queue WHERE (payload->>'tenant_id')::int IN (<ids>);
DELETE FROM audit_log WHERE tenant_id IN (<ids>);
DELETE FROM bank_transactions WHERE tenant_id IN (<ids>);
DELETE FROM users WHERE tenant_id IN (<ids>);
DELETE FROM campuses WHERE tenant_id IN (<ids>);
DELETE FROM tenants WHERE id IN (<ids>);
```

## Estado después del fix
La tabla queda vacía después de cada corrida. Ver `enqueue-audit-cross-process-race.md` para el patrón correcto del afterAll.
