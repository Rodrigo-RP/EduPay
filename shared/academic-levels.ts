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
 * Obtiene el nivel académico basado en el grado del estudiante
 */
export function getAcademicLevel(grado: string | null): NivelAcademico {
  if (!grado) return 'PRIMARIA'; // Default
  
  const gradoUpper = grado.toUpperCase().trim();
  
  // Buscar mapeo exacto
  if (GRADO_TO_NIVEL[gradoUpper]) {
    return GRADO_TO_NIVEL[gradoUpper];
  }
  
  // Buscar por patrones
  if (gradoUpper.includes('KINDER') || gradoUpper.includes('PREESCOLAR') || gradoUpper.includes('PRE')) {
    return 'KINDER';
  }
  
  if (gradoUpper.includes('PRIMARIA') || /^[1-6]/.test(gradoUpper)) {
    return 'PRIMARIA';
  }
  
  if (gradoUpper.includes('SECUNDARIA') || /^[7-9]/.test(gradoUpper)) {
    return 'SECUNDARIA';
  }
  
  if (gradoUpper.includes('BACHILLERATO') || gradoUpper.includes('PREPARATORIA') || 
      gradoUpper.includes('PREPA') || /^1[0-2]/.test(gradoUpper)) {
    return 'BACHILLERATO';
  }
  
  // Default fallback
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