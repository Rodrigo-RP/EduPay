-- Migration 015: añadir conciliado_at a bank_transactions
--
-- Timestamp del momento en que la transacción bancaria fue conciliada.
-- Null mientras esté pendiente.
-- Usado por la cola de revisión de supervisor (confianza_pct 90-99):
--   WHERE confianza_pct BETWEEN 90 AND 99
--     AND estado_conciliacion = 'conciliado'
--     AND conciliado_at >= NOW() - INTERVAL '24 hours'

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS conciliado_at TIMESTAMPTZ;
