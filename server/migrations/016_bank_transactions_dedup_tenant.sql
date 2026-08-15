-- Migration 016: dedup index + tenant_id backfill para bank_transactions
--
-- 1. Índice UNIQUE parcial: cuando referencia está presente, impide duplicados.
--    Filas sin referencia (NULL) no se deducan — PostgreSQL trata NULLs como
--    distintos en índices UNIQUE, por lo que múltiples filas con referencia=NULL
--    coexisten sin conflicto.
--
-- 2. Backfill tenant_id: 53/81 filas tienen tenant_id NULL porque los endpoints
--    importar y transferencia-manual no lo escribían. El campus→tenant es 1-a-1
--    (campuses.tenant_id FK), así que la recuperación es determinista.

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_dedup
  ON bank_transactions (campus_id, fecha, monto_centavos, referencia)
  WHERE referencia IS NOT NULL;

UPDATE bank_transactions
SET    tenant_id = (SELECT tenant_id FROM campuses WHERE id = bank_transactions.campus_id)
WHERE  tenant_id IS NULL
  AND  campus_id IS NOT NULL;
