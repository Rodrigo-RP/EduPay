/**
 * ALGORITMOS INTELIGENTES DE BECAS Y DESCUENTOS
 * Sistema avanzado para asignación automática de beneficios educativos
 */

export type ScholarshipCategory = 'academica' | 'socioeconomica' | 'deportiva' | 'descuento' | 'cultural';
export type AlgorithmType = 'manual' | 'automatico' | 'promedio' | 'hermanos' | 'ingresos' | 'scoring';

export interface Student {
  id: number;
  nombre_completo: string;
  grado: string;
  promedio?: number;
  hermanos_inscritos?: number;
  ingreso_familiar?: number;
  actividades_extracurriculares?: string[];
  campus_id: number;
}

export interface ScholarshipCriteria {
  promedio_minimo?: number;
  ingreso_familiar_maximo?: number;
  hermanos_minimos?: number;
  actividades_requeridas?: string[];
}

export interface ScholarshipBenefit {
  tipo: 'porcentaje' | 'monto_fijo' | 'escala';
  porcentaje?: number;
  monto_fijo_centavos?: number;
  limite_maximo_centavos?: number;
  aplica_conceptos: string[];
}

export interface ScholarshipEvaluation {
  student_id: number;
  elegible: boolean;
  score: number;
  porcentaje_sugerido: number;
  monto_sugerido_centavos: number;
  razon: string;
  criterios_cumplidos: string[];
  criterios_faltantes: string[];
}

/**
 * ALGORITMO 1: BECA POR EXCELENCIA ACADÉMICA
 * Asigna becas basadas en promedio académico con escalas progresivas
 */
export function calculateAcademicScholarship(
  student: Student,
  criteria: ScholarshipCriteria
): ScholarshipEvaluation {
  const promedio = student.promedio || 0;
  const promedioMinimo = criteria.promedio_minimo || 8.5;
  
  if (promedio < promedioMinimo) {
    return {
      student_id: student.id,
      elegible: false,
      score: promedio,
      porcentaje_sugerido: 0,
      monto_sugerido_centavos: 0,
      razon: `Promedio ${promedio} menor al mínimo requerido ${promedioMinimo}`,
      criterios_cumplidos: [],
      criterios_faltantes: ['promedio_minimo']
    };
  }

  // Escala progresiva de becas académicas
  let porcentaje = 0;
  let razon = '';
  
  if (promedio >= 9.8) {
    porcentaje = 100;
    razon = 'Excelencia Académica - Promedio sobresaliente';
  } else if (promedio >= 9.5) {
    porcentaje = 75;
    razon = 'Alto rendimiento académico';
  } else if (promedio >= 9.2) {
    porcentaje = 50;
    razon = 'Buen rendimiento académico';
  } else if (promedio >= 9.0) {
    porcentaje = 25;
    razon = 'Rendimiento académico satisfactorio';
  } else {
    porcentaje = 10;
    razon = 'Cumple requisitos mínimos';
  }

  return {
    student_id: student.id,
    elegible: true,
    score: promedio,
    porcentaje_sugerido: porcentaje,
    monto_sugerido_centavos: 0, // Se calcula contra el monto del concepto
    razon,
    criterios_cumplidos: ['promedio_minimo'],
    criterios_faltantes: []
  };
}

/**
 * ALGORITMO 2: DESCUENTO POR HERMANOS
 * Aplica descuentos automáticos cuando hay múltiples hermanos inscritos
 */
export function calculateSiblingDiscount(
  student: Student,
  criteria: ScholarshipCriteria
): ScholarshipEvaluation {
  const hermanos = student.hermanos_inscritos || 0;
  const hermanosMinimos = criteria.hermanos_minimos || 2;
  
  if (hermanos < hermanosMinimos) {
    return {
      student_id: student.id,
      elegible: false,
      score: hermanos,
      porcentaje_sugerido: 0,
      monto_sugerido_centavos: 0,
      razon: `Solo ${hermanos} hermanos inscritos, mínimo requerido: ${hermanosMinimos}`,
      criterios_cumplidos: [],
      criterios_faltantes: ['hermanos_minimos']
    };
  }

  // Escala de descuentos por hermanos
  let porcentaje = 0;
  let razon = '';
  
  if (hermanos >= 4) {
    porcentaje = 40;
    razon = 'Descuento familia numerosa (4+ hermanos)';
  } else if (hermanos === 3) {
    porcentaje = 30;
    razon = 'Descuento por 3 hermanos inscritos';
  } else if (hermanos === 2) {
    porcentaje = 20;
    razon = 'Descuento por 2 hermanos inscritos';
  }

  return {
    student_id: student.id,
    elegible: true,
    score: hermanos,
    porcentaje_sugerido: porcentaje,
    monto_sugerido_centavos: 0,
    razon,
    criterios_cumplidos: ['hermanos_minimos'],
    criterios_faltantes: []
  };
}

/**
 * ALGORITMO 3: BECA SOCIOECONÓMICA
 * Asigna becas basadas en el nivel de ingresos familiares
 */
export function calculateSocioeconomicScholarship(
  student: Student,
  criteria: ScholarshipCriteria
): ScholarshipEvaluation {
  const ingresoFamiliar = student.ingreso_familiar || 0;
  const ingresoMaximo = criteria.ingreso_familiar_maximo || 50000;
  
  if (ingresoFamiliar > ingresoMaximo) {
    return {
      student_id: student.id,
      elegible: false,
      score: ingresoFamiliar,
      porcentaje_sugerido: 0,
      monto_sugerido_centavos: 0,
      razon: `Ingreso familiar $${ingresoFamiliar} excede el máximo $${ingresoMaximo}`,
      criterios_cumplidos: [],
      criterios_faltantes: ['ingreso_familiar']
    };
  }

  // Escala inversamente proporcional al ingreso
  let porcentaje = 0;
  let razon = '';
  
  const porcentajeIngreso = (ingresoFamiliar / ingresoMaximo) * 100;
  
  if (porcentajeIngreso <= 20) {
    porcentaje = 90;
    razon = 'Situación socioeconómica crítica';
  } else if (porcentajeIngreso <= 40) {
    porcentaje = 70;
    razon = 'Situación socioeconómica vulnerable';
  } else if (porcentajeIngreso <= 60) {
    porcentaje = 50;
    razon = 'Apoyo socioeconómico moderado';
  } else if (porcentajeIngreso <= 80) {
    porcentaje = 30;
    razon = 'Apoyo socioeconómico básico';
  } else {
    porcentaje = 15;
    razon = 'Apoyo socioeconómico mínimo';
  }

  return {
    student_id: student.id,
    elegible: true,
    score: 100 - porcentajeIngreso, // Score inversamente proporcional
    porcentaje_sugerido: porcentaje,
    monto_sugerido_centavos: 0,
    razon,
    criterios_cumplidos: ['ingreso_familiar'],
    criterios_faltantes: []
  };
}

/**
 * ALGORITMO 4: BECA DEPORTIVA/CULTURAL
 * Asigna becas por participación en actividades extracurriculares
 */
export function calculateExtracurricularScholarship(
  student: Student,
  criteria: ScholarshipCriteria
): ScholarshipEvaluation {
  const actividades = student.actividades_extracurriculares || [];
  const actividadesRequeridas = criteria.actividades_requeridas || [];
  
  const actividadesCumplidas = actividades.filter(a => 
    actividadesRequeridas.includes(a)
  );
  
  if (actividadesCumplidas.length === 0) {
    return {
      student_id: student.id,
      elegible: false,
      score: 0,
      porcentaje_sugerido: 0,
      monto_sugerido_centavos: 0,
      razon: 'No participa en actividades extracurriculares requeridas',
      criterios_cumplidos: [],
      criterios_faltantes: ['actividades_extracurriculares']
    };
  }

  // Porcentaje basado en número y tipo de actividades
  const porcentaje = Math.min(actividadesCumplidas.length * 15, 60);
  const razon = `Participación en: ${actividadesCumplidas.join(', ')}`;

  return {
    student_id: student.id,
    elegible: true,
    score: actividadesCumplidas.length,
    porcentaje_sugerido: porcentaje,
    monto_sugerido_centavos: 0,
    razon,
    criterios_cumplidos: ['actividades_extracurriculares'],
    criterios_faltantes: []
  };
}

/**
 * ALGORITMO 5: SCORING COMBINADO
 * Evalúa múltiples criterios y asigna una puntuación compuesta
 */
export function calculateCompositeScore(
  student: Student,
  criteria: ScholarshipCriteria,
  weights: { academic: number; socioeconomic: number; extracurricular: number }
): ScholarshipEvaluation {
  const academicEval = calculateAcademicScholarship(student, criteria);
  const socioEval = calculateSocioeconomicScholarship(student, criteria);
  const extraEval = calculateExtracurricularScholarship(student, criteria);
  
  // Normalizar scores a escala 0-100
  const academicScore = academicEval.elegible ? (academicEval.score / 10) * 100 : 0;
  const socioScore = socioEval.elegible ? socioEval.score : 0;
  const extraScore = extraEval.elegible ? (extraEval.score / 4) * 100 : 0;
  
  // Calcular score ponderado
  const compositeScore = (
    (academicScore * weights.academic) +
    (socioScore * weights.socioeconomic) +
    (extraScore * weights.extracurricular)
  ) / (weights.academic + weights.socioeconomic + weights.extracurricular);
  
  // Determinar porcentaje basado en score compuesto
  let porcentaje = 0;
  let razon = '';
  
  if (compositeScore >= 90) {
    porcentaje = 80;
    razon = 'Excelencia integral - Múltiples criterios sobresalientes';
  } else if (compositeScore >= 80) {
    porcentaje = 65;
    razon = 'Desempeño destacado en múltiples áreas';
  } else if (compositeScore >= 70) {
    porcentaje = 50;
    razon = 'Buen desempeño integral';
  } else if (compositeScore >= 60) {
    porcentaje = 35;
    razon = 'Desempeño satisfactorio';
  } else if (compositeScore >= 50) {
    porcentaje = 20;
    razon = 'Cumple criterios básicos';
  }
  
  const criteriosCumplidos = [];
  if (academicEval.elegible) criteriosCumplidos.push('académico');
  if (socioEval.elegible) criteriosCumplidos.push('socioeconómico');
  if (extraEval.elegible) criteriosCumplidos.push('extracurricular');
  
  return {
    student_id: student.id,
    elegible: compositeScore >= 50,
    score: compositeScore,
    porcentaje_sugerido: porcentaje,
    monto_sugerido_centavos: 0,
    razon,
    criterios_cumplidos: criteriosCumplidos,
    criterios_faltantes: []
  };
}

/**
 * FUNCIÓN PRINCIPAL: EVALUAR ESTUDIANTE PARA BECA
 * Coordina la evaluación según el algoritmo especificado
 */
export function evaluateStudentForScholarship(
  student: Student,
  algorithm: AlgorithmType,
  criteria: ScholarshipCriteria,
  weights?: { academic: number; socioeconomic: number; extracurricular: number }
): ScholarshipEvaluation {
  switch (algorithm) {
    case 'promedio':
      return calculateAcademicScholarship(student, criteria);
    
    case 'hermanos':
      return calculateSiblingDiscount(student, criteria);
    
    case 'ingresos':
      return calculateSocioeconomicScholarship(student, criteria);
    
    case 'scoring':
      return calculateCompositeScore(
        student, 
        criteria, 
        weights || { academic: 0.4, socioeconomic: 0.4, extracurricular: 0.2 }
      );
    
    case 'automatico':
      // Ejecuta múltiples algoritmos y toma el mejor resultado
      const evaluations = [
        calculateAcademicScholarship(student, criteria),
        calculateSiblingDiscount(student, criteria),
        calculateSocioeconomicScholarship(student, criteria),
        calculateExtracurricularScholarship(student, criteria)
      ];
      
      const bestEvaluation = evaluations
        .filter(e => e.elegible)
        .sort((a, b) => b.porcentaje_sugerido - a.porcentaje_sugerido)[0];
      
      return bestEvaluation || evaluations[0];
    
    case 'manual':
    default:
      return {
        student_id: student.id,
        elegible: true,
        score: 0,
        porcentaje_sugerido: 0,
        monto_sugerido_centavos: 0,
        razon: 'Evaluación manual requerida',
        criterios_cumplidos: [],
        criterios_faltantes: []
      };
  }
}

/**
 * UTILIDAD: CALCULAR MONTO FINAL CON DESCUENTO
 */
export function calculateDiscountedAmount(
  originalAmountCentavos: number,
  porcentajeDescuento: number,
  montoFijoDescuentoCentavos: number = 0,
  limiteMaximoCentavos?: number
): number {
  let descuento = 0;
  
  if (montoFijoDescuentoCentavos > 0) {
    descuento = montoFijoDescuentoCentavos;
  } else if (porcentajeDescuento > 0) {
    descuento = Math.floor((originalAmountCentavos * porcentajeDescuento) / 100);
  }
  
  // Aplicar límite máximo si existe
  if (limiteMaximoCentavos && descuento > limiteMaximoCentavos) {
    descuento = limiteMaximoCentavos;
  }
  
  return Math.max(0, originalAmountCentavos - descuento);
}

/**
 * PRESETS DE CONFIGURACIÓN COMÚN
 */
export const SCHOLARSHIP_PRESETS = {
  EXCELENCIA_ACADEMICA: {
    categoria: 'academica' as ScholarshipCategory,
    algoritmo: 'promedio' as AlgorithmType,
    criterios: { promedio_minimo: 9.0 },
    beneficios: { tipo: 'porcentaje' as const, aplica_conceptos: ['colegiatura'] }
  },
  
  DESCUENTO_HERMANOS: {
    categoria: 'descuento' as ScholarshipCategory,
    algoritmo: 'hermanos' as AlgorithmType,
    criterios: { hermanos_minimos: 2 },
    beneficios: { tipo: 'porcentaje' as const, aplica_conceptos: ['colegiatura', 'inscripcion'] }
  },
  
  BECA_SOCIOECONOMICA: {
    categoria: 'socioeconomica' as ScholarshipCategory,
    algoritmo: 'ingresos' as AlgorithmType,
    criterios: { ingreso_familiar_maximo: 40000 },
    beneficios: { tipo: 'porcentaje' as const, aplica_conceptos: ['colegiatura'] }
  },
  
  BECA_DEPORTIVA: {
    categoria: 'deportiva' as ScholarshipCategory,
    algoritmo: 'automatico' as AlgorithmType,
    criterios: { actividades_requeridas: ['futbol', 'basquetbol', 'natacion', 'atletismo'] },
    beneficios: { tipo: 'porcentaje' as const, aplica_conceptos: ['colegiatura'] }
  }
};