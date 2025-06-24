import { 
  tenants, campuses, users, students, guardians, student_guardian, concepts, 
  charges, payments, payment_methods, invoices, scholarships, discounts,
  type User, type InsertUser, type Guardian, type InsertGuardian, 
  type Student, type InsertStudent, type Charge, type InsertCharge,
  type Payment, type InsertPayment, type Campus, type InsertCampus,
  type Concept, type InsertConcept, type Tenant, type InsertTenant,
  type PaymentMethod
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface IStorage {
  // Authentication
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
  getPendingChargesByGuardian(guardianId: number): Promise<(Charge & { student: Student; concept: Concept })[]>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  updateChargeStatus(chargeId: number, status: string): Promise<void>;
  
  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByGuardian(guardianId: number): Promise<(Payment & { charge: Charge & { concept: Concept; student: Student } })[]>;
  
  // Payment methods
  getPaymentMethodsByGuardian(guardianId: number): Promise<PaymentMethod[]>;
  
  // Dashboard KPIs
  getDashboardKPIs(campusId: number): Promise<{
    totalBilled: number;
    paymentRate: number;
    overdueRate: number;
    activeStudents: number;
  }>;
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
    return await db
      .select({
        id: payments.id,
        charge_id: payments.charge_id,
        guardian_id: payments.guardian_id,
        metodo: payments.metodo,
        referencia_pasarela: payments.referencia_pasarela,
        monto_centavos: payments.monto_centavos,
        fecha_pago: payments.fecha_pago,
        estado: payments.estado,
        created_at: payments.created_at,
        updated_at: payments.updated_at,
        charge: {
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
          student: students,
        },
      })
      .from(payments)
      .innerJoin(charges, eq(payments.charge_id, charges.id))
      .innerJoin(concepts, eq(charges.concept_id, concepts.id))
      .innerJoin(students, eq(charges.student_id, students.id))
      .where(eq(payments.guardian_id, guardianId))
      .orderBy(desc(payments.fecha_pago));
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
}

export const storage = new DatabaseStorage();
