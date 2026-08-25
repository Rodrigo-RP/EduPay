-- The active payment configuration screen identifies concepts by primary key.
-- Keep the legacy text column while moving the charge engine to this explicit
-- relationship so equal names across campuses cannot share a surcharge rule.
ALTER TABLE payment_surcharge_rules
  ADD COLUMN IF NOT EXISTS concept_id INTEGER REFERENCES concepts(id);

-- Scope existing rows to the tenant that owns their campus. New active-screen
-- writes already set this value; this is only a compatible backfill.
UPDATE payment_surcharge_rules rule
   SET tenant_id = campus.tenant_id
  FROM campuses campus
 WHERE rule.campus_id = campus.id
   AND rule.tenant_id IS NULL;

-- Only migrate legacy rows when the name maps to exactly one concept in that
-- campus. Ambiguous historic rows intentionally stay NULL and are ignored by
-- the engine until an administrator configures a specific concept.
WITH unambiguous_concepts AS (
  SELECT campus_id, nombre, MIN(id) AS concept_id
    FROM concepts
   GROUP BY campus_id, nombre
  HAVING COUNT(*) = 1
)
UPDATE payment_surcharge_rules rule
   SET concept_id = match.concept_id
  FROM unambiguous_concepts match
 WHERE rule.concept_id IS NULL
   AND rule.campus_id = match.campus_id
   AND rule.concepto = match.nombre;

CREATE INDEX IF NOT EXISTS idx_surcharge_rules_active_concept_scope
  ON payment_surcharge_rules (tenant_id, campus_id, concept_id)
  WHERE activo = true AND concept_id IS NOT NULL;