-- Gestión administrativa de becas:
-- 1) estado manual de una asignación individual;
-- 2) tablas de catálogo que el esquema compartido ya modelaba.
--
-- `estado` permanece nullable para no invalidar registros históricos. Las
-- nuevas filas reciben 'activa' y toda lectura financiera interpreta NULL
-- histórico como activa hasta que un administrador cambie explícitamente el
-- estado.

ALTER TABLE scholarships
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activa';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'scholarships_estado_check'
  ) THEN
    ALTER TABLE scholarships
      ADD CONSTRAINT scholarships_estado_check
      CHECK (estado IN ('activa', 'suspendida')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scholarships_effective_scope
  ON scholarships (tenant_id, student_id, estado, vigencia_inicio, vigencia_fin);

CREATE TABLE IF NOT EXISTS scholarship_criteria (
  id SERIAL PRIMARY KEY,
  scholarship_type_id INTEGER REFERENCES scholarship_types(id) ON DELETE CASCADE,
  criterio VARCHAR(100) NOT NULL,
  valor_minimo NUMERIC(10,2),
  valor_maximo NUMERIC(10,2),
  obligatorio BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scholarship_benefits (
  id SERIAL PRIMARY KEY,
  scholarship_type_id INTEGER REFERENCES scholarship_types(id) ON DELETE CASCADE,
  tipo_beneficio VARCHAR(50) NOT NULL,
  porcentaje_descuento INTEGER,
  monto_fijo_centavos BIGINT,
  aplica_conceptos TEXT[] DEFAULT ARRAY['colegiatura']::TEXT[],
  limite_maximo_centavos BIGINT,
  vigencia_meses INTEGER DEFAULT 12,
  created_at TIMESTAMP DEFAULT NOW()
);