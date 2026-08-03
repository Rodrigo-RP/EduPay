-- ============================================================
-- MIGRACIÓN 002: Núcleo de Familia y Ledger Financiero
-- Task #8 — Instituto JFR
-- ============================================================

-- ── 1. Tabla families ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS families (
  id                     SERIAL PRIMARY KEY,
  tenant_id              INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campus_id              INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  nombre                 VARCHAR(300) NOT NULL,
  clabe_virtual          VARCHAR(18),           -- Placeholder; CLABE real en fase posterior
  guardian_id_principal  INTEGER REFERENCES guardians(id),
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_families_tenant  ON families(tenant_id);
CREATE INDEX IF NOT EXISTS idx_families_campus  ON families(campus_id);

-- ── 2. Tabla family_students ───────────────────────────────
CREATE TABLE IF NOT EXISTS family_students (
  family_id   INTEGER NOT NULL REFERENCES families(id)  ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (family_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_family_students_family  ON family_students(family_id);
CREATE INDEX IF NOT EXISTS idx_family_students_student ON family_students(student_id);

-- ── 3. Tabla payment_applications ─────────────────────────
-- Puente de aplicaciones de pago; soporta pagos parciales y multi-cargo.
CREATE TABLE IF NOT EXISTS payment_applications (
  id                SERIAL PRIMARY KEY,
  payment_id        INTEGER NOT NULL REFERENCES payments(id)  ON DELETE CASCADE,
  charge_id         INTEGER NOT NULL REFERENCES charges(id)   ON DELETE CASCADE,
  amount_centavos   BIGINT  NOT NULL,
  applied_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_applications_payment ON payment_applications(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_applications_charge  ON payment_applications(charge_id);

-- ── 4. Tabla payment_events ────────────────────────────────
-- Registro crudo de webhooks/eventos de pasarela de pagos.
-- UNIQUE (provider, provider_event_id) garantiza idempotencia.
CREATE TABLE IF NOT EXISTS payment_events (
  id                   SERIAL PRIMARY KEY,
  tenant_id            INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider             VARCHAR(50)  NOT NULL,
  provider_event_id    VARCHAR(255) NOT NULL,
  payload              TEXT,
  processed_at         TIMESTAMP,
  status               VARCHAR(20) NOT NULL DEFAULT 'received',
  error_message        TEXT,
  created_at           TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_payment_events_provider UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON payment_events(tenant_id);

-- ── 5. Backfill: familias desde student_guardian existentes ─
-- Una familia por guardian_id_principal (el guardian con más alumnos,
-- desempate por id menor).
WITH guardian_groups AS (
  SELECT
    sg.guardian_id,
    g.nombre_completo,
    g.campus_id AS g_campus_id,
    s.campus_id AS s_campus_id,
    s.tenant_id,
    array_agg(sg.student_id ORDER BY sg.student_id) AS student_ids,
    count(*) AS num_students
  FROM student_guardian sg
  JOIN guardians  g ON g.id  = sg.guardian_id
  JOIN students   s ON s.id  = sg.student_id
  WHERE s.tenant_id IS NOT NULL
  GROUP BY sg.guardian_id, g.nombre_completo, g.campus_id, s.campus_id, s.tenant_id
),
principal AS (
  SELECT DISTINCT ON (student_ids::text)
    guardian_id,
    nombre_completo,
    COALESCE(g_campus_id, s_campus_id) AS campus_id,
    tenant_id
  FROM guardian_groups
  ORDER BY student_ids::text, num_students DESC, guardian_id ASC
)
INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
SELECT
  p.tenant_id,
  p.campus_id,
  p.nombre_completo || ' (Familia)',
  p.guardian_id
FROM principal p
WHERE p.campus_id IS NOT NULL
  AND p.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 6. Backfill: family_students ──────────────────────────
INSERT INTO family_students (family_id, student_id)
SELECT DISTINCT f.id, sg.student_id
FROM families f
JOIN student_guardian sg ON sg.guardian_id = f.guardian_id_principal
ON CONFLICT DO NOTHING;

-- ── 7. Backfill: payment_applications desde payments.charge_id ──
-- Solo pagos exitosos con cargo registrado.
-- Los pagos futuros deben registrarse vía applyPaymentToCharge en storage.
INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
SELECT
  p.id,
  p.charge_id,
  p.monto_centavos,
  COALESCE(p.created_at, NOW())
FROM payments p
WHERE p.charge_id IS NOT NULL
  AND p.estado = 'exitoso'
ON CONFLICT DO NOTHING;
