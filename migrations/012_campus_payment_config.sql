-- Migración 012: campus_payment_config
--
-- Contexto: el módulo de pagos reales (Stripe Connect) necesita saber
-- qué cuenta conectada (acct_XXXX) corresponde a cada campus, y si esa
-- cuenta ya completó el onboarding de Stripe (charges_enabled,
-- payouts_enabled, details_submitted).
--
-- Decisión de diseño validada contra documentación Stripe (agosto 2026):
--   • stripe_account_id  → identificador público acct_XXXX, NO es secreto.
--   • La clave secreta de la plataforma (sk_live_/sk_test_) vive en Replit
--     Secrets (STRIPE_SECRET_KEY), nunca en esta tabla ni en ninguna fila DB.
--   • No se guarda publishable key por cuenta; la de la plataforma sirve
--     para todas (confirmado: destination charges no requieren stripeAccount
--     client-side; el acct_ solo viaja en headers server-side).
--   • Los tres booleanos reflejan los campos reales del objeto Account de
--     Stripe; se actualizan vía webhook account.updated (próxima ronda).
--
-- Rollback:
--   DROP TABLE campus_payment_config;

CREATE TABLE IF NOT EXISTS campus_payment_config (
  id                  SERIAL PRIMARY KEY,
  campus_id           INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  tenant_id           INTEGER NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  payment_provider    VARCHAR(50)  NOT NULL DEFAULT 'stripe',
  stripe_account_id   VARCHAR(255),
  charges_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campus_payment_config_campus_id_unique UNIQUE (campus_id)
);

CREATE INDEX IF NOT EXISTS idx_campus_payment_config_tenant
  ON campus_payment_config (tenant_id);
