-- Migration 003: Create scholarship_types table
-- Source: shared/schema.ts:231-241 (Drizzle definition ya existía; solo
--         faltaba aplicar la migración a la DB real).
-- Applied: 2026-08-07 via vitest probe script.
--
-- Tablas de schema anticipado SIN endpoint consumidor (no requieren acción
-- hasta que se construya la funcionalidad que las use):
--   - scholarship_criteria  (shared/schema.ts:243) — FK a scholarship_types
--   - scholarship_benefits  (shared/schema.ts:253) — FK a scholarship_types
--   - platform_profiles     (shared/schema.ts:95)  — schema puro, sin rutas
--   - platform_subscriptions (shared/schema.ts:735) — schema puro, sin rutas
--
-- DOWN → ejecutar el siguiente DROP antes del UP si se necesita revertir:
--
--   DROP TABLE IF EXISTS scholarship_types;
--
-- Reversibilidad: tabla nueva y vacía al aplicarse; sin datos de producción
-- en riesgo. scholarships.scholarship_type_id es FK nullable → el DROP no
-- rompe filas existentes de scholarships (FK se vuelve huérfana nullable,
-- no viola restricción). Verificar que no haya filas en scholarship_types
-- antes del DROP.
-- ---------------------------------------------------------------------------

-- Parte 2 (idempotente): la tabla scholarships en la DB real tiene columnas
-- distintas al schema Drizzle (porcentaje en vez de porcentaje_aplicado, motivo
-- en vez de observaciones, sin estado, sin monto_fijo_aplicado_centavos, sin
-- scholarship_type_id). Se añade solo la FK necesaria para el LEFT JOIN de los
-- endpoints de consulta. Las otras diferencias de columna se corrigen en las
-- queries SQL directas de admin.ts (líneas 352 y 488) sin tocar el contrato de
-- la tabla — son lectura, no escritura.
--
-- DOWN adicional (ejecutar antes del DROP de scholarship_types):
--   ALTER TABLE scholarships DROP COLUMN IF EXISTS scholarship_type_id;
ALTER TABLE scholarships
  ADD COLUMN IF NOT EXISTS scholarship_type_id INTEGER REFERENCES scholarship_types(id);

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scholarship_types (
  id          SERIAL PRIMARY KEY,
  campus_id   INTEGER REFERENCES campuses(id),
  nombre      VARCHAR(100) NOT NULL,
  categoria   VARCHAR(50)  NOT NULL,  -- 'academica','socioeconomica','deportiva','descuento'
  descripcion TEXT,
  algoritmo   VARCHAR(50)  NOT NULL,  -- 'manual','automatico','promedio','hermanos','ingresos'
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
