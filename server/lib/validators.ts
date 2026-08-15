/**
 * server/lib/validators.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validadores reutilizables para campos críticos del SAT.
 * Importar desde cualquier endpoint que escriba datos fiscales.
 */

/**
 * Patrón oficial CURP actualizado mayo 2024.
 * Incluye 'X' en posición de sexo para personas no binarias.
 *
 * Estructura (18 caracteres):
 *  [A-Z]         — primera letra del primer apellido
 *  [AEIOUX]      — primera vocal interna del primer apellido (X = sin vocal)
 *  [A-Z]{2}      — primera letra del segundo apellido + primera letra del nombre
 *  [0-9]{2}      — año de nacimiento
 *  [0-1][0-9]    — mes de nacimiento
 *  [0-3][0-9]    — día de nacimiento
 *  [HMX]         — sexo: H = hombre, M = mujer, X = no binario (may 2024)
 *  [A-Z]{2}      — clave de estado de nacimiento (2 letras)
 *  [A-Z]{3}      — consonantes internas: primer apellido, segundo apellido, nombre
 *                  (incluye Ñ en el catálogo SAT; se permite [A-Z] en DB CHECK
 *                   y se valida con exactitud en la capa de aplicación)
 *  [0-9A-Z]      — dígito diferenciador (0-9 nacidos en México, A-Z extranjeros)
 *  [0-9]         — dígito verificador
 */
export const CURP_RE =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}[0-1]\d[0-3]\d[HMX][A-Z]{2}[BCDFGHJKLMNÑPQRSTVWXYZ]{3}[0-9A-Z]\d$/;

/**
 * Valida el formato oficial de una CURP mexicana.
 *
 * @param curp — cadena a validar (la función la normaliza a mayúsculas)
 * @returns true si el formato es válido
 *
 * Notas:
 *  - Valida formato, no que la CURP esté registrada en el RENAPO.
 *  - La función normaliza a mayúsculas y elimina espacios antes de validar.
 *  - Incluye Ñ en el conjunto de consonantes internas (posiciones 14-16).
 */
export function validarCurp(curp: string): boolean {
  return CURP_RE.test(curp.toUpperCase().trim());
}

/**
 * Normaliza una CURP: mayúsculas + trim.
 * Llamar antes de guardar en la DB.
 */
export function normalizarCurp(curp: string): string {
  return curp.toUpperCase().trim();
}

/**
 * Mapa nivel_educativo SAT → clave_prod_serv del catálogo SAT.
 * 86121500 — Servicios de educación prescolar, primaria y secundaria
 * 86121600 — Servicios de educación media superior
 */
export const CLAVE_PROD_SERV: Record<string, string> = {
  "Preescolar":                      "86121500",
  "Primaria":                        "86121500",
  "Secundaria":                      "86121500",
  "Profesional técnico":             "86121600",
  "Bachillerato o su equivalente":   "86121600",
};

/**
 * Mapa nivel_educativo SAT → campo a usar en institutional_info para aut_rvoe.
 * básica      → cct   (Clave de Centro de Trabajo SEP)
 * media sup.  → rvoe  (Reconocimiento de Validez Oficial de Estudios)
 */
export const CAMPO_AUT_RVOE: Record<string, "cct" | "rvoe"> = {
  "Preescolar":                      "cct",
  "Primaria":                        "cct",
  "Secundaria":                      "cct",
  "Profesional técnico":             "rvoe",
  "Bachillerato o su equivalente":   "rvoe",
};

/**
 * Formas de pago SAT que permiten deducibilidad D10.
 * Efectivo ('01') y OXXO están excluidos — el sistema los acepta pero
 * debe mostrar aviso al generar el CFDI.
 */
export const FORMAS_PAGO_DEDUCIBLES = new Set(["02","03","04","05","06","08","12","13","17","23","24","25","28","29","30"]);

/**
 * Mapa payments.metodo → forma_pago SAT.
 * 'tarjeta' es ambiguo hasta que subtipo_tarjeta esté disponible.
 */
export const METODO_A_FORMA_PAGO: Record<string, string | null> = {
  spei:     "03",
  cheque:   "02",
  efectivo: "01",  // válido en SAT pero no deducible con D10 — aviso en UI
  oxxo:     "01",  // tratado igual que efectivo
  tarjeta:  null,  // resolver con subtipo_tarjeta: crédito→'04', débito→'28'
};
