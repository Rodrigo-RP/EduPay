---
name: Facturación infraestructura multi-proveedor
description: Diseño y estado de la capa de facturación CFDI — campus_invoicing_config, InvoicingProvider, factory, y reglas de comportamiento honesto.
---

# Infraestructura de Facturación Multi-Proveedor

## Regla cardinal de seguridad
EduPay **nunca** persiste bytes de `.cer`/`.key` en DB. Solo guarda el `organizacion_id` devuelto por el PAC. Los buffers en `POST /api/fiscal/registrar-organizacion` se descartan inmediatamente tras el `await` al proveedor.

## Tabla principal: `campus_invoicing_config`
- Creada en `migrations/019_campus_invoicing_config.sql`
- 1 fila por campus (UNIQUE campus_id)
- Columnas clave: `proveedor`, `organizacion_id`, `rfc`, `razon_social`, `regimen_fiscal`, `uso_cfdi_default`, `timbrado_automatico`, `ambiente`, `estado` (`pendiente`/`activo`/`error`)
- `ultimo_error` para trazar fallos del PAC

## Columnas nuevas en `invoices`
- `xml_content TEXT` — XML del CFDI timbrado (sin S3, ~5–15 KB)
- `pdf_base64 TEXT` — PDF codificado en base64

## Interfaz `InvoicingProvider` (`server/lib/invoicing/invoicing-provider.ts`)
4 métodos: `registrarOrganizacion`, `timbrar`, `cancelar`, `consultarEstado`
4 errores tipados: `ProviderAuthError`, `ProviderValidationError`, `ProviderNetworkError`, `ProviderStampError`

## Factory (`server/lib/invoicing/get-invoicing-provider.ts`)
`getInvoicingProvider(proveedor, overrides?)` — switch 'facturapi' | 'fiscalapi' | 'sw_sapien'
- Lanza error claro si `FACTURAPI_SECRET_KEY` no está configurada → endpoints fiscales devuelven 503

## Comportamiento honesto de `fiscal.ts`
- `timbrar-lote`, `regenerar-cfdi`, `cancelar-cfdi` → **503** si no hay `campus_invoicing_config` con `estado='activo'`
- **Nunca** generan UUID `DEMO-...` ni simulan éxito
- `estado-pac` → lee desde DB; `config-automatica` → `PUT campus_invoicing_config`
- Alias `GET /api/becas-auto/reglas` tiene guard `SCHOLARSHIPS.ASSIGN` (igual que el canonical)

## Estado del adaptador
- `facturapi-adapter.ts` → **pendiente** (no implementado aún)
- La factory lanza error descriptivo → los endpoints devuelven 503 → correcto por diseño
- Variable de entorno a agregar cuando se implemente: `FACTURAPI_SECRET_KEY`

## Neon: aplicar migraciones fuera de tests
- `neon()` (cliente HTTP) falla con "The endpoint has been disabled" si no hay conexión activa
- Usar `npx tsx /tmp/migrate.ts` importando `pool` desde `server/db.ts` — usa WebSocket y funciona

**Why:** La interfaz y factory son el contrato estable; el adaptador concreto puede añadirse sin tocar fiscal.ts ni los tests CIC.
