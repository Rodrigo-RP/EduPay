import { 
  tenants, campuses, users, students, guardians, student_guardian, concepts, 
  charges, payments, payment_methods, invoices, scholarships, discounts,
  security_events, platform_metrics, system_health, pending_approvals,
  approval_notifications, approval_workflow_logs,
  type User, type InsertUser, type Guardian, type InsertGuardian, 
  type Student, type InsertStudent, type Charge, type InsertCharge,
  type Payment, type InsertPayment, type Campus, type InsertCampus,
  type Concept, type InsertConcept, type Tenant, type InsertTenant,
  type PaymentMethod, type SecurityEvent, type InsertSecurityEvent, 
  type SystemHealth, type PendingApproval, type InsertPendingApproval,
  type ApprovalNotification, type InsertApprovalNotification,
  type ApprovalWorkflowLog, type InsertApprovalWorkflowLog
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface IStorage {
  // Authentication
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Super Admin operations
  createSuperAdmin(admin: InsertUser): Promise<User>;
  getPlatformMetrics(): Promise<{
    totalSchools: number;
    activeSchools: number;
    totalStudents: number;
    totalPayments: number;
    securityEvents: number;
  }>;
  getSecurityEvents(limit?: number): Promise<SecurityEvent[]>;
  getTenantsList(): Promise<(Tenant & { campusCount: number; studentCount: number; status: string })[]>;
  getSystemHealth(): Promise<SystemHealth[]>;
  createSecurityEvent(event: InsertSecurityEvent): Promise<SecurityEvent>;
  
  // Guardian authentication
  getGuardian(id: number): Promise<Guardian | undefined>;
  getGuardianByEmail(email: string): Promise<Guardian | undefined>;
  createGuardian(guardian: InsertGuardian): Promise<Guardian>;
  
  // Multi-tenant operations
  getTenant(id: number): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  getCampusesByTenant(tenantId: number): Promise<Campus[]>;
  createCampus(campus: InsertCampus): Promise<Campus>;
  
  // Student operations
  getStudentsByGuardian(guardianId: number): Promise<(Student & { campus: Campus })[]>;
  getStudentsByCampus(campusId: number): Promise<Student[]>;
  createStudent(student: InsertStudent): Promise<Student>;
  
  // Concept operations
  getConceptsByCampus(campusId: number): Promise<Concept[]>;
  createConcept(concept: InsertConcept): Promise<Concept>;
  
  // Charge operations
  getChargesByStudent(studentId: number): Promise<(Charge & { concept: Concept })[]>;
  getChargesByCampus(campusId: number): Promise<Charge[]>;
  getPendingChargesByGuardian(guardianId: number): Promise<(Charge & { student: Student; concept: Concept })[]>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  updateChargeStatus(chargeId: number, status: string): Promise<void>;
  
  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByGuardian(guardianId: number): Promise<(Payment & { charge: Charge & { concept: Concept; student: Student } })[]>;
  getPaymentsByCampus(campusId: number): Promise<(Payment & { charge: Charge & { concept: Concept; student: Student } })[]>;
  
  // Payment methods
  getPaymentMethodsByGuardian(guardianId: number): Promise<PaymentMethod[]>;
  
  // School management operations
  getUsersByTenant(tenantId: number): Promise<User[]>;
  updateTenantStatus(tenantId: number, status: string): Promise<void>;
  updateUserStatus(userId: number, status: string): Promise<void>;
  updateUserPassword(userId: number, password_hash: string): Promise<void>;
  
  // Dashboard KPIs
  getDashboardKPIs(campusId: number): Promise<{
    totalBilled: number;
    paymentRate: number;
    overdueRate: number;
    activeStudents: number;
  }>;
  
  // Approval workflow operations
  createPendingApproval(approval: InsertPendingApproval): Promise<PendingApproval>;
  getPendingApprovalsForApprover(userId: number): Promise<PendingApproval[]>;
  getPendingApprovalsByRequester(userId: number): Promise<PendingApproval[]>;
  getPendingApprovalById(id: number): Promise<PendingApproval | undefined>;
  updateApprovalStatus(id: number, status: string, approvedBy?: number, notes?: string): Promise<void>;
  createApprovalNotification(notification: InsertApprovalNotification): Promise<ApprovalNotification>;
  getNotificationsByUser(userId: number): Promise<ApprovalNotification[]>;
  markNotificationAsRead(id: number): Promise<void>;
  createApprovalWorkflowLog(log: InsertApprovalWorkflowLog): Promise<ApprovalWorkflowLog>;
  getWorkflowLogsByApproval(approvalId: number): Promise<ApprovalWorkflowLog[]>;
  checkUserCanApprove(userId: number, actionType: string): Promise<boolean>;
  requiresApproval(actionType: string, userId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password_hash, 10);
    const [user] = await db
      .insert(users)
      .values({ ...insertUser, password_hash: hashedPassword })
      .returning();
    return user;
  }

  async getGuardian(id: number): Promise<Guardian | undefined> {
    const [guardian] = await db.select().from(guardians).where(eq(guardians.id, id));
    return guardian || undefined;
  }

  async getGuardianByEmail(email: string): Promise<Guardian | undefined> {
    const [guardian] = await db.select().from(guardians).where(eq(guardians.email, email));
    return guardian || undefined;
  }

  async createGuardian(insertGuardian: InsertGuardian): Promise<Guardian> {
    const hashedPassword = insertGuardian.password_hash ? 
      await bcrypt.hash(insertGuardian.password_hash, 10) : null;
    const [guardian] = await db
      .insert(guardians)
      .values({ ...insertGuardian, password_hash: hashedPassword })
      .returning();
    return guardian;
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant || undefined;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  async getCampusesByTenant(tenantId: number): Promise<Campus[]> {
    return await db.select().from(campuses).where(eq(campuses.tenant_id, tenantId));
  }

  async createCampus(campus: InsertCampus): Promise<Campus> {
    const [newCampus] = await db.insert(campuses).values(campus).returning();
    return newCampus;
  }

  async getStudentsByGuardian(guardianId: number): Promise<(Student & { campus: Campus })[]> {
    return await db
      .select({
        id: students.id,
        campus_id: students.campus_id,
        curp: students.curp,
        nombre_completo: students.nombre_completo,
        grado: students.grado,
        grupo: students.grupo,
        status: students.status,
        created_at: students.created_at,
        updated_at: students.updated_at,
        campus: campuses,
      })
      .from(students)
      .innerJoin(student_guardian, eq(students.id, student_guardian.student_id))
      .innerJoin(campuses, eq(students.campus_id, campuses.id))
      .where(eq(student_guardian.guardian_id, guardianId));
  }

  async getStudentsByCampus(campusId: number): Promise<Student[]> {
    return await db.select().from(students).where(eq(students.campus_id, campusId));
  }

  async createStudent(student: InsertStudent): Promise<Student> {
    const [newStudent] = await db.insert(students).values(student).returning();
    return newStudent;
  }

  async getConceptsByCampus(campusId: number): Promise<Concept[]> {
    return await db.select().from(concepts).where(eq(concepts.campus_id, campusId));
  }

  async createConcept(concept: InsertConcept): Promise<Concept> {
    const [newConcept] = await db.insert(concepts).values(concept).returning();
    return newConcept;
  }

  async getChargesByStudent(studentId: number): Promise<(Charge & { concept: Concept })[]> {
    return await db
      .select({
        id: charges.id,
        student_id: charges.student_id,
        concept_id: charges.concept_id,
        ciclo_escolar: charges.ciclo_escolar,
        fecha_emision: charges.fecha_emision,
        fecha_vencimiento: charges.fecha_vencimiento,
        monto_base_centavos: charges.monto_base_centavos,
        beca_aplicada: charges.beca_aplicada,
        recargo_aplicado_centavos: charges.recargo_aplicado_centavos,
        estado: charges.estado,
        created_at: charges.created_at,
        updated_at: charges.updated_at,
        concept: concepts,
      })
      .from(charges)
      .innerJoin(concepts, eq(charges.concept_id, concepts.id))
      .where(eq(charges.student_id, studentId))
      .orderBy(desc(charges.fecha_vencimiento));
  }

  async getChargesByCampus(campusId: number): Promise<Charge[]> {
    const results = await db
      .select()
      .from(charges)
      .innerJoin(students, eq(charges.student_id, students.id))
      .where(eq(students.campus_id, campusId))
      .orderBy(desc(charges.fecha_vencimiento));
    
    return results.map((row: any) => row.charges);
  }

  async getPendingChargesByGuardian(guardianId: number): Promise<(Charge & { student: Student; concept: Concept })[]> {
    return await db
      .select({
        id: charges.id,
        student_id: charges.student_id,
        concept_id: charges.concept_id,
        ciclo_escolar: charges.ciclo_escolar,
        fecha_emision: charges.fecha_emision,
        fecha_vencimiento: charges.fecha_vencimiento,
        monto_base_centavos: charges.monto_base_centavos,
        beca_aplicada: charges.beca_aplicada,
        recargo_aplicado_centavos: charges.recargo_aplicado_centavos,
        estado: charges.estado,
        created_at: charges.created_at,
        updated_at: charges.updated_at,
        student: students,
        concept: concepts,
      })
      .from(charges)
      .innerJoin(students, eq(charges.student_id, students.id))
      .innerJoin(concepts, eq(charges.concept_id, concepts.id))
      .innerJoin(student_guardian, eq(students.id, student_guardian.student_id))
      .where(
        and(
          eq(student_guardian.guardian_id, guardianId),
          eq(charges.estado, "pendiente")
        )
      )
      .orderBy(charges.fecha_vencimiento);
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const [newCharge] = await db.insert(charges).values(charge).returning();
    return newCharge;
  }

  async updateChargeStatus(chargeId: number, status: string): Promise<void> {
    await db.update(charges)
      .set({ estado: status })
      .where(eq(charges.id, chargeId));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getPaymentsByGuardian(guardianId: number): Promise<(Payment & { charge: Charge & { concept: Concept; student: Student } })[]> {
    const results = await db
      .select()
      .from(payments)
      .innerJoin(charges, eq(payments.charge_id, charges.id))
      .innerJoin(concepts, eq(charges.concept_id, concepts.id))
      .innerJoin(students, eq(charges.student_id, students.id))
      .where(eq(payments.guardian_id, guardianId));

    return results.map((row: any) => ({
      ...row.payments,
      charge: {
        ...row.charges,
        concept: row.concepts,
        student: row.students
      }
    })) as any;
  }

  async getPaymentsByCampus(campusId: number): Promise<(Payment & { charge: Charge & { concept: Concept; student: Student } })[]> {
    const results = await db
      .select()
      .from(payments)
      .innerJoin(charges, eq(payments.charge_id, charges.id))
      .innerJoin(concepts, eq(charges.concept_id, concepts.id))
      .innerJoin(students, eq(charges.student_id, students.id))
      .where(eq(students.campus_id, campusId))
      .orderBy(desc(payments.fecha_pago));

    return results.map((row: any) => ({
      ...row.payments,
      charge: {
        ...row.charges,
        concept: row.concepts,
        student: row.students
      }
    })) as any;
  }

  async getPaymentMethodsByGuardian(guardianId: number): Promise<PaymentMethod[]> {
    return await db.select().from(payment_methods).where(eq(payment_methods.guardian_id, guardianId));
  }

  async getDashboardKPIs(campusId: number): Promise<{
    totalBilled: number;
    paymentRate: number;
    overdueRate: number;
    activeStudents: number;
  }> {
    // Get total billed amount for this campus
    const [billedResult] = await db
      .select({ 
        total: sql<number>`COALESCE(SUM(${charges.monto_base_centavos}), 0)` 
      })
      .from(charges)
      .innerJoin(students, eq(charges.student_id, students.id))
      .where(eq(students.campus_id, campusId));

    // Get payment statistics
    const [paymentStats] = await db
      .select({
        total_charges: sql<number>`COUNT(*)`,
        paid_charges: sql<number>`COUNT(CASE WHEN ${charges.estado} = 'pagado' THEN 1 END)`,
        overdue_charges: sql<number>`COUNT(CASE WHEN ${charges.estado} = 'pendiente' AND ${charges.fecha_vencimiento} < CURRENT_DATE THEN 1 END)`,
      })
      .from(charges)
      .innerJoin(students, eq(charges.student_id, students.id))
      .where(eq(students.campus_id, campusId));

    // Get active students count
    const [studentCount] = await db
      .select({ 
        count: sql<number>`COUNT(*)` 
      })
      .from(students)
      .where(
        and(
          eq(students.campus_id, campusId),
          eq(students.status, "activo")
        )
      );

    const totalBilled = billedResult.total / 100; // Convert from centavos
    const paymentRate = paymentStats.total_charges > 0 ? 
      (paymentStats.paid_charges / paymentStats.total_charges) * 100 : 0;
    const overdueRate = paymentStats.total_charges > 0 ? 
      (paymentStats.overdue_charges / paymentStats.total_charges) * 100 : 0;

    return {
      totalBilled,
      paymentRate,
      overdueRate,
      activeStudents: studentCount.count,
    };
  }

  // SUPER ADMIN FUNCTIONS
  async createSuperAdmin(admin: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(admin.password_hash, 12);
    const [newAdmin] = await db.insert(users).values({
      ...admin,
      password_hash: hashedPassword,
      role: 'super_admin',
      is_super_admin: true,
      platform_permissions: ['platform_management', 'security_monitoring', 'tenant_management']
    }).returning();
    return newAdmin;
  }

  async getPlatformMetrics(): Promise<{
    totalSchools: number;
    activeSchools: number;
    totalStudents: number;
    totalPayments: number;
    securityEvents: number;
  }> {
    // Get total schools (tenants)
    const [schoolCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tenants);

    // Get active schools (those with recent activity)
    const [activeSchoolCount] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${tenants.id})` })
      .from(tenants)
      .innerJoin(campuses, eq(tenants.id, campuses.tenant_id))
      .innerJoin(students, eq(campuses.id, students.campus_id))
      .where(eq(students.status, 'activo'));

    // Get total students across all schools
    const [studentCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(students)
      .where(eq(students.status, 'activo'));

    // Get total payments
    const [paymentsCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(payments);

    // Get security events from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [securityCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(security_events)
      .where(sql`${security_events.created_at} >= ${thirtyDaysAgo}`);

    return {
      totalSchools: schoolCount.count,
      activeSchools: activeSchoolCount.count,
      totalStudents: studentCount.count,
      totalPayments: paymentsCount.count,
      securityEvents: securityCount.count,
    };
  }

  async getSecurityEvents(limit: number = 50): Promise<SecurityEvent[]> {
    return await db
      .select()
      .from(security_events)
      .orderBy(desc(security_events.created_at))
      .limit(limit);
  }

  async getTenantsList(): Promise<(Tenant & { campusCount: number; studentCount: number; status: string })[]> {
    const tenantsWithStats = await db
      .select({
        id: tenants.id,
        nombre_legal: tenants.nombre_legal,
        rfc: tenants.rfc,
        cfdi_pac_id: tenants.cfdi_pac_id,
        created_at: tenants.created_at,
        updated_at: tenants.updated_at,
        campusCount: sql<number>`COUNT(DISTINCT ${campuses.id})`,
        studentCount: sql<number>`COUNT(DISTINCT ${students.id})`,
      })
      .from(tenants)
      .leftJoin(campuses, eq(tenants.id, campuses.tenant_id))
      .leftJoin(students, eq(campuses.id, students.campus_id))
      .groupBy(tenants.id)
      .orderBy(tenants.created_at);

    return tenantsWithStats.map(tenant => ({
      ...tenant,
      status: tenant.studentCount > 0 ? 'active' : 'inactive'
    }));
  }

  async getSystemHealth(): Promise<SystemHealth[]> {
    return await db
      .select()
      .from(system_health)
      .orderBy(desc(system_health.checked_at))
      .limit(10);
  }

  // School management operations
  async getUsersByTenant(tenantId: number): Promise<User[]> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return [];
    
    const campusesData = await db.select().from(campuses).where(eq(campuses.tenant_id, tenantId));
    const campusIds = campusesData.map(c => c.id);
    
    if (campusIds.length === 0) return [];
    
    const usersData = await db.select().from(users).where(
      campusIds.length === 1 
        ? eq(users.campus_id, campusIds[0])
        : inArray(users.campus_id, campusIds)
    );
    
    return usersData;
  }

  async updateTenantStatus(tenantId: number, status: string): Promise<void> {
    await db.update(tenants)
      .set({ updated_at: new Date() })
      .where(eq(tenants.id, tenantId));
  }

  async updateUserStatus(userId: number, status: string): Promise<void> {
    await db.update(users)
      .set({ is_active: status === 'active', updated_at: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserPassword(userId: number, password_hash: string): Promise<void> {
    await db.update(users)
      .set({ password_hash, updated_at: new Date() })
      .where(eq(users.id, userId));
  }

  async createSecurityEvent(event: InsertSecurityEvent): Promise<SecurityEvent> {
    const [newEvent] = await db.insert(security_events).values(event).returning();
    return newEvent;
  }

  // ========================================
  // APPROVAL WORKFLOW OPERATIONS
  // ========================================

  async createPendingApproval(approval: InsertPendingApproval): Promise<PendingApproval> {
    const [newApproval] = await db.insert(pending_approvals).values(approval).returning();
    return newApproval;
  }

  async getPendingApprovalsForApprover(userId: number): Promise<PendingApproval[]> {
    const user = await this.getUser(userId);
    if (!user) return [];
    
    // Solo admin y super_admin pueden aprobar cambios críticos
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return [];
    }
    
    const approvals = await db
      .select()
      .from(pending_approvals)
      .where(
        and(
          eq(pending_approvals.status, 'pending'),
          user.role === 'super_admin' 
            ? undefined 
            : eq(pending_approvals.campus_id, user.campus_id!)
        )
      )
      .orderBy(desc(pending_approvals.created_at));
    
    return approvals;
  }

  async getPendingApprovalsByRequester(userId: number): Promise<PendingApproval[]> {
    const approvals = await db
      .select()
      .from(pending_approvals)
      .where(eq(pending_approvals.requested_by, userId))
      .orderBy(desc(pending_approvals.created_at));
    
    return approvals;
  }

  async getPendingApprovalById(id: number): Promise<PendingApproval | undefined> {
    const [approval] = await db
      .select()
      .from(pending_approvals)
      .where(eq(pending_approvals.id, id));
    
    return approval || undefined;
  }

  async updateApprovalStatus(id: number, status: string, approvedBy?: number, notes?: string): Promise<void> {
    await db
      .update(pending_approvals)
      .set({ 
        status, 
        approved_by: approvedBy,
        approval_notes: notes,
        updated_at: new Date()
      })
      .where(eq(pending_approvals.id, id));
  }

  async createApprovalNotification(notification: InsertApprovalNotification): Promise<ApprovalNotification> {
    const [newNotification] = await db.insert(approval_notifications).values(notification).returning();
    return newNotification;
  }

  async getNotificationsByUser(userId: number): Promise<ApprovalNotification[]> {
    const notifications = await db
      .select()
      .from(approval_notifications)
      .where(eq(approval_notifications.recipient_id, userId))
      .orderBy(desc(approval_notifications.sent_at));
    
    return notifications;
  }

  async markNotificationAsRead(id: number): Promise<void> {
    await db
      .update(approval_notifications)
      .set({ is_read: true, read_at: new Date() })
      .where(eq(approval_notifications.id, id));
  }

  async createApprovalWorkflowLog(log: InsertApprovalWorkflowLog): Promise<ApprovalWorkflowLog> {
    const [newLog] = await db.insert(approval_workflow_logs).values(log).returning();
    return newLog;
  }

  async getWorkflowLogsByApproval(approvalId: number): Promise<ApprovalWorkflowLog[]> {
    const logs = await db
      .select()
      .from(approval_workflow_logs)
      .where(eq(approval_workflow_logs.approval_id, approvalId))
      .orderBy(desc(approval_workflow_logs.created_at));
    
    return logs;
  }

  async checkUserCanApprove(userId: number, actionType: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    
    // Solo admin y super_admin pueden aprobar cambios críticos
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return false;
    }
    
    // Super admin puede aprobar cualquier cosa
    if (user.role === 'super_admin') {
      return true;
    }
    
    // Admin puede aprobar dentro de su campus
    return user.role === 'admin';
  }

  async requiresApproval(actionType: string, userId: number): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return true;
    
    // Super admin no necesita aprobación
    if (user.role === 'super_admin') {
      return false;
    }
    
    // Admin no necesita aprobación
    if (user.role === 'admin') {
      return false;
    }
    
    // Tipos de acción que requieren aprobación
    const criticalActions = [
      'modify_scholarship',
      'modify_late_fee', 
      'modify_price',
      'modify_payment_due_date',
      'delete_concept',
      'modify_concept'
    ];
    
    return criticalActions.includes(actionType);
  }
}

export const storage = new DatabaseStorage();
