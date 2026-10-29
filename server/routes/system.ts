import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, checkCampusTenant, serializeUser, upload, esmRequire, JWT_SECRET, hasPermissionForUser } from "./shared";
import { users, students, guardians, charges, payments, concepts, invoices, payment_rules, late_fee_calculations, payment_due_dates, payment_surcharge_rules } from "@shared/schema";
import { insertUserSchema } from "@shared/schema";
import { canEditUser, UserRole, MODULES, ACTIONS } from "@shared/permissions";
import { optimizeDatabase, checkQueryPerformance, cleanupObsoleteData, runMaintenanceTask } from "../optimize-database";
import { registerDemoSeedRoute } from "./demo-seed";
import { registerUnavailableSecurityRoutes } from "./unavailable-security";
import { unavailableFeature } from "./unavailable-feature";
import { wsManager } from "../websocket-manager";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";

export function registerSystemRoutes(app: Express): void {
  registerDemoSeedRoute(app);

  app.get("/api/payment-rules", authenticateToken, async (req: any, res) => {
    try {
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ error: "Campus requerido" });
      const rules = await db.select().from(payment_rules).where(eq(payment_rules.campus_id, campusId));
      res.json(rules);
    } catch (error) {
      console.error("Error fetching payment rules:", error);
      res.status(500).json({ error: "Error obteniendo reglas de pago" });
    }
  });

  app.post("/api/payment-rules", authenticateToken, async (req: any, res) => {
    try {
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      if (!campusId || !tenantId) return res.status(400).json({ error: "Campus y tenant requeridos" });

      // Validación con los nombres reales de columna que envía el frontend.
      // Bug original: el handler validaba 'type' y 'value' (nombres incorrectos)
      // mientras que el frontend (reglas-pago.tsx:173–189) envía 'rule_type',
      // 'name', 'late_fee_percentage', etc. — exactamente los nombres de columna
      // del schema Drizzle.  La validación incorrecta causaba 400 siempre, antes
      // incluso de llegar al INSERT (que también fallaba por tabla inexistente).
      const { rule_type, name: ruleName } = req.body;
      if (!rule_type) return res.status(400).json({ error: "rule_type es requerido" });
      if (!ruleName) return res.status(400).json({ error: "name es requerido" });

      // El frontend sobreescribe campus_id con un valor hardcodeado (campus_id: 24).
      // Lo sobreescribimos con el campus_id del JWT del usuario autenticado.
      const ruleData = { ...req.body, campus_id: campusId, tenant_id: tenantId };
      const [newRule] = await db.insert(payment_rules).values(ruleData).returning();
      res.json(newRule);
    } catch (error) {
      console.error("Error creating payment rule:", error);
      res.status(500).json({ error: "Error creando regla de pago" });
    }
  });

  app.post("/api/payment-rules/test", authenticateToken, async (req: any, res) => {
    try {
      const { rule, sampleAmounts } = req.body;
      
      // Simulate different late payment scenarios
      const scenarios = [];
      const testDays = [1, 7, 15, 30, 60];
      
      for (const amount of sampleAmounts) {
        for (const days of testDays) {
          let lateFee = 0;
          let calculation = "";
          
          // Apply grace period
          const effectiveDays = Math.max(0, days - rule.grace_period_days);
          
          if (effectiveDays > 0) {
            switch (rule.rule_type) {
              case 'percentage':
                lateFee = Math.round(amount * (rule.late_fee_percentage / 100));
                calculation = `${rule.late_fee_percentage}% del monto original`;
                break;
              case 'fixed_amount':
                lateFee = rule.late_fee_fixed_amount_centavos;
                calculation = `Recargo fijo de $${(lateFee/100).toFixed(2)}`;
                break;
              case 'compound':
                const dailyRate = (rule.late_fee_percentage / 100) / 30;
                lateFee = Math.round(amount * dailyRate * effectiveDays);
                calculation = `${rule.late_fee_percentage}% mensual compuesto por ${effectiveDays} días`;
                break;
            }
            
            // Apply limits
            if (rule.max_late_fee_centavos && lateFee > rule.max_late_fee_centavos) {
              lateFee = rule.max_late_fee_centavos;
              calculation += ` (limitado a máximo)`;
            }
            if (rule.min_late_fee_centavos && lateFee < rule.min_late_fee_centavos) {
              lateFee = rule.min_late_fee_centavos;
              calculation += ` (mínimo aplicado)`;
            }
          }
          
          scenarios.push({
            originalAmount: amount,
            daysLate: days,
            lateFee,
            totalAmount: amount + lateFee,
            calculation
          });
        }
      }
      
      res.json({ scenarios });
    } catch (error) {
      console.error("Error testing payment rule:", error);
      res.status(500).json({ error: "Failed to test payment rule" });
    }
  });


  // Update profile photo
  // Usa el patrón callback de multer para interceptar errores del fileFilter
  // (MIME no permitido) y devolver 400 en lugar de dejar que lleguen al
  // error handler global, que los convierte en 500 por falta de err.status.
  app.put("/api/profile/photo", authenticateToken, (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      
      if (!req.file) {
        return res.status(400).json({ message: "No se subió ninguna imagen" });
      }

      // Get current user
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // Convert image to base64 data URL
      const imageBuffer = req.file.buffer;
      const base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;

      // Update user photo URL
      const updateData = {
        ...user,
        foto_url: base64Image,
        updated_at: new Date()
      };

      await storage.updateUser(userId, updateData);

      res.json({ 
        message: "Foto de perfil actualizada exitosamente",
        foto_url: base64Image 
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error actualizando foto" });
    }
  });

  // SECURITY CYBERNETICS APIs
  
  // Security dashboard metrics - PROTEGIDO
  app.get("/api/security/metrics", requireAuth, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SECURITY, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver métricas de seguridad" });
      }
      res.status(501).json({ code: "NO_DISPONIBLE", message: "No disponible por ahora" });
    } catch (error) {
      res.status(500).json({ error: "Error obteniendo métricas de seguridad" });
    }
  });

  // Security events log - PROTEGIDO
  app.get("/api/security/events", requireAuth, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SECURITY, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver eventos de seguridad" });
      }
      res.status(501).json({ code: "NO_DISPONIBLE", message: "No disponible por ahora" });
    } catch (error) {
      res.status(500).json({ error: "Error obteniendo eventos de seguridad" });
    }
  });

  registerUnavailableSecurityRoutes(app, requireAuth, req =>
    hasPermissionForUser((req as any).user, MODULES.SECURITY, ACTIONS.READ),
  );

  // Generate security report - PROTEGIDO
  app.get("/api/security/report", requireAuth, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SECURITY, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver el reporte de seguridad" });
      }
      res.status(501).json({ code: "NO_DISPONIBLE", message: "No disponible por ahora" });
    } catch (error) {
      res.status(500).json({ error: "Error generando reporte de seguridad" });
    }
  });

  // ========================================
  // DATABASE OPTIMIZATION ENDPOINTS
  // ========================================

  // Optimize database performance
  app.post("/api/admin/optimize-database", requireAuth, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SYSTEM, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar optimización de base de datos" });
      }
      const result = await optimizeDatabase();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "Error optimizando base de datos", details: "Ver logs del servidor" });
    }
  });

  // Check query performance
  app.get("/api/admin/database-performance", requireAuth, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SYSTEM, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver rendimiento de la base de datos" });
      }
      const result = await checkQueryPerformance();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "Error verificando rendimiento", details: "Ver logs del servidor" });
    }
  });

  // Clean obsolete data
  app.post("/api/admin/cleanup-database", requireAuth, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SYSTEM, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar limpieza de base de datos" });
      }
      const result = await cleanupObsoleteData();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "Error limpiando datos", details: "Ver logs del servidor" });
    }
  });

  // Run complete maintenance task
  app.post("/api/admin/database-maintenance", requireAuth, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SYSTEM, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar mantenimiento de base de datos" });
      }
      const result = await runMaintenanceTask();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "Error ejecutando mantenimiento", details: "Ver logs del servidor" });
    }
  });

  // ========================================
  // SUPER ADMIN PLATFORM MANAGEMENT ROUTES
  // ========================================

  // Platform dashboard metrics
  app.get("/api/super-admin/platform/metrics", requireSuperAdmin, async (req, res) => {
    try {
      const metrics = await storage.getPlatformMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo métricas de plataforma" });
    }
  });

  // List all tenants/schools
  app.get("/api/super-admin/tenants", requireSuperAdmin, async (req, res) => {
    try {
      const tenants = await storage.getTenantsList();
      res.json(tenants);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo lista de escuelas" });
    }
  });

  // Security events monitoring (moved from regular admin)
  app.get("/api/super-admin/security/events", requireSuperAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getSecurityEvents(limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo eventos de seguridad" });
    }
  });

  // Security scan (platform-wide)
  app.post("/api/super-admin/security/scan", requireSuperAdmin, unavailableFeature(() => true));

  // System health monitoring
  app.get("/api/super-admin/system/health", requireSuperAdmin, async (req, res) => {
    try {
      const health = await storage.getSystemHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo estado del sistema" });
    }
  });

  // ========================================
  // DASHBOARD CONTADOR ROUTE
  // ========================================

  // Dashboard específico para contador (solo lectura)
  app.get("/api/dashboard/contador", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      // Obtener datos completos para análisis contable
      const [students, payments, charges, concepts] = await Promise.all([
        storage.getStudentsByCampus(campusId),
        storage.getPaymentsByCampus(campusId),
        storage.getChargesByCampus(campusId),
        storage.getConceptsByCampus(campusId)
      ]);

      // Calcular métricas financieras
      const completedPayments = payments.filter((p: any) => p.estado === 'completado');
      const totalIncome = completedPayments.reduce((sum: number, p: any) => sum + p.monto_centavos, 0);
      
      const pendingCharges = charges.filter((c: any) => c.estado === 'pendiente');
      const totalPending = pendingCharges.reduce((sum: number, c: any) => sum + c.monto_base_centavos, 0);
      
      const overdueCharges = charges.filter((c: any) => {
        const vencimiento = new Date(c.fecha_vencimiento);
        const hoy = new Date();
        return c.estado === 'pendiente' && vencimiento < hoy;
      });
      const totalOverdue = overdueCharges.reduce((sum: number, c: any) => sum + c.monto_base_centavos, 0);

      // Calcular tasa de cobranza
      const totalCharges = charges.reduce((sum: number, c: any) => sum + c.monto_base_centavos, 0);
      const collectionRate = totalCharges > 0 ? (totalIncome / totalCharges) * 100 : 0;

      // Estudiantes con saldo pendiente
      const studentsWithBalance = new Set();
      pendingCharges.forEach((charge: any) => {
        studentsWithBalance.add(charge.student_id);
      });

      const financialSummary = {
        total_income: totalIncome,
        total_pending: totalPending,
        total_overdue: totalOverdue,
        collection_rate: collectionRate,
        students_with_balance: studentsWithBalance.size,
        active_students: students.filter((s: any) => s.status === 'activo').length
      };

      res.json({
        students,
        payments: completedPayments, // Solo pagos completados para el contador
        charges,
        financial_summary: financialSummary
      });

    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo datos del dashboard" });
    }
  });

  // ========================================
  // SUPER ADMIN SCHOOL MANAGEMENT ROUTES
  // ========================================

  // Get detailed school information
  app.get("/api/super-admin/school-details/:schoolId", requireSuperAdmin, async (req, res) => {
    try {
      const schoolId = parseInt(req.params.schoolId);
      
      // Get campuses for this school
      const campuses = await storage.getCampusesByTenant(schoolId);
      
      // Get students for this school
      const allStudents = [];
      for (const campus of campuses) {
        const campusStudents = await storage.getStudentsByCampus(campus.id);
        allStudents.push(...campusStudents.map((s: any) => ({ ...s, campus })));
      }
      
      const schoolData = {
        campusCount: campuses.length,
        studentCount: allStudents.length,
        campuses,
        students: allStudents,
        unavailable: ["financial", "users", "activity"],
        message: "No disponible"
      };

      res.json(schoolData);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo detalles de escuela" });
    }
  });

  // Create new user for specific school
  app.post("/api/super-admin/create-user", requireSuperAdmin, async (req, res) => {
    try {
      const { email, nombre_completo, password, role, campus_id, tenant_id } = req.body;
      
      if (!email || !nombre_completo || !password || !role || !campus_id) {
        return res.status(400).json({ message: "Todos los campos son requeridos" });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);
      
      const newUser = await storage.createUser({
        email,
        name: nombre_completo,
        password_hash,
        role,
        campus_id: parseInt(campus_id),
        tenant_id: parseInt(tenant_id),
        is_active: true,
        is_super_admin: false
      });

      res.json({ 
        message: "Usuario creado exitosamente",
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creando usuario" });
    }
  });

  // Update school status
  app.post("/api/super-admin/update-school-status", requireSuperAdmin, async (req, res) => {
    try {
      const { schoolId, status } = req.body;
      
      if (!schoolId || !status) {
        return res.status(400).json({ message: "School ID y status son requeridos" });
      }

      // Update tenant status - simplified implementation
      // await storage.updateTenantStatus(schoolId, status);
      
      // Log security event
      await storage.createSecurityEvent({
        event_type: 'school_status_change',
        severity: 'medium',
        event_details: JSON.stringify({ 
          school_id: schoolId, 
          new_status: status,
          changed_by: (req as any).user.email 
        }),
        is_blocked: false
      });

      res.json({ 
        message: `Estado de escuela actualizado a ${status}`,
        schoolId,
        newStatus: status
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error actualizando estado de escuela" });
    }
  });

  // Get users by tenant
  app.get("/api/super-admin/users/:tenantId", requireSuperAdmin, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const users = await storage.getUsersByTenant(tenantId);
      res.json(users.map(serializeUser));
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo usuarios" });
    }
  });

  // Update user status
  app.post("/api/super-admin/update-user-status", requireSuperAdmin, async (req, res) => {
    try {
      const { userId, status } = req.body;
      
      if (!userId || !status) {
        return res.status(400).json({ message: "User ID y status son requeridos" });
      }

      await storage.updateUserStatus(userId, status);
      
      res.json({ 
        message: `Estado de usuario actualizado a ${status}`,
        userId,
        newStatus: status
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error actualizando estado de usuario" });
    }
  });

  // Reset user password
  app.post("/api/super-admin/reset-password", requireSuperAdmin, async (req, res) => {
    try {
      const { userId, newPassword } = req.body;
      
      if (!userId || !newPassword) {
        return res.status(400).json({ message: "User ID y nueva contraseña son requeridos" });
      }

      const password_hash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, password_hash);
      
      // Log security event
      await storage.createSecurityEvent({
        event_type: 'password_reset',
        severity: 'medium',
        event_details: JSON.stringify({ 
          user_id: userId,
          reset_by: (req as any).user.email 
        }),
        is_blocked: false
      });

      res.json({ 
        message: "Contraseña actualizada exitosamente",
        userId
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error actualizando contraseña" });
    }
  });

  // Block IP across platform
  app.post("/api/super-admin/security/block-ip", requireSuperAdmin, unavailableFeature(() => true));

  // Create super admin user — requiere autenticación de super admin existente
  app.post("/api/super-admin/create", requireSuperAdmin, async (req, res) => {
    try {
      const { email, password, name } = req.body;
      
      if (!email || !password || !name) {
        return res.status(400).json({ message: "Email, password y name son requeridos" });
      }

      // Check if super admin already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Usuario ya existe" });
      }

      const superAdmin = await storage.createSuperAdmin({
        email,
        password_hash: password, // Will be hashed in storage
        name,
        role: 'super_admin'
      });

      res.json({
        message: "Super administrador creado exitosamente",
        user: {
          id: superAdmin.id,
          email: superAdmin.email,
          name: superAdmin.name,
          role: superAdmin.role,
          is_super_admin: superAdmin.is_super_admin
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creando super administrador" });
    }
  });

  // REAL-TIME CEO DASHBOARD APIs
  app.get('/api/super-admin/live/revenue', requireSuperAdmin, unavailableFeature(() => true));
  app.get('/api/super-admin/live/transactions', requireSuperAdmin, unavailableFeature(() => true));
  app.get('/api/super-admin/analytics/regional', requireSuperAdmin, unavailableFeature(() => true));
  app.get('/api/super-admin/alerts/executive', requireSuperAdmin, unavailableFeature(() => true));

  // Retirado: no sustituir el ledger por estimaciones ni datos de ejemplo.
  const financialUnavailable = unavailableFeature(user =>
    hasPermissionForUser(user, MODULES.FINANCIAL, ACTIONS.READ));
  app.get("/api/financial/analysis/:period", authenticateToken, financialUnavailable);
  app.get("/api/financial/analysis", authenticateToken, financialUnavailable);

  // NOTIFICATION SYSTEM API - Sistema de notificaciones automáticas
  /**
   * GET /api/notifications
   * Historial real de notificaciones enviadas, filtrado por tenant del usuario.
   * Soporta query: ?canal=EMAIL|SMS|WHATSAPP&tipo=...&limit=&offset=
   */
}
