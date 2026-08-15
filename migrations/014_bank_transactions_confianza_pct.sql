-- Migración 014: bank_transactions.confianza_pct
--
-- Contexto: motor de conciliación con niveles de confianza porcentuales.
-- Agrega la columna que almacena el score calculado (0-100) en el momento
-- de conciliar. Las filas ya existentes con estado_conciliacion='conciliado'
-- conservan NULL — no se rellena retroactivamente y está bien así.
--
-- Niveles de interpretación:
--   100     → auto-conciliado sin revisión
--   90-99   → auto-conciliado, visible en cola de auditoría 24 h
--   70-89   → revisión sugerida, operador confirma
--   0-69    → aclaración manual
--   NULL    → conciliado antes de esta migración (sin score)
--
-- Rollback:
--   ALTER TABLE bank_transactions DROP COLUMN IF EXISTS confianza_pct;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS confianza_pct SMALLINT;
