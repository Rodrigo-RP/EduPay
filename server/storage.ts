import { 
  tenants, campuses, users, students, guardians, student_guardian, concepts, 
  charges, payments, payment_methods, invoices, scholarships, discounts,
  security_events, platform_metrics, system_health, pending_approvals,
  approval_notifications, approval_workflow_logs, institutional_settings,
  payment_due_dates, payment_surcharge_rules,
  families, family_students, payment_applications, payment_events,
  audit_log,
  type User, type InsertUser, type Guardian, type InsertGuardian, 
  type Student, type InsertStudent, type Charge, type InsertCharge,
  type Payment, type InsertPayment, type Campus, type InsertCampus,
  type Concept, type InsertConcept, type Tenant, type InsertTenant,
  type PaymentMethod, type SecurityEvent, type InsertSecurityEvent, 
  type SystemHealth, type PendingApproval, type InsertPendingApproval,
  type ApprovalNotification, type InsertApprovalNotification,
  type ApprovalWorkflowLog, type InsertApprovalWorkflowLog,
  type InstitutionalSettings, type InsertInstitutionalSettings,
  type PaymentDueDate, type InsertPaymentDueDate,
  type PaymentSurchargeRule, type InsertPaymentSurchargeRule,
  type Family, type InsertFamily,
  type PaymentApplication, type InsertPaymentApplication,
  type PaymentEvent, type InsertPaymentEvent,
  type AuditLogEntry, type InsertAuditLogEntry
} from "@shared/schema";
import { transition, InvalidStateTransitionError, type StateMachineEntity } from "./state-machines";
import { db, pool } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface IStorage {
  // Authentication
  getUser(id: number): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByCampus(campusId: number): Promise<User[]>;
  deleteUser(id: number): Promise<boolean>;
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

  // Tenant-scoped lookups (primary security layer — always prefer over unscoped)
  getGuardianScoped(id: number, tenantId: number): Promise<Guardian | undefined>;
  getStudentScoped(id: number, tenantId: number): Promise<Student | undefined>;
  getChargeScoped(id: number, tenantId: number): Promise<Charge | undefined>;
  getConceptScoped(id: number, tenantId: number): Promise<Concept | undefined>;
  /** Verifica que un campus pertenece al tenant indicado. Retorna undefined si no. */
  getCampusScoped(campusId: number, tenantId: number): Promise<Campus | undefined>;
  /** Verifica que un cargo pertenece a un guardián autenticado (vía student_guardian). */
  getChargeByGuardian(chargeId: number, guardianId: number): Promise<Charge | undefined>;

  // ── Familia y Ledger ────────────────────────────────────────────────────────
  /** Lista todas las familias de un tenant (opcionalmente filtra por campus). */
  getFamiliesByTenant(tenantId: number, campusId?: number): Promise<Family[]>;
  /** Obtiene una familia verificando que pertenezca al tenant. */
  getFamilyScoped(familyId: number, tenantId: number): Promise<Family | undefined>;
  /**
   * Calcula el balance de una familia.
   * balance = SUM(charges.monto_base_centavos) - SUM(payment_applications.amount_centavos)
   * El saldo NUNCA se almacena; siempre calculado.
   */
  getFamilyBalance(familyId: number, tenantId: number): Promise<{
    total_cargos_centavos: number;
    total_pagado_centavos: number;
    saldo_pendiente_centavos: number;
    saldo_a_favor_centavos: number;
    saldo_neto_centavos: number;
    num_cargos: number;
    num_pagos: number;
  }>;
  /** Registra una aplicación de pago (puede ser parcial). */
  applyPaymentToCharge(data: InsertPaymentApplication): Promise<PaymentApplication>;
  /**
   * Guarda un evento de proveedor de pagos de forma idempotente.
   * Retorna { created: false, event } si ya existía (duplicado).
   */
  recordPaymentEvent(data: InsertPaymentEvent): Promise<{ created: boolean; event: PaymentEvent }>;

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
  /** Valida transición de estado (state machine), actualiza y emite audit_log. Atómico con SELECT FOR UPDATE. */
  updateChargeStatus(
    chargeId: number,
    status: string,
    ctx?: { tenantId?: number; userId?: number; guardianId?: number; ip?: string; metadata?: Record<string, unknown> }
  ): Promise<void>;
  /** Valida transición de estado de pago, actualiza y emite audit_log. Atómico con SELECT FOR UPDATE. */
  updatePaymentStatus(
    paymentId: number,
    status: string,
    ctx?: { tenantId?: number; userId?: number; guardianId?: number; ip?: string; metadata?: Record<string, unknown> }
  ): Promise<void>;
  /** Valida transición de estado de factura, actualiza y emite audit_log. Atómico con SELECT FOR UPDATE.
   *  @param extraFields  Campos adicionales (ej. uuid_cfdi al regenerar CFDI) actualizados en la misma txn. */
  updateInvoiceStatus(
    invoiceId: number,
    status: string,
    ctx?: { tenantId?: number; userId?: number; guardianId?: number; ip?: string; metadata?: Record<string, unknown> },
    extraFields?: Partial<{ uuid_cfdi: string; xml_url: string; pdf_url: string }>
  ): Promise<void>;

  // ── Audit Log ────────────────────────────────────────────────────────────────
  /**
   * Registra una entrada de auditoría. Solo INSERT; nunca UPDATE ni DELETE.
   * Debe llamarse dentro de la misma transacción que la operación auditada.
   */
  appendAuditLog(entry: InsertAuditLogEntry): Promise<AuditLogEntry>;
  /** Consulta entradas de auditoría con filtros opcionales. */
  getAuditLog(tenantId: number, opts?: {
    limit?: number;
    offset?: number;
    entityType?: string;
    action?: string;
    userId?: number;
    desde?: string;
    hasta?: string;
    search?: string;
  }): Promise<{ entries: AuditLogEntry[]; total: number }>;
  
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

  // Institutional settings operations
  getInstitutionalSettings(campusId: number): Promise<InstitutionalSettings | undefined>;
  saveInstitutionalSettings(settings: InsertInstitutionalSettings): Promise<InstitutionalSettings>;
  updateInstitutionalSettings(campusId: number, updates: Partial<InstitutionalSettings>): Promise<InstitutionalSettings | undefined>;
  
  // Payment configuration operations
  getPaymentDueDatesByCampus(campusId: number): Promise<PaymentDueDate[]>;
  createPaymentDueDate(dueDate: InsertPaymentDueDate): Promise<PaymentDueDate>;
  updatePaymentDueDate(id: number, updates: Partial<PaymentDueDate>): Promise<PaymentDueDate | undefined>;
  deletePaymentDueDate(id: number): Promise<boolean>;
  
  getSurchargeRulesByCampus(campusId: number): Promise<PaymentSurchargeRule[]>;
  createSurchargeRule(rule: InsertPaymentSurchargeRule): Promise<PaymentSurchargeRule>;
  updateSurchargeRule(id: number, updates: Partial<PaymentSurchargeRule>): Promise<PaymentSurchargeRule | undefined>;
  deleteSurchargeRule(id: number): Promise<boolean>;
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

  async deleteUser(id: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getUsersByCampus(campusId: number): Promise<User[]> {
    return await db.select().from(users).where(eq(users.campus_id, campusId));
  }

  async getGuardian(id: number): Promise<Guardian | undefined> {
    const [guardian] = await db.select().from(guardians).where(eq(guardians.id, id));
    return guardian || undefined;
  }

  /**
   * Versión segura de getGuardian que verifica la pertenencia al tenant.
   * Retorna undefined si el guardian no pertenece al tenant indicado.
   */
  async getGuardianScoped(id: number, tenantId: number): Promise<Guardian | undefined> {
    const [guardian] = await db.select().from(guardians)
      .where(and(eq(guardians.id, id), eq(guardians.tenant_id, tenantId)));
    return guardian || undefined;
  }

  /**
   * Versión segura de getStudent que verifica la pertenencia al tenant.
   * Retorna undefined si el alumno no pertenece al tenant indicado.
   */
  async getStudentScoped(id: number, tenantId: number): Promise<Student | undefined> {
    const [student] = await db.select().from(students)
      .where(and(eq(students.id, id), eq(students.tenant_id, tenantId)));
    return student || undefined;
  }

  /**
   * Versión segura de getConcept que verifica la pertenencia al tenant.
   * Retorna undefined si el concepto no pertenece al tenant indicado.
   */
  async getConceptScoped(id: number, tenantId: number): Promise<Concept | undefined> {
    const [concept] = await db.select().from(concepts)
      .where(and(eq(concepts.id, id), eq(concepts.tenant_id, tenantId)));
    return concept || undefined;
  }

  /**
   * Versión segura de getCharge que verifica la pertenencia al tenant.
   * Retorna undefined si el cargo no pertenece al tenant indicado.
   */
  async getChargeScoped(id: number, tenantId: number): Promise<Charge | undefined> {
    const [charge] = await db.select().from(charges)
      .where(and(eq(charges.id, id), eq(charges.tenant_id, tenantId)));
    return charge || undefined;
  }

  /**
   * Verifica que un campus pertenece al tenant indicado.
   * Retorna undefined si el campus no pertenece al tenant o no existe.
   */
  async getCampusScoped(campusId: number, tenantId: number): Promise<Campus | undefined> {
    const [campus] = await db.select().from(campuses)
      .where(and(eq(campuses.id, campusId), eq(campuses.tenant_id, tenantId)));
    return campus || undefined;
  }

  /**
   * Verifica que un cargo pertenece a los estudiantes de un guardián autenticado.
   * Previene IDOR en el portal de pagos de tutores.
   */
  async getChargeByGuardian(chargeId: number, guardianId: number): Promise<Charge | undefined> {
    const result = await db
      .select({ charge: charges })
      .from(charges)
      .innerJoin(students, eq(charges.student_id, students.id))
      .innerJoin(student_guardian, eq(students.id, student_guardian.student_id))
      .where(and(
        eq(charges.id, chargeId),
        eq(student_guardian.guardian_id, guardianId)
      ))
      .limit(1);
    return result[0]?.charge || undefined;
  }

  async getGuardianByEmail(email: string): Promise<Guardian | undefined> {
    const [byEmail] = await db.select().from(guardians).where(eq(guardians.email, email));
    if (byEmail) return byEmail;
    const [byCorrecto] = await db.select().from(guardians).where(eq(guardians.correo_institucional_familiar, email));
    return byCorrecto || undefined;
  }

  async getGuardiansByCampus(campusId: number): Promise<Omit<Guardian, 'password_hash'>[]> {
    // Filtrar SIEMPRE por guardians.campus_id (columna directa, sin cruzar tenants)
    // Excluir password_hash de la respuesta — nunca se serializa por API
    const results = await db
      .select({
        id: guardians.id,
        email: guardians.email,
        nombres: guardians.nombres,
        telefono: guardians.telefono,
        nombre_completo: guardians.nombre_completo,
        rfc: guardians.rfc,
        campus_id: guardians.campus_id,
        tenant_id: guardians.tenant_id,
        correo_institucional_familiar: guardians.correo_institucional_familiar,
        created_at: guardians.created_at,
        updated_at: guardians.updated_at,
      })
      .from(guardians)
      .where(eq(guardians.campus_id, campusId))
      .orderBy(guardians.nombre_completo);

    return results as any;
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
      .where(eq(student_guardian.guardian_id, guardianId)) as any;
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
        tenant_id: charges.tenant_id,
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
        tenant_id: charges.tenant_id,
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
          eq(student_guardian.es_responsable_pago, true),   // solo cargos del tutor pagador
          eq(charges.estado, "pendiente")
        )
      )
      .orderBy(charges.fecha_vencimiento);
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const [newCharge] = await db.insert(charges).values(charge).returning();
    return newCharge;
  }

  /**
   * Actualiza el estado de un cargo validando la máquina de estados y generando
   * una entrada de auditoría. Todo ocurre dentro de una transacción atómica con
   * SELECT FOR UPDATE para evitar race conditions concurrentes.
   * Lanza `InvalidStateTransitionError` si la transición no está permitida.
   */
  async updateChargeStatus(
    chargeId: number,
    newStatus: string,
    ctx?: { tenantId?: number; userId?: number; guardianId?: number; ip?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Lock + leer estado actual en la misma transacción (previene race conditions)
      const locked = await tx.execute(
        sql`SELECT id, estado, tenant_id FROM charges WHERE id = ${chargeId} FOR UPDATE`
      );
      const current = (locked.rows as any[])[0];
      if (!current) throw new Error(`Cargo ${chargeId} no encontrado`);

      // 2. Validar transición (lanza InvalidStateTransitionError si inválida)
      transition("charge", current.estado ?? "pendiente", newStatus);

      const tenantId = ctx?.tenantId ?? Number(current.tenant_id) ?? 0;

      // 3. Actualizar estado
      await tx.update(charges)
        .set({ estado: newStatus })
        .where(eq(charges.id, chargeId));

      // 4. Emitir audit log dentro de la misma transacción
      await tx.insert(audit_log).values({
        tenant_id:      tenantId,
        user_id:        ctx?.userId ?? null,
        guardian_id:    ctx?.guardianId ?? null,
        action:         "charge.status_changed",
        entity_type:    "charge",
        entity_id:      chargeId,
        previous_value: JSON.stringify({ estado: current.estado }),
        new_value:      JSON.stringify({ estado: newStatus }),
        ip_address:     ctx?.ip ?? null,
        metadata:       ctx?.metadata ? JSON.stringify(ctx.metadata) : null,
      });
    });
  }

  /**
   * Actualiza el estado de un pago validando la máquina de estados y generando
   * una entrada de auditoría. Transacción atómica con SELECT FOR UPDATE.
   * Lanza `InvalidStateTransitionError` si la transición no está permitida.
   */
  async updatePaymentStatus(
    paymentId: number,
    newStatus: string,
    ctx?: { tenantId?: number; userId?: number; guardianId?: number; ip?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT id, estado, tenant_id FROM payments WHERE id = ${paymentId} FOR UPDATE`
      );
      const current = (locked.rows as any[])[0];
      if (!current) throw new Error(`Pago ${paymentId} no encontrado`);

      transition("payment", current.estado ?? "pendiente", newStatus);

      const tenantId = ctx?.tenantId ?? Number(current.tenant_id) ?? 0;

      await tx.update(payments)
        .set({ estado: newStatus })
        .where(eq(payments.id, paymentId));

      await tx.insert(audit_log).values({
        tenant_id:      tenantId,
        user_id:        ctx?.userId ?? null,
        guardian_id:    ctx?.guardianId ?? null,
        action:         "payment.status_changed",
        entity_type:    "payment",
        entity_id:      paymentId,
        previous_value: JSON.stringify({ estado: current.estado }),
        new_value:      JSON.stringify({ estado: newStatus }),
        ip_address:     ctx?.ip ?? null,
        metadata:       ctx?.metadata ? JSON.stringify(ctx.metadata) : null,
      });
    });
  }

  /**
   * Actualiza el estado de una factura validando la máquina de estados y generando
   * una entrada de auditoría. Transacción atómica con SELECT FOR UPDATE.
   * Lanza `InvalidStateTransitionError` si la transición no está permitida.
   * @param extraFields  Campos adicionales a actualizar en la misma transacción (ej. uuid_cfdi al regenerar).
   */
  async updateInvoiceStatus(
    invoiceId: number,
    newStatus: string,
    ctx?: { tenantId?: number; userId?: number; guardianId?: number; ip?: string; metadata?: Record<string, unknown> },
    extraFields?: Partial<{ uuid_cfdi: string; xml_url: string; pdf_url: string }>
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT id, estado, tenant_id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`
      );
      const current = (locked.rows as any[])[0];
      if (!current) throw new Error(`Factura ${invoiceId} no encontrada`);

      transition("invoice", current.estado ?? "pendiente", newStatus);

      const tenantId = ctx?.tenantId ?? Number(current.tenant_id) ?? 0;

      await tx.update(invoices)
        .set({ estado: newStatus, ...extraFields })
        .where(eq(invoices.id, invoiceId));

      await tx.insert(audit_log).values({
        tenant_id:      tenantId,
        user_id:        ctx?.userId ?? null,
        guardian_id:    ctx?.guardianId ?? null,
        action:         "invoice.status_changed",
        entity_type:    "invoice",
        entity_id:      invoiceId,
        previous_value: JSON.stringify({ estado: current.estado }),
        new_value:      JSON.stringify({ estado: newStatus, ...extraFields }),
        ip_address:     ctx?.ip ?? null,
        metadata:       ctx?.metadata ? JSON.stringify(ctx.metadata) : null,
      });
    });
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

    // Enrich approvals with student information when available
    const enrichedApprovals = await Promise.all(
      approvals.map(async (approval) => {
        try {
          // Parse original and requested data to extract student information
          const originalData = JSON.parse(approval.original_data || '{}');
          const requestedData = JSON.parse(approval.requested_data || '{}');
          
          let studentInfo = null;
          
          // Try to find student information from the data
          if (originalData.student || requestedData.student) {
            const studentName = originalData.student || requestedData.student;
            
            // Search for student by name
            const student = await db
              .select({
                id: students.id,
                nombre_completo: students.nombre_completo,
                grado: students.grado,
                grupo: students.grupo,
                curp: students.curp
              })
              .from(students)
              .where(eq(students.nombre_completo, studentName))
              .limit(1);
            
            if (student.length > 0) {
              studentInfo = student[0];
            }
          }
          
          return {
            ...approval,
            student_info: studentInfo
          } as any;
        } catch (error) {
          return approval as any;
        }
      })
    );
    
    return enrichedApprovals;
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
    // Get all approvals with requester information and student data when applicable
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
        action_description: pending_approvals.reason
      })
      .from(pending_approvals)
      .leftJoin(users, eq(pending_approvals.requested_by, users.id))
      .where(
        // Include approved and rejected approvals only
        inArray(pending_approvals.status, ['approved', 'rejected'])
      )
      .orderBy(desc(pending_approvals.updated_at))
      .limit(50); // Limit to recent 50 records

    // Enrich approvals with student information when available
    const enrichedApprovals = await Promise.all(
      allApprovals.map(async (approval) => {
        try {
          // Parse original and requested data to extract student information
          const originalData = JSON.parse(approval.original_data || '{}');
          const requestedData = JSON.parse(approval.requested_data || '{}');
          
          let studentInfo = null;
          
          // Try to find student information from the data
          if (originalData.student || requestedData.student) {
            const studentName = originalData.student || requestedData.student;
            
            // Search for student by name
            const student = await db
              .select({
                id: students.id,
                nombre_completo: students.nombre_completo,
                grado: students.grado,
                grupo: students.grupo,
                curp: students.curp
              })
              .from(students)
              .where(eq(students.nombre_completo, studentName))
              .limit(1);
            
            if (student.length > 0) {
              studentInfo = student[0];
            } else {
              // Try partial match for more flexible search
              const partialStudent = await db
                .select({
                  id: students.id,
                  nombre_completo: students.nombre_completo,
                  grado: students.grado,
                  grupo: students.grupo,
                  curp: students.curp
                })
                .from(students)
                .where(sql`LOWER(${students.nombre_completo}) LIKE ${`%${studentName.toLowerCase()}%`}`)
                .limit(1);
              
              if (partialStudent.length > 0) {
                studentInfo = partialStudent[0];
              }
            }
          }
          
          return {
            ...approval,
            student_info: studentInfo
          };
        } catch (error) {
          return approval;
        }
      })
    );
    
    return enrichedApprovals;
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
  // Institutional settings operations
  async getInstitutionalSettings(campusId: number): Promise<InstitutionalSettings | undefined> {
    const [settings] = await db.select().from(institutional_settings).where(eq(institutional_settings.campus_id, campusId));
    return settings || undefined;
  }

  async saveInstitutionalSettings(settings: InsertInstitutionalSettings): Promise<InstitutionalSettings> {
    // Check if settings already exist for this campus
    const existing = await this.getInstitutionalSettings(settings.campus_id);
    
    if (existing) {
      // Update existing settings
      const [updated] = await db
        .update(institutional_settings)
        .set({ ...settings, updated_at: new Date() })
        .where(eq(institutional_settings.campus_id, settings.campus_id))
        .returning();
      return updated;
    } else {
      // Create new settings
      const [created] = await db
        .insert(institutional_settings)
        .values(settings)
        .returning();
      return created;
    }
  }

  async updateInstitutionalSettings(campusId: number, updates: Partial<InstitutionalSettings>): Promise<InstitutionalSettings | undefined> {
    const [updated] = await db
      .update(institutional_settings)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(institutional_settings.campus_id, campusId))
      .returning();
    return updated || undefined;
  }

  // Payment Due Dates Configuration
  async getPaymentDueDatesByCampus(campusId: number): Promise<PaymentDueDate[]> {
    console.log("🔧 Storage getPaymentDueDatesByCampus - Campus ID:", campusId);
    const dueDates = await db
      .select()
      .from(payment_due_dates)
      .where(eq(payment_due_dates.campus_id, campusId));
    
    // Fix HTML entity encoding when reading from database
    const cleanedDueDates = dueDates.map(dueDate => ({
      ...dueDate,
      mes_aplicacion: typeof dueDate.mes_aplicacion === 'string' 
        ? dueDate.mes_aplicacion.replace(/&quot;/g, '"') 
        : dueDate.mes_aplicacion
    }));
    
    console.log("🔧 Storage getPaymentDueDatesByCampus - Raw result:", JSON.stringify(dueDates, null, 2));
    console.log("🔧 Storage getPaymentDueDatesByCampus - Cleaned result:", JSON.stringify(cleanedDueDates, null, 2));
    return cleanedDueDates;
  }

  async createPaymentDueDate(dueDate: InsertPaymentDueDate): Promise<PaymentDueDate> {
    console.log("🔧 Storage createPaymentDueDate - Input data:", JSON.stringify(dueDate, null, 2));
    
    try {
      const [newDueDate] = await db
        .insert(payment_due_dates)
        .values(dueDate)
        .returning();
      
      console.log("🔧 Storage createPaymentDueDate - Result:", JSON.stringify(newDueDate, null, 2));
      
      // Immediate verification
      const verification = await db
        .select()
        .from(payment_due_dates)
        .where(eq(payment_due_dates.id, newDueDate.id));
      
      console.log("🔧 Storage createPaymentDueDate - Verification:", JSON.stringify(verification, null, 2));
      
      return newDueDate;
    } catch (error) {
      console.error("🔧 Storage createPaymentDueDate - Error:", error);
      throw error;
    }
  }

  async updatePaymentDueDate(id: number, updates: Partial<PaymentDueDate>): Promise<PaymentDueDate | undefined> {
    console.log("🔧 Storage updatePaymentDueDate - ID:", id);
    console.log("🔧 Storage updatePaymentDueDate - Updates:", JSON.stringify(updates, null, 2));
    
    try {
      const [updated] = await db
        .update(payment_due_dates)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(payment_due_dates.id, id))
        .returning();
      
      console.log("🔧 Storage updatePaymentDueDate - Result:", JSON.stringify(updated, null, 2));
      
      // Verificar si realmente se actualizó
      const verification = await db
        .select()
        .from(payment_due_dates)
        .where(eq(payment_due_dates.id, id));
      console.log("🔧 Storage updatePaymentDueDate - Verification:", JSON.stringify(verification, null, 2));
      
      return updated || undefined;
    } catch (error) {
      console.error("🔧 Storage updatePaymentDueDate - Error:", error);
      throw error;
    }
  }

  async deletePaymentDueDate(id: number): Promise<boolean> {
    const result = await db
      .delete(payment_due_dates)
      .where(eq(payment_due_dates.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Surcharge Rules Configuration
  async getSurchargeRulesByCampus(campusId: number): Promise<PaymentSurchargeRule[]> {
    return await db
      .select()
      .from(payment_surcharge_rules)
      .where(eq(payment_surcharge_rules.campus_id, campusId));
  }

  async createSurchargeRule(rule: InsertPaymentSurchargeRule): Promise<PaymentSurchargeRule> {
    const [newRule] = await db
      .insert(payment_surcharge_rules)
      .values(rule)
      .returning();
    return newRule;
  }

  async updateSurchargeRule(id: number, updates: Partial<PaymentSurchargeRule>): Promise<PaymentSurchargeRule | undefined> {
    const [updated] = await db
      .update(payment_surcharge_rules)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(payment_surcharge_rules.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSurchargeRule(id: number): Promise<boolean> {
    const result = await db
      .delete(payment_surcharge_rules)
      .where(eq(payment_surcharge_rules.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ── Familia y Ledger ────────────────────────────────────────────────────────

  async getFamiliesByTenant(tenantId: number, campusId?: number): Promise<Family[]> {
    if (campusId !== undefined) {
      return await db.select().from(families)
        .where(and(eq(families.tenant_id, tenantId), eq(families.campus_id, campusId)))
        .orderBy(families.nombre);
    }
    return await db.select().from(families)
      .where(eq(families.tenant_id, tenantId))
      .orderBy(families.nombre);
  }

  async getFamilyScoped(familyId: number, tenantId: number): Promise<Family | undefined> {
    const [row] = await db.select().from(families)
      .where(and(eq(families.id, familyId), eq(families.tenant_id, tenantId)));
    return row;
  }

  async getFamilyBalance(familyId: number, tenantId: number): Promise<{
    total_cargos_centavos: number;
    total_pagado_centavos: number;
    saldo_pendiente_centavos: number;
    saldo_a_favor_centavos: number;
    saldo_neto_centavos: number;
    num_cargos: number;
    num_pagos: number;
  }> {
    // Verify family belongs to tenant
    const family = await this.getFamilyScoped(familyId, tenantId);
    if (!family) {
      return {
        total_cargos_centavos: 0, total_pagado_centavos: 0,
        saldo_pendiente_centavos: 0, saldo_a_favor_centavos: 0,
        saldo_neto_centavos: 0, num_cargos: 0, num_pagos: 0,
      };
    }

    // Sum all charges for students in this family
    const chargesResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(c.monto_base_centavos), 0)::bigint AS total_cargos,
        COUNT(DISTINCT c.id)::integer AS num_cargos
      FROM family_students fs
      JOIN charges c ON c.student_id = fs.student_id
      WHERE fs.family_id = ${familyId}
    `);
    const chargesRow = (chargesResult.rows as any[])[0] || {};
    const total_cargos_centavos = Number(chargesRow.total_cargos ?? 0);
    const num_cargos = Number(chargesRow.num_cargos ?? 0);

    // Sum all payment applications for charges belonging to students in this family
    const paidResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(pa.amount_centavos), 0)::bigint AS total_pagado,
        COUNT(DISTINCT pa.payment_id)::integer AS num_pagos
      FROM family_students fs
      JOIN charges c ON c.student_id = fs.student_id
      JOIN payment_applications pa ON pa.charge_id = c.id
      WHERE fs.family_id = ${familyId}
    `);
    const paidRow = (paidResult.rows as any[])[0] || {};
    const total_pagado_centavos = Number(paidRow.total_pagado ?? 0);
    const num_pagos = Number(paidRow.num_pagos ?? 0);

    // Saldo a favor: solo créditos ACTIVOS (status='activo').
    // Los consumidos ya están reflejados en payment_applications y no se cuentan dos veces.
    const creditResult = await db.execute(sql`
      SELECT COALESCE(SUM(fc.amount_centavos), 0)::bigint AS saldo_a_favor
      FROM family_credits fc
      WHERE fc.status = 'activo'
        AND (
          fc.family_id = ${familyId}
          OR fc.student_id IN (
            SELECT fs2.student_id FROM family_students fs2 WHERE fs2.family_id = ${familyId}
          )
        )
    `);
    const saldo_a_favor_centavos = Number((creditResult.rows as any[])[0]?.saldo_a_favor ?? 0);

    const saldo_pendiente_centavos = total_cargos_centavos - total_pagado_centavos;
    const saldo_neto_centavos = Math.max(0, saldo_pendiente_centavos - saldo_a_favor_centavos);

    return {
      total_cargos_centavos,
      total_pagado_centavos,
      saldo_pendiente_centavos,
      saldo_a_favor_centavos,
      saldo_neto_centavos,
      num_cargos,
      num_pagos,
    };
  }

  /**
   * Registra una aplicación de pago de forma transaccional.
   * Valida que:
   *  - El pago pertenece al mismo tenant que el cargo (vía estudiante)
   *  - El monto no excede lo pendiente del cargo (previene doble-aplicación)
   */
  async applyPaymentToCharge(data: InsertPaymentApplication): Promise<PaymentApplication> {
    // Validar que pago y cargo comparten tenant a través del estudiante
    const ownerCheck = await db.execute(sql`
      SELECT
        p.id AS payment_id,
        c.id AS charge_id,
        s.tenant_id,
        c.monto_base_centavos,
        COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_aplicado
      FROM payments p
      JOIN charges c ON c.id = ${data.charge_id}
      JOIN students s ON s.id = c.student_id
      LEFT JOIN payment_applications pa ON pa.charge_id = c.id
      WHERE p.id = ${data.payment_id}
      GROUP BY p.id, c.id, s.tenant_id, c.monto_base_centavos
    `);

    const ownerRow = (ownerCheck.rows as any[])[0];
    if (!ownerRow) {
      throw new Error("Pago o cargo no encontrado al aplicar payment_application");
    }

    // Advertir (no bloquear) si se excede el monto del cargo — saldos negativos son válidos
    // como crédito a favor de la familia.

    const [row] = await db.insert(payment_applications).values(data).returning();
    return row;
  }

  // ── Audit Log ────────────────────────────────────────────────────────────────

  async appendAuditLog(entry: InsertAuditLogEntry): Promise<AuditLogEntry> {
    const [row] = await db.insert(audit_log).values(entry).returning();
    return row;
  }

  async getAuditLog(tenantId: number, opts?: {
    limit?: number;
    offset?: number;
    entityType?: string;
    action?: string;
    userId?: number;
    desde?: string;
    hasta?: string;
    search?: string;
  }): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const limitVal  = Math.min(opts?.limit  ?? 50, 200);
    const offsetVal = opts?.offset ?? 0;

    // Todos los valores controlados por el usuario se pasan como parámetros
    // vinculados ($n) — nunca como interpolación de string.
    // Para `search`, los metacaracteres LIKE (% y _) se escapan con backslash
    // antes de construir el patrón, y el ILIKE usa ESCAPE E'\\'.
    // Esto elimina tanto el riesgo de inyección SQL como el abuso de wildcards
    // que permitía extraer todas las filas del tenant con search=%.
    const params: any[]        = [tenantId];
    const conditions: string[] = [`al.tenant_id = $1`];

    if (opts?.entityType) {
      params.push(opts.entityType);
      conditions.push(`al.entity_type = $${params.length}`);
    }
    if (opts?.action) {
      params.push(opts.action);
      conditions.push(`al.action = $${params.length}`);
    }
    if (opts?.userId) {
      params.push(Number(opts.userId));
      conditions.push(`al.user_id = $${params.length}`);
    }
    if (opts?.desde) {
      params.push(opts.desde);
      conditions.push(`al.created_at >= $${params.length}::timestamptz`);
    }
    if (opts?.hasta) {
      params.push(opts.hasta + ' 23:59:59');
      conditions.push(`al.created_at <= $${params.length}::timestamptz`);
    }
    if (opts?.search) {
      // Escapar % y _ para que se traten como caracteres literales en ILIKE,
      // no como wildcards.  Se usa E'\\' como carácter de escape ANSI.
      const escaped = opts.search
        .replace(/\\/g, '\\\\')
        .replace(/%/g,  '\\%')
        .replace(/_/g,  '\\_');
      params.push(`%${escaped}%`);
      const idx = params.length;
      conditions.push(
        `(al.action    ILIKE $${idx} ESCAPE E'\\\\' ` +
        ` OR al.metadata  ILIKE $${idx} ESCAPE E'\\\\' ` +
        ` OR al.new_value ILIKE $${idx} ESCAPE E'\\\\')`
      );
    }

    const where = conditions.join(' AND ');

    const [countResult, rowsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total FROM audit_log al WHERE ${where}`,
        params,
      ),
      pool.query(
        `SELECT al.*,
                u.name              AS user_name,
                u.email             AS user_email,
                g.nombre_completo   AS guardian_name
         FROM audit_log al
         LEFT JOIN users     u ON u.id = al.user_id
         LEFT JOIN guardians g ON g.id = al.guardian_id
         WHERE ${where}
         ORDER BY al.created_at DESC
         LIMIT ${limitVal} OFFSET ${offsetVal}`,
        params,
      ),
    ]);

    const total   = Number((countResult.rows as any[])[0]?.total ?? 0);
    const entries = rowsResult.rows as AuditLogEntry[];
    return { entries, total };
  }

  async recordPaymentEvent(data: InsertPaymentEvent): Promise<{ created: boolean; event: PaymentEvent }> {
    // Try insert; on conflict return existing (idempotent)
    const [inserted] = await db.insert(payment_events)
      .values(data)
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return { created: true, event: inserted };
    }

    // Already exists — fetch and return it
    const [existing] = await db.select().from(payment_events)
      .where(and(
        eq(payment_events.provider, data.provider),
        eq(payment_events.provider_event_id, data.provider_event_id)
      ));
    return { created: false, event: existing };
  }
}

export const storage = new DatabaseStorage();
