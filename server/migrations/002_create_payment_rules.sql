-- Migration 002: Create payment_rules and late_fee_calculations tables
-- Source: shared/schema.ts:552-600 (Drizzle definitions ya existían; solo faltaba
--         aplicar la migración a la DB real).
-- Applied: 2026-08-07 via vitest probe script.
--
-- UP   → ejecutar todo el bloque de CREATE TABLE de abajo.
-- DOWN → ejecutar el siguiente bloque DROP (orden inverso por FK):
--
--   DROP TABLE IF EXISTS late_fee_calculations;
--   DROP TABLE IF EXISTS payment_rules;
--
-- Reversibilidad: ambas tablas eran nuevas y vacías al aplicarse;
-- no hay datos de producción en riesgo. El DROP es seguro mientras
-- late_fee_calculations no tenga filas que referencien payment_rules.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_rules (
  id                            SERIAL PRIMARY KEY,
  campus_id                     INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  tenant_id                     INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  description                   TEXT,
  rule_type                     TEXT NOT NULL,          -- 'percentage','fixed_amount','progressive','compound'
  is_active                     BOOLEAN NOT NULL DEFAULT true,

  -- Período de gracia
  grace_period_days             INTEGER NOT NULL DEFAULT 0,
  grace_period_unit             TEXT NOT NULL DEFAULT 'days', -- 'days','weeks'

  -- Recargo por porcentaje (tipo 'percentage' / 'compound')
  late_fee_percentage           NUMERIC(5,2),

  -- Recargo fijo en centavos (tipo 'fixed_amount')
  late_fee_fixed_amount_centavos INTEGER,

  -- Reglas progresivas (JSON)
  progressive_rules             TEXT,

  -- Límites
  max_late_fee_centavos         INTEGER,
  min_late_fee_centavos         INTEGER,

  -- Flags avanzados
  compound_daily                BOOLEAN NOT NULL DEFAULT false,
  applies_to_weekends           BOOLEAN NOT NULL DEFAULT false,
  applies_to_holidays           BOOLEAN NOT NULL DEFAULT false,

  -- Conceptos a los que aplica (JSON array)
  applies_to_concepts           TEXT,

  created_at                    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS late_fee_calculations (
  id                            SERIAL PRIMARY KEY,
  charge_id                     INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  payment_rule_id               INTEGER NOT NULL REFERENCES payment_rules(id) ON DELETE CASCADE,
  tenant_id                     INTEGER REFERENCES tenants(id),
  original_amount_centavos      INTEGER NOT NULL,
  due_date                      TIMESTAMP NOT NULL,
  adjusted_due_date             TIMESTAMP NOT NULL,
  calculation_date              TIMESTAMP NOT NULL,
  days_late                     INTEGER NOT NULL,
  late_fee_amount_centavos      INTEGER NOT NULL,
  calculation_details           TEXT,
  is_applied                    BOOLEAN NOT NULL DEFAULT false,
  created_at                    TIMESTAMP NOT NULL DEFAULT NOW()
);
