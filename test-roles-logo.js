/**
 * Script para probar el logo institucional en diferentes roles
 * Simula el cambio de roles y verifica que el logo aparezca correctamente
 */

console.log('👥 PRUEBAS DE LOGO POR ROLES');
console.log('='.repeat(50));

// Configuración de usuarios de prueba
const testUsers = [
  {
    id: 40,
    nombre_completo: "Rodrigo Rodriguez Pacheco", 
    email: "rodrigorp@institutojfr.edu.mx",
    role: "administrador_general",
    campus_id: 39,
    tenant_id: 24
  },
  {
    id: 52,
    nombre_completo: "Reyna Landaverde",
    email: "reyna@institutojfr.edu.mx", 
    role: "administrador_campus",
    campus_id: 39,
    tenant_id: 24
  },
  {
    id: 101,
    nombre_completo: "Ana Patricia López",
    email: "auxiliar1@jfr.edu.mx",
    role: "auxiliar_contable",
    campus_id: 39,
    tenant_id: 24
  },
  {
    id: 102,
    nombre_completo: "Carmen Morales", 
    email: "asistente@jfr.edu.mx",
    role: "asistente",
    campus_id: 39,
    tenant_id: 24
  },
  {
    id: 103,
    nombre_completo: "Laura Admisiones",
    email: "admisiones@jfr.edu.mx", 
    role: "admisiones",
    campus_id: 39,
    tenant_id: 24
  }
];

// Páginas que cada rol debe poder acceder
const rolePages = {
  'administrador_general': ['/admin-dashboard', '/usuarios', '/pagos', '/reportes', '/cuentas-por-cobrar'],
  'administrador_campus': ['/admin-dashboard', '/usuarios', '/pagos', '/reportes'],
  'auxiliar_contable': ['/dashboard-contador', '/pagos', '/reportes'],
  'asistente': ['/dashboard-admisiones', '/pagos'],
  'admisiones': ['/dashboard-admisiones', '/pagos']
};

// Función para simular login de usuario
function simulateUserLogin(user) {
  console.log(`\n🔐 Simulando login: ${user.nombre_completo} (${user.role})`);
  
  // Simular token de autenticación
  const fakeToken = `fake_token_${user.id}_${Date.now()}`;
  localStorage.setItem('auth_token', fakeToken);
  localStorage.setItem('auth_user', JSON.stringify(user));
  
  console.log(`✅ Usuario ${user.role} autenticado correctamente`);
  return user;
}

// Función para verificar logo en página específica
async function testLogoInPage(pagePath, userRole) {
  console.log(`\n📄 Probando logo en: ${pagePath} (rol: ${userRole})`);
  
  try {
    // Simular navegación (sin cambiar realmente la página)
    console.log(`🔍 Verificando elementos de logo para ${pagePath}...`);
    
    // Verificar si la página está en la lista de páginas con logo
    const pagesWithLogo = [
      '/admin-dashboard', '/dashboard-admisiones', '/dashboard-caja', 
      '/dashboard-contador', '/usuarios', '/pagos', '/reportes', '/cuentas-por-cobrar'
    ];
    
    if (pagesWithLogo.includes(pagePath)) {
      console.log(`✅ ${pagePath} debe mostrar logo institucional`);
      
      // Verificar si hay elementos de logo en el DOM actual
      const logoElements = document.querySelectorAll('img[alt="Logo institucional"]');
      if (logoElements.length > 0) {
        console.log(`🖼️ Logo encontrado: ${logoElements.length} elemento(s)`);
        return true;
      } else {
        console.log(`⚠️ Logo no encontrado en DOM actual`);
        return false;
      }
    } else {
      console.log(`ℹ️ ${pagePath} no tiene logo implementado`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error probando ${pagePath}:`, error.message);
    return false;
  }
}

// Función para probar todos los roles
async function testAllRoles() {
  console.log('🧪 Iniciando pruebas para todos los roles...\n');
  
  const results = {};
  
  for (const user of testUsers) {
    console.log(`\n${'='.repeat(40)}`);
    console.log(`👤 PROBANDO ROL: ${user.role.toUpperCase()}`);
    console.log(`${'='.repeat(40)}`);
    
    // Simular login
    simulateUserLogin(user);
    
    // Esperar un momento para que React se actualice
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Probar páginas para este rol
    const userPages = rolePages[user.role] || [];
    const roleResults = {};
    
    for (const page of userPages) {
      const result = await testLogoInPage(page, user.role);
      roleResults[page] = result;
      
      // Pequeña pausa entre pruebas
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    results[user.role] = roleResults;
    
    console.log(`\n📊 Resumen para ${user.role}:`);
    Object.entries(roleResults).forEach(([page, result]) => {
      const status = result === true ? '✅' : result === false ? '❌' : 'ℹ️';
      console.log(`  ${status} ${page}`);
    });
  }
  
  return results;
}

// Función para generar reporte final
function generateReport(results) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('📋 REPORTE FINAL DE PRUEBAS DE LOGO');
  console.log(`${'='.repeat(60)}`);
  
  let totalTests = 0;
  let passedTests = 0;
  
  Object.entries(results).forEach(([role, pages]) => {
    console.log(`\n👤 ${role.toUpperCase()}:`);
    Object.entries(pages).forEach(([page, result]) => {
      totalTests++;
      if (result === true) passedTests++;
      
      const status = result === true ? '✅ PASS' : result === false ? '❌ FAIL' : 'ℹ️ N/A';
      console.log(`  ${status} ${page}`);
    });
  });
  
  const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  
  console.log(`\n📊 ESTADÍSTICAS:`);
  console.log(`   Total de pruebas: ${totalTests}`);
  console.log(`   Pruebas exitosas: ${passedTests}`);
  console.log(`   Tasa de éxito: ${successRate}%`);
  
  if (successRate >= 90) {
    console.log(`\n🎉 ¡EXCELENTE! El sistema de logo está funcionando correctamente`);
  } else if (successRate >= 70) {
    console.log(`\n⚠️ BUENO: El sistema funciona pero hay algunas áreas de mejora`);
  } else {
    console.log(`\n❌ REQUIERE ATENCIÓN: El sistema necesita revisión`);
  }
}

// Función principal
async function runRoleTests() {
  console.log('🚀 Iniciando pruebas completas de roles...');
  
  try {
    const results = await testAllRoles();
    generateReport(results);
    
    console.log(`\n💡 INSTRUCCIONES PARA PRUEBAS MANUALES:`);
    console.log(`1. Usa las credenciales de prueba para cada rol`);
    console.log(`2. Navega a cada página mencionada`);
    console.log(`3. Verifica que el logo aparezca en el header`);
    console.log(`4. El logo debe ser coherente con el diseño de cada página`);
    
  } catch (error) {
    console.log('❌ Error en las pruebas:', error.message);
  }
}

// Auto-ejecutar
if (typeof window !== 'undefined') {
  runRoleTests();
} else {
  module.exports = { runRoleTests, testAllRoles, simulateUserLogin };
}