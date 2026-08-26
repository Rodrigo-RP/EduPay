-- MIGRACIÓN 030: acumulación mensual de recargos
-- Mantiene recargo_aplicado_centavos como total denormalizado y agrega un
-- ledger idempotente por cargo/mes para no duplicar incrementos.

ALTER TABLE payment_surcharge_rules
  ADD COLUMN IF NOT EXISTS modo_acumulacion TEXT NOT NULL DEFAULT 'ninguno',
  ADD COLUMN IF NOT EXISTS tipo_incremento_mensual TEXT,
  ADD COLUMN IF NOT EXISTS incremento_mensual_centavos INTEGER,
  ADD COLUMN IF NOT EXISTS incremento_mensual_porcentaje NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS fecha_inicio_acumulacion DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_surcharge_rules_modo_acumulacion_check'
  ) THEN
    ALTER TABLE payment_surcharge_rules
      ADD CONSTRAINT payment_surcharge_rules_modo_acumulacion_check
      CHECK (modo_acumulacion IN ('ninguno', 'incremento_fijo', 'compuesto'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_surcharge_rules_tipo_incremento_mensual_check'
  ) THEN
    ALTER TABLE payment_surcharge_rules
      ADD CONSTRAINT payment_surcharge_rules_tipo_incremento_mensual_check
      CHECK (tipo_incremento_mensual IS NULL OR tipo_incremento_mensual IN ('monto', 'porcentaje'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS charge_surcharge_periods (
  id SERIAL PRIMARY KEY,
  charge_id INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  payment_rule_id INTEGER REFERENCES payment_surcharge_rules(id) ON DELETE SET NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  campus_id INTEGER NOT NULL REFERENCES campuses(id),
  periodo_mes DATE NOT NULL,
  modo_acumulacion TEXT NOT NULL
    CHECK (modo_acumulacion IN ('ninguno', 'incremento_fijo', 'compuesto')),
  saldo_base_centavos INTEGER NOT NULL CHECK (saldo_base_centavos >= 0),
  recargo_anterior_centavos INTEGER NOT NULL CHECK (recargo_anterior_centavos >= 0),
  incremento_centavos INTEGER NOT NULL CHECK (incremento_centavos >= 0),
  recargo_total_centavos INTEGER NOT NULL CHECK (recargo_total_centavos >= 0),
  formula_detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  aplicado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT charge_surcharge_periods_charge_month_unique
    UNIQUE (charge_id, periodo_mes)
);

CREATE INDEX IF NOT EXISTS idx_charge_surcharge_periods_scope
  ON charge_surcharge_periods (tenant_id, campus_id, periodo_mes);
