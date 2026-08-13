-- Migración 011: campo de texto libre para el sistema de origen en adeudos migrados.
-- Se almacena en charges.descripcion (nullable) y es visible en el estado de cuenta
-- del tutor. No afecta concept_id ni la clasificación fiscal del cargo.
--
-- Rollback: ALTER TABLE charges DROP COLUMN descripcion;

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS descripcion TEXT;
