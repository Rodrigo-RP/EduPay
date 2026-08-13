-- Migration 004: Add onboarding_steps_completados to campuses
-- Tracks which wizard steps have been explicitly confirmed by the admin,
-- independently of row counts (so "already had students" ≠ "step completed").
--
-- Applied: 2026-08-13 via vitest probe script.
--
-- DOWN → ALTER TABLE campuses DROP COLUMN IF EXISTS onboarding_steps_completados;
--
-- Valid step IDs (enforced in application layer, not DB constraint):
--   escuela, alumnos, familias, becas, adeudos, activar
-- ---------------------------------------------------------------------------

ALTER TABLE campuses
  ADD COLUMN IF NOT EXISTS onboarding_steps_completados jsonb NOT NULL DEFAULT '{}';
