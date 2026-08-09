-- Migration 002: onboarding_completado flag on campuses
-- Rationale: campuses is the guaranteed-to-exist root entity per campus.
-- institutional_settings may not have a row yet at onboarding start.
-- The JWT carries campus_id directly so no JOIN is needed to check the flag.

ALTER TABLE campuses
  ADD COLUMN IF NOT EXISTS onboarding_completado BOOLEAN NOT NULL DEFAULT false;

-- Grandfather existing configured campuses so active sessions are not disrupted.
-- A campus is considered already configured if it has students OR concepts.
UPDATE campuses
SET onboarding_completado = true
WHERE id IN (
  SELECT DISTINCT campus_id FROM students  WHERE campus_id IS NOT NULL
  UNION
  SELECT DISTINCT campus_id FROM concepts  WHERE campus_id IS NOT NULL
);
