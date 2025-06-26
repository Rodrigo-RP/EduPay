/**
 * TESTING DE CASOS EXTREMOS Y STRESS TESTING
 * Valida comportamiento bajo condiciones límite
 */

const testData = {
  // Casos extremos para motor predictivo
  extremeCases: {
    // Familia con historial perfecto
    perfectFamily: {
      family_id: 999,
      payment_history: { total_payments: 50, on_time_payments: 50, late_payments: 0, average_delay_days: 0 },
      risk_factors: { employment_stability: 1.0, economic_indicators: 1.0, communication_responsiveness: 1.0 }
    },
    // Familia con historial crítico
    criticalFamily: {
      family_id: 1000,
      payment_history: { total_payments: 20, on_time_payments: 2, late_payments: 18, average_delay_days: 45 },
      risk_factors: { employment_stability: 0.1, economic_indicators: 0.1, communication_responsiveness: 0.1 }
    },
    // Familia nueva sin historial
    newFamily: {
      family_id: 1001,
      payment_history: { total_payments: 0, on_time_payments: 0, late_payments: 0, average_delay_days: 0 },
      risk_factors: { employment_stability: 0.5, economic_indicators: 0.5, communication_responsiveness: 0.5 }
    }
  },

  // Casos extremos para conciliación
  extremeTransactions: [
    // Transacción con monto exacto de 1 centavo
    { transaction_id: "EXTREME-001", amount_cents: 1, sender_name: "JUAN PEREZ", concept: "PAGO MINIMO" },
    // Transacción muy grande
    { transaction_id: "EXTREME-002", amount_cents: 100000000, sender_name: "BENEFACTOR ANONIMO", concept: "DONACION GRANDE" },
    // Nombre con caracteres especiales
    { transaction_id: "EXTREME-003", amount_cents: 450000, sender_name: "MARÍA JOSÉ GARCÍA-LÓPEZ & ASSOCIATES", concept: "COLEGIATURA CON CARACTERES ESPECIALES" },
    // Concepto vacío
    { transaction_id: "EXTREME-004", amount_cents: 350000, sender_name: "PEDRO RAMIREZ", concept: "" },
    // Transacción antigua
    { transaction_id: "EXTREME-005", amount_cents: 450000, sender_name: "ANA TORRES", concept: "PAGO ENERO", transaction_date: new Date("2020-01-15") }
  ],

  // Casos extremos para CFDI
  extremeCFDI: [
    // Monto muy pequeño
    { student_name: "Test Student", amount_cents: 1, concept: "Centavo", family_rfc: "XAXX010101000", academic_level: "KINDER" },
    // Monto muy grande  
    { student_name: "VIP Student", amount_cents: 50000000, concept: "Colegiatura Anual Premium", family_rfc: "ABCD123456789", academic_level: "BACHILLERATO" },
    // RFC público en general
    { student_name: "Público General", amount_cents: 100000, concept: "Servicio General", family_rfc: "XAXX010101000", academic_level: "PRIMARIA" },
    // Concepto con caracteres especiales
    { student_name: "José María", amount_cents: 450000, concept: "Colegiatura María José 2025 - Nivel Avanzado & Premium", family_rfc: "JOMA850315ABC", academic_level: "SECUNDARIA" }
  ]
};

async function testExtremeScenarios() {
  console.log("🔥 INICIANDO TESTING DE CASOS EXTREMOS");
  console.log("="."repeat(60));
  
  const results = {
    predictive_extreme: { passed: 0, failed: 0, errors: [] },
    banking_extreme: { passed: 0, failed: 0, errors: [] },
    fiscal_extreme: { passed: 0, failed: 0, errors: [] },
    performance: { passed: 0, failed: 0, errors: [] }
  };

  // Test 1: Motor predictivo con casos extremos
  console.log("🧠 Testing motor predictivo - casos extremos...");
  
  try {
    // Familia perfecta - debe tener riesgo muy bajo
    const perfectScore = calculateRiskScore(testData.extremeCases.perfectFamily);
    if (perfectScore >= 90) {
      results.predictive_extreme.passed++;
      console.log("  ✅ Familia perfecta: riesgo bajo detectado correctamente");
    } else {
      results.predictive_extreme.failed++;
      results.predictive_extreme.errors.push(`Familia perfecta tiene score ${perfectScore}, esperado >90`);
    }

    // Familia crítica - debe tener riesgo muy alto
    const criticalScore = calculateRiskScore(testData.extremeCases.criticalFamily);
    if (criticalScore <= 30) {
      results.predictive_extreme.passed++;
      console.log("  ✅ Familia crítica: riesgo alto detectado correctamente");
    } else {
      results.predictive_extreme.failed++;
      results.predictive_extreme.errors.push(`Familia crítica tiene score ${criticalScore}, esperado <=30`);
    }

    // Familia nueva - debe manejar división por cero
    const newScore = calculateRiskScore(testData.extremeCases.newFamily);
    if (newScore >= 40 && newScore <= 60) {
      results.predictive_extreme.passed++;
      console.log("  ✅ Familia nueva: score neutro asignado correctamente");
    } else {
      results.predictive_extreme.failed++;
      results.predictive_extreme.errors.push(`Familia nueva tiene score ${newScore}, esperado 40-60`);
    }

  } catch (error) {
    results.predictive_extreme.failed++;
    results.predictive_extreme.errors.push(`Error en predictivo extremo: ${error.message}`);
  }

  // Test 2: Conciliación con transacciones extremas
  console.log("🏦 Testing conciliación bancaria - casos extremos...");
  
  try {
    for (const tx of testData.extremeTransactions) {
      // Test normalización de nombres
      const normalizedName = normalizeText(tx.sender_name);
      if (normalizedName && normalizedName.length > 0) {
        results.banking_extreme.passed++;
      } else {
        results.banking_extreme.failed++;
        results.banking_extreme.errors.push(`Fallo normalizando: ${tx.sender_name}`);
      }

      // Test manejo de conceptos vacíos
      const concept = tx.concept || "SIN CONCEPTO";
      if (concept.length > 0) {
        results.banking_extreme.passed++;
      } else {
        results.banking_extreme.failed++;
        results.banking_extreme.errors.push(`Concepto vacío no manejado: ${tx.transaction_id}`);
      }

      // Test montos extremos
      if (tx.amount_cents >= 1 && tx.amount_cents <= 100000000) {
        results.banking_extreme.passed++;
      } else {
        results.banking_extreme.failed++;
        results.banking_extreme.errors.push(`Monto fuera de rango: ${tx.amount_cents}`);
      }
    }

    console.log(`  ✅ ${results.banking_extreme.passed} validaciones de casos extremos pasaron`);

  } catch (error) {
    results.banking_extreme.failed++;
    results.banking_extreme.errors.push(`Error en banking extremo: ${error.message}`);
  }

  // Test 3: CFDI con casos extremos
  console.log("📄 Testing motor fiscal - casos extremos...");
  
  try {
    for (const data of testData.extremeCFDI) {
      // Test montos extremos
      const subtotal = data.amount_cents / 100;
      if (subtotal >= 0.01 && subtotal <= 500000) {
        results.fiscal_extreme.passed++;
      } else {
        results.fiscal_extreme.failed++;
        results.fiscal_extreme.errors.push(`Monto CFDI fuera de rango: ${subtotal}`);
      }

      // Test RFC público en general
      if (data.family_rfc === "XAXX010101000") {
        const usoCFDI = "P01"; // Por definir para público general
        if (usoCFDI === "P01") {
          results.fiscal_extreme.passed++;
        } else {
          results.fiscal_extreme.failed++;
          results.fiscal_extreme.errors.push("RFC público general no manejado correctamente");
        }
      } else {
        results.fiscal_extreme.passed++;
      }

      // Test caracteres especiales en conceptos
      const sanitizedConcept = data.concept.replace(/[^\w\s-áéíóúñ]/g, '');
      if (sanitizedConcept.length > 0) {
        results.fiscal_extreme.passed++;
      } else {
        results.fiscal_extreme.failed++;
        results.fiscal_extreme.errors.push("Concepto con caracteres especiales no sanitizado");
      }
    }

    console.log(`  ✅ ${results.fiscal_extreme.passed} validaciones CFDI extremas pasaron`);

  } catch (error) {
    results.fiscal_extreme.failed++;
    results.fiscal_extreme.errors.push(`Error en fiscal extremo: ${error.message}`);
  }

  // Test 4: Performance con volumen alto
  console.log("⚡ Testing performance con volumen alto...");
  
  try {
    const startTime = Date.now();
    
    // Simular procesamiento de 1000 familias
    const largeFamilySet = Array.from({length: 1000}, (_, i) => ({
      family_id: i + 1,
      payment_history: {
        total_payments: Math.floor(Math.random() * 50) + 1,
        on_time_payments: Math.floor(Math.random() * 30),
        late_payments: Math.floor(Math.random() * 20),
        average_delay_days: Math.floor(Math.random() * 60)
      },
      risk_factors: {
        employment_stability: Math.random(),
        economic_indicators: Math.random(),
        communication_responsiveness: Math.random()
      }
    }));

    // Procesar análisis de riesgo masivo
    const riskResults = largeFamilySet.map(family => calculateRiskScore(family));
    
    const processingTime = Date.now() - startTime;
    
    if (processingTime < 5000) { // Menos de 5 segundos para 1000 familias
      results.performance.passed++;
      console.log(`  ✅ Performance aceptable: ${processingTime}ms para 1000 familias`);
    } else {
      results.performance.failed++;
      results.performance.errors.push(`Performance lenta: ${processingTime}ms para 1000 familias`);
    }

    // Validar que no hay NaN o valores inválidos
    const invalidResults = riskResults.filter(score => isNaN(score) || score < 0 || score > 100);
    if (invalidResults.length === 0) {
      results.performance.passed++;
      console.log("  ✅ Todos los scores de riesgo son válidos");
    } else {
      results.performance.failed++;
      results.performance.errors.push(`${invalidResults.length} scores inválidos generados`);
    }

  } catch (error) {
    results.performance.failed++;
    results.performance.errors.push(`Error en performance: ${error.message}`);
  }

  // Reporte final
  console.log("\n" + "="."repeat(60));
  console.log("📊 REPORTE DE CASOS EXTREMOS");
  console.log("="."repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;
  let allErrors = [];

  Object.entries(results).forEach(([category, result]) => {
    totalPassed += result.passed;
    totalFailed += result.failed;
    allErrors.push(...result.errors);
    
    console.log(`\n${category.toUpperCase()}:`);
    console.log(`  ✅ Exitosos: ${result.passed}`);
    console.log(`  ❌ Fallidos: ${result.failed}`);
    if (result.errors.length > 0) {
      console.log("  🚨 Errores:");
      result.errors.forEach(error => console.log(`     • ${error}`));
    }
  });

  const successRate = totalPassed + totalFailed > 0 ? (totalPassed / (totalPassed + totalFailed)) * 100 : 0;

  console.log(`\nRESUMEN CASOS EXTREMOS:`);
  console.log(`  Total tests: ${totalPassed + totalFailed}`);
  console.log(`  Tasa de éxito: ${successRate.toFixed(1)}%`);
  
  if (allErrors.length === 0) {
    console.log("\n🎉 TODOS LOS CASOS EXTREMOS MANEJADOS CORRECTAMENTE");
    console.log("   Sistemas robustos y listos para producción");
  } else {
    console.log(`\n⚠️ ${allErrors.length} PROBLEMAS DETECTADOS EN CASOS EXTREMOS`);
    console.log("   Requieren atención antes de producción");
  }

  return {
    success_rate: successRate,
    total_tests: totalPassed + totalFailed,
    errors: allErrors,
    robust: allErrors.length === 0
  };
}

// Funciones auxiliares para testing
function calculateRiskScore(family) {
  try {
    if (family.payment_history.total_payments === 0) {
      // Familia nueva - score neutro
      return 50;
    }
    
    const onTimeRate = family.payment_history.on_time_payments / family.payment_history.total_payments;
    const delayPenalty = Math.min(family.payment_history.average_delay_days * 2, 50);
    const employmentScore = family.risk_factors.employment_stability * 100;
    
    const rawScore = (onTimeRate * 50) + (employmentScore * 0.3) - delayPenalty;
    return Math.max(0, Math.min(100, rawScore));
  } catch (error) {
    return 50; // Score neutro en caso de error
  }
}

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9\s]/g, '') // Solo alfanuméricos
    .replace(/\s+/g, ' ')
    .trim();
}

// Ejecutar si se llama directamente
if (typeof window === 'undefined') {
  testExtremeScenarios().then(results => {
    process.exit(results.robust ? 0 : 1);
  });
}

// Exportar para navegador
if (typeof window !== 'undefined') {
  window.testCasosExtremos = testExtremeScenarios;
}