import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacturapiAdapter } from '../lib/invoicing/adapters/facturapi-adapter';
import { ProviderAuthError, ProviderNetworkError } from '../lib/invoicing/invoicing-provider';

const input = {
  rfc_receptor: 'ABC101010111',
  nombre_receptor: 'Cliente Sandbox',
  uso_cfdi: 'D10',
  regimen_fiscal_receptor: '605',
  forma_pago: '28',
  metodo_pago: 'PUE' as const,
  monto_centavos: 100,
  concepto_descripcion: 'Servicio educativo de prueba',
  clave_prod_serv: '86121500',
  clave_unidad: 'E48',
  curp_alumno: 'XEXX010101HNEXXXA4',
  nivel_educativo: 'Primaria',
  aut_rvoe: '09PPR0001A',
  payment_id: 123,
};

describe('FacturapiAdapter sandbox', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('crea, valida y descarga un CFDI sandbox timbrado', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'inv_sandbox',
        uuid: '11111111-2222-3333-4444-555555555555',
        status: 'valid',
        stamp: { date: '2026-08-25T00:00:00.000Z', sat_cert_number: '00001000000500000000' },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response('<cfdi:Comprobante UUID="11111111-2222-3333-4444-555555555555"/>'))
      .mockResolvedValueOnce(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46])));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new FacturapiAdapter('sk_test_local_mock').timbrar('sandbox', input);

    expect(result.uuid).toBe('11111111-2222-3333-4444-555555555555');
    expect(result.xml_content).toContain(result.uuid);
    expect(result.pdf_base64).toBe(Buffer.from([0x25, 0x50, 0x44, 0x46]).toString('base64'));
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.facturapi.io/v2/invoices?async=false');
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      payment_form: '28',
      payment_method: 'PUE',
      complements: [{
        type: 'custom',
        data: expect.stringContaining('iedu:instEducativas'),
      }],
    });
  });

  it('rechaza explícitamente una Live Key', async () => {
    await expect(
      new FacturapiAdapter('sk_live_not_allowed').timbrar('sandbox', input),
    ).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it('clasifica una caída al descargar el XML como error de red recuperable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'inv_sandbox',
        uuid: '11111111-2222-3333-4444-555555555555',
        status: 'valid',
        stamp: { date: '2026-08-25T00:00:00.000Z', sat_cert_number: '00001000000500000000' },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'temporarily_unavailable' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new FacturapiAdapter('sk_test_local_mock').timbrar('sandbox', input),
    ).rejects.toBeInstanceOf(ProviderNetworkError);
  });
});