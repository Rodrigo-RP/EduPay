-- ============================================================
-- MIGRACIÓN 004: Extender tabla notifications
-- Task #3 — Instituto JFR
-- ============================================================
-- La tabla notifications ya existe con: id, user_id, guardian_id, canal,
-- contenido, enviado_en, tenant_id. Le agregamos las columnas necesarias
-- para el módulo de notificaciones automáticas.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS tipo        VARCHAR(100),          -- 'RECORDATORIO_VENCIMIENTO','AVISO_MORA','CARGO_EMITIDO','PAGO_CONFIRMADO'
  ADD COLUMN IF NOT EXISTS destinatario VARCHAR(255),          -- email o teléfono del destinatario
  ADD COLUMN IF NOT EXISTS asunto      TEXT,                   -- asunto del email (null para SMS/WhatsApp)
  ADD COLUMN IF NOT EXISTS mensaje     TEXT,                   -- contenido completo del mensaje
  ADD COLUMN IF NOT EXISTS estado      VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente','enviado','error'
  ADD COLUMN IF NOT EXISTS intentos    INTEGER DEFAULT 0,      -- número de intentos de envío
  ADD COLUMN IF NOT EXISTS student_id  INTEGER REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant  ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_estado  ON notifications(estado);
CREATE INDEX IF NOT EXISTS idx_notifications_enviado ON notifications(enviado_en DESC);
