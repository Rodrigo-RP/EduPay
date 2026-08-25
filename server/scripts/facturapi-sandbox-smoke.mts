import { FacturapiAdapter } from '../lib/invoicing/adapters/facturapi-adapter';

const key = process.env.FACTURAPI_SECRET_KEY;
if (!key) {
  console.error('no detectada');
  process.exitCode = 1;
}

async function main(apiKey: string): Promise<void> {
  try {
    const adapter = new FacturapiAdapter(apiKey);
    const result = await adapter.timbrar('sandbox', {
      rfc_receptor: 'ABC101010111',
      nombre_receptor: 'Cliente Sandbox Facturapi',
      uso_cfdi: 'D10',
      regimen_fiscal_receptor: '605',
      forma_pago: '28',
      metodo_pago: 'PUE',
      monto_centavos: 100,
      concepto_descripcion: 'Prueba técnica EduPay — no válida para producción',
      clave_prod_serv: '86121500',
      clave_unidad: 'E48',
      curp_alumno: 'XEXX010101HNEXXXA4',
      nivel_educativo: 'Primaria',
      aut_rvoe: '09PPR0001A',
      payment_id: Date.now(),
    });

    if (!result.uuid || !result.xml_content.includes(result.uuid) || !result.pdf_base64) {
      throw new Error('Respuesta de Facturapi incompleta.');
    }
    console.log('timbrado');
  } catch (error: any) {
    // Nunca imprimir la key ni el payload fiscal completo.
    console.error(`sandbox_error:${error?.name ?? 'Error'}:${error?.message ?? 'sin_detalle'}`);
    process.exitCode = 1;
  }
}

if (key) void main(key);