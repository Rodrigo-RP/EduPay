---
name: Bank transactions importar blindaje
description: Decisiones de diseño y deudas técnicas del endpoint POST /api/conciliacion/importar y transferencia-manual tras el blindaje completo.
---

# Bank transactions — importar + transferencia-manual

## Reglas

- **Guard**: `hasPermissionForUser(PAYMENTS.PROCESS)` — mismo rol que `transferencia-manual`. Justificación: dominio financiero, no SYSTEM.IMPORT.
- **Dedup**: migración 016 añade `UNIQUE INDEX bank_transactions_dedup ON (campus_id, fecha, monto_centavos, referencia) WHERE referencia IS NOT NULL`. Filas sin referencia (NULL) nunca se deducan — múltiples NULLs coexisten. `ON CONFLICT DO NOTHING` solo dispara cuando referencia presente y hay duplicado.
- **Contador**: usar `result.rowCount === 1` (no `importadas++`). Respuesta devuelve `{ successful, skipped, failed[], committed }`.  `skipped` = ON CONFLICT deduplicadas (no es error). `failed` = validación de fila o error de DB.
- **tenant_id**: escribir desde JWT en cada INSERT — antes quedaba NULL. `transferencia-manual` tiene el mismo fix.
- **Atomicidad**: BEGIN + SAVEPOINT por fila + COMMIT|ROLLBACK (patrón admin.ts importar). Error de fila → ROLLBACK TO SAVEPOINT + failed[]; error fatal → ROLLBACK completo + 500.
- **dry_run**: ROLLBACK + `committed: false`, mismos conteos.
- **Auditoría**: `enqueueAuditLog` post-COMMIT con `action='BANK_TRANSACTIONS_IMPORT'` (importar) / `'BANK_TRANSACTION_MANUAL'` (transferencia-manual).

## Por qué dedup parcial (no total)

Filas sin referencia son válidas (algunos movimientos de nómina, comisiones bancarias no traen referencia). Un UNIQUE constraint total daría falsos positivos. El índice parcial `WHERE referencia IS NOT NULL` cubre el caso donde el estado de cuenta se vuelve a importar idempotentemente.

## Backfill tenant_id (migración 016)

53/81 filas tenían `tenant_id=NULL`. Backfill: `UPDATE bank_transactions SET tenant_id = (SELECT tenant_id FROM campuses WHERE id = bank_transactions.campus_id) WHERE tenant_id IS NULL AND campus_id IS NOT NULL`. Campus→tenant es 1-a-1, determinista.

## Cómo aplicar

- Al añadir nuevos INSERT a `bank_transactions`, siempre incluir `tenant_id` desde el JWT/contexto.
- Al diseñar el parser CSV/Excel bancario futuro, el endpoint importar ya está listo para recibir `{ fecha, descripcion, monto, tipo, referencia, clabe, nombre }[]`.
