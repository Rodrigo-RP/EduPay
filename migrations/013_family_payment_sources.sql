-- Migración 013: family_payment_sources
--
-- Contexto: motor de conciliación bancaria con niveles de confianza porcentuales.
-- Esta tabla acumula las CLABEs de origen conocidas por familia, aprendidas de
-- forma incremental cada vez que una transacción se concilia exitosamente
-- (sin importar el nivel de confianza — auto o confirmación de operador).
--
-- Diseño validado contra el algoritmo de confianza (agosto 2026):
--   • clabe_score = 20  si confirmaciones >= 2
--   • clabe_score = 15  si confirmaciones = 1
--   • clabe_score =  0  si la CLABE no aparece en esta tabla
--
-- El upsert se dispara en applyReconciliation() fuera de la transacción
-- atómica (patrón ADR-001), igual que enqueueAuditLog.
--
-- Rollback:
--   DROP TABLE family_payment_sources;

CREATE TABLE IF NOT EXISTS family_payment_sources (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  clabe           VARCHAR(18) NOT NULL,
  nombre_inferido VARCHAR(255),
  confirmaciones  INTEGER NOT NULL DEFAULT 1,
  primera_vez_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_vez_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT family_payment_sources_uniq UNIQUE (family_id, clabe)
);

CREATE INDEX IF NOT EXISTS idx_family_payment_sources_tenant
  ON family_payment_sources (tenant_id);

CREATE INDEX IF NOT EXISTS idx_family_payment_sources_clabe
  ON family_payment_sources (clabe);
