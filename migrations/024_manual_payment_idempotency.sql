-- Evita que un reintento de la misma captura manual cree otro payment.
-- La referencia se genera en el cliente una vez por intento y se conserva
-- si la respuesta de red falla después de que el servidor hizo COMMIT.
CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_referencia_pasarela_uidx
  ON payments (tenant_id, referencia_pasarela)
  WHERE referencia_pasarela IS NOT NULL;