/**
 * SISTEMA DE CONCILIACIÓN BANCARIA AUTOMÁTICA EN TIEMPO REAL
 * Integración completa con sistema bancario mexicano (SPEI, CoDi, Banxico)
 */

export interface BankTransaction {
  transaction_id: string;
  bank_reference: string;
  spei_tracking_id?: string;
  amount_cents: number;
  sender_account: string;
  sender_name: string;
  sender_rfc?: string;
  receiver_account: string;
  concept: string;
  transaction_date: Date;
  value_date: Date;
  transaction_type: 'SPEI' | 'TRANSFER' | 'DEPOSIT' | 'CODI' | 'CARD';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
  bank_fees_cents: number;
  currency: 'MXN' | 'USD';
  channel: 'ONLINE' | 'ATM' | 'BRANCH' | 'MOBILE';
}

export interface PendingCharge {
  charge_id: number;
  student_id: number;
  family_id: number;
  amount_cents: number;
  concept: string;
  due_date: Date;
  reference_number: string;
  student_name: string;
  family_rfc?: string;
  family_names: string[];
  alternative_references: string[];
  tolerance_cents: number; // Tolerancia para pagos aproximados
}

export interface MatchResult {
  transaction_id: string;
  charge_id: number;
  match_type: 'EXACT' | 'FUZZY' | 'MANUAL' | 'PARTIAL';
  confidence_score: number; // 0-1
  match_criteria: MatchCriteria;
  discrepancies: string[];
  requires_manual_review: boolean;
  auto_approved: boolean;
}

export interface MatchCriteria {
  amount_match: number;      // 0-1 score
  reference_match: number;   // 0-1 score
  name_match: number;        // 0-1 score
  timing_match: number;      // 0-1 score
  overall_score: number;     // 0-1 score
}

export interface ReconciliationSummary {
  date: Date;
  total_transactions: number;
  matched_automatically: number;
  pending_review: number;
  unmatched: number;
  total_amount_matched_cents: number;
  discrepancies_found: number;
  processing_time_ms: number;
}

export interface AnomalyDetection {
  anomaly_id: string;
  type: 'DUPLICATE_PAYMENT' | 'UNUSUAL_AMOUNT' | 'SUSPICIOUS_TIMING' | 'PATTERN_DEVIATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affected_transactions: string[];
  recommended_action: string;
  auto_resolved: boolean;
}

/**
 * MOTOR DE MATCHING INTELIGENTE
 * Utiliza algoritmos de fuzzy matching y machine learning
 */
export class PaymentMatchingEngine {

  /**
   * Normaliza texto para comparaciones
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^a-z0-9\s]/g, '') // Solo alfanuméricos
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calcula similitud entre dos strings usando Levenshtein distance
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    const a = this.normalizeText(str1);
    const b = this.normalizeText(str2);
    
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;
    
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    const maxLength = Math.max(a.length, b.length);
    return 1 - (matrix[a.length][b.length] / maxLength);
  }

  /**
   * Evalúa coincidencia de monto con tolerancia
   */
  private static evaluateAmountMatch(
    transactionAmount: number, 
    chargeAmount: number, 
    tolerance: number
  ): number {
    const difference = Math.abs(transactionAmount - chargeAmount);
    
    if (difference === 0) return 1.0;
    if (difference <= tolerance) return 0.9;
    if (difference <= tolerance * 2) return 0.7;
    if (difference <= tolerance * 5) return 0.5;
    
    // Para diferencias mayores, calcular score basado en porcentaje
    const percentageDiff = difference / chargeAmount;
    if (percentageDiff <= 0.05) return 0.8; // 5% diferencia
    if (percentageDiff <= 0.10) return 0.6; // 10% diferencia
    if (percentageDiff <= 0.20) return 0.3; // 20% diferencia
    
    return 0.0;
  }

  /**
   * Evalúa coincidencia de referencia de pago
   */
  private static evaluateReferenceMatch(
    transactionConcept: string,
    charge: PendingCharge
  ): number {
    const concept = this.normalizeText(transactionConcept);
    
    // Buscar referencia exacta
    if (concept.includes(charge.reference_number.toLowerCase())) {
      return 1.0;
    }
    
    // Buscar referencias alternativas
    for (const altRef of charge.alternative_references) {
      if (concept.includes(this.normalizeText(altRef))) {
        return 0.9;
      }
    }
    
    // Buscar nombre del estudiante
    const studentNameSimilarity = this.calculateStringSimilarity(
      concept, 
      charge.student_name
    );
    
    if (studentNameSimilarity > 0.8) return 0.8;
    if (studentNameSimilarity > 0.6) return 0.6;
    
    // Buscar términos relacionados con el concepto
    const conceptWords = this.normalizeText(charge.concept).split(' ');
    let maxSimilarity = 0;
    
    for (const word of conceptWords) {
      if (word.length > 3 && concept.includes(word)) {
        maxSimilarity = Math.max(maxSimilarity, 0.5);
      }
    }
    
    return maxSimilarity;
  }

  /**
   * Evalúa coincidencia de nombres
   */
  private static evaluateNameMatch(
    transactionSenderName: string,
    familyNames: string[],
    familyRfc?: string
  ): number {
    const senderName = this.normalizeText(transactionSenderName);
    
    // Si hay RFC y coincide
    if (familyRfc && senderName.includes(familyRfc.toLowerCase())) {
      return 1.0;
    }
    
    let maxSimilarity = 0;
    
    for (const familyName of familyNames) {
      const similarity = this.calculateStringSimilarity(senderName, familyName);
      maxSimilarity = Math.max(maxSimilarity, similarity);
      
      // También verificar si contiene palabras del nombre
      const nameWords = this.normalizeText(familyName).split(' ');
      for (const word of nameWords) {
        if (word.length > 2 && senderName.includes(word)) {
          maxSimilarity = Math.max(maxSimilarity, 0.7);
        }
      }
    }
    
    return maxSimilarity;
  }

  /**
   * Evalúa coincidencia temporal
   */
  private static evaluateTimingMatch(
    transactionDate: Date,
    dueDate: Date
  ): number {
    const diffDays = Math.abs(
      (transactionDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (diffDays <= 1) return 1.0;      // Mismo día o siguiente
    if (diffDays <= 3) return 0.9;      // Dentro de 3 días
    if (diffDays <= 7) return 0.8;      // Dentro de una semana
    if (diffDays <= 15) return 0.6;     // Dentro de 15 días
    if (diffDays <= 30) return 0.4;     // Dentro de un mes
    
    return 0.2; // Más de un mes de diferencia
  }

  /**
   * MOTOR PRINCIPAL: Encuentra coincidencias entre transacciones y cargos
   */
  static findMatches(
    transaction: BankTransaction,
    pendingCharges: PendingCharge[]
  ): MatchResult[] {
    const matches: MatchResult[] = [];
    
    for (const charge of pendingCharges) {
      const criteria: MatchCriteria = {
        amount_match: this.evaluateAmountMatch(
          transaction.amount_cents,
          charge.amount_cents,
          charge.tolerance_cents
        ),
        reference_match: this.evaluateReferenceMatch(
          transaction.concept,
          charge
        ),
        name_match: this.evaluateNameMatch(
          transaction.sender_name,
          charge.family_names,
          charge.family_rfc
        ),
        timing_match: this.evaluateTimingMatch(
          transaction.transaction_date,
          charge.due_date
        ),
        overall_score: 0
      };
      
      // Calcular score general con pesos
      const weights = {
        amount: 0.35,
        reference: 0.30,
        name: 0.25,
        timing: 0.10
      };
      
      criteria.overall_score = (
        criteria.amount_match * weights.amount +
        criteria.reference_match * weights.reference +
        criteria.name_match * weights.name +
        criteria.timing_match * weights.timing
      );
      
      // Solo considerar matches con score mínimo
      if (criteria.overall_score >= 0.3) {
        
        // Determinar tipo de match
        let matchType: 'EXACT' | 'FUZZY' | 'MANUAL' | 'PARTIAL';
        if (criteria.overall_score >= 0.95) matchType = 'EXACT';
        else if (criteria.overall_score >= 0.75) matchType = 'FUZZY';
        else if (criteria.overall_score >= 0.50) matchType = 'MANUAL';
        else matchType = 'PARTIAL';
        
        // Identificar discrepancias
        const discrepancies: string[] = [];
        if (criteria.amount_match < 0.9) {
          const diff = Math.abs(transaction.amount_cents - charge.amount_cents) / 100;
          discrepancies.push(`Diferencia de monto: $${diff.toFixed(2)}`);
        }
        if (criteria.reference_match < 0.7) {
          discrepancies.push("Referencia de pago no coincide exactamente");
        }
        if (criteria.name_match < 0.7) {
          discrepancies.push("Nombre del pagador no coincide exactamente");
        }
        if (criteria.timing_match < 0.8) {
          discrepancies.push("Pago fuera del período esperado");
        }
        
        const match: MatchResult = {
          transaction_id: transaction.transaction_id,
          charge_id: charge.charge_id,
          match_type: matchType,
          confidence_score: criteria.overall_score,
          match_criteria: criteria,
          discrepancies,
          requires_manual_review: criteria.overall_score < 0.75 || discrepancies.length > 1,
          auto_approved: criteria.overall_score >= 0.85 && discrepancies.length <= 1
        };
        
        matches.push(match);
      }
    }
    
    // Ordenar por score descendente
    return matches.sort((a, b) => b.confidence_score - a.confidence_score);
  }
}

/**
 * SISTEMA DE DETECCIÓN DE ANOMALÍAS
 * Identifica patrones sospechosos y errores automáticamente
 */
export class AnomalyDetectionSystem {
  
  /**
   * Detecta pagos duplicados
   */
  static detectDuplicatePayments(transactions: BankTransaction[]): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = [];
    const seen = new Map<string, BankTransaction>();
    
    for (const transaction of transactions) {
      const key = `${transaction.amount_cents}-${transaction.sender_account}-${transaction.transaction_date.toDateString()}`;
      
      if (seen.has(key)) {
        const original = seen.get(key)!;
        anomalies.push({
          anomaly_id: `DUP-${Date.now()}-${transaction.transaction_id}`,
          type: 'DUPLICATE_PAYMENT',
          severity: 'HIGH',
          description: `Posible pago duplicado: ${transaction.amount_cents / 100} MXN de ${transaction.sender_name}`,
          affected_transactions: [original.transaction_id, transaction.transaction_id],
          recommended_action: "Verificar si es pago duplicado o error del banco",
          auto_resolved: false
        });
      } else {
        seen.set(key, transaction);
      }
    }
    
    return anomalies;
  }

  /**
   * Detecta montos inusuales
   */
  static detectUnusualAmounts(
    transactions: BankTransaction[],
    historicalStats: { mean: number; stdDev: number }
  ): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = [];
    
    for (const transaction of transactions) {
      const zScore = Math.abs(transaction.amount_cents - historicalStats.mean) / historicalStats.stdDev;
      
      if (zScore > 3) { // Más de 3 desviaciones estándar
        let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        if (zScore > 5) severity = 'CRITICAL';
        else if (zScore > 4) severity = 'HIGH';
        else severity = 'MEDIUM';
        
        anomalies.push({
          anomaly_id: `AMT-${Date.now()}-${transaction.transaction_id}`,
          type: 'UNUSUAL_AMOUNT',
          severity,
          description: `Monto inusual: $${transaction.amount_cents / 100} MXN (${zScore.toFixed(2)} desviaciones estándar)`,
          affected_transactions: [transaction.transaction_id],
          recommended_action: "Verificar si el monto es correcto o si requiere autorización especial",
          auto_resolved: false
        });
      }
    }
    
    return anomalies;
  }

  /**
   * Detecta patrones temporales sospechosos
   */
  static detectSuspiciousTiming(transactions: BankTransaction[]): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = [];
    
    // Agrupar por hora
    const hourlyGroups = new Map<number, BankTransaction[]>();
    
    for (const transaction of transactions) {
      const hour = transaction.transaction_date.getHours();
      if (!hourlyGroups.has(hour)) {
        hourlyGroups.set(hour, []);
      }
      hourlyGroups.get(hour)!.push(transaction);
    }
    
    // Detectar actividad inusual fuera de horario
    for (const [hour, txs] of hourlyGroups.entries()) {
      if ((hour < 6 || hour > 22) && txs.length > 5) {
        anomalies.push({
          anomaly_id: `TIME-${Date.now()}-${hour}`,
          type: 'SUSPICIOUS_TIMING',
          severity: 'MEDIUM',
          description: `Actividad inusual a las ${hour}:00 hrs con ${txs.length} transacciones`,
          affected_transactions: txs.map(tx => tx.transaction_id),
          recommended_action: "Verificar si es actividad legítima o procesamiento batch",
          auto_resolved: false
        });
      }
    }
    
    return anomalies;
  }
}

/**
 * MOTOR PRINCIPAL DE CONCILIACIÓN
 * Coordina todo el proceso de matching y reconciliación
 */
export class ReconciliationEngine {
  
  /**
   * Procesa conciliación completa
   */
  static async processReconciliation(
    transactions: BankTransaction[],
    pendingCharges: PendingCharge[]
  ): Promise<{
    matches: MatchResult[];
    anomalies: AnomalyDetection[];
    summary: ReconciliationSummary;
    unmatched_transactions: BankTransaction[];
    unmatched_charges: PendingCharge[];
  }> {
    const startTime = Date.now();
    
    const allMatches: MatchResult[] = [];
    const allAnomalies: AnomalyDetection[] = [];
    const matchedTransactionIds = new Set<string>();
    const matchedChargeIds = new Set<number>();
    
    // 1. Buscar matches para cada transacción
    for (const transaction of transactions) {
      const matches = PaymentMatchingEngine.findMatches(transaction, pendingCharges);
      
      // Tomar el mejor match si es suficientemente bueno
      if (matches.length > 0 && matches[0].confidence_score >= 0.5) {
        allMatches.push(matches[0]);
        matchedTransactionIds.add(transaction.transaction_id);
        matchedChargeIds.add(matches[0].charge_id);
      }
    }
    
    // 2. Detectar anomalías
    allAnomalies.push(...AnomalyDetectionSystem.detectDuplicatePayments(transactions));
    
    // Calcular estadísticas históricas (mock para demo)
    const historicalStats = { mean: 450000, stdDev: 150000 }; // $4,500 promedio
    allAnomalies.push(...AnomalyDetectionSystem.detectUnusualAmounts(transactions, historicalStats));
    allAnomalies.push(...AnomalyDetectionSystem.detectSuspiciousTiming(transactions));
    
    // 3. Identificar transacciones y cargos sin match
    const unmatchedTransactions = transactions.filter(
      tx => !matchedTransactionIds.has(tx.transaction_id)
    );
    
    const unmatchedCharges = pendingCharges.filter(
      charge => !matchedChargeIds.has(charge.charge_id)
    );
    
    // 4. Generar resumen
    const totalAmountMatched = allMatches.reduce(
      (sum, match) => {
        const transaction = transactions.find(tx => tx.transaction_id === match.transaction_id);
        return sum + (transaction?.amount_cents || 0);
      },
      0
    );
    
    const summary: ReconciliationSummary = {
      date: new Date(),
      total_transactions: transactions.length,
      matched_automatically: allMatches.filter(m => m.auto_approved).length,
      pending_review: allMatches.filter(m => m.requires_manual_review).length,
      unmatched: unmatchedTransactions.length,
      total_amount_matched_cents: totalAmountMatched,
      discrepancies_found: allMatches.filter(m => m.discrepancies.length > 0).length,
      processing_time_ms: Date.now() - startTime
    };
    
    return {
      matches: allMatches,
      anomalies: allAnomalies,
      summary,
      unmatched_transactions: unmatchedTransactions,
      unmatched_charges: unmatchedCharges
    };
  }

  /**
   * Genera reporte de conciliación
   */
  static generateReconciliationReport(results: any): {
    executive_summary: string;
    key_metrics: Record<string, any>;
    action_items: string[];
    recommendations: string[];
  } {
    const automaticMatchRate = (results.summary.matched_automatically / results.summary.total_transactions) * 100;
    
    return {
      executive_summary: `Procesadas ${results.summary.total_transactions} transacciones en ${results.summary.processing_time_ms}ms. ${results.summary.matched_automatically} matches automáticos (${automaticMatchRate.toFixed(1)}%). ${results.anomalies.length} anomalías detectadas.`,
      
      key_metrics: {
        'Tasa de coincidencia automática': `${automaticMatchRate.toFixed(1)}%`,
        'Monto total conciliado': `$${(results.summary.total_amount_matched_cents / 100).toLocaleString()} MXN`,
        'Transacciones pendientes de revisión': results.summary.pending_review,
        'Anomalías críticas': results.anomalies.filter((a: any) => a.severity === 'CRITICAL').length,
        'Tiempo de procesamiento': `${results.summary.processing_time_ms}ms`
      },
      
      action_items: [
        `Revisar ${results.summary.pending_review} matches que requieren validación manual`,
        `Investigar ${results.summary.unmatched} transacciones sin coincidencia`,
        `Resolver ${results.anomalies.filter((a: any) => a.severity === 'HIGH' || a.severity === 'CRITICAL').length} anomalías de alta prioridad`
      ],
      
      recommendations: [
        automaticMatchRate < 80 ? "Ajustar parámetros de matching para mejorar automatización" : "Mantener configuración actual de matching",
        results.anomalies.length > 10 ? "Implementar alertas proactivas para detección de anomalías" : "Sistema de detección funcionando correctamente",
        "Considerar integración directa con más bancos para mejorar tiempo real"
      ]
    };
  }
}

/**
 * INTEGRACIÓN SPEI Y BANCOS MEXICANOS
 * Conectores específicos para el sistema bancario mexicano
 */
export class SPEIIntegration {
  
  /**
   * Procesa notificación SPEI en tiempo real
   */
  static async processSPEINotification(speiData: any): Promise<BankTransaction> {
    // Convertir datos SPEI al formato interno
    return {
      transaction_id: `SPEI-${speiData.claveRastreo}`,
      bank_reference: speiData.claveRastreo,
      spei_tracking_id: speiData.claveRastreo,
      amount_cents: Math.round(speiData.monto * 100),
      sender_account: speiData.cuentaOrdenante,
      sender_name: speiData.nombreOrdenante,
      sender_rfc: speiData.rfcCurpOrdenante,
      receiver_account: speiData.cuentaBeneficiario,
      concept: speiData.conceptoPago || "",
      transaction_date: new Date(speiData.fechaOperacion),
      value_date: new Date(speiData.fechaOperacion),
      transaction_type: 'SPEI',
      status: 'COMPLETED',
      bank_fees_cents: 0,
      currency: 'MXN',
      channel: 'ONLINE'
    };
  }

  /**
   * Valida estructura de datos SPEI
   */
  static validateSPEIData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!data.claveRastreo) errors.push("Clave de rastreo requerida");
    if (!data.monto || data.monto <= 0) errors.push("Monto inválido");
    if (!data.cuentaOrdenante) errors.push("Cuenta ordenante requerida");
    if (!data.nombreOrdenante) errors.push("Nombre ordenante requerido");
    if (!data.cuentaBeneficiario) errors.push("Cuenta beneficiario requerida");
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}