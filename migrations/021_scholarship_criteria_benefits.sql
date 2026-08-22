-- Catálogos auxiliares de becas requeridos por el seed demo y el esquema compartido.
-- Idempotente: puede aplicarse en entornos donde scholarship_types ya existe.

CREATE TABLE IF NOT EXISTS scholarship_criteria (
  id                  SERIAL PRIMARY KEY,
  scholarship_type_id INTEGER REFERENCES scholarship_types(id) ON DELETE CASCADE,
  criterio            VARCHAR(100) NOT NULL,
  valor_minimo        NUMERIC(10, 2),
  valor_maximo        NUMERIC(10, 2),
  obligatorio         BOOLEAN DEFAULT true,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scholarship_benefits (
  id                    SERIAL PRIMARY KEY,
  scholarship_type_id   INTEGER REFERENCES scholarship_types(id) ON DELETE CASCADE,
  tipo_beneficio        VARCHAR(50) NOT NULL,
  porcentaje_descuento  INTEGER,
  monto_fijo_centavos   BIGINT,
  aplica_conceptos      TEXT[] DEFAULT ARRAY['colegiatura']::TEXT[],
  limite_maximo_centavos BIGINT,
  vigencia_meses        INTEGER DEFAULT 12,
  created_at            TIMESTAMP DEFAULT NOW()
);