-- migrations/017_iedu_complement.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Complemento IEDU — campos SAT para facturación educativa
-- XSD fuente: http://www.sat.gob.mx/sitio_internet/cfd/iedu/iedu.pdf
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. invoices: 8 columnas del complemento IEDU ─────────────────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS curp_alumno     VARCHAR(18)
    CHECK (curp_alumno IS NULL OR curp_alumno ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[0-9A-Z][0-9]$'),
  ADD COLUMN IF NOT EXISTS nivel_educativo VARCHAR(50)
    CHECK (nivel_educativo IS NULL OR nivel_educativo IN (
      'Preescolar',
      'Primaria',
      'Secundaria',
      'Profesional técnico',
      'Bachillerato o su equivalente'
    )),
  ADD COLUMN IF NOT EXISTS aut_rvoe        VARCHAR(20),
  -- aut_rvoe: CCT para Preescolar/Primaria/Secundaria,
  --           RVOE para Profesional técnico / Bachillerato o su equivalente
  ADD COLUMN IF NOT EXISTS rfc_pago        VARCHAR(13),
  -- rfc_pago: solo se incluye en el CFDI cuando el pagador difiere del receptor
  ADD COLUMN IF NOT EXISTS uso_cfdi        VARCHAR(10)  DEFAULT 'D10',
  ADD COLUMN IF NOT EXISTS forma_pago      VARCHAR(2)
    CHECK (forma_pago IS NULL OR forma_pago IN (
      '01','02','03','04','05','06','08','12','13','17','23','24','25','28','29','30','99'
    )),
  -- forma_pago 01=efectivo: la deducibilidad D10 la decide la capa de aplicación,
  -- no el CHECK. El sistema avisa al tutor pero permite continuar.
  ADD COLUMN IF NOT EXISTS clave_prod_serv VARCHAR(20),
  -- clave_prod_serv: 86121500 para Preescolar/Primaria/Secundaria
  --                  86121600 para Profesional técnico / Bachillerato o su equivalente
  -- Sin DEFAULT fijo — se calcula al generar el CFDI según nivel_educativo del alumno.
  ADD COLUMN IF NOT EXISTS clave_unidad    VARCHAR(10)  DEFAULT 'E48';

-- ── 2. institutional_info: clave RVOE por sección educativa ──────────────────
--
-- CCT  (ya existe) → educación básica (Preescolar, Primaria, Secundaria)
-- RVOE (nuevo)     → educación media superior (Bachillerato, Profesional técnico)
-- Instituto JFR confirmado: usa CCT para básica, RVOE para bachillerato.

ALTER TABLE institutional_info
  ADD COLUMN IF NOT EXISTS rvoe VARCHAR(20);

-- ── 3. students: nivel_educativo controlado (catálogo SAT, 5 valores) ─────────

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS nivel_educativo VARCHAR(50)
    CHECK (nivel_educativo IS NULL OR nivel_educativo IN (
      'Preescolar',
      'Primaria',
      'Secundaria',
      'Profesional técnico',
      'Bachillerato o su equivalente'
    ));

-- Poblamiento automático desde nivel_escolar (texto libre → catálogo SAT).
-- Los alumnos sin mapeo quedan NULL y deben ser clasificados manualmente
-- desde el expediente del alumno antes de poder timbrar su CFDI.
UPDATE students
SET nivel_educativo = CASE
  WHEN lower(nivel_escolar) ~ 'preescolar|kinder|k[ií]nder|jard[ií]n|inicial'
    THEN 'Preescolar'
  WHEN lower(nivel_escolar) ~ 'primaria'
    THEN 'Primaria'
  WHEN lower(nivel_escolar) ~ 'secundaria'
    THEN 'Secundaria'
  WHEN lower(nivel_escolar) ~ 't[eé]cnico|vocacional|cetis|conalep'
    THEN 'Profesional técnico'
  WHEN lower(nivel_escolar) ~ 'bachillerato|preparatoria|prepa|medio superior|cch'
    THEN 'Bachillerato o su equivalente'
  ELSE NULL
END
WHERE nivel_educativo IS NULL
  AND nivel_escolar   IS NOT NULL;

-- Query de diagnóstico post-migración: alumnos activos sin clasificar.
-- Ejecutar después de aplicar esta migración para que el administrador
-- revise manualmente los casos ambiguos:
--
--   SELECT id, nombre_completo, nivel_escolar, grado
--   FROM   students
--   WHERE  nivel_educativo IS NULL
--     AND  status = 'activo'
--   ORDER  BY nivel_escolar NULLS LAST, grado;

-- ── 4. payments: subtipo_tarjeta para distinción crédito/débito ───────────────
--
-- Valores SAT: crédito → forma_pago '04', débito → '28', servicios → '29'.
-- La pasarela (Stripe Connect) proveerá este dato en la respuesta del pago.
-- Nullable mientras la integración con el procesador real no esté activa.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS subtipo_tarjeta VARCHAR(10)
    CHECK (subtipo_tarjeta IS NULL OR subtipo_tarjeta IN ('credito', 'debito'));

-- ── 5. fiscal_config: corregir uso_cfdi G03 → D10 ────────────────────────────
--
-- G03 = gastos en general (default incorrecto para servicios educativos).
-- D10 = pagos por servicios educativos (único uso_cfdi válido con complemento IEDU).
-- EduPay es exclusivamente educativo, por lo que la actualización es segura.
-- DO block: no falla si fiscal_config todavía no existe (la tabla no tiene
-- migración propia; se crea en el primer GET/PUT de /api/fiscal/config-automatica).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'fiscal_config'
  ) THEN
    UPDATE fiscal_config SET uso_cfdi = 'D10' WHERE uso_cfdi = 'G03';
  END IF;
END
$$;
