// Mapeo de grados académicos a niveles para precios diferenciados
export type NivelAcademico = 'KINDER' | 'PRIMARIA' | 'SECUNDARIA' | 'BACHILLERATO';

// Mapeo de grados específicos a niveles académicos
const GRADO_TO_NIVEL: Record<string, NivelAcademico> = {
  // Kinder / Preescolar
  'PRE-K': 'KINDER',
  'K1': 'KINDER',
  'K2': 'KINDER', 
  'K3': 'KINDER',
  'KINDER 1': 'KINDER',
  'KINDER 2': 'KINDER',
  'KINDER 3': 'KINDER',
  'PREESCOLAR 1': 'KINDER',
  'PREESCOLAR 2': 'KINDER',
  'PREESCOLAR 3': 'KINDER',
  
  // Primaria
  '1°': 'PRIMARIA',
  '2°': 'PRIMARIA',
  '3°': 'PRIMARIA',
  '4°': 'PRIMARIA',
  '5°': 'PRIMARIA',
  '6°': 'PRIMARIA',
  '1° PRIMARIA': 'PRIMARIA',
  '2° PRIMARIA': 'PRIMARIA',
  '3° PRIMARIA': 'PRIMARIA',
  '4° PRIMARIA': 'PRIMARIA',
  '5° PRIMARIA': 'PRIMARIA',
  '6° PRIMARIA': 'PRIMARIA',
  'PRIMERO': 'PRIMARIA',
  'SEGUNDO': 'PRIMARIA',
  'TERCERO': 'PRIMARIA',
  'CUARTO': 'PRIMARIA',
  'QUINTO': 'PRIMARIA',
  'SEXTO': 'PRIMARIA',
  
  // Secundaria
  '1° SECUNDARIA': 'SECUNDARIA',
  '2° SECUNDARIA': 'SECUNDARIA',
  '3° SECUNDARIA': 'SECUNDARIA',
  '7°': 'SECUNDARIA',
  '8°': 'SECUNDARIA',
  '9°': 'SECUNDARIA',
  'SÉPTIMO': 'SECUNDARIA',
  'OCTAVO': 'SECUNDARIA',
  'NOVENO': 'SECUNDARIA',
  
  // Bachillerato / Preparatoria
  '1° BACHILLERATO': 'BACHILLERATO',
  '2° BACHILLERATO': 'BACHILLERATO',
  '3° BACHILLERATO': 'BACHILLERATO',
  '1° PREPARATORIA': 'BACHILLERATO',
  '2° PREPARATORIA': 'BACHILLERATO',
  '3° PREPARATORIA': 'BACHILLERATO',
  '10°': 'BACHILLERATO',
  '11°': 'BACHILLERATO',
  '12°': 'BACHILLERATO',
  'DÉCIMO': 'BACHILLERATO',
  'UNDÉCIMO': 'BACHILLERATO',
  'DUODÉCIMO': 'BACHILLERATO',
};

/**
 * Obtiene el nivel académico basado en el grado del estudiante.
 *
 * Orden de evaluación (de mayor a menor señal):
 *   1. Mapa exacto — fuente de verdad para formatos institucionales conocidos.
 *   2. Palabras clave explícitas (BACHILLERATO, SECUNDARIA, PRIMARIA, KINDER…) —
 *      siempre ganan sobre patrones de dígito. "1er BACHILLERATO" → BACHILLERATO,
 *      nunca PRIMARIA.
 *   3. Patrones de dígito inicial — solo actúan cuando no hay ninguna palabra clave.
 *   4. Default PRIMARIA — para cadenas completamente ambiguas ("1er año", "texto raro").
 *
 * Decisión de diseño: el default es PRIMARIA (no error).
 *   Lanzar un error en el default bloquearía lotes completos de cargos si una escuela
 *   importa un formato de grado no estándar. El operador ve el precio autocompleto en la
 *   UI antes de confirmar, y el guard 422 en /api/charges/generate bloquea el cargo si
 *   precio_primaria=0 en el producto, actuando como red de seguridad adicional.
 *
 * Nota: `includes('PRE')` fue eliminado del check de KINDER porque capturaba 'PREPA'
 * y 'PREPARATORIA', asignándolas a KINDER en lugar de BACHILLERATO.
 */
export function getAcademicLevel(grado: string | null): NivelAcademico {
  if (!grado) return 'PRIMARIA';

  const gradoUpper = grado.toUpperCase().trim();

  // 1. Búsqueda exacta en el mapa — señal más fuerte
  if (GRADO_TO_NIVEL[gradoUpper]) return GRADO_TO_NIVEL[gradoUpper];

  // 2. Palabras clave explícitas — evaluar ANTES de cualquier patrón numérico.
  //    Un texto explícito es señal inequívoca; un dígito inicial es ambiguo.
  if (gradoUpper.includes('BACHILLERATO') || gradoUpper.includes('PREPARATORIA') ||
      gradoUpper.includes('PREPA')) {
    return 'BACHILLERATO';
  }

  if (gradoUpper.includes('SECUNDARIA')) return 'SECUNDARIA';
  if (gradoUpper.includes('PRIMARIA'))   return 'PRIMARIA';

  // KINDER: incluye KINDER y PREESCOLAR.
  // includes('PRE') eliminado — capturaba 'PREPA'/'PREPARATORIA' como KINDER.
  if (gradoUpper.includes('KINDER') || gradoUpper.includes('PREESCOLAR')) return 'KINDER';

  // 3. Patrones de dígito inicial — solo aplican cuando no hubo palabra clave.
  //    ^1[0-2] primero para que "10°", "11°", "12°" no caigan en ^[1-6].
  if (/^1[0-2]/.test(gradoUpper)) return 'BACHILLERATO';
  if (/^[7-9]/.test(gradoUpper))  return 'SECUNDARIA';
  if (/^[1-6]/.test(gradoUpper))  return 'PRIMARIA';

  // 4. Default: PRIMARIA (ver decisión de diseño arriba)
  return 'PRIMARIA';
}

/**
 * Obtiene el precio correcto de un producto según el nivel académico del estudiante
 */
export function getPriceForStudent(
  productPrices: Record<NivelAcademico, number>, 
  studentGrade: string | null
): number {
  const level = getAcademicLevel(studentGrade);
  return productPrices[level] || productPrices.PRIMARIA || 0;
}

/**
 * Lista de todos los niveles académicos disponibles
 */
export const NIVELES_ACADEMICOS: NivelAcademico[] = ['KINDER', 'PRIMARIA', 'SECUNDARIA', 'BACHILLERATO'];

/**
 * Nombres legibles de los niveles académicos
 */
export const NIVEL_NAMES: Record<NivelAcademico, string> = {
  KINDER: 'Kinder',
  PRIMARIA: 'Primaria', 
  SECUNDARIA: 'Secundaria',
  BACHILLERATO: 'Bachillerato'
};