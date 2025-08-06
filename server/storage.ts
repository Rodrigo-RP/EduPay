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
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  
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
  updateUserProfile(userId: number, updates: { name?: string; email?: string; telefono?: string; foto_url?: string }): Promise<void>;
  updateGuardianProfile(guardianId: number, updates: { nombre_completo?: string; email?: string; telefono?: string; foto_url?: string; password_hash?: string }): Promise<void>;
  
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
  getAllApprovalsHistory(): Promise<any[]>;
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

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getGuardian(id: number): Promise<Guardian | undefined> {
    const [guardian] = await db.select().from(guardians).where(eq(guardians.id, id));
    return guardian || undefined;
  }

  async getGuardianByEmail(email: string): Promise<Guardian | undefined> {
    const [guardian] = await db.select().from(guardians).where(eq(guardians.email, email));
    return guardian || undefined;
  }

  async getGuardiansByCampus(campusId: number): Promise<Guardian[]> {
    const results = await db
      .select({
        id: guardians.id,
        email: guardians.email,
        password_hash: guardians.password_hash,
        telefono: guardians.telefono,
        nombre_completo: guardians.nombre_completo,
        rfc: guardians.rfc,
        created_at: guardians.created_at,
        updated_at: guardians.updated_at,
      })
      .from(guardians)
      .innerJoin(student_guardian, eq(guardians.id, student_guardian.guardian_id))
      .innerJoin(students, eq(student_guardian.student_id, students.id))
      .where(eq(students.campus_id, campusId))
      .groupBy(guardians.id)
      .orderBy(guardians.nombre_completo);
    
    return results;
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

  async getAccountsReceivableByCampus(campusId: number): Promise<any[]> {
    try {
      const results = await db
        .select({
          charge_id: charges.id,
          student_id: students.id,
          student_name: students.nombre_completo,
          student_grade: students.grado,
          student_level: sql<string>`CASE 
            WHEN ${students.grado} LIKE '%Kinder%' OR ${students.grado} LIKE '%Pre%' THEN 'KINDER'
            WHEN ${students.grado} LIKE '%1ro%' OR ${students.grado} LIKE '%2do%' OR ${students.grado} LIKE '%3ro%' OR ${students.grado} LIKE '%4to%' OR ${students.grado} LIKE '%5to%' OR ${students.grado} LIKE '%6to%' THEN 'PRIMARIA'
            WHEN ${students.grado} LIKE '%Secundaria%' THEN 'SECUNDARIA'
            WHEN ${students.grado} LIKE '%Bachillerato%' OR ${students.grado} LIKE '%Prepa%' THEN 'BACHILLERATO'
            ELSE 'NO_DEFINIDO'
          END`,
          concept_name: concepts.nombre,
          charge_amount: charges.monto_base_centavos,
          discount_amount: sql<number>`COALESCE(${charges.monto_base_centavos} * COALESCE(${charges.beca_aplicada}, 0) / 100, 0)`,
          late_fee_amount: sql<number>`COALESCE(${charges.recargo_aplicado_centavos}, 0)`,
          amount_paid: sql<number>`COALESCE((SELECT SUM(${payments.monto_centavos}) FROM ${payments} WHERE ${payments.charge_id} = ${charges.id}), 0)`,
          charge_date: charges.fecha_emision,
          due_date: charges.fecha_vencimiento,
          status: charges.estado
        })
        .from(charges)
        .innerJoin(students, eq(charges.student_id, students.id))
        .innerJoin(concepts, eq(charges.concept_id, concepts.id))
        .where(eq(students.campus_id, campusId))
        .orderBy(desc(charges.fecha_vencimiento));

      return results.map(row => {
        const baseAmount = row.charge_amount || 0;
        const discount = row.discount_amount || 0;
        const lateFee = row.late_fee_amount || 0;
        const amountPaid = row.amount_paid || 0;
        const totalAmount = baseAmount - discount + lateFee;
        const pendingAmount = totalAmount - amountPaid;
        
        // Calcular días vencidos
        const dueDate = new Date(row.due_date);
        const today = new Date();
        const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Determinar estado de cobranza
        let collectionStatus = "AL_DIA";
        if (row.status === "pagado") {
          collectionStatus = "PAGADO";
        } else if (pendingAmount > 0) {
          if (daysOverdue > 30) {
            collectionStatus = "MOROSO";
          } else if (daysOverdue > 0) {
            collectionStatus = "VENCIDO";
          } else if (amountPaid > 0) {
            collectionStatus = "PARCIAL";
          } else {
            collectionStatus = "PENDIENTE";
          }
        }

        return {
          id: row.charge_id,
          estudiante: row.student_name,
          responsable: `Responsable de ${row.student_name}`,
          telefono: "555-0000",
          email: "responsable@instituto-jfr.edu.mx",
          nivel_escolar: row.student_level || "NO_DEFINIDO",
          grado: row.student_grade,
          concepto: row.concept_name,
          fecha_cargo: row.charge_date,
          monto_inicial_centavos: baseAmount,
          descuentos_centavos: discount,
          recargos_centavos: lateFee,
          total_pagado_centavos: amountPaid,
          pendiente_pagar_centavos: pendingAmount,
          dias_vencido: daysOverdue,
          estado_cobranza: collectionStatus,
          fecha_vencimiento: row.due_date,
          fecha_compromiso: null,
          cuenta_habilitada: pendingAmount <= 0,
          fecha_ultimo_seguimiento: row.charge_date,
          observaciones_cobranza: `Cargo generado el ${row.charge_date}`
        };
      });
    } catch (error) {
      console.error('Error en getAccountsReceivableByCampus:', error);
      throw error;
    }
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

  async updateUserProfile(userId: number, updates: { name?: string; email?: string; telefono?: string; foto_url?: string }): Promise<void> {
    await db.update(users)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(users.id, userId));
  }

  async updateGuardianProfile(guardianId: number, updates: { nombre_completo?: string; email?: string; telefono?: string; foto_url?: string; password_hash?: string }): Promise<void> {
    await db.update(guardians)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(guardians.id, guardianId));
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
    
    // Solo administrador_general puede aprobar cambios críticos financieros
    if (user.role !== 'administrador_general' && user.role !== 'super_admin') {
      return [];
    }
    
    const approvals = await db
      .select({
        id: pending_approvals.id,
        campus_id: pending_approvals.campus_id,
        tenant_id: pending_approvals.tenant_id,
        requested_by: pending_approvals.requested_by,
        action_type: pending_approvals.action_type,

        entity_type: pending_approvals.entity_type,
        entity_id: pending_approvals.entity_id,
        original_data: pending_approvals.original_data,
        requested_data: pending_approvals.requested_data,
        reason: pending_approvals.reason,
        status: pending_approvals.status,
        priority: pending_approvals.priority,
        created_at: pending_approvals.created_at,
        updated_at: pending_approvals.updated_at,
        approved_by: pending_approvals.approved_by,
        approval_notes: pending_approvals.approval_notes,
        expires_at: pending_approvals.expires_at,
        requester_name: users.name,
        requester_email: users.email,
        requester_role: users.role
      })
      .from(pending_approvals)
      .leftJoin(users, eq(pending_approvals.requested_by, users.id))
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

  async getAllApprovalsHistory(): Promise<any[]> {
    // Get all approvals with requester information
    const allApprovals = await db
      .select({
        id: pending_approvals.id,
        campus_id: pending_approvals.campus_id,
        tenant_id: pending_approvals.tenant_id,
        requested_by: pending_approvals.requested_by,
        action_type: pending_approvals.action_type,
        entity_type: pending_approvals.entity_type,
        entity_id: pending_approvals.entity_id,
        original_data: pending_approvals.original_data,
        requested_data: pending_approvals.requested_data,
        reason: pending_approvals.reason,
        status: pending_approvals.status,
        priority: pending_approvals.priority,
        created_at: pending_approvals.created_at,
        updated_at: pending_approvals.updated_at,
        approved_by: pending_approvals.approved_by,
        approval_notes: pending_approvals.approval_notes,
        expires_at: pending_approvals.expires_at,
        requester_name: users.name,
        requester_email: users.email,
        requester_role: users.role,
        action_description: pending_approvals.reason // Using reason as description for now
      })
      .from(pending_approvals)
      .leftJoin(users, eq(pending_approvals.requested_by, users.id))
      .orderBy(desc(pending_approvals.created_at))
      .limit(50); // Limit to recent 50 records
    
    return allApprovals;
  }

  async checkUserCanApprove(userId: number, actionType: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    
    // Solo administrador_general y super_admin pueden aprobar cambios críticos financieros
    if (user.role !== 'administrador_general' && user.role !== 'super_admin') {
      return false;
    }
    
    // Super admin puede aprobar cualquier cosa
    if (user.role === 'super_admin') {
      return true;
    }
    
    // Administrador general puede aprobar cambios financieros críticos
    return user.role === 'administrador_general';
  }

  async requiresApproval(actionType: string, userId: number): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return true;
    
    // Super admin no necesita aprobación
    if (user.role === 'super_admin') {
      return false;
    }
    
    // Administrador general no necesita aprobación (es quien aprueba)
    if (user.role === 'administrador_general') {
      return false;
    }
    
    // Tipos de acción que requieren aprobación del administrador general
    const criticalFinancialActions = [
      'modify_scholarship',        // Cambiar porcentajes de becas
      'modify_late_fee',          // Modificar recargos por mora
      'modify_price',             // Cambiar precios de conceptos
      'modify_payment_due_date',  // Cambiar fechas de vencimiento
      'delete_concept',           // Eliminar conceptos de pago
      'modify_concept',           // Modificar conceptos de pago
      'delete_charge',            // Eliminar cargos
      'modify_charge_amount',     // Modificar montos de cargos
      'cancel_payment',           // Cancelar pagos
      'refund_payment'            // Reembolsar pagos
    ];
    
    return criticalFinancialActions.includes(actionType);
  }
}

export const storage = new DatabaseStorage();
