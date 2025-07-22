import { db } from "./db";
import { 
  users, tenants, campuses, students, security_events, platform_metrics, system_health 
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";

export async function seedSuperAdminData() {
  try {
    console.log("🚀 Iniciando seed de datos Super Admin...");

    // 1. Crear usuario Super Admin si no existe
    const existingSuperAdmin = await db.select().from(users).where(eq(users.email, 'superadmin@edupay.com'));
    
    if (existingSuperAdmin.length === 0) {
      const hashedPassword = await bcrypt.hash('SuperAdmin123!', 12);
      await db.insert(users).values({
        email: 'superadmin@edupay.com',
        password_hash: hashedPassword,
        name: 'Propietario Edupay',
        role: 'super_admin',
        is_super_admin: true,
        platform_permissions: ['platform_management', 'security_monitoring', 'tenant_management']
      });
      console.log("✅ Super Admin creado");
    }

    // 2. Crear tenants demo
    const demoTenants = [
      {
        nombre_legal: 'Instituto San Patricio S.C.',
        rfc: 'ISP870815ABC',
        cfdi_pac_id: 'PAC_001'
      },
      {
        nombre_legal: 'Colegio Montessori de Guadalajara A.C.',
        rfc: 'CMG951203XYZ',
        cfdi_pac_id: 'PAC_002'
      },
      {
        nombre_legal: 'Escuela Bilingüe del Valle S.A. de C.V.',
        rfc: 'EBV881120DEF',
        cfdi_pac_id: 'PAC_003'
      }
    ];

    for (const tenant of demoTenants) {
      const existing = await db.select().from(tenants).where(eq(tenants.rfc, tenant.rfc));
      if (existing.length === 0) {
        const [newTenant] = await db.insert(tenants).values(tenant).returning();
        
        // Crear campus para cada tenant
        await db.insert(campuses).values({
          tenant_id: newTenant.id,
          nombre: `Campus Principal - ${tenant.nombre_legal.split(' ')[0]}`,
          clave_sep: `SEP${Math.random().toString().slice(2, 8)}`
        });
      }
    }
    console.log("✅ Tenants demo creados");

    // 3. Crear eventos de seguridad demo
    const securityEventsDemo = [
      {
        event_type: 'sql_injection_blocked',
        severity: 'critical',
        ip_address: '192.168.1.45',
        event_details: JSON.stringify({ 
          attack_vector: 'POST /api/login',
          payload: "' OR '1'='1",
          blocked_at: new Date().toISOString()
        }),
        is_blocked: true
      },
      {
        event_type: 'brute_force_attempt',
        severity: 'high',
        ip_address: '10.0.0.23',
        event_details: JSON.stringify({
          attempts: 15,
          target_user: 'admin@colegio.com',
          duration_minutes: 5
        }),
        is_blocked: true
      },
      {
        event_type: 'suspicious_login',
        severity: 'medium',
        ip_address: '203.45.67.89',
        event_details: JSON.stringify({
          user_agent: 'Suspicious Bot v1.0',
          geolocation: 'Unknown',
          success: false
        }),
        is_blocked: false
      }
    ];

    for (const event of securityEventsDemo) {
      await db.insert(security_events).values(event);
    }
    console.log("✅ Eventos de seguridad demo creados");

    // 4. Crear métricas de plataforma
    const today = new Date().toISOString().split('T')[0];
    const platformMetricsDemo = [
      {
        metric_type: 'total_schools',
        metric_value: 3,
        metric_date: today
      },
      {
        metric_type: 'active_schools',
        metric_value: 2,
        metric_date: today
      },
      {
        metric_type: 'total_students',
        metric_value: 1247,
        metric_date: today
      },
      {
        metric_type: 'total_payments',
        metric_value: 8932,
        metric_date: today
      },
      {
        metric_type: 'security_events',
        metric_value: 23,
        metric_date: today
      }
    ];

    for (const metric of platformMetricsDemo) {
      const existing = await db.select().from(platform_metrics)
        .where(and(
          eq(platform_metrics.metric_type, metric.metric_type),
          eq(platform_metrics.metric_date, metric.metric_date)
        ));
      
      if (existing.length === 0) {
        await db.insert(platform_metrics).values(metric);
      }
    }
    console.log("✅ Métricas de plataforma creadas");

    // 5. Crear registros de salud del sistema
    const systemHealthDemo = [
      {
        service_name: 'database',
        status: 'healthy',
        response_time_ms: 45,
        error_message: null
      },
      {
        service_name: 'api_gateway',
        status: 'healthy',
        response_time_ms: 12,
        error_message: null
      },
      {
        service_name: 'security_engine',
        status: 'healthy',
        response_time_ms: 8,
        error_message: null
      },
      {
        service_name: 'payment_processor',
        status: 'warning',
        response_time_ms: 120,
        error_message: 'High response time detected'
      }
    ];

    for (const health of systemHealthDemo) {
      await db.insert(system_health).values(health);
    }
    console.log("✅ Estado del sistema creado");

    console.log("🎉 Seed de datos Super Admin completado exitosamente");
    return true;

  } catch (error) {
    console.error("❌ Error en seed Super Admin:", error);
    return false;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  seedSuperAdminData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}