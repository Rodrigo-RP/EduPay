-- Añade columna de notas de conciliación a bank_transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS nota_conciliacion TEXT;
