-- Familias archivadas, acceso de tutores y datos de contacto por tutor.
-- El archivado es lógico: no elimina alumnos, tutores, pagos ni relaciones.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE families
  DROP CONSTRAINT IF EXISTS families_status_check;

ALTER TABLE families
  ADD CONSTRAINT families_status_check
  CHECK (status IN ('activo', 'archivada'));

CREATE INDEX IF NOT EXISTS idx_families_tenant_campus_status
  ON families (tenant_id, campus_id, status);

ALTER TABLE guardians
  ADD COLUMN IF NOT EXISTS calle VARCHAR(255),
  ADD COLUMN IF NOT EXISTS numero_exterior VARCHAR(30),
  ADD COLUMN IF NOT EXISTS numero_interior VARCHAR(30),
  ADD COLUMN IF NOT EXISTS colonia VARCHAR(255),
  ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(5),
  ADD COLUMN IF NOT EXISTS municipio VARCHAR(255),
  ADD COLUMN IF NOT EXISTS estado VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono VARCHAR(20),
  ADD COLUMN IF NOT EXISTS contacto_emergencia_relacion VARCHAR(100);

ALTER TABLE magic_link_tokens
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_guardian_active
  ON magic_link_tokens (guardian_id)
  WHERE revoked_at IS NULL;