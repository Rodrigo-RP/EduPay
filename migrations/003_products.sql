-- Migration 003: Product Catalog
-- Tabla de catálogo de productos con precios por nivel académico y metadata SAT/CFDI.
-- Dominio distinto de `concepts` (que maneja precios únicos operacionales).

CREATE TABLE IF NOT EXISTS products (
  id                  SERIAL PRIMARY KEY,
  campus_id           INTEGER NOT NULL REFERENCES campuses(id)  ON DELETE CASCADE,
  tenant_id           INTEGER NOT NULL REFERENCES tenants(id),
  codigo              VARCHAR(50)  NOT NULL,
  nombre              VARCHAR(255) NOT NULL,
  descripcion         TEXT,
  categoria           VARCHAR(50)  NOT NULL,         -- COLEGIATURAS | INSCRIPCIONES | REINSCRIPCIONES | SEGURO_ESCOLAR | LIBROS | OTROS
  unidad_medida       VARCHAR(20)  NOT NULL DEFAULT 'SERVICIO', -- SERVICIO | PIEZA | LOTE | KILOGRAMO
  clave_sat           VARCHAR(20),
  activo              BOOLEAN NOT NULL DEFAULT true,
  precio_kinder       BIGINT  NOT NULL DEFAULT 0,    -- centavos MXN
  precio_primaria     BIGINT  NOT NULL DEFAULT 0,
  precio_secundaria   BIGINT  NOT NULL DEFAULT 0,
  precio_bachillerato BIGINT  NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_campus ON products(campus_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
-- código único por campus (distintos campus del mismo tenant pueden reutilizar el código)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_campus_codigo_unique;
ALTER TABLE products ADD CONSTRAINT products_campus_codigo_unique UNIQUE (campus_id, codigo);
