-- Migration 017: tabla genérica de acciones/hallazgos para seguimiento de workflow
--
-- Diseño: hallazgo polimórfico (entity_type + entity_id, mismo patrón que audit_log)
-- + asignación de responsable + enum de estados real + timestamps para efectividad.
-- La fuente de verdad de conciliación sigue siendo bank_transactions.estado_conciliacion;
-- acciones_seguimiento es la capa de gestión encima, sin duplicar ni reemplazar ese campo.

CREATE TYPE accion_status AS ENUM (
  'pendiente',    -- detectado, sin responsable asignado
  'asignado',     -- responsable designado, aún no inicia
  'en_progreso',  -- responsable marcó inicio de trabajo
  'resuelto',     -- cierre exitoso con acción efectiva
  'ignorado',     -- cerrado deliberadamente sin resolver
  'escalado'      -- reasignado a nivel superior
);

CREATE TABLE acciones_seguimiento (
  id               SERIAL PRIMARY KEY,

  -- Aislamiento multi-tenant (NOT NULL — ambos obligatorios)
  tenant_id        INTEGER NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  campus_id        INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,

  -- Referencia polimórfica al origen (mismo patrón que audit_log, sin FK rígida)
  -- entity_type: 'bank_transaction' | 'charge' | 'payment_plan' | 'risk_score' | ...
  entity_type      VARCHAR(50) NOT NULL,
  entity_id        INTEGER     NOT NULL,

  -- Tipo de hallazgo (varchar + check constraint — extensible sin migrar el tipo pgEnum)
  tipo_hallazgo    VARCHAR(50) NOT NULL
    CHECK (tipo_hallazgo IN (
      'excepcion_conciliacion',
      'riesgo_financiero',
      'override_condonacion',
      'pago_manual_sugerido',
      'cfdi_sin_timbrar',
      'otro'
    )),

  -- Estado con enum real (no varchar libre)
  status           accion_status NOT NULL DEFAULT 'pendiente',

  -- Texto humano del hallazgo (aparece en bandeja de acciones)
  titulo           VARCHAR(255) NOT NULL,
  descripcion      TEXT,

  -- Asignación de responsable (nullable: puede existir sin responsable todavía)
  -- SET NULL: si el usuario es eliminado la acción no desaparece
  assigned_to      INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- Detalles de resolución
  resolution_notes TEXT,

  -- Metadata extensible sin migración (contexto del hallazgo)
  -- Ej: { monto_centavos, referencia, confianza_pct, nombre_ordenante }
  metadata         JSONB,

  -- Quién creó el hallazgo (NULL = sistema automático)
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps para medir efectividad (cada transición escribe su timestamp)
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),   -- cuándo se detectó
  assigned_at      TIMESTAMP,                          -- cuándo se asignó responsable
  started_at       TIMESTAMP,                          -- cuándo se marcó en_progreso
  resolved_at      TIMESTAMP,                          -- cuándo se cerró
  escalated_at     TIMESTAMP,                          -- cuándo se escaló (si aplica)

  -- Garantiza un único registro por origen+campus (clave de idempotencia)
  CONSTRAINT acciones_seg_entity_campus_uniq
    UNIQUE (entity_type, entity_id, campus_id)
);

-- Índices para bandeja de acciones y queries de efectividad
CREATE INDEX acciones_seg_status_idx        ON acciones_seguimiento(status);
CREATE INDEX acciones_seg_assigned_idx      ON acciones_seguimiento(assigned_to);
CREATE INDEX acciones_seg_tipo_idx          ON acciones_seguimiento(tipo_hallazgo);
CREATE INDEX acciones_seg_campus_status_idx ON acciones_seguimiento(campus_id, status);
