/**
 * PRUEBA DE PENETRACIÓN SIMPLIFICADA - SIMULACIÓN HACKER
 * Testing de defensas usando fetch nativo
 */

const BASE_URL = 'http://localhost:5000';

console.log("🎯 INICIANDO ATAQUE HACKER - PRUEBA DE PENETRACIÓN");
console.log("=".repeat(60));

const results = {
  attemptedAttacks: 0,
  successfulBreaches: 0,
  blockedAttacks: 0
};

// Función auxiliar para realizar requests
async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    return { status: response.status, data: await response.text() };
  } catch (error) {
    return { error: error.message };
  }
}

// 1. ATAQUE SQL INJECTION
async function testSQLInjection() {
  console.log("\n🔍 1. TESTING SQL INJECTION");
  
  const payloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "admin'--"
  ];

  for (const payload of payloads) {
    results.attemptedAttacks++;
    console.log(`   Intentando: ${payload}`);
    
    const result = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: payload,
        password: "test"
      })
    });

    if (result.status === 200) {
      console.log(`   ❌ VULNERABILIDAD: SQL Injection exitoso`);
      results.successfulBreaches++;
    } else {
      console.log(`   ✅ BLOQUEADO: Input malicioso rechazado`);
      results.blockedAttacks++;
    }
  }
}

// 2. ATAQUE XSS
async function testXSSAttacks() {
  console.log("\n🔍 2. TESTING XSS ATTACKS");
  
  const xssPayloads = [
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert('XSS')>",
    "javascript:alert('XSS')"
  ];

  for (const payload of xssPayloads) {
    results.attemptedAttacks++;
    console.log(`   Intentando XSS: ${payload.substring(0, 25)}...`);
    
    const result = await makeRequest(`${BASE_URL}/api/security/metrics?search=${encodeURIComponent(payload)}`);

    if (result.status === 200 && result.data.includes(payload)) {
      console.log(`   ❌ VULNERABILIDAD: XSS no sanitizado`);
      results.successfulBreaches++;
    } else {
      console.log(`   ✅ PROTEGIDO: XSS bloqueado/sanitizado`);
      results.blockedAttacks++;
    }
  }
}

// 3. ATAQUE BRUTE FORCE
async function testBruteForce() {
  console.log("\n🔍 3. TESTING BRUTE FORCE");
  
  const passwords = ["123456", "password", "admin", "12345678"];
  
  for (let i = 0; i < passwords.length; i++) {
    results.attemptedAttacks++;
    console.log(`   Intento ${i + 1}: ${passwords[i]}`);
    
    const result = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: "admin@escuela.mx",
        password: passwords[i]
      })
    });

    if (result.status === 429) {
      console.log(`   ✅ PROTEGIDO: Rate limiting activado`);
      results.blockedAttacks++;
      break;
    } else if (result.status === 200) {
      console.log(`   ❌ VULNERABILIDAD: Contraseña débil`);
      results.successfulBreaches++;
      break;
    } else {
      console.log(`   Contraseña incorrecta, continuando...`);
    }
  }
}

// 4. ATAQUE DE ESCALACIÓN DE PRIVILEGIOS
async function testPrivilegeEscalation() {
  console.log("\n🔍 4. TESTING ESCALACIÓN DE PRIVILEGIOS");
  
  const endpoints = [
    '/api/security/report',
    '/api/admin/users',
    '/api/security/block-ip'
  ];

  for (const endpoint of endpoints) {
    results.attemptedAttacks++;
    console.log(`   Accediendo sin auth: ${endpoint}`);
    
    const result = await makeRequest(`${BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': 'Bearer fake-token'
      }
    });

    if (result.status === 200) {
      console.log(`   ❌ VULNERABILIDAD: Acceso no autorizado`);
      results.successfulBreaches++;
    } else if (result.status === 401 || result.status === 403) {
      console.log(`   ✅ PROTEGIDO: Acceso denegado`);
      results.blockedAttacks++;
    } else {
      console.log(`   ✅ PROTEGIDO: Endpoint protegido`);
      results.blockedAttacks++;
    }
  }
}

// 5. ATAQUE DE HEADERS MALICIOSOS
async function testHeaderAttacks() {
  console.log("\n🔍 5. TESTING HEADERS MALICIOSOS");
  
  const maliciousHeaders = [
    { 'X-Admin': 'true' },
    { 'User-Agent': '<script>alert("XSS")</script>' },
    { 'Content-Length': '999999999' }
  ];

  for (const headers of maliciousHeaders) {
    results.attemptedAttacks++;
    const headerName = Object.keys(headers)[0];
    console.log(`   Header malicioso: ${headerName}`);
    
    const result = await makeRequest(`${BASE_URL}/api/security/metrics`, {
      headers
    });

    if (result.status === 400) {
      console.log(`   ✅ PROTEGIDO: Header rechazado`);
      results.blockedAttacks++;
    } else {
      console.log(`   ⚠️  Header aceptado`);
    }
  }
}

// 6. ATAQUE DDOS SIMPLIFICADO
async function testDDoSSimple() {
  console.log("\n🔍 6. TESTING DDoS SIMPLIFICADO");
  
  const requests = [];
  const concurrentRequests = 10;
  
  console.log(`   Enviando ${concurrentRequests} requests simultáneos...`);
  
  for (let i = 0; i < concurrentRequests; i++) {
    results.attemptedAttacks++;
    requests.push(makeRequest(`${BASE_URL}/api/security/metrics`));
  }

  const results_ddos = await Promise.all(requests);
  const blocked = results_ddos.filter(r => r.status === 429).length;
  const successful = results_ddos.filter(r => r.status === 200).length;
  
  console.log(`   Exitosos: ${successful}, Bloqueados: ${blocked}`);
  
  if (blocked > 0) {
    console.log(`   ✅ PROTEGIDO: Rate limiting detectado`);
    results.blockedAttacks += blocked;
  } else {
    console.log(`   ⚠️  Sin rate limiting visible`);
  }
}

// REPORTE FINAL
function generateReport() {
  console.log("\n" + "=".repeat(60));
  console.log("📊 REPORTE DE PENETRACIÓN");
  console.log("=".repeat(60));
  
  console.log(`📈 ESTADÍSTICAS:`);
  console.log(`   • Ataques intentados: ${results.attemptedAttacks}`);
  console.log(`   • Vulnerabilidades: ${results.successfulBreaches}`);
  console.log(`   • Ataques bloqueados: ${results.blockedAttacks}`);
  
  const blockRate = (results.blockedAttacks / results.attemptedAttacks * 100).toFixed(1);
  const vulnRate = (results.successfulBreaches / results.attemptedAttacks * 100).toFixed(1);
  
  console.log(`\n🛡️  EFICACIA:`);
  console.log(`   • Tasa de bloqueo: ${blockRate}%`);
  console.log(`   • Tasa de vulnerabilidad: ${vulnRate}%`);
  
  if (results.successfulBreaches === 0) {
    console.log(`\n✅ RESULTADO: SISTEMA SEGURO`);
    console.log(`   Todas las defensas funcionaron correctamente.`);
  } else if (results.successfulBreaches < 3) {
    console.log(`\n⚠️  RESULTADO: VULNERABILIDADES MENORES`);
    console.log(`   Se detectaron ${results.successfulBreaches} problemas.`);
  } else {
    console.log(`\n❌ RESULTADO: SISTEMA VULNERABLE`);
    console.log(`   Se detectaron ${results.successfulBreaches} vulnerabilidades críticas.`);
  }
  
  console.log("\n=".repeat(60));
}

// EJECUTAR TODAS LAS PRUEBAS
async function runPenetrationTest() {
  try {
    await testSQLInjection();
    await testXSSAttacks();
    await testBruteForce();
    await testPrivilegeEscalation();
    await testHeaderAttacks();
    await testDDoSSimple();
    
    generateReport();
  } catch (error) {
    console.error('Error en prueba de penetración:', error.message);
  }
}

// Ejecutar
runPenetrationTest();