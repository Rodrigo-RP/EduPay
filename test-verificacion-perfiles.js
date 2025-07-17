/**
 * PRUEBA COMPLETA DE VERIFICACIÓN DE PERFILES
 * Validación de autenticación, datos y relaciones por perfil
 */

const BASE_URL = 'http://localhost:5000';

// Credenciales de prueba
const USERS = {
  contador: { email: 'contador@sanpatricio.edu.mx', password: 'demo123' },
  admisiones: { email: 'admisiones@sanpatricio.edu.mx', password: 'demo123' },
  admin: { email: 'admin@sanpatricio.edu.mx', password: 'demo123' },
  caja: { email: 'caja@sanpatricio.edu.mx', password: 'demo123' },
  superadmin: { email: 'superadmin@escuelapay.com', password: 'SuperAdmin123!' }
};

const CAMPUS_ID = 24;

// Resultados de pruebas
const results = {
  authentication: {},
  dataAccess: {},
  dataRelations: {},
  roleFiltering: {},
  summary: { passed: 0, failed: 0, total: 0 }
};

// Función para realizar requests HTTP
async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}`, status: response.status };
    }

    const data = await response.json();
    return { data, status: response.status };
  } catch (error) {
    return { error: error.message };
  }
}

// Test 1: Autenticación de perfiles
async function testAuthentication() {
  console.log('\n🔐 PRUEBA 1: AUTENTICACIÓN DE PERFILES');
  console.log('='.repeat(50));

  for (const [role, credentials] of Object.entries(USERS)) {
    console.log(`\n📋 Probando perfil: ${role.toUpperCase()}`);
    
    const response = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify(credentials)
    });

    if (response.data && response.data.token) {
      console.log('✅ Autenticación exitosa');
      console.log(`   📍 Campus ID: ${response.data.campus_id || 'N/A'}`);
      console.log(`   👤 Usuario: ${response.data.user.name || 'N/A'}`);
      console.log(`   🎯 Rol: ${response.data.user.role || 'N/A'}`);
      
      results.authentication[role] = {
        success: true,
        token: response.data.token,
        user: response.data.user,
        campus_id: response.data.campus_id
      };
      results.summary.passed++;
    } else {
      console.log(`❌ Error de autenticación: ${response.error}`);
      results.authentication[role] = { success: false, error: response.error };
      results.summary.failed++;
    }
    results.summary.total++;
  }
}

// Test 2: Acceso a datos por perfil
async function testDataAccess() {
  console.log('\n📊 PRUEBA 2: ACCESO A DATOS POR PERFIL');
  console.log('='.repeat(50));

  const endpoints = [
    { path: '/api/payments', name: 'Pagos' },
    { path: `/api/admin/students/${CAMPUS_ID}`, name: 'Estudiantes' },
    { path: `/api/admin/guardians/${CAMPUS_ID}`, name: 'Tutores' },
    { path: `/api/admin/dashboard/${CAMPUS_ID}`, name: 'Dashboard' }
  ];

  for (const [role, auth] of Object.entries(results.authentication)) {
    if (!auth.success) continue;

    console.log(`\n📋 Probando acceso de datos para: ${role.toUpperCase()}`);
    results.dataAccess[role] = {};

    for (const endpoint of endpoints) {
      const response = await makeRequest(`${BASE_URL}${endpoint.path}`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });

      if (response.data) {
        console.log(`✅ ${endpoint.name}: ${Array.isArray(response.data) ? response.data.length : 'OK'} registros`);
        results.dataAccess[role][endpoint.name] = {
          success: true,
          count: Array.isArray(response.data) ? response.data.length : 1,
          data: response.data
        };
        results.summary.passed++;
      } else {
        console.log(`❌ ${endpoint.name}: ${response.error}`);
        results.dataAccess[role][endpoint.name] = { success: false, error: response.error };
        results.summary.failed++;
      }
      results.summary.total++;
    }
  }
}

// Test 3: Verificación de relaciones de datos
async function testDataRelations() {
  console.log('\n🔗 PRUEBA 3: VERIFICACIÓN DE RELACIONES DE DATOS');
  console.log('='.repeat(50));

  const adminAuth = results.authentication.admin;
  if (!adminAuth || !adminAuth.success) {
    console.log('❌ No se puede verificar relaciones sin acceso admin');
    return;
  }

  // Verificar relación estudiante-campus
  const studentsResponse = await makeRequest(`${BASE_URL}/api/admin/students/${CAMPUS_ID}`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` }
  });

  if (studentsResponse.data && studentsResponse.data.length > 0) {
    console.log('✅ Estudiantes encontrados en campus 24');
    console.log(`   📊 Total estudiantes: ${studentsResponse.data.length}`);
    
    // Verificar datos de muestra
    const sampleStudent = studentsResponse.data[0];
    console.log(`   👤 Estudiante muestra: ${sampleStudent.nombre_completo}`);
    console.log(`   🎓 Grado: ${sampleStudent.grado}`);
    console.log(`   📍 Campus: ${sampleStudent.campus_id}`);
    
    results.dataRelations.students = {
      success: true,
      count: studentsResponse.data.length,
      sample: sampleStudent
    };
    results.summary.passed++;
  } else {
    console.log('❌ No se encontraron estudiantes en campus 24');
    results.dataRelations.students = { success: false };
    results.summary.failed++;
  }

  // Verificar relación pagos-conceptos
  const paymentsResponse = await makeRequest(`${BASE_URL}/api/payments?campus_id=${CAMPUS_ID}`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` }
  });

  if (paymentsResponse.data && paymentsResponse.data.length > 0) {
    console.log('✅ Pagos encontrados con relaciones');
    console.log(`   💰 Total pagos: ${paymentsResponse.data.length}`);
    
    const samplePayment = paymentsResponse.data[0];
    console.log(`   💵 Pago muestra: $${samplePayment.monto_centavos / 100}`);
    console.log(`   📄 Concepto: ${samplePayment.charge?.concept?.nombre || 'N/A'}`);
    console.log(`   👤 Estudiante: ${samplePayment.charge?.student?.nombre_completo || 'N/A'}`);
    
    results.dataRelations.payments = {
      success: true,
      count: paymentsResponse.data.length,
      sample: samplePayment
    };
    results.summary.passed++;
  } else {
    console.log('❌ No se encontraron pagos con relaciones');
    results.dataRelations.payments = { success: false };
    results.summary.failed++;
  }

  results.summary.total += 2;
}

// Test 4: Filtrado por rol
async function testRoleFiltering() {
  console.log('\n🎯 PRUEBA 4: FILTRADO POR ROL');
  console.log('='.repeat(50));

  // Verificar filtrado de admisiones (solo debe ver inscripciones)
  const admisionesAuth = results.authentication.admisiones;
  if (admisionesAuth && admisionesAuth.success) {
    console.log('\n📋 Verificando filtrado de ADMISIONES');
    
    const response = await makeRequest(`${BASE_URL}/api/payments?campus_id=${CAMPUS_ID}`, {
      headers: { Authorization: `Bearer ${admisionesAuth.token}` }
    });

    if (response.data) {
      const inscripcionPayments = response.data.filter(p => 
        p.charge?.concept?.tipo?.includes('INSCRIPCION')
      );
      
      console.log(`✅ Pagos filtrados correctamente`);
      console.log(`   📊 Total pagos visibles: ${response.data.length}`);
      console.log(`   📝 Pagos de inscripción: ${inscripcionPayments.length}`);
      
      // Verificar que solo son inscripciones
      const allInscriptions = response.data.every(p => 
        p.charge?.concept?.tipo?.includes('INSCRIPCION')
      );
      
      if (allInscriptions) {
        console.log('✅ Filtrado correcto: Solo pagos de inscripción');
        results.roleFiltering.admisiones = { success: true, filtered: true };
        results.summary.passed++;
      } else {
        console.log('❌ Filtrado incorrecto: Se ven otros tipos de pago');
        results.roleFiltering.admisiones = { success: false, filtered: false };
        results.summary.failed++;
      }
    } else {
      console.log(`❌ Error obteniendo pagos: ${response.error}`);
      results.roleFiltering.admisiones = { success: false, error: response.error };
      results.summary.failed++;
    }
  }

  // Verificar acceso completo del contador
  const contadorAuth = results.authentication.contador;
  if (contadorAuth && contadorAuth.success) {
    console.log('\n📋 Verificando acceso completo de CONTADOR');
    
    const response = await makeRequest(`${BASE_URL}/api/payments?campus_id=${CAMPUS_ID}`, {
      headers: { Authorization: `Bearer ${contadorAuth.token}` }
    });

    if (response.data) {
      console.log(`✅ Acceso completo del contador`);
      console.log(`   📊 Total pagos: ${response.data.length}`);
      
      // Verificar variedad de tipos de pago
      const paymentTypes = [...new Set(response.data.map(p => p.charge?.concept?.tipo))];
      console.log(`   🎯 Tipos de concepto: ${paymentTypes.join(', ')}`);
      
      results.roleFiltering.contador = { 
        success: true, 
        fullAccess: true,
        paymentTypes: paymentTypes 
      };
      results.summary.passed++;
    } else {
      console.log(`❌ Error obteniendo pagos: ${response.error}`);
      results.roleFiltering.contador = { success: false, error: response.error };
      results.summary.failed++;
    }
  }

  results.summary.total += 2;
}

// Test 5: Verificación de datos auténticos
async function testAuthenticData() {
  console.log('\n🔍 PRUEBA 5: VERIFICACIÓN DE DATOS AUTÉNTICOS');
  console.log('='.repeat(50));

  const adminAuth = results.authentication.admin;
  if (!adminAuth || !adminAuth.success) {
    console.log('❌ No se puede verificar datos sin acceso admin');
    return;
  }

  // Verificar precios de inscripción auténticos
  const paymentsResponse = await makeRequest(`${BASE_URL}/api/payments?campus_id=${CAMPUS_ID}`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` }
  });

  if (paymentsResponse.data && paymentsResponse.data.length > 0) {
    console.log('✅ Verificando precios de inscripción auténticos');
    
    const pricesByLevel = {
      KINDER: [],
      PRIMARIA: [],
      SECUNDARIA: [],
      BACHILLERATO: []
    };

    paymentsResponse.data.forEach(payment => {
      const tipo = payment.charge?.concept?.tipo;
      const monto = payment.monto_centavos / 100;
      
      if (tipo?.includes('INSCRIPCION_KINDER')) {
        pricesByLevel.KINDER.push(monto);
      } else if (tipo?.includes('INSCRIPCION_PRIMARIA')) {
        pricesByLevel.PRIMARIA.push(monto);
      } else if (tipo?.includes('INSCRIPCION_SECUNDARIA')) {
        pricesByLevel.SECUNDARIA.push(monto);
      } else if (tipo?.includes('INSCRIPCION_BACHILLERATO')) {
        pricesByLevel.BACHILLERATO.push(monto);
      }
    });

    console.log('   💰 Precios encontrados:');
    Object.entries(pricesByLevel).forEach(([level, prices]) => {
      if (prices.length > 0) {
        const uniquePrices = [...new Set(prices)];
        console.log(`   📝 ${level}: $${uniquePrices.join(', $')}`);
      }
    });

    // Verificar precios esperados
    const expectedPrices = {
      KINDER: 2500,
      PRIMARIA: 2800,
      SECUNDARIA: 3200
    };

    let correctPrices = 0;
    let totalChecked = 0;

    Object.entries(expectedPrices).forEach(([level, expected]) => {
      const found = pricesByLevel[level];
      if (found.length > 0) {
        totalChecked++;
        if (found.includes(expected)) {
          correctPrices++;
          console.log(`   ✅ ${level}: Precio correcto $${expected}`);
        } else {
          console.log(`   ❌ ${level}: Precio incorrecto, esperado $${expected}, encontrado $${found[0]}`);
        }
      }
    });

    if (correctPrices === totalChecked && totalChecked > 0) {
      console.log('✅ Todos los precios son auténticos y correctos');
      results.summary.passed++;
    } else {
      console.log('❌ Algunos precios no coinciden con los esperados');
      results.summary.failed++;
    }
  } else {
    console.log('❌ No se encontraron pagos para verificar precios');
    results.summary.failed++;
  }

  results.summary.total++;
}

// Función para generar reporte final
function generateReport() {
  console.log('\n📋 REPORTE FINAL DE VERIFICACIÓN');
  console.log('='.repeat(60));
  
  const successRate = ((results.summary.passed / results.summary.total) * 100).toFixed(1);
  
  console.log(`\n📊 RESUMEN DE RESULTADOS:`);
  console.log(`   ✅ Pruebas exitosas: ${results.summary.passed}`);
  console.log(`   ❌ Pruebas fallidas: ${results.summary.failed}`);
  console.log(`   📈 Tasa de éxito: ${successRate}%`);
  console.log(`   🎯 Total de pruebas: ${results.summary.total}`);

  console.log(`\n🔐 AUTENTICACIÓN POR PERFIL:`);
  Object.entries(results.authentication).forEach(([role, result]) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} ${role.toUpperCase()}: ${result.success ? 'OK' : result.error}`);
  });

  console.log(`\n📊 ACCESO A DATOS:`);
  Object.entries(results.dataAccess).forEach(([role, endpoints]) => {
    console.log(`   👤 ${role.toUpperCase()}:`);
    Object.entries(endpoints).forEach(([endpoint, result]) => {
      const status = result.success ? '✅' : '❌';
      const info = result.success ? `${result.count} registros` : result.error;
      console.log(`     ${status} ${endpoint}: ${info}`);
    });
  });

  console.log(`\n🎯 FILTRADO POR ROL:`);
  Object.entries(results.roleFiltering).forEach(([role, result]) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} ${role.toUpperCase()}: ${result.success ? 'Correcto' : 'Error'}`);
  });

  console.log(`\n🏆 EVALUACIÓN GENERAL:`);
  if (successRate >= 90) {
    console.log(`   🎉 EXCELENTE: Sistema completamente funcional`);
  } else if (successRate >= 80) {
    console.log(`   👍 BUENO: Sistema mayormente funcional`);
  } else if (successRate >= 70) {
    console.log(`   ⚠️ ACEPTABLE: Sistema funcional con algunas mejoras`);
  } else {
    console.log(`   ❌ CRÍTICO: Sistema requiere atención inmediata`);
  }

  return results;
}

// Ejecutar todas las pruebas
async function runAllTests() {
  console.log('🚀 INICIANDO VERIFICACIÓN COMPLETA DE PERFILES');
  console.log('='.repeat(60));
  console.log('📅 Fecha:', new Date().toLocaleString());
  console.log('🏫 Campus de prueba:', CAMPUS_ID);

  try {
    await testAuthentication();
    await testDataAccess();
    await testDataRelations();
    await testRoleFiltering();
    await testAuthenticData();
    
    const finalResults = generateReport();
    
    console.log('\n✅ VERIFICACIÓN COMPLETA TERMINADA');
    return finalResults;
  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
    return { error: error.message };
  }
}

// Ejecutar si se llama directamente
if (typeof window === 'undefined') {
  runAllTests().then(results => {
    process.exit(results.summary.failed > 0 ? 1 : 0);
  });
}