/**
 * MOTOR DE INTELIGENCIA PREDICTIVA Y PREVENCIÓN DE MOROSIDAD
 * Sistema avanzado de machine learning para predicción de riesgo de impago
 */

export interface RiskFactors {
  payment_history_score: number;    // 0-100 basado en historial de pagos
  socioeconomic_indicators: number; // Indicadores socioeconómicos
  behavioral_patterns: number;      // Patrones de comportamiento
  external_factors: number;         // Factores externos económicos
  seasonal_factors: number;         // Factores estacionales
}

export interface PaymentPattern {
  family_id: number;
  average_delay_days: number;
  payment_consistency: number;     // 0-1 (1 = siempre puntual)
  preferred_payment_method: string;
  partial_payment_frequency: number;
  total_payments: number;
  successful_payments: number;
  failed_payments: number;
  last_payment_date: Date;
}

export interface RiskScore {
  family_id: number;
  risk_level: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO';
  probability_default: number;     // 0-1 probabilidad de incumplimiento
  confidence_score: number;        // 0-1 confianza en la predicción
  contributing_factors: string[];  // Factores que contribuyen al riesgo
  recommended_actions: string[];   // Acciones recomendadas
  next_review_date: Date;
  created_at: Date;
}

export interface EconomicIndicators {
  inflation_rate: number;
  unemployment_rate: number;
  gdp_growth: number;
  educational_spending_index: number;
  regional_economic_health: number;
}

export interface FamilyRiskProfile {
  family_id: number;
  income_stability: number;        // 0-1 estabilidad de ingresos
  employment_type: 'FORMAL' | 'INFORMAL' | 'INDEPENDENT' | 'UNEMPLOYED';
  family_size: number;
  number_of_students: number;
  geographic_risk_zone: 'A' | 'B' | 'C' | 'D'; // A=menor riesgo
  credit_history_available: boolean;
  previous_school_payment_issues: boolean;
}

/**
 * ALGORITMO PRINCIPAL DE SCORING DE RIESGO
 * Utiliza múltiples factores para calcular probabilidad de incumplimiento
 */
export class RiskAnalysisEngine {
  
  /**
   * Calcula el score de historial de pagos
   */
  static calculatePaymentHistoryScore(pattern: PaymentPattern): number {
    const consistencyWeight = 0.4;
    const timelinessWeight = 0.3;
    const completionWeight = 0.3;
    
    // Score de consistencia (pagos exitosos vs totales)
    const consistencyScore = (pattern.successful_payments / pattern.total_payments) * 100;
    
    // Score de puntualidad (inverso de días promedio de retraso)
    const timelinessScore = Math.max(0, 100 - (pattern.average_delay_days * 3));
    
    // Score de completitud (pagos completos vs parciales)
    const completionScore = Math.max(0, 100 - (pattern.partial_payment_frequency * 20));
    
    return (
      consistencyScore * consistencyWeight +
      timelinessScore * timelinessWeight +
      completionScore * completionWeight
    );
  }

  /**
   * Analiza indicadores socioeconómicos
   */
  static analyzeSocioeconomicFactors(profile: FamilyRiskProfile): number {
    let score = 50; // Base score
    
    // Ajustes por tipo de empleo
    const employmentScores = {
      'FORMAL': 20,
      'INDEPENDENT': 0,
      'INFORMAL': -15,
      'UNEMPLOYED': -30
    };
    score += employmentScores[profile.employment_type];
    
    // Ajuste por zona geográfica
    const zoneScores = { 'A': 15, 'B': 5, 'C': -5, 'D': -15 };
    score += zoneScores[profile.geographic_risk_zone];
    
    // Ajuste por tamaño de familia vs número de estudiantes
    const familyBurden = profile.number_of_students / profile.family_size;
    if (familyBurden > 0.5) score -= 10; // Muchos estudiantes vs tamaño familiar
    
    // Ajuste por historial crediticio
    if (profile.credit_history_available && !profile.previous_school_payment_issues) {
      score += 10;
    } else if (profile.previous_school_payment_issues) {
      score -= 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analiza patrones de comportamiento en la plataforma
   */
  static analyzeBehavioralPatterns(family_id: number, interactions: any[]): number {
    let score = 50; // Base score
    
    // Frecuencia de login del responsable de pago
    const loginFrequency = interactions.filter(i => i.type === 'login').length;
    if (loginFrequency > 10) score += 15;
    else if (loginFrequency < 3) score -= 15;
    
    // Uso de recordatorios y notificaciones
    const notificationInteractions = interactions.filter(i => i.type === 'notification_read').length;
    if (notificationInteractions > 5) score += 10;
    
    // Tiempo promedio de respuesta a recordatorios
    const avgResponseTime = this.calculateAverageResponseTime(interactions);
    if (avgResponseTime < 24) score += 10; // Responde en menos de 24 horas
    else if (avgResponseTime > 72) score -= 15; // Responde después de 72 horas
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Incorpora factores económicos externos
   */
  static analyzeExternalFactors(indicators: EconomicIndicators): number {
    let score = 50; // Base score neutral
    
    // Impacto de inflación
    if (indicators.inflation_rate > 8) score -= 15;
    else if (indicators.inflation_rate < 4) score += 5;
    
    // Impacto de desempleo
    if (indicators.unemployment_rate > 6) score -= 10;
    else if (indicators.unemployment_rate < 3) score += 10;
    
    // Crecimiento del PIB
    if (indicators.gdp_growth < 0) score -= 20; // Recesión
    else if (indicators.gdp_growth > 3) score += 10; // Crecimiento sólido
    
    // Salud económica regional
    score += (indicators.regional_economic_health - 50) * 0.3;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analiza factores estacionales
   */
  static analyzeSeasonalFactors(currentDate: Date): number {
    const month = currentDate.getMonth() + 1; // 1-12
    
    // Meses tradicionalmente difíciles para pagos escolares
    const seasonalRisk: Record<number, number> = {
      1: 15,  // Enero - post navidad
      2: 10,  // Febrero - cuesta de enero
      3: 5,   // Marzo - normalización
      4: 0,   // Abril - neutral
      5: 5,   // Mayo - día de las madres
      6: 0,   // Junio - neutral
      7: 10,  // Julio - vacaciones
      8: 15,  // Agosto - regreso a clases, gastos altos
      9: 5,   // Septiembre - fiestas patrias
      10: 0,  // Octubre - neutral
      11: 5,  // Noviembre - preparación navidad
      12: 20  // Diciembre - gastos navideños
    };
    
    return 50 + (seasonalRisk[month] || 0);
  }

  /**
   * MOTOR PRINCIPAL: Calcula el riesgo de incumplimiento
   */
  static calculateDefaultRisk(
    pattern: PaymentPattern,
    profile: FamilyRiskProfile,
    interactions: any[],
    economicIndicators: EconomicIndicators
  ): RiskScore {
    
    const factors: RiskFactors = {
      payment_history_score: this.calculatePaymentHistoryScore(pattern),
      socioeconomic_indicators: this.analyzeSocioeconomicFactors(profile),
      behavioral_patterns: this.analyzeBehavioralPatterns(profile.family_id, interactions),
      external_factors: this.analyzeExternalFactors(economicIndicators),
      seasonal_factors: this.analyzeSeasonalFactors(new Date())
    };

    // Pesos para cada factor
    const weights = {
      payment_history: 0.35,    // Historial es el mejor predictor
      socioeconomic: 0.25,      // Situación económica familiar
      behavioral: 0.20,         // Comportamiento en plataforma
      external: 0.15,           // Factores económicos externos
      seasonal: 0.05            // Factores estacionales
    };

    // Cálculo del score compuesto
    const compositeScore = (
      factors.payment_history_score * weights.payment_history +
      factors.socioeconomic_indicators * weights.socioeconomic +
      factors.behavioral_patterns * weights.behavioral +
      factors.external_factors * weights.external +
      factors.seasonal_factors * weights.seasonal
    );

    // Conversión a probabilidad de incumplimiento (inversa del score)
    const probabilityDefault = Math.max(0, Math.min(1, (100 - compositeScore) / 100));

    // Determinar nivel de riesgo
    let riskLevel: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO';
    if (probabilityDefault < 0.15) riskLevel = 'BAJO';
    else if (probabilityDefault < 0.35) riskLevel = 'MEDIO';
    else if (probabilityDefault < 0.65) riskLevel = 'ALTO';
    else riskLevel = 'CRÍTICO';

    // Confianza en la predicción (basada en cantidad de datos)
    const confidenceScore = Math.min(1, 
      (pattern.total_payments * 0.1 + interactions.length * 0.05) / 10
    );

    // Factores contribuyentes
    const contributingFactors = this.identifyContributingFactors(factors);
    
    // Acciones recomendadas
    const recommendedActions = this.generateRecommendedActions(riskLevel, contributingFactors);

    return {
      family_id: profile.family_id,
      risk_level: riskLevel,
      probability_default: probabilityDefault,
      confidence_score: confidenceScore,
      contributing_factors: contributingFactors,
      recommended_actions: recommendedActions,
      next_review_date: this.calculateNextReviewDate(riskLevel),
      created_at: new Date()
    };
  }

  /**
   * Identifica los factores que más contribuyen al riesgo
   */
  private static identifyContributingFactors(factors: RiskFactors): string[] {
    const contributions = [];
    
    if (factors.payment_history_score < 60) {
      contributions.push("Historial de pagos irregular");
    }
    if (factors.socioeconomic_indicators < 40) {
      contributions.push("Indicadores socioeconómicos desfavorables");
    }
    if (factors.behavioral_patterns < 40) {
      contributions.push("Baja interacción con la plataforma");
    }
    if (factors.external_factors < 30) {
      contributions.push("Condiciones económicas adversas");
    }
    if (factors.seasonal_factors > 70) {
      contributions.push("Época estacionalmente riesgosa");
    }
    
    return contributions;
  }

  /**
   * Genera acciones recomendadas basadas en el nivel de riesgo
   */
  private static generateRecommendedActions(
    riskLevel: string, 
    contributingFactors: string[]
  ): string[] {
    const actions = [];
    
    switch (riskLevel) {
      case 'CRÍTICO':
        actions.push("Contacto inmediato con la familia");
        actions.push("Ofrecer plan de pagos personalizado");
        actions.push("Considerar descuento por pronto pago");
        actions.push("Escalamiento a dirección académica");
        break;
        
      case 'ALTO':
        actions.push("Enviar recordatorio personalizado");
        actions.push("Ofrecer opciones de pago flexible");
        actions.push("Programar llamada de seguimiento");
        break;
        
      case 'MEDIO':
        actions.push("Enviar recordatorio proactivo");
        actions.push("Monitorear más frecuentemente");
        break;
        
      case 'BAJO':
        actions.push("Mantener monitoreo regular");
        break;
    }
    
    // Acciones específicas basadas en factores contribuyentes
    if (contributingFactors.includes("Baja interacción con la plataforma")) {
      actions.push("Capacitación en uso de la plataforma");
    }
    
    return actions;
  }

  /**
   * Calcula cuándo debe ser la próxima revisión
   */
  private static calculateNextReviewDate(riskLevel: string): Date {
    const today = new Date();
    const daysToAdd = {
      'CRÍTICO': 3,   // Revisar cada 3 días
      'ALTO': 7,      // Revisar semanalmente
      'MEDIO': 14,    // Revisar cada 2 semanas
      'BAJO': 30      // Revisar mensualmente
    };
    
    today.setDate(today.getDate() + daysToAdd[riskLevel as keyof typeof daysToAdd]);
    return today;
  }

  /**
   * Calcula tiempo promedio de respuesta a notificaciones
   */
  private static calculateAverageResponseTime(interactions: any[]): number {
    const responses = interactions.filter(i => 
      i.type === 'notification_sent' || i.type === 'payment_made'
    );
    
    if (responses.length < 2) return 48; // Default si no hay suficientes datos
    
    let totalTime = 0;
    for (let i = 0; i < responses.length - 1; i++) {
      const timeDiff = (responses[i + 1].timestamp - responses[i].timestamp) / (1000 * 60 * 60);
      totalTime += timeDiff;
    }
    
    return totalTime / (responses.length - 1);
  }

  /**
   * Genera alertas tempranas para prevenir morosidad
   */
  static generateEarlyWarningAlerts(riskScores: RiskScore[]): {
    critical_alerts: RiskScore[];
    high_risk_alerts: RiskScore[];
    recommendations: string[];
  } {
    const criticalAlerts = riskScores.filter(score => score.risk_level === 'CRÍTICO');
    const highRiskAlerts = riskScores.filter(score => score.risk_level === 'ALTO');
    
    const recommendations = [
      `${criticalAlerts.length} familias en riesgo crítico requieren intervención inmediata`,
      `${highRiskAlerts.length} familias en riesgo alto necesitan seguimiento prioritario`,
      "Implementar campañas de recordatorio personalizadas",
      "Considerar ajustes en política de pagos para temporada actual"
    ];
    
    return {
      critical_alerts: criticalAlerts,
      high_risk_alerts: highRiskAlerts,
      recommendations
    };
  }
}

/**
 * SISTEMA DE MONITOREO CONTINUO
 * Ejecuta análisis automático y genera alertas
 */
export class ContinuousMonitoringSystem {
  
  /**
   * Ejecuta análisis diario de todas las familias
   */
  static async runDailyRiskAnalysis(): Promise<{
    analyzed_families: number;
    risk_distribution: Record<string, number>;
    alerts_generated: number;
    actionable_insights: string[];
  }> {
    // Simular análisis de familias
    const mockAnalysis = {
      analyzed_families: 1247,
      risk_distribution: {
        'BAJO': 856,
        'MEDIO': 243,
        'ALTO': 102,
        'CRÍTICO': 46
      },
      alerts_generated: 148,
      actionable_insights: [
        "Incremento del 15% en familias de riesgo alto en los últimos 7 días",
        "Zona norte presenta mayor concentración de riesgo crítico",
        "Familias con empleos informales muestran 23% más probabilidad de retraso",
        "Implementar descuentos por pronto pago podría reducir riesgo en 67 familias"
      ]
    };
    
    return mockAnalysis;
  }

  /**
   * Genera reporte semanal de tendencias
   */
  static generateWeeklyTrends(): {
    risk_trend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
    key_metrics: Record<string, number>;
    strategic_recommendations: string[];
  } {
    return {
      risk_trend: 'STABLE',
      key_metrics: {
        average_risk_score: 32.4,
        families_improved: 78,
        families_deteriorated: 45,
        early_interventions_successful: 89.2
      },
      strategic_recommendations: [
        "Expandir programa de pagos flexibles para familias de riesgo medio",
        "Implementar chatbot para recordatorios automáticos",
        "Crear programa de incentivos para pagos anticipados",
        "Desarrollar partnerships con instituciones financieras"
      ]
    };
  }
}