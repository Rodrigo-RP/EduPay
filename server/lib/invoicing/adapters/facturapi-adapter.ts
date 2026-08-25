import {
  type CFDIEstado,
  type CFDIInput,
  type CFDIResult,
  type InvoicingProvider,
  type OrganizacionRegistrada,
  ProviderAuthError,
  ProviderNetworkError,
  ProviderStampError,
  ProviderValidationError,
} from '../invoicing-provider';

const FACTURAPI_BASE_URL = 'https://www.facturapi.io/v2';

type FacturapiInvoice = {
  id?: string;
  uuid?: string;
  status?: string;
  cancellation_status?: string;
  stamp?: {
    date?: string;
    sat_cert_number?: string;
  };
  code?: string;
};

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function errorCode(body: unknown): string | null {
  return body && typeof body === 'object' && typeof (body as any).code === 'string'
    ? (body as any).code
    : null;
}

function errorPath(body: unknown): string | null {
  const path = body && typeof body === 'object' ? (body as any).path : null;
  return typeof path === 'string' && /^[a-zA-Z0-9_[\].-]+$/.test(path) ? path : null;
}

/**
 * Adaptador sandbox de Facturapi.
 *
 * Según la referencia oficial de Facturapi:
 * - POST /v2/invoices crea un CFDI; async=false (o ausente) espera el timbrado.
 * - una sk_test_ usa el ambiente Test y una sk_live_ usa Live.
 * - GET /v2/invoices/{id}/{format} descarga el XML o PDF ya timbrado.
 *
 * Este adaptador rechaza claves Live deliberadamente. El objetivo actual es
 * validar la integración técnica en sandbox; la activación productiva requiere
 * una revisión separada de datos fiscales y configuración por campus.
 */
export class FacturapiAdapter implements InvoicingProvider {
  constructor(private readonly apiKey: string) {}

  private assertSandbox(): void {
    if (!this.apiKey.startsWith('sk_test_')) {
      throw new ProviderAuthError(
        'El adaptador de Facturapi está habilitado sólo para una Test Secret Key (sk_test_...). Live permanece desactivado.',
      );
    }
  }

  private assertSandboxOrganization(organizacionId: string): void {
    if (organizacionId !== 'sandbox') {
      throw new ProviderValidationError(
        'El adaptador Facturapi actual sólo admite la organización sandbox. No puede emitir para un campus configurado.',
      );
    }
  }

  private throwHttpError(status: number, body: unknown, operation: string): never {
    const code = errorCode(body);
    const path = errorPath(body);
    const safeDetail = code || path ? ` (${[code, path].filter(Boolean).join(':')})` : '';
    if (status === 401 || status === 403) {
      throw new ProviderAuthError(`Facturapi rechazó las credenciales${safeDetail}.`);
    }
    if (status === 400 || status === 404 || status === 422) {
      throw new ProviderValidationError(`Facturapi rechazó los datos fiscales${safeDetail}.`);
    }
    if (status >= 500 || status === 429) {
      throw new ProviderNetworkError(`Facturapi no está disponible durante ${operation}${safeDetail}.`);
    }
    throw new ProviderStampError(`Facturapi no pudo completar ${operation}${safeDetail}.`);
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<{ response: Response; body: unknown }> {
    this.assertSandbox();
    let response: Response;
    try {
      response = await fetch(`${FACTURAPI_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ProviderNetworkError('No fue posible conectar con Facturapi.');
    }

    const rawBody = await response.text();
    let body: unknown = rawBody;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      // Las descargas binarias se consumen por download(), no por request().
    }

    if (!response.ok) this.throwHttpError(response.status, body, 'la solicitud');

    return { response, body };
  }

  private async download(invoiceId: string, format: 'xml' | 'pdf'): Promise<Buffer> {
    this.assertSandbox();
    let response: Response;
    try {
      response = await fetch(`${FACTURAPI_BASE_URL}/invoices/${encodeURIComponent(invoiceId)}/${format}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
    } catch {
      throw new ProviderNetworkError(`No fue posible descargar el ${format.toUpperCase()} de Facturapi.`);
    }

    if (!response.ok) {
      const rawBody = await response.text();
      let body: unknown = rawBody;
      try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { /* respuesta binaria inesperada */ }
      this.throwHttpError(response.status, body, `la descarga de ${format.toUpperCase()}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private ieduXml(input: CFDIInput): string {
    const rfcPago = input.rfc_pago ? ` rfcPago="${escapeXmlAttribute(input.rfc_pago)}"` : '';
    return [
      '<iedu:instEducativas',
      ' version="1.0"',
      ` nombreAlumno="${escapeXmlAttribute(input.nombre_receptor)}"`,
      ` CURP="${escapeXmlAttribute(input.curp_alumno)}"`,
      ` nivelEducativo="${escapeXmlAttribute(input.nivel_educativo)}"`,
      ` autRVOE="${escapeXmlAttribute(input.aut_rvoe)}"`,
      rfcPago,
      '/>',
    ].join('');
  }

  async registrarOrganizacion(
    _cer: Buffer,
    _key: Buffer,
    _password: string,
  ): Promise<OrganizacionRegistrada> {
    this.assertSandbox();
    // Facturapi documenta que crear organizaciones y administrar CSD requiere
    // una User Secret Key. La Test Secret Key de una organización no autoriza
    // ese flujo, por lo que fallamos explícitamente antes de transmitir CSD.
    throw new ProviderAuthError(
      'Facturapi requiere una User Secret Key para registrar organizaciones y CSD. El sandbox actual usa una Test Secret Key de organización.',
    );
  }

  async timbrar(organizacion_id: string, input: CFDIInput): Promise<CFDIResult> {
    this.assertSandbox();
    this.assertSandboxOrganization(organizacion_id);
    const amount = input.monto_centavos / 100;
    if (!Number.isSafeInteger(input.monto_centavos) || amount <= 0) {
      throw new ProviderValidationError('El monto del CFDI debe ser un entero positivo en centavos.');
    }
    if (!input.aut_rvoe.trim() || !input.curp_alumno.trim()) {
      throw new ProviderValidationError('El complemento IEDU requiere CURP y autorización RVOE/CCT.');
    }

    const payload = {
      type: 'I',
      customer: {
        legal_name: input.nombre_receptor,
        tax_id: input.rfc_receptor,
        tax_system: input.regimen_fiscal_receptor,
        address: { zip: '64000' },
      },
      items: [{
        quantity: 1,
        product: {
          description: input.concepto_descripcion,
          product_key: input.clave_prod_serv,
          unit_key: input.clave_unidad,
          price: amount,
          tax_included: true,
          taxability: '01',
          taxes: [],
        },
      }],
      use: input.uso_cfdi,
      payment_form: input.forma_pago,
      payment_method: input.metodo_pago,
      currency: 'MXN',
      external_id: `edupay-sandbox-${organizacion_id}-${input.payment_id}`,
      complements: [{
        type: 'custom',
        data: this.ieduXml(input),
      }],
      namespaces: [{
        prefix: 'iedu',
        uri: 'http://www.sat.gob.mx/iedu',
        schema_location: 'http://www.sat.gob.mx/sitio_internet/cfd/iedu/iedu.xsd',
      }],
    };

    const { body } = await this.request('/invoices?async=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const invoice = body as FacturapiInvoice;
    if (invoice.status !== 'valid' || !invoice.id || !invoice.uuid || !invoice.stamp?.date || !invoice.stamp.sat_cert_number) {
      throw new ProviderStampError('Facturapi no confirmó un CFDI timbrado en sandbox.');
    }

    const [xml, pdf] = await Promise.all([
      this.download(invoice.id, 'xml'),
      this.download(invoice.id, 'pdf'),
    ]);
    if (xml.length === 0 || pdf.length === 0) {
      throw new ProviderStampError('Facturapi devolvió un CFDI sin XML o PDF.');
    }

    return {
      uuid: invoice.uuid,
      xml_content: xml.toString('utf8'),
      pdf_base64: pdf.toString('base64'),
      fecha_timbrado: new Date(invoice.stamp.date),
      no_certificado_sat: invoice.stamp.sat_cert_number,
    };
  }

  async cancelar(
    organizacion_id: string,
    uuid: string,
    motivo: string,
  ): Promise<{ acuse: string }> {
    this.assertSandboxOrganization(organizacion_id);
    const { body } = await this.request(`/invoices/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motive: motivo }),
    });
    const invoice = body as FacturapiInvoice;
    if (!invoice.id) throw new ProviderStampError('Facturapi no confirmó la cancelación del CFDI.');
    return { acuse: JSON.stringify({ id: invoice.id, cancellation_status: invoice.cancellation_status ?? null }) };
  }

  async consultarEstado(
    organizacion_id: string,
    uuid: string,
  ): Promise<CFDIEstado> {
    this.assertSandboxOrganization(organizacion_id);
    const { body } = await this.request(`/invoices/${encodeURIComponent(uuid)}`);
    const invoice = body as FacturapiInvoice;
    if (!invoice.uuid) {
      return { uuid, estado: 'no_encontrado' };
    }
    return {
      uuid: invoice.uuid,
      estado: invoice.status === 'canceled' || invoice.cancellation_status === 'accepted'
        ? 'cancelado'
        : invoice.status === 'valid'
          ? 'vigente'
          : 'no_encontrado',
    };
  }
}