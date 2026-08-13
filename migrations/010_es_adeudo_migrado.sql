-- Migración 010: charges.es_adeudo_migrado boolean
--
-- Contexto: la exención de recargo para adeudos heredados de sistemas anteriores
-- se modelaba como un valor especial de concepts.tipo ('adeudo_migrado').
-- Eso acoplaba DOS preguntas distintas en un solo campo:
--   ¿De qué se trata el cargo? (colegiatura, inscripción…)
--   ¿Es un adeudo migrado que no debe acumular mora?
--
-- Con esta columna cada charge lleva su propia bandera de "es adeudo migrado",
-- independiente del concepto al que apunte. Un charge con concept_id que apunta
-- a 'Colegiatura Agosto' puede ser es_adeudo_migrado = true (saldo anterior del
-- SAE/CONTPAQi que se migra conservando el nombre real del concepto para CFDI)
-- sin necesidad de un concepto ficticio 'adeudo_migrado'.
--
-- Puntos de exención que consumen esta columna (en producción al momento de la migración):
--   1. POST /api/admin/cargos/aplicar-recargos  → WHERE NOT c.es_adeudo_migrado
--   2. POST /api/charges/generate               → lateFee = 0 si es_adeudo_migrado=true
--
-- Rollback:
--   ALTER TABLE charges DROP COLUMN es_adeudo_migrado;

ALTER TABLE charges
  ADD COLUMN es_adeudo_migrado BOOLEAN NOT NULL DEFAULT FALSE;
