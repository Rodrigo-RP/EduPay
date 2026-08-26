-- MIGRACIÓN 031: vencimientos por periodicidad
--
-- Las reglas mensuales conservan el nombre textual por compatibilidad, pero
-- concept_id pasa a ser la asociación canónica. Los conceptos no mensuales
-- utilizan una fecha explícita por ciclo y periodo académico.

ALTER TABLE payment_due_dates
  ADD COLUMN IF NOT EXISTS concept_id INTEGER REFERENCES concepts(id);

-- Sólo asociar configuraciones cuyo nombre identifica exactamente un concepto
-- dentro del mismo campus/tenant. Los casos no únicos permanecen NULL para
-- revisión explícita; no se inventa una relación.
WITH unique_matches AS (
  SELECT
    pd.id AS due_date_id,
    MIN(c.id) AS concept_id
  FROM payment_due_dates pd
  JOIN concepts c
    ON c.campus_id = pd.campus_id
   AND c.nombre = pd.concepto
   AND (
     pd.tenant_id IS NULL
     OR c.tenant_id = pd.tenant_id
     OR (
       c.tenant_id IS NULL
       AND EXISTS (
         SELECT 1
           FROM campuses cp
          WHERE cp.id = c.campus_id
            AND cp.tenant_id = pd.tenant_id
       )
     )
   )
  WHERE pd.concept_id IS NULL
  GROUP BY pd.id
  HAVING COUNT(c.id) = 1
)
UPDATE payment_due_dates pd
SET concept_id = unique_matches.concept_id
FROM unique_matches
WHERE pd.id = unique_matches.due_date_id;

CREATE INDEX IF NOT EXISTS idx_payment_due_dates_scope_concept
  ON payment_due_dates (tenant_id, campus_id, concept_id, activo);

CREATE TABLE IF NOT EXISTS payment_due_date_periods (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campus_id INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  ciclo_escolar VARCHAR(50) NOT NULL,
  periodo_clave VARCHAR(50) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_due_date_periods_dates_check
    CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT payment_due_date_periods_unique
    UNIQUE (tenant_id, campus_id, concept_id, ciclo_escolar, periodo_clave)
);

CREATE INDEX IF NOT EXISTS idx_payment_due_date_periods_scope
  ON payment_due_date_periods
    (tenant_id, campus_id, concept_id, ciclo_escolar, activo);

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_override_reason TEXT;

