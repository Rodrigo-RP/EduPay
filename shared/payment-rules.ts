/**
 * SISTEMA AVANZADO DE REGLAS DE PAGO
 * Plataforma líder en gestión de pagos educativos
 */

import { addDays, isWeekend, format, isAfter, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

// Calendario SEP 2025-2026 - Días no laborales oficiales
export const SEP_NON_WORKING_DAYS_2025_2026: Date[] = [
  // Agosto 2025
  new Date(2025, 7, 19), // Consejo técnico escolar fase intensiva
  new Date(2025, 7, 20), // Consejo técnico escolar fase intensiva
  new Date(2025, 7, 21), // Consejo técnico escolar fase intensiva
  new Date(2025, 7, 22), // Consejo técnico escolar fase intensiva
  new Date(2025, 7, 23), // Consejo técnico escolar fase intensiva
  
  // Septiembre 2025
  new Date(2025, 8, 16), // Día de la Independencia
  
  // Octubre 2025
  new Date(2025, 9, 31), // Consejo técnico escolar sesión ordinaria
  
  // Noviembre 2025
  new Date(2025, 10, 3), // Día de Muertos (observado)
  new Date(2025, 10, 17), // Día de la Revolución Mexicana (observado)
  new Date(2025, 10, 28), // Consejo técnico escolar sesión ordinaria
  
  // Diciembre 2025 - Vacaciones de invierno
  new Date(2025, 11, 22), // Inicio vacaciones
  new Date(2025, 11, 23),
  new Date(2025, 11, 24),
  new Date(2025, 11, 25), // Navidad
  new Date(2025, 11, 26),
  new Date(2025, 11, 27),
  new Date(2025, 11, 28),
  new Date(2025, 11, 29),
  new Date(2025, 11, 30),
  new Date(2025, 11, 31),
  
  // Enero 2026
  new Date(2026, 0, 1), // Año Nuevo
  new Date(2026, 0, 2),
  new Date(2026, 0, 3),
  new Date(2026, 0, 6), // Día de Reyes
  new Date(2026, 0, 7),
  new Date(2026, 0, 30), // Consejo técnico escolar sesión ordinaria
  
  // Febrero 2026
  new Date(2026, 1, 2), // Día de la Constitución (observado)
  new Date(2026, 1, 27), // Consejo técnico escolar sesión ordinaria
  
  // Marzo 2026
  new Date(2026, 2, 16), // Natalicio de Benito Juárez (observado)
  new Date(2026, 2, 27), // Consejo técnico escolar sesión ordinaria
  
  // Abril 2026 - Vacaciones de Semana Santa
  new Date(2026, 3, 6), // Inicio vacaciones
  new Date(2026, 3, 7),
  new Date(2026, 3, 8),
  new Date(2026, 3, 9),
  new Date(2026, 3, 10), // Viernes Santo
  new Date(2026, 3, 13),
  new Date(2026, 3, 17),
  new Date(2026, 3, 24), // Consejo técnico escolar sesión ordinaria
  
  // Mayo 2026
  new Date(2026, 4, 1), // Día del Trabajo
  new Date(2026, 4, 5), // Batalla de Puebla
  new Date(2026, 4, 15), // Día del Maestro
  new Date(2026, 4, 29), // Consejo técnico escolar sesión ordinaria
  
  // Junio 2026
  new Date(2026, 5, 26), // Consejo técnico escolar sesión ordinaria
  
  // Julio 2026 - Vacaciones de verano
  new Date(2026, 6, 1), // Inicio vacaciones
  // ... resto del mes de julio (vacaciones)
];

export type PaymentRuleType = 'percentage' | 'fixed_amount' | 'progressive' | 'compound';
export type GracePeriodUnit = 'days' | 'weeks';

export interface PaymentRule {
  id: number;
  campus_id: number;
  name: string;
  description: string;
  rule_type: PaymentRuleType;
  is_active: boolean;
  
  // Configuración básica
  grace_period_days: number;
  grace_period_unit: GracePeriodUnit;
  
  // Reglas de recargo
  late_fee_percentage?: number; // Para tipo 'percentage'
  late_fee_fixed_amount_centavos?: number; // Para tipo 'fixed_amount'
  
  // Reglas progresivas
  progressive_rules?: ProgressiveRule[];
  
  // Configuración avanzada
  max_late_fee_centavos?: number; // Límite máximo de recargo
  min_late_fee_centavos?: number; // Mínimo de recargo
  compound_daily: boolean; // Si se calcula diariamente
  applies_to_weekends: boolean; // Si aplica en fines de semana
  applies_to_holidays: boolean; // Si aplica en días festivos
  
  // Configuración de conceptos
  applies_to_concepts: string[]; // IDs de conceptos donde aplica
  
  created_at: Date;
  updated_at: Date;
}

export interface ProgressiveRule {
  days_from: number;
  days_to: number;
  fee_percentage?: number;
  fee_fixed_amount_centavos?: number;
}

/**
 * Verifica si una fecha es día hábil según el calendario SEP
 */
export function isBusinessDay(date: Date): boolean {
  // Verificar si es fin de semana
  if (isWeekend(date)) {
    return false;
  }
  
  // Verificar si está en el calendario de días no laborales SEP
  const dateString = format(date, 'yyyy-MM-dd');
  const isHoliday = SEP_NON_WORKING_DAYS_2025_2026.some(
    holiday => format(holiday, 'yyyy-MM-dd') === dateString
  );
  
  return !isHoliday;
}

/**
 * Ajusta una fecha de pago al siguiente día hábil si cae en día inhábil
 */
export function adjustPaymentDateToBusinessDay(originalDate: Date): Date {
  let adjustedDate = new Date(originalDate);
  
  while (!isBusinessDay(adjustedDate)) {
    adjustedDate = addDays(adjustedDate, 1);
  }
  
  return adjustedDate;
}

/**
 * Calcula el recargo por pago extemporáneo según las reglas configuradas
 */
export function calculateLateFee(
  rule: PaymentRule,
  originalAmount: number,
  dueDate: Date,
  paymentDate: Date = new Date()
): {
  lateFeeAmount: number;
  daysLate: number;
  adjustedDueDate: Date;
  isLate: boolean;
  calculation: string;
} {
  // Ajustar fecha de vencimiento al siguiente día hábil si es necesario
  const adjustedDueDate = adjustPaymentDateToBusinessDay(dueDate);
  
  // Calcular días de retraso (solo días hábiles si así está configurado)
  let daysLate = 0;
  if (isAfter(paymentDate, adjustedDueDate)) {
    if (rule.applies_to_weekends && rule.applies_to_holidays) {
      // Incluir todos los días
      daysLate = differenceInDays(paymentDate, adjustedDueDate);
    } else {
      // Contar solo días hábiles
      let currentDate = addDays(adjustedDueDate, 1);
      while (currentDate <= paymentDate) {
        if (isBusinessDay(currentDate) || 
            (rule.applies_to_weekends && isWeekend(currentDate))) {
          daysLate++;
        }
        currentDate = addDays(currentDate, 1);
      }
    }
  }
  
  // Aplicar período de gracia
  const gracePeriodDays = rule.grace_period_unit === 'weeks' 
    ? rule.grace_period_days * 7 
    : rule.grace_period_days;
  
  const effectiveDaysLate = Math.max(0, daysLate - gracePeriodDays);
  const isLate = effectiveDaysLate > 0;
  
  if (!isLate) {
    return {
      lateFeeAmount: 0,
      daysLate: effectiveDaysLate,
      adjustedDueDate,
      isLate: false,
      calculation: `Sin recargo - dentro del período de gracia (${gracePeriodDays} días)`
    };
  }
  
  let lateFeeAmount = 0;
  let calculation = '';
  
  switch (rule.rule_type) {
    case 'percentage':
      lateFeeAmount = Math.round(originalAmount * (rule.late_fee_percentage! / 100));
      calculation = `${rule.late_fee_percentage}% del monto original ($${(originalAmount/100).toFixed(2)})`;
      break;
      
    case 'fixed_amount':
      lateFeeAmount = rule.late_fee_fixed_amount_centavos!;
      calculation = `Recargo fijo de $${(lateFeeAmount/100).toFixed(2)}`;
      break;
      
    case 'progressive':
      if (rule.progressive_rules) {
        const applicableRule = rule.progressive_rules.find(
          pr => effectiveDaysLate >= pr.days_from && effectiveDaysLate <= pr.days_to
        );
        
        if (applicableRule) {
          if (applicableRule.fee_percentage) {
            lateFeeAmount = Math.round(originalAmount * (applicableRule.fee_percentage / 100));
            calculation = `${applicableRule.fee_percentage}% (${effectiveDaysLate} días de retraso)`;
          } else if (applicableRule.fee_fixed_amount_centavos) {
            lateFeeAmount = applicableRule.fee_fixed_amount_centavos;
            calculation = `$${(lateFeeAmount/100).toFixed(2)} fijo (${effectiveDaysLate} días de retraso)`;
          }
        }
      }
      break;
      
    case 'compound':
      // Recargo compuesto diario
      const dailyRate = (rule.late_fee_percentage! / 100) / 30; // Convertir porcentaje mensual a diario
      lateFeeAmount = Math.round(originalAmount * dailyRate * effectiveDaysLate);
      calculation = `${rule.late_fee_percentage}% mensual compuesto por ${effectiveDaysLate} días`;
      break;
  }
  
  // Aplicar límites máximos y mínimos
  if (rule.max_late_fee_centavos && lateFeeAmount > rule.max_late_fee_centavos) {
    lateFeeAmount = rule.max_late_fee_centavos;
    calculation += ` (limitado a máximo $${(rule.max_late_fee_centavos/100).toFixed(2)})`;
  }
  
  if (rule.min_late_fee_centavos && lateFeeAmount < rule.min_late_fee_centavos) {
    lateFeeAmount = rule.min_late_fee_centavos;
    calculation += ` (mínimo $${(rule.min_late_fee_centavos/100).toFixed(2)})`;
  }
  
  return {
    lateFeeAmount,
    daysLate: effectiveDaysLate,
    adjustedDueDate,
    isLate: true,
    calculation
  };
}

/**
 * Configuraciones predefinidas de reglas de pago más utilizadas en México
 */
export const PAYMENT_RULE_PRESETS: Omit<PaymentRule, 'id' | 'campus_id' | 'created_at' | 'updated_at'>[] = [
  {
    name: "Estándar Mexicano",
    description: "3% mensual sobre saldos vencidos con 5 días de gracia",
    rule_type: 'percentage',
    is_active: true,
    grace_period_days: 5,
    grace_period_unit: 'days',
    late_fee_percentage: 3,
    compound_daily: false,
    applies_to_weekends: false,
    applies_to_holidays: false,
    applies_to_concepts: [],
    max_late_fee_centavos: 500000, // $5,000 MXN máximo
  },
  
  {
    name: "Recargo Fijo Básico",
    description: "Recargo fijo de $200 pesos con 3 días de gracia",
    rule_type: 'fixed_amount',
    is_active: true,
    grace_period_days: 3,
    grace_period_unit: 'days',
    late_fee_fixed_amount_centavos: 20000, // $200 MXN
    compound_daily: false,
    applies_to_weekends: false,
    applies_to_holidays: false,
    applies_to_concepts: [],
  },
  
  {
    name: "Progresivo por Días",
    description: "Recargo progresivo: 1% (1-15 días), 2% (16-30 días), 3% (31+ días)",
    rule_type: 'progressive',
    is_active: true,
    grace_period_days: 7,
    grace_period_unit: 'days',
    compound_daily: false,
    applies_to_weekends: false,
    applies_to_holidays: false,
    applies_to_concepts: [],
    progressive_rules: [
      { days_from: 1, days_to: 15, fee_percentage: 1 },
      { days_from: 16, days_to: 30, fee_percentage: 2 },
      { days_from: 31, days_to: 999, fee_percentage: 3 },
    ],
  },
  
  {
    name: "Solo Colegiaturas Premium",
    description: "2% mensual compuesto solo para colegiaturas con 10 días de gracia",
    rule_type: 'compound',
    is_active: true,
    grace_period_days: 10,
    grace_period_unit: 'days',
    late_fee_percentage: 2,
    compound_daily: true,
    applies_to_weekends: false,
    applies_to_holidays: false,
    applies_to_concepts: ['colegiatura'],
    max_late_fee_centavos: 1000000, // $10,000 MXN máximo
  }
];

/**
 * Genera reporte de impacto de reglas de pago
 */
export function generatePaymentRuleReport(
  rule: PaymentRule,
  sampleAmounts: number[] = [50000, 100000, 200000, 500000] // $500, $1000, $2000, $5000
): {
  rule: PaymentRule;
  scenarios: Array<{
    originalAmount: number;
    daysLate: number;
    lateFee: number;
    totalAmount: number;
    calculation: string;
  }>;
} {
  const scenarios = [];
  const testDays = [1, 7, 15, 30, 60];
  
  for (const amount of sampleAmounts) {
    for (const days of testDays) {
      const dueDate = addDays(new Date(), -days);
      const result = calculateLateFee(rule, amount, dueDate);
      
      scenarios.push({
        originalAmount: amount,
        daysLate: days,
        lateFee: result.lateFeeAmount,
        totalAmount: amount + result.lateFeeAmount,
        calculation: result.calculation
      });
    }
  }
  
  return { rule, scenarios };
}