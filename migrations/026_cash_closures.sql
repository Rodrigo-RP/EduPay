-- Cierres diarios de caja: snapshot auditable por campus y fecha.
-- La unicidad impide que dos solicitudes simultáneas cierren el mismo día.
CREATE TABLE IF NOT EXISTS cash_closures (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campus_id INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  closed_by_user_id INTEGER NOT NULL REFERENCES users(id),
  fecha DATE NOT NULL,
  efectivo_capturado_centavos BIGINT NOT NULL,
  efectivo_registrado_centavos BIGINT NOT NULL,
  ingresos_bancarios_centavos BIGINT NOT NULL,
  total_cobrado_centavos BIGINT NOT NULL,
  diferencia_efectivo_centavos BIGINT NOT NULL,
  pagos_procesados INTEGER NOT NULL,
  observaciones TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cash_closures_amounts_non_negative CHECK (
    efectivo_capturado_centavos >= 0
    AND efectivo_registrado_centavos >= 0
    AND ingresos_bancarios_centavos >= 0
    AND total_cobrado_centavos >= 0
    AND pagos_procesados >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_closures_campus_fecha_unique
  ON cash_closures (campus_id, fecha);

CREATE INDEX IF NOT EXISTS cash_closures_tenant_campus_created_idx
  ON cash_closures (tenant_id, campus_id, created_at DESC);