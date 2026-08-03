-- ============================================================
-- MIGRACIÓN 003: Audit Log Inmutable
-- Task #9 — Instituto JFR
-- ============================================================

-- ── 1. Tabla audit_log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id)     ON DELETE SET NULL,
  guardian_id     INTEGER REFERENCES guardians(id) ON DELETE SET NULL,
  action          VARCHAR(100)  NOT NULL,     -- 'charge.status_changed', 'payment.confirmed', etc.
  entity_type     VARCHAR(50)   NOT NULL,     -- 'charge', 'payment', 'invoice'
  entity_id       INTEGER       NOT NULL,
  previous_value  TEXT,                        -- JSON estado anterior
  new_value       TEXT,                        -- JSON estado nuevo
  ip_address      VARCHAR(45),
  metadata        TEXT,                        -- JSON contexto adicional (monto, alumno, etc.)
  created_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant     ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity     ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user       ON audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- ── 2. RLS: solo INSERT permitido ─────────────────────────
-- Habilitamos RLS y creamos una política que bloquea UPDATE y DELETE.
-- SELECT e INSERT se permiten (la política de USING siempre regresa TRUE para SELECTs
-- cuando row security no restringe SELECT explícitamente; el bloqueo real está en
-- la ausencia de políticas FOR UPDATE/DELETE).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Política SELECT: solo puede leer quien pertenece al mismo tenant
-- (ajustamos a acceso libre en la aplicación porque el filtro tenant_id se hace en código)
DROP POLICY IF EXISTS audit_log_select_policy ON audit_log;
CREATE POLICY audit_log_select_policy ON audit_log
  FOR SELECT USING (true);

-- Política INSERT: siempre permitida (la tabla es append-only por diseño)
DROP POLICY IF EXISTS audit_log_insert_policy ON audit_log;
CREATE POLICY audit_log_insert_policy ON audit_log
  FOR INSERT WITH CHECK (true);

-- Política UPDATE: BLOQUEADA — nadie puede modificar registros de auditoría
DROP POLICY IF EXISTS audit_log_no_update ON audit_log;
CREATE POLICY audit_log_no_update ON audit_log
  FOR UPDATE USING (false);

-- Política DELETE: BLOQUEADA — nadie puede borrar registros de auditoría
DROP POLICY IF EXISTS audit_log_no_delete ON audit_log;
CREATE POLICY audit_log_no_delete ON audit_log
  FOR DELETE USING (false);
