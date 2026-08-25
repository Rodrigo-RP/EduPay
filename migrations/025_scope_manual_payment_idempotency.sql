-- Corrige instalaciones que recibieron la versión inicial de la migración 024:
-- la misma referencia SPEI puede generar una aplicación por cada cargo.
DROP INDEX IF EXISTS payments_tenant_referencia_pasarela_uidx;

CREATE UNIQUE INDEX payments_tenant_referencia_pasarela_uidx
  ON payments (tenant_id, referencia_pasarela)
  WHERE referencia_pasarela LIKE 'manual:%';