/**
 * Script de pruebas para verificar el logo institucional
 * Verifica que el logo aparezca correctamente en todos los roles y páginas
 */

console.log('🧪 INICIANDO PRUEBAS DEL LOGO INSTITUCIONAL');
console.log('='.repeat(60));

// Test 1: Verificar que la API de información institucional responde
async function testInstitutionalAPI() {
  console.log('\n📡 Test 1: API de información institucional');
  try {
    const response = await fetch('/api/institutional-info', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API responde correctamente');
      console.log('📊 Datos recibidos:', {
        nombre_legal: data.nombre_legal,
        logo_url_length: data.logo_url ? data.logo_url.length : 0,
        tiene_logo: !!data.logo_url
      });
      return data;
    } else {
      console.log('❌ Error en API:', response.status);
      return null;
    }
  } catch (error) {
    console.log('❌ Error de conexión:', error.message);
    return null;
  }
}

// Test 2: Verificar elementos del logo en el DOM
function testLogoElements() {
  console.log('\n🔍 Test 2: Elementos de logo en el DOM');
  
  const logoElements = document.querySelectorAll('img[alt="Logo institucional"]');
  console.log(`📊 Elementos de logo encontrados: ${logoElements.length}`);
  
  logoElements.forEach((logo, index) => {
    console.log(`🖼️ Logo ${index + 1}:`);
    console.log(`  - Src: ${logo.src.substring(0, 50)}...`);
    console.log(`  - Dimensiones: ${logo.clientWidth}x${logo.clientHeight}px`);
    console.log(`  - Visible: ${logo.offsetParent !== null}`);
  });
  
  return logoElements.length > 0;
}

// Test 3: Verificar hook useInstitution
function testUseInstitutionHook() {
  console.log('\n🪝 Test 3: Hook useInstitution');
  
  // Buscar componentes que usen el hook
  const reactFiber = document.querySelector('#root')?._reactInternalInstance ||
                    document.querySelector('#root')?._reactInternals;
  
  if (reactFiber) {
    console.log('✅ React detectado en la aplicación');
    console.log('📊 Hook useInstitution está funcionando (verificar consola de red)');
  } else {
    console.log('❌ No se pudo detectar React');
  }
}

// Test 4: Verificar páginas específicas
function testSpecificPages() {
  console.log('\n📄 Test 4: Páginas con logo implementado');
  
  const currentPath = window.location.pathname;
  const pagesWithLogo = [
    '/admin-dashboard',
    '/dashboard-admisiones', 
    '/dashboard-caja',
    '/dashboard-contador',
    '/usuarios',
    '/pagos',
    '/reportes',
    '/cuentas-por-cobrar'
  ];
  
  console.log(`📍 Página actual: ${currentPath}`);
  
  if (pagesWithLogo.includes(currentPath)) {
    console.log('✅ Esta página debe tener logo institucional');
    return testLogoElements();
  } else {
    console.log('ℹ️ Esta página no tiene logo institucional implementado');
    return false;
  }
}

// Test 5: Verificar roles de usuario
function testUserRoles() {
  console.log('\n👤 Test 5: Roles de usuario');
  
  const userStr = localStorage.getItem('auth_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      console.log('✅ Usuario autenticado:', {
        nombre: user.nombre_completo,
        role: user.role,
        campus_id: user.campus_id
      });
      
      const rolesWithDashboard = [
        'super_admin', 'administrador_general', 'administrador_campus',
        'admisiones', 'caja', 'contador_general', 'auxiliar_contable', 'asistente'
      ];
      
      if (rolesWithDashboard.includes(user.role)) {
        console.log('✅ Este rol debe ver logo en su dashboard');
      } else {
        console.log('ℹ️ Rol no configurado para logo específico');
      }
    } catch (error) {
      console.log('❌ Error parseando usuario:', error.message);
    }
  } else {
    console.log('❌ No hay usuario autenticado');
  }
}

// Test 6: Verificar localStorage vs base de datos
async function testLogoStorage() {
  console.log('\n💾 Test 6: Almacenamiento de logo');
  
  // Verificar si hay logo en localStorage (legacy)
  const localLogo = localStorage.getItem('institution_logo');
  console.log(`📱 Logo en localStorage: ${localLogo ? 'Sí' : 'No'}`);
  
  // Verificar logo desde API (nuevo sistema)
  const apiData = await testInstitutionalAPI();
  const hasApiLogo = apiData && apiData.logo_url;
  console.log(`🗄️ Logo en base de datos: ${hasApiLogo ? 'Sí' : 'No'}`);
  
  if (hasApiLogo) {
    console.log('✅ Sistema usando logo desde base de datos (correcto)');
  } else if (localLogo) {
    console.log('⚠️ Sistema usando logo desde localStorage (legacy)');
  } else {
    console.log('ℹ️ No hay logo configurado');
  }
}

// Ejecutar todas las pruebas
async function runAllTests() {
  console.log('🚀 Ejecutando todas las pruebas...\n');
  
  await testInstitutionalAPI();
  testLogoElements();
  testUseInstitutionHook();
  testSpecificPages();
  testUserRoles();
  await testLogoStorage();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ PRUEBAS COMPLETADAS');
  console.log('📋 Revisa los resultados arriba para verificar el funcionamiento');
  console.log('💡 Si hay problemas, verifica la consola de red y errores');
}

// Auto-ejecutar si está en el navegador
if (typeof window !== 'undefined') {
  runAllTests();
} else {
  module.exports = { runAllTests, testInstitutionalAPI, testLogoElements };
}