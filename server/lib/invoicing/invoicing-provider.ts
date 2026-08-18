/**
 * server/lib/invoicing/invoicing-provider.ts
 *
 * Interfaz abstracta del proveedor de timbrado CFDI.
 *
 * El adaptador concreto (Facturapi, Fiscalapi, SW Sapien…) implementa esta
 * interfaz. El código de negocio (fiscal.ts) solo habla con InvoicingProvider —
 * nunca con el SDK o la API HTTP de un proveedor específico.
 *
 * Principio de seguridad innegociable:
 *   EduPay NUNCA persiste bytes de .cer / .key.
 *   `registrarOrganizacion` recibe los buffers en memoria, los reenvía al
 *   proveedor dentro de la misma request, y el llamador los descarta
 *   inmediatamente tras el await. El proveedor almacena el CSD de forma
 *   segura y devuelve solo un organizacion_id opaco.
 */

// ─── Tipos de entrada ────────────────────────────────────────────────────────

/**
 * Datos necesarios para generar un CFDI 4.0 de ingreso con complemento IEDU.
 * El adaptador es responsable de mapear estos campos al XSD del SAT.
 */
export interface CFDIInput {
  // ── Receptor ──────────────────────────────────────────────────────────────
  rfc_receptor:               string;   // RFC del tutor / pagador
  nombre_receptor:            string;
  uso_cfdi:                   string;   // SAT c_UsoCFDI: 'D10' por defecto
  regimen_fiscal_receptor:    string;   // SAT c_RegimenFiscal del receptor

  // ── Comprobante ───────────────────────────────────────────────────────────
  forma_pago:                 string;   // SAT c_FormaPago: '01','04','28'…
  metodo_pago:                'PUE' | 'PPD';
  monto_centavos:             number;   // En centavos; el adaptador convierte a MXN
  concepto_descripcion:       string;   // Descripción del servicio educativo
  clave_prod_serv:            string;   // SAT c_ClaveProdServ: 86121500 | 86121600
  clave_unidad:               string;   // SAT c_ClaveUnidad: 'E48' (servicio educativo)

  // ── Complemento IEDU (SAT XSD iedu.pdf) ──────────────────────────────────
  curp_alumno:                string;   // CURP del alumno (18 chars, regex SAT)
  nivel_educativo:            string;   // Exactamente uno de los 5 valores catálogo SAT
  aut_rvoe:                   string;   // CCT (básica) | RVOE (bachillerato/técnico)
  rfc_pago?:                  string;   // Solo si el pagador difiere del receptor

  // ── Referencia interna (trazabilidad) ────────────────────────────────────
  payment_id:                 number;   // Ignorado en el XML; permite correlación
}

/**
 * Resultado exitoso de un timbrado real ante el SAT.
 * Todos los campos son datos reales — no hay UUIDs simulados aquí.
 */
export interface CFDIResult {
  uuid:                string;  // UUID fiscal SAT (36 chars, formato 8-4-4-4-12)
  xml_content:         string;  // XML timbrado completo (~5–15 KB, UTF-8)
  pdf_base64:          string;  // PDF en base64 generado por el proveedor
  fecha_timbrado:      Date;
  no_certificado_sat:  string;  // Número de certificado del SAT (para validación)
}

/**
 * Estado de un CFDI previamente timbrado, consultado directamente al SAT
 * a través del proveedor. Útil para sincronización y auditoría.
 */
export interface CFDIEstado {
  uuid:                string;
  estado:              'vigente' | 'cancelado' | 'no_encontrado';
  fecha_cancelacion?:  Date;
  motivo_cancelacion?: string;  // SAT c_MotivoCancelacion cuando aplica
}

/**
 * Resultado del registro exitoso de una organización (RFC + CSD) en el proveedor.
 *
 * El proveedor valida el CSD contra el SAT, lo almacena de forma segura,
 * y devuelve un identificador opaco. EduPay persiste únicamente ese ID.
 */
export interface OrganizacionRegistrada {
  organizacion_id:      string;  // ID opaco del proveedor — lo único que guarda EduPay
  rfc:                  string;  // RFC confirmado por el proveedor (validado ante SAT)
  razon_social:         string;  // Nombre legal confirmado por el proveedor
  fecha_vencimiento_csd: Date;   // Extraída del certificado por el proveedor
}

// ─── Interfaz del proveedor ──────────────────────────────────────────────────

export interface InvoicingProvider {
  /**
   * Registra un RFC con su CSD en el proveedor de timbrado.
   *
   * SEGURIDAD:
   *   - Los buffers `cer` y `key` viven exclusivamente en memoria (multer memoryStorage).
   *   - El llamador DEBE descartar las referencias a ambos buffers inmediatamente
   *     después de este await (asignar null), antes de cualquier otra operación.
   *   - El proveedor almacena el CSD en su propia infraestructura segura.
   *   - EduPay persiste únicamente el organizacion_id devuelto.
   *   - Si un proveedor candidato no soporta este modelo (exige que EduPay
   *     almacene el CSD), su adaptador no puede implementar esta interfaz.
   *
   * @param cer      Buffer del archivo .cer (certificado público)
   * @param key      Buffer del archivo .key (llave privada — NUNCA persiste)
   * @param password Contraseña de la llave privada
   *
   * @throws ProviderAuthError       CSD inválido o contraseña incorrecta
   * @throws ProviderNetworkError    Fallo de conectividad con el proveedor
   * @throws ProviderValidationError RFC no encontrado en el SAT o CSD vencido
   */
  registrarOrganizacion(
    cer:      Buffer,
    key:      Buffer,
    password: string,
  ): Promise<OrganizacionRegistrada>;

  /**
   * Timbra un CFDI ante el SAT para la organización identificada por
   * organizacion_id.
   *
   * @param organizacion_id  ID devuelto por registrarOrganizacion
   * @param input            Datos del CFDI a generar
   *
   * @throws ProviderValidationError Datos CFDI inválidos (RFC, CURP, nivel, etc.)
   * @throws ProviderStampError      Error del SAT al timbrar (folios agotados, etc.)
   * @throws ProviderNetworkError    Fallo de conectividad con el proveedor
   */
  timbrar(
    organizacion_id: string,
    input:           CFDIInput,
  ): Promise<CFDIResult>;

  /**
   * Solicita la cancelación de un CFDI al SAT a través del proveedor.
   * Devuelve el acuse de cancelación emitido por el SAT.
   *
   * @param organizacion_id  ID de la organización emisora
   * @param uuid             UUID fiscal del CFDI a cancelar
   * @param motivo           SAT c_MotivoCancelacion: '01','02','03','04'
   *
   * @throws ProviderNetworkError  Fallo de conectividad con el proveedor o el SAT
   * @throws ProviderStampError    El CFDI no puede cancelarse (plazo vencido, etc.)
   */
  cancelar(
    organizacion_id: string,
    uuid:            string,
    motivo:          string,
  ): Promise<{ acuse: string }>;

  /**
   * Consulta el estado actual de un CFDI directamente ante el SAT.
   *
   * @param organizacion_id  ID de la organización emisora
   * @param uuid             UUID fiscal a consultar
   */
  consultarEstado(
    organizacion_id: string,
    uuid:            string,
  ): Promise<CFDIEstado>;
}

// ─── Errores tipados ─────────────────────────────────────────────────────────

/** CSD inválido, contraseña incorrecta, o certificado no reconocido por el SAT. */
export class ProviderAuthError extends Error {
  readonly code = 'PROVIDER_AUTH_ERROR' as const;
  constructor(message: string) { super(message); this.name = 'ProviderAuthError'; }
}

/** Fallo de red al conectarse con el proveedor de timbrado o con el SAT. */
export class ProviderNetworkError extends Error {
  readonly code = 'PROVIDER_NETWORK_ERROR' as const;
  constructor(message: string) { super(message); this.name = 'ProviderNetworkError'; }
}

/** Datos del CFDI inválidos (RFC inexistente, CURP mal formada, nivel no permitido, etc.). */
export class ProviderValidationError extends Error {
  readonly code = 'PROVIDER_VALIDATION_ERROR' as const;
  constructor(message: string) { super(message); this.name = 'ProviderValidationError'; }
}

/** Error del SAT durante el timbrado (folios agotados, RFC no encontrado, etc.). */
export class ProviderStampError extends Error {
  readonly code = 'PROVIDER_STAMP_ERROR' as const;
  constructor(message: string) { super(message); this.name = 'ProviderStampError'; }
}
