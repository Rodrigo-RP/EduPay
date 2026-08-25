-- Actividades de cobranza persistentes.
-- Esta tabla es independiente de acciones_seguimiento: aquella modela hallazgos
-- de workflow (principalmente conciliación), mientras ésta registra el historial
-- operativo de cada cuenta por cobrar.

CREATE TABLE IF NOT EXISTS collection_activities (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campus_id         INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  charge_id         INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tipo              VARCHAR(40) NOT NULL,
  estado            VARCHAR(40) NOT NULL DEFAULT 'registrado',
  titulo            VARCHAR(255) NOT NULL,
  descripcion       TEXT,
  fecha_programada  DATE,
  hora_programada   TIME,
  monto_centavos    BIGINT,
  canal             VARCHAR(30),
  prioridad         VARCHAR(20),
  motivo            VARCHAR(100),
  supervisor        VARCHAR(255),
  urgencia          VARCHAR(20),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT collection_activities_tipo_check CHECK (
    tipo IN ('cobranza', 'recordatorio', 'promesa', 'seguimiento', 'nota', 'escalacion')
  ),
  CONSTRAINT collection_activities_estado_check CHECK (
    estado IN ('pendiente', 'programado', 'registrado', 'iniciado', 'enviado', 'escalado', 'prometido')
  )
);

CREATE INDEX IF NOT EXISTS idx_collection_activities_tenant_campus_created
  ON collection_activities (tenant_id, campus_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_activities_charge_created
  ON collection_activities (charge_id, created_at DESC);