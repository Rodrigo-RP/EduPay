-- migrations/019_campus_invoicing_config.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Infraestructura de facturación multi-proveedor multi-RFC
--
-- Principio de seguridad innegociable:
--   EduPay NUNCA persiste bytes de .cer / .key en su propia infraestructura.
--   Solo se guarda el organizacion_id devuelto por el proveedor de timbrado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. campus_invoicing_config ────────────────────────────────────────────────
--
-- Una fila por campus (UNIQUE campus_id), igual que campus_payment_config.
-- El proveedor de timbrado elegido es intercambiable detrás de InvoicingProvider.

CREATE TABLE IF NOT EXISTS campus_invoicing_config (
  id                    SERIAL       PRIMARY KEY,
  campus_id             INTEGER      NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  tenant_id             INTEGER      NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,

  -- Proveedor de timbrado elegido (intercambiable por diseño)
  -- Valores soportados: 'facturapi' | (futuro: 'fiscalapi', 'sw_sapien')
  proveedor             VARCHAR(50)  NOT NULL DEFAULT 'facturapi',

  -- Identificador de la organización en el proveedor.
  -- Es el único dato que persiste del proceso de registro del CSD.
  -- NUNCA contiene bytes del certificado (.cer) ni de la llave privada (.key).
  organizacion_id       VARCHAR(255),

  -- Datos fiscales confirmados por el proveedor al registrar el CSD
  rfc                   VARCHAR(13),
  razon_social          VARCHAR(255),

  -- Configuración de timbrado
  regimen_fiscal        VARCHAR(4)   NOT NULL DEFAULT '601',
  -- SAT c_RegimenFiscal: 601=General Ley Personas Morales; ajustar por escuela
  uso_cfdi_default      VARCHAR(10)  NOT NULL DEFAULT 'D10',
  timbrado_automatico   BOOLEAN      NOT NULL DEFAULT false,
  ambiente              VARCHAR(20)  NOT NULL DEFAULT 'sandbox',
  -- 'sandbox' | 'produccion'

  -- Vigencia del CSD para alertas preventivas (el CSD dura 4 años exactos)
  fecha_vencimiento_csd DATE,

  -- Estado del onboarding de este campus con el proveedor de timbrado
  estado                VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  -- 'pendiente' (sin organizacion_id aún)
  -- 'activo'    (CSD registrado en proveedor; listo para timbrar)
  -- 'error'     (último intento de registro falló; ver ultimo_error)
  -- 'vencido'   (fecha_vencimiento_csd < hoy; requiere renovar CSD)

  -- Diagnóstico del último intento fallido de registro o timbrado
  ultimo_error          TEXT,

  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Un único perfil fiscal activo por campus, igual que campus_payment_config
  CONSTRAINT uq_campus_invoicing_config_campus UNIQUE (campus_id)
);

-- ── 2. invoices: columnas para XML y PDF reales del SAT ───────────────────────
--
-- xml_url / pdf_url ya existen (siempre NULL con timbrado simulado).
-- Estas columnas almacenan el contenido real cuando el adaptador concreto
-- esté activo. Los CFDIs son texto (~5–15 KB) — caben en PostgreSQL sin S3.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS xml_content TEXT,
  -- XML timbrado completo devuelto por el proveedor (texto UTF-8).
  -- NULL para CFDIs generados antes de esta migración o en modo simulado.
  ADD COLUMN IF NOT EXISTS pdf_base64  TEXT;
  -- PDF del CFDI en base64, devuelto por el proveedor junto con el XML.
  -- NULL para CFDIs generados antes de esta migración o en modo simulado.

-- ── Nota sobre fiscal_config ──────────────────────────────────────────────────
-- La tabla fiscal_config fue referenciada en código sin migración formal y
-- con .catch(() => {}) como fallback. Sus campos (habilitado, timbrado_automatico,
-- pac_nombre, regimen_fiscal, uso_cfdi) quedan absorbidos en campus_invoicing_config.
-- Los endpoints GET/PUT /api/fiscal/config-automatica ahora leen/escriben en
-- campus_invoicing_config — misma URL pública, sin breaking change para el frontend.
-- No se hace DROP TABLE fiscal_config porque puede no existir en todos los entornos.
