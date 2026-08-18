/**
 * server/lib/invoicing/get-invoicing-provider.ts
 *
 * Factory inyectable del proveedor de timbrado.
 *
 * Patrón idéntico a resolveStripe() en campus-payment.ts:
 *   - En producción: lee env var y construye el adaptador concreto.
 *   - En tests: acepta un override para inyectar un mock sin credenciales reales.
 *
 * Para agregar un proveedor nuevo:
 *   1. Implementar InvoicingProvider en adapters/<nombre>-adapter.ts
 *   2. Agregar el case correspondiente al switch más abajo
 *   3. Añadir la(s) env var(s) necesarias y documentarlas en replit.md
 */

import type { InvoicingProvider } from './invoicing-provider';

// Mapa de overrides para tests — las claves son los nombres de proveedor
type ProviderOverrides = Partial<Record<string, InvoicingProvider>>;

/**
 * Devuelve la instancia del proveedor de timbrado para el proveedor indicado.
 *
 * @param proveedor  Nombre del proveedor ('facturapi' | ...)
 * @param overrides  Mapa opcional de mocks por nombre de proveedor (solo para tests)
 *
 * @throws Error  Si el proveedor no está soportado o la env var requerida falta.
 *                El llamador debe capturar este error y devolver HTTP 503.
 */
export function getInvoicingProvider(
  proveedor: string,
  overrides?: ProviderOverrides,
): InvoicingProvider {
  // Inyección de mock para tests — sin credenciales reales
  if (overrides?.[proveedor]) {
    return overrides[proveedor]!;
  }

  switch (proveedor) {
    case 'facturapi': {
      // ── Facturapi ─────────────────────────────────────────────────────────
      // Modelo multi-RFC: EduPay tiene una cuenta de plataforma en Facturapi.
      // Cada escuela es una "organización" dentro de esa cuenta.
      // EduPay almacena solo el organization.id devuelto por Facturapi.
      // Documentación: https://developers.facturapi.io/docs/organizations
      const apiKey = process.env.FACTURAPI_SECRET_KEY;
      if (!apiKey) {
        throw new Error(
          'FACTURAPI_SECRET_KEY no configurada — ' +
          'agrega la llave secreta de la cuenta EduPay en Facturapi ' +
          'como variable de entorno antes de activar el timbrado real.',
        );
      }
      // Importación diferida para que el import no falle si el módulo
      // del adaptador aún no existe (se implementa cuando Rodrigo elija el PAC)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FacturapiAdapter } = require('./adapters/facturapi-adapter');
      return new FacturapiAdapter(apiKey) as InvoicingProvider;
    }

    // ── Espacio reservado para proveedores futuros ─────────────────────────
    // case 'fiscalapi': {
    //   const apiKey = process.env.FISCALAPI_KEY;
    //   if (!apiKey) throw new Error('FISCALAPI_KEY no configurada');
    //   const { FiscalapiAdapter } = require('./adapters/fiscalapi-adapter');
    //   return new FiscalapiAdapter(apiKey);
    // }
    // case 'sw_sapien': {
    //   const user = process.env.SW_SAPIEN_USER;
    //   const pass = process.env.SW_SAPIEN_PASSWORD;
    //   if (!user || !pass) throw new Error('SW_SAPIEN_USER / SW_SAPIEN_PASSWORD no configuradas');
    //   const { SwSapienAdapter } = require('./adapters/sw-sapien-adapter');
    //   return new SwSapienAdapter(user, pass);
    // }

    default:
      throw new Error(
        `Proveedor de facturación no soportado: '${proveedor}'. ` +
        `Valores válidos: 'facturapi'. ` +
        `Para agregar un proveedor nuevo, implementa InvoicingProvider ` +
        `en server/lib/invoicing/adapters/ y registra el case en get-invoicing-provider.ts.`,
      );
  }
}
