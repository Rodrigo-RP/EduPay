-- Motor de becas automáticas real e idempotente.
ALTER TABLE scholarship_auto_rules
  ADD COLUMN IF NOT EXISTS ciclo_escolar VARCHAR(50),
  ADD COLUMN IF NOT EXISTS vigencia_inicio DATE,
  ADD COLUMN IF NOT EXISTS vigencia_fin DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarship_auto_rules_percentage_check') THEN
    ALTER TABLE scholarship_auto_rules
      ADD CONSTRAINT scholarship_auto_rules_percentage_check
      CHECK (descuento_porcentaje > 0 AND descuento_porcentaje <= 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarship_auto_rules_type_check') THEN
    ALTER TABLE scholarship_auto_rules
      ADD CONSTRAINT scholarship_auto_rules_type_check
      CHECK (tipo = 'hermanos') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarship_auto_rules_destination_check') THEN
    ALTER TABLE scholarship_auto_rules
      ADD CONSTRAINT scholarship_auto_rules_destination_check
      CHECK (aplica_a IN ('todos', 'segundo_hijo', 'tercer_hijo')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarship_auto_rules_cycle_check') THEN
    ALTER TABLE scholarship_auto_rules
      ADD CONSTRAINT scholarship_auto_rules_cycle_check
      CHECK (ciclo_escolar IS NULL OR ciclo_escolar ~ '^[0-9]{4}-[0-9]{4}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarship_auto_rules_dates_check') THEN
    ALTER TABLE scholarship_auto_rules
      ADD CONSTRAINT scholarship_auto_rules_dates_check
      CHECK (vigencia_inicio IS NULL OR vigencia_fin IS NULL OR vigencia_fin >= vigencia_inicio) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS scholarship_auto_assignments (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES scholarship_auto_rules(id) ON DELETE CASCADE,
  scholarship_id INTEGER REFERENCES scholarships(id) ON DELETE SET NULL,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  campus_id INTEGER NOT NULL REFERENCES campuses(id),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  ciclo_escolar VARCHAR(50) NOT NULL,
  porcentaje_aplicado NUMERIC(5,2) NOT NULL,
  porcentaje_manual NUMERIC(5,2),
  estado VARCHAR(40) NOT NULL DEFAULT 'aplicada',
  motivo_resultado VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT scholarship_auto_assignments_rule_student_cycle_uq
    UNIQUE (rule_id, student_id, ciclo_escolar)
);

CREATE INDEX IF NOT EXISTS idx_scholarship_auto_assignments_scope
  ON scholarship_auto_assignments (tenant_id, campus_id, ciclo_escolar);
CREATE INDEX IF NOT EXISTS idx_scholarship_auto_assignments_alerts
  ON scholarship_auto_assignments (tenant_id, campus_id, estado);

CREATE TABLE IF NOT EXISTS charge_scholarship_applications (
  id SERIAL PRIMARY KEY,
  charge_id INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  scholarship_id INTEGER NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  effective_percentage NUMERIC(5,2) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'automatico',
  applied_at TIMESTAMP DEFAULT NOW(),
  recalculated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT charge_scholarship_applications_charge_scholarship_uq
    UNIQUE (charge_id, scholarship_id)
);

CREATE INDEX IF NOT EXISTS idx_charge_scholarship_applications_tenant
  ON charge_scholarship_applications (tenant_id, charge_id);