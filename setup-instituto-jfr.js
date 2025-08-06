// Script para configurar el Instituto JFR con datos reales
import { setupRealAdmin, cleanTestData } from './server/setup-real-admin.js';
import { setupRealSystemData } from './server/import-real-data.js';

async function main() {
  console.log('🏫 CONFIGURACIÓN INSTITUTO JOSÉ FRANCISCO RUIZ MASSIEU');
  console.log('=' .repeat(60));
  
  try {
    // 1. Configurar administrador real
    console.log('\n1️⃣  CREANDO ADMINISTRADOR REAL...');
    const setupResult = await setupRealAdmin();
    
    if (!setupResult.success) {
      console.error('❌ Error configurando administrador:', setupResult.error);
      return;
    }
    
    const { tenant, campus, adminUser } = setupResult;
    
    // 2. Configurar datos del sistema
    console.log('\n2️⃣  CONFIGURANDO DATOS DEL SISTEMA...');
    const importer = await setupRealSystemData(campus.id);
    
    console.log('\n✅ CONFIGURACIÓN COMPLETADA EXITOSAMENTE!');
    console.log('=' .repeat(60));
    console.log('🏢 INSTITUCIÓN:', tenant.nombre);
    console.log('🏫 CAMPUS:', campus.nombre);
    console.log('👤 ADMINISTRADOR:', adminUser.name);
    console.log('📧 EMAIL:', adminUser.email);
    console.log('🔑 CONTRASEÑA: [REDACTED]');
    console.log('=' .repeat(60));
    
    console.log('\n📋 PRÓXIMOS PASOS:');
    console.log('1. Subir logotipo del instituto');
    console.log('2. Importar archivo de alumnos reales');
    console.log('3. Configurar credenciales institucionales reales');
    console.log('4. Configurar métodos de pago');
    
  } catch (error) {
    console.error('❌ Error durante la configuración:', error);
  }
}

// Ejecutar configuración
main().catch(console.error);