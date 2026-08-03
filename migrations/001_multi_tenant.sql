-- ============================================================
-- MIGRACIÓN 001: FUNDACIÓN MULTI-TENANT SEGURA
-- Aplicada directamente en Neon PostgreSQL (Instituto JFR)
-- Estado: APLICADA EN PRODUCCIÓN
-- Cobertura: TODAS las tablas tenant-owned con campus_id
-- ============================================================

-- ─── 1. NUEVAS COLUMNAS tenant_id ────────────────────────────────────────────
-- Tablas principales
ALTER TABLE students        ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE guardians       ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE guardians       ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id);
ALTER TABLE users           ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE charges         ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE payments        ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE concepts        ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE discounts       ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE scholarships    ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE notifications   ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE reconciliation_batches      ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE security_events             ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE pending_approvals           ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE institutional_settings      ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE institutional_credentials   ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE institutional_info          ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE payment_due_dates           ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE payment_surcharge_rules     ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
-- Tablas del módulo contador (existen en producción)
ALTER TABLE bank_transactions     ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE payment_plans         ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE scholarship_auto_rules ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE financial_events       ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
-- NOTE: payment_rules/late_fee_calculations no existen en este deployment (schema futuro)
-- NOTE: student_guardian, payment_plan_installments, approval_notifications/logs, 
--       system_health, platform_metrics, platform_profiles: no requieren tenant_id
--       (tablas de unión, métricas de plataforma, o acceso vía entidad padre)

-- ─── 2. BACKFILL tenant_id DESDE campus → tablas relacionadas ────────────────
UPDATE students    s SET tenant_id = c.tenant_id FROM campuses c WHERE s.campus_id = c.id AND s.tenant_id IS NULL;
UPDATE concepts    co SET tenant_id = c.tenant_id FROM campuses c WHERE co.campus_id = c.id AND co.tenant_id IS NULL;
UPDATE users       u SET tenant_id = c.tenant_id FROM campuses c WHERE u.campus_id = c.id AND u.tenant_id IS NULL;
UPDATE charges     ch SET tenant_id = s.tenant_id FROM students s WHERE ch.student_id = s.id AND ch.tenant_id IS NULL;
UPDATE payments    p  SET tenant_id = c.tenant_id FROM charges c WHERE p.charge_id = c.id AND p.tenant_id IS NULL;
UPDATE invoices    i  SET tenant_id = p.tenant_id FROM payments p WHERE i.payment_id = p.id AND i.tenant_id IS NULL;
UPDATE discounts   d  SET tenant_id = c.tenant_id FROM campuses c WHERE d.campus_id = c.id AND d.tenant_id IS NULL;
UPDATE scholarships sch SET tenant_id = s.tenant_id FROM students s WHERE sch.student_id = s.id AND sch.tenant_id IS NULL;
UPDATE institutional_credentials ic SET tenant_id = c.tenant_id FROM campuses c WHERE ic.campus_id = c.id AND ic.tenant_id IS NULL;
UPDATE institutional_info ii SET tenant_id = c.tenant_id FROM campuses c WHERE ii.campus_id = c.id AND ii.tenant_id IS NULL;
UPDATE institutional_settings ist SET tenant_id = c.tenant_id FROM campuses c WHERE ist.campus_id = c.id AND ist.tenant_id IS NULL;
UPDATE payment_due_dates pd SET tenant_id = c.tenant_id FROM campuses c WHERE pd.campus_id = c.id AND pd.tenant_id IS NULL;
UPDATE payment_surcharge_rules ps SET tenant_id = c.tenant_id FROM campuses c WHERE ps.campus_id = c.id AND ps.tenant_id IS NULL;
UPDATE bank_transactions bt SET tenant_id = c.tenant_id FROM campuses c WHERE bt.campus_id = c.id AND bt.tenant_id IS NULL;
UPDATE payment_plans pp SET tenant_id = c.tenant_id FROM campuses c WHERE pp.campus_id = c.id AND pp.tenant_id IS NULL;
UPDATE scholarship_auto_rules sar SET tenant_id = c.tenant_id FROM campuses c WHERE sar.campus_id = c.id AND sar.tenant_id IS NULL;
UPDATE financial_events fe SET tenant_id = c.tenant_id FROM campuses c WHERE fe.campus_id = c.id AND fe.tenant_id IS NULL;
-- Guardianes: derivar desde alumno → campus → tenant
UPDATE guardians g SET tenant_id = s.tenant_id
  FROM students s
  JOIN student_guardian sg ON sg.student_id = s.id
  WHERE sg.guardian_id = g.id AND g.tenant_id IS NULL;
UPDATE guardians g SET campus_id = s.campus_id
  FROM students s
  JOIN student_guardian sg ON sg.student_id = s.id
  WHERE sg.guardian_id = g.id AND g.campus_id IS NULL;

-- ─── 3. ÍNDICES PARA QUERIES POR TENANT ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_tenant        ON students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guardians_tenant       ON guardians(tenant_id);
CREATE INDEX IF NOT EXISTS idx_charges_tenant         ON charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant        ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant        ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_concepts_tenant        ON concepts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_due_dates_tenant    ON payment_due_dates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_surcharge_rules_tenant      ON payment_surcharge_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_tenant    ON bank_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_tenant        ON payment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scholarship_rules_tenant    ON scholarship_auto_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_tenant     ON financial_events(tenant_id);

-- ─── 4. ROW LEVEL SECURITY ───────────────────────────────────────────────────
-- NOTA: Efectivo para roles no-superusuario. Con el rol de Neon (superusuario),
-- el filtrado explícito en la capa de aplicación es la defensa primaria.
-- Ref: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
-- "Superusers are never subject to row security policies"

ALTER TABLE students        ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians       ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE students        FORCE ROW LEVEL SECURITY;
ALTER TABLE guardians       FORCE ROW LEVEL SECURITY;
ALTER TABLE charges         FORCE ROW LEVEL SECURITY;
ALTER TABLE payments        FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices        FORCE ROW LEVEL SECURITY;
ALTER TABLE concepts        FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_methods FORCE ROW LEVEL SECURITY;

-- Políticas SELECT + INSERT/UPDATE WITH CHECK
-- Permite acceso si tenant no seteado (super admin) o si coincide
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['students','guardians','charges','payments','invoices','concepts','payment_methods'] LOOP
    -- DROP existentes para recrear con WITH CHECK
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format('
      CREATE POLICY tenant_isolation ON %I
        USING (
          current_setting(''app.current_tenant'', true) = ''''
          OR tenant_id::text = current_setting(''app.current_tenant'', true)
          OR current_setting(''app.current_tenant'', true) IS NULL
        )
        WITH CHECK (
          current_setting(''app.current_tenant'', true) = ''''
          OR tenant_id::text = current_setting(''app.current_tenant'', true)
          OR current_setting(''app.current_tenant'', true) IS NULL
        )', tbl);
  END LOOP;
END $$;
