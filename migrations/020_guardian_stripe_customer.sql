-- Migración 020: Customer Stripe persistido por tutor
-- ─────────────────────────────────────────────────────────────────────────────
-- SPEI vía Stripe customer_balance requiere un Customer. La referencia se guarda
-- en guardians para reutilizarlo entre intentos y evitar crear Customers nuevos
-- para el mismo tutor. Nullable: los tutores que nunca pagan con Stripe no se
-- modifican.
--
-- La relación PaymentIntent ↔ cargos pendientes se persiste en payments:
-- referencia_pasarela = pi_..., estado = 'pendiente'. No se requiere una tabla
-- paralela; el webhook firma + completa esos payments de forma transaccional.
--
-- DOWN:
--   ALTER TABLE guardians DROP COLUMN IF EXISTS stripe_customer_id;

ALTER TABLE guardians
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_guardians_stripe_customer_id
  ON guardians (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;