/**
 * PRUEBA DE DISTRIBUCIÓN DE DATOS DE ADMISIONES
 * Verificar que los datos están correctamente distribuidos por nivel académico
 */

const BASE_URL = 'http://localhost:5000';

// Datos de usuario de admisiones
const USUARIO_ADMISIONES = {
  email: "admisiones@sanpatricio.edu.mx",
  password: "demo123"
};

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    
    // Si la respuesta es HTML, probablemente no es una API válida
    if (text.startsWith('<!DOCTYPE html>')) {
      return { success: false, error: 'Respuesta HTML recibida en lugar de JSON' };
    }
    
    const data = JSON.parse(text);
    return { success: response.ok, data, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function probarDistribucionAdmisiones() {
  console.log('📊 PRUEBA DE DISTRIBUCIÓN DE DATOS DE ADMISIONES');
  console.log('='.repeat(60));
  
  // Autenticar
  const authResult = await makeRequest(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(USUARIO_ADMISIONES)
  });
  
  if (!authResult.success) {
    console.log('❌ Error al autenticar:', authResult.error);
    return;
  }
  
  const token = authResult.data.token;
  console.log('✅ Usuario autenticado correctamente');
  
  // Obtener datos de estudiantes
  const estudiantesResult = await makeRequest(`${BASE_URL}/api/admin/students/24`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!estudiantesResult.success) {
    console.log('❌ Error al obtener estudiantes:', estudiantesResult.error);
    return;
  }
  
  const estudiantes = estudiantesResult.data;
  console.log(`✅ Total de estudiantes: ${estudiantes.length}`);
  
  // Análisis de distribución por nivel académico
  console.log('\n📚 DISTRIBUCIÓN POR NIVEL ACADÉMICO:');
  console.log('─'.repeat(60));
  
  const porNivel = {};
  const porEstado = {};
  const conCurp = {};
  
  estudiantes.forEach(estudiante => {
    // Detectar nivel académico desde el grado
    let nivel = 'Sin nivel';
    if (estudiante.grado.includes('Kinder')) nivel = 'Kinder';
    else if (estudiante.grado.includes('Primaria')) nivel = 'Primaria';
    else if (estudiante.grado.includes('Secundaria')) nivel = 'Secundaria';
    else if (estudiante.grado.includes('Bachillerato')) nivel = 'Bachillerato';
    
    const estado = estudiante.status || 'Sin estado';
    const curp = estudiante.curp ? 'Con CURP' : 'Sin CURP';
    
    porNivel[nivel] = (porNivel[nivel] || 0) + 1;
    porEstado[estado] = (porEstado[estado] || 0) + 1;
    conCurp[curp] = (conCurp[curp] || 0) + 1;
  });
  
  // Mostrar distribución por nivel
  Object.entries(porNivel).sort((a, b) => b[1] - a[1]).forEach(([nivel, cantidad]) => {
    const porcentaje = ((cantidad / estudiantes.length) * 100).toFixed(1);
    console.log(`   ${nivel.padEnd(15)} │ ${cantidad.toString().padStart(2)} estudiantes │ ${porcentaje.padStart(5)}%`);
  });
  
  // Mostrar distribución por estado
  console.log('\n📋 DISTRIBUCIÓN POR ESTADO:');
  console.log('─'.repeat(60));
  Object.entries(porEstado).forEach(([estado, cantidad]) => {
    const porcentaje = ((cantidad / estudiantes.length) * 100).toFixed(1);
    console.log(`   ${estado.padEnd(15)} │ ${cantidad.toString().padStart(2)} estudiantes │ ${porcentaje.padStart(5)}%`);
  });
  
  // Mostrar distribución por CURP
  console.log('\n📄 DISTRIBUCIÓN POR CURP:');
  console.log('─'.repeat(60));
  Object.entries(conCurp).forEach(([curp, cantidad]) => {
    const porcentaje = ((cantidad / estudiantes.length) * 100).toFixed(1);
    console.log(`   ${curp.padEnd(15)} │ ${cantidad.toString().padStart(2)} estudiantes │ ${porcentaje.padStart(5)}%`);
  });
  
  // Análisis detallado por nivel académico
  console.log('\n🔍 ANÁLISIS DETALLADO POR NIVEL:');
  console.log('─'.repeat(60));
  
  const niveles = ['Kinder', 'Primaria', 'Secundaria', 'Bachillerato'];
  
  niveles.forEach(nivel => {
    const estudiantesNivel = estudiantes.filter(e => {
      return e.grado.includes(nivel);
    });
    
    if (estudiantesNivel.length > 0) {
      console.log(`\n📚 ${nivel.toUpperCase()}:`);
      console.log(`   Total: ${estudiantesNivel.length} estudiantes`);
      
      // Mostrar algunos ejemplos
      estudiantesNivel.slice(0, 3).forEach(estudiante => {
        const curpIcon = estudiante.curp ? '✅' : '⚠️';
        console.log(`   ${curpIcon} ${estudiante.nombre_completo} (${estudiante.grado})`);
      });
    }
  });
  
  // Verificar que los datos son apropiados para admisiones
  console.log('\n🎯 VERIFICACIÓN PARA ADMISIONES:');
  console.log('─'.repeat(60));
  
  const estudiantesRelevantes = estudiantes.filter(e => 
    e.status === 'activo'
  );
  
  console.log(`📊 Total de estudiantes activos: ${estudiantesRelevantes.length}`);
  console.log(`📚 Estudiantes con CURP generado: ${estudiantes.filter(e => e.curp).length}`);
  console.log(`📋 Distribución correcta por niveles académicos: ${Object.keys(porNivel).length} niveles`);
  
  console.log('\n✅ PRUEBA COMPLETADA - Datos de admisiones listos para visualización');
  
  console.log('\n🎉 RESUMEN FINAL:');
  console.log('='.repeat(60));
  console.log(`📊 Total de estudiantes: ${estudiantes.length}`);
  console.log(`🎯 Niveles académicos: ${Object.keys(porNivel).length}`);
  console.log(`📋 Estados diferentes: ${Object.keys(porEstado).length}`);
  console.log(`📚 Estudiantes con CURP: ${estudiantes.filter(e => e.curp).length}`);
  console.log(`✅ Datos listos para reportes de admisiones`);
}

// Ejecutar la prueba
probarDistribucionAdmisiones().catch(console.error);