// @ts-nocheck
/**
 * OPTIMIZACIÓN DE BASE DE DATOS - EDUPAY
 * Script para agregar índices críticos y optimizar rendimiento
 */

import { db } from './db';
import { sql } from 'drizzle-orm';

export async function optimizeDatabase() {
  console.log('🔧 Iniciando optimización de base de datos...');
  
  try {
    // Índices para tablas principales
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_campus_id ON users(campus_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_is_active ON users(is_active);
    `);
    
    // Índices para estudiantes
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_campus_id ON students(campus_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_curp ON students(curp);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_status ON students(status);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_grado ON students(grado);
    `);
    
    // Índices para guardianes
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guardians_email ON guardians(email);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guardians_rfc ON guardians(rfc);
    `);
    
    // Índices para pagos
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_student_id ON payments(student_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_guardian_id ON payments(guardian_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_created_at ON payments(created_at);
    `);
    
    // Índices para cargos
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_charges_student_id ON charges(student_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_charges_concept_id ON charges(concept_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_charges_status ON charges(status);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_charges_due_date ON charges(due_date);
    `);
    
    // Índices para becas
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scholarships_student_id ON scholarships(student_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scholarships_status ON scholarships(status);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scholarships_type ON scholarships(type);
    `);
    
    // Índices para tenants y campus
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campuses_tenant_id ON campuses(tenant_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_concepts_campus_id ON concepts(campus_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_concepts_type ON concepts(type);
    `);
    
    // Índices para relaciones
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_guardian_student_id ON student_guardian(student_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_guardian_guardian_id ON student_guardian(guardian_id);
    `);
    
    // Índices para sistema de aprobaciones
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_approvals_approver_id ON pending_approvals(approver_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_approvals_status ON pending_approvals(status);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_approvals_created_at ON pending_approvals(created_at);
    `);
    
    // Índices para notificaciones
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_notifications_user_id ON approval_notifications(user_id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_notifications_read ON approval_notifications(read);
    `);
    
    console.log('✅ Índices de base de datos optimizados');
    
    // Actualizar estadísticas de tablas
    await db.execute(sql`ANALYZE;`);
    
    console.log('✅ Estadísticas de tablas actualizadas');
    
    return { success: true, message: 'Base de datos optimizada exitosamente' };
    
  } catch (error) {
    console.error('❌ Error optimizando base de datos:', error);
    return { success: false, error: error.message };
  }
}

// Función para verificar el rendimiento de consultas
export async function checkQueryPerformance() {
  try {
    console.log('📊 Verificando rendimiento de consultas...');
    
    // Verificar tamaño de tablas
    const tableStats = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats 
      WHERE schemaname = 'public' 
      AND tablename IN ('users', 'students', 'payments', 'charges', 'guardians')
      ORDER BY tablename, attname;
    `);
    
    console.log('📈 Estadísticas de tablas:', tableStats.rows);
    
    // Verificar índices utilizados
    const indexUsage = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC;
    `);
    
    console.log('🔍 Uso de índices:', indexUsage.rows);
    
    return { 
      success: true, 
      tableStats: tableStats.rows, 
      indexUsage: indexUsage.rows 
    };
    
  } catch (error) {
    console.error('❌ Error verificando rendimiento:', error);
    return { success: false, error: error.message };
  }
}

// Función para limpiar datos obsoletos
export async function cleanupObsoleteData() {
  try {
    console.log('🧹 Limpiando datos obsoletos...');
    
    // Eliminar tokens de sesión expirados
    await db.execute(sql`
      DELETE FROM sessions 
      WHERE expire < NOW();
    `);
    
    // Eliminar logs de seguridad antiguos (más de 90 días)
    await db.execute(sql`
      DELETE FROM security_events 
      WHERE created_at < NOW() - INTERVAL '90 days';
    `);
    
    // Eliminar notificaciones leídas antiguas (más de 30 días)
    await db.execute(sql`
      DELETE FROM approval_notifications 
      WHERE read = true 
      AND created_at < NOW() - INTERVAL '30 days';
    `);
    
    console.log('✅ Datos obsoletos limpiados');
    
    return { success: true, message: 'Limpieza completada' };
    
  } catch (error) {
    console.error('❌ Error en limpieza:', error);
    return { success: false, error: error.message };
  }
}

// Función para ejecutar mantenimiento completo
export async function runMaintenanceTask() {
  console.log('🔧 Ejecutando mantenimiento de base de datos...');
  
  const results = {
    optimization: await optimizeDatabase(),
    performance: await checkQueryPerformance(),
    cleanup: await cleanupObsoleteData()
  };
  
  console.log('📊 Resultados del mantenimiento:', results);
  
  return results;
}