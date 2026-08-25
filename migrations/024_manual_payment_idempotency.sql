-- Evita que un reintento de la misma captura manual cree otro payment.
-- Sólo las referencias con namespace manual: representan una clave de
-- idempotencia. Referencias de pasarela/SPEI pueden aplicarse a varios cargos.
CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_referencia_pasarela_uidx
  ON payments (tenant_id, referencia_pasarela)
  WHERE referencia_pasarela LIKE 'manual:%';