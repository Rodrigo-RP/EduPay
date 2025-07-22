import { pgTable, text, serial, integer, boolean, varchar, bigint, numeric, date, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// TENANTS (Multi-school SaaS)
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  nombre_legal: varchar("nombre_legal", { length: 255 }).notNull(),
  rfc: varchar("rfc", { length: 13 }).notNull(),
  cfdi_pac_id: varchar("cfdi_pac_id", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// CAMPUSES (School divisions)
export const campuses = pgTable("campuses", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  clave_sep: varchar("clave_sep", { length: 50 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// USERS (Super Admin, Admin, Caja, Contador)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(), // 'super_admin', 'admin', 'caja', 'contador', 'admisiones', 'asistente', 'support', 'implementation'
  telefono: varchar("telefono", { length: 20 }),
  foto_url: varchar("foto_url", { length: 500 }),
  twofa_secret: varchar("twofa_secret", { length: 255 }),
  is_active: boolean("is_active").default(true),
  is_super_admin: boolean("is_super_admin").default(false),
  platform_permissions: text("platform_permissions").array(),
  last_login_at: timestamp("last_login_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// PLATFORM PROFILES (Support and Implementation users)
export const platform_profiles = pgTable("platform_profiles", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  profile_type: varchar("profile_type", { length: 50 }).notNull(), // 'support', 'implementation'
  specialization: varchar("specialization", { length: 100 }), // 'technical_support', 'customer_success', 'onboarding_specialist', 'integration_expert'
  access_level: varchar("access_level", { length: 50 }).notNull(), // 'read_only', 'read_write', 'full_access'
  assigned_schools: text("assigned_schools").array(), // Array of tenant IDs
  permissions: text("permissions").array(), // Specific permissions array
  support_tier: varchar("support_tier", { length: 20 }), // 'tier1', 'tier2', 'tier3' for support users
  implementation_phase: varchar("implementation_phase", { length: 50 }), // 'pre_onboarding', 'setup', 'training', 'go_live', 'post_launch'
  metrics: text("metrics"), // JSON string with performance metrics
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// STUDENTS
export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  curp: varchar("curp", { length: 18 }),
  nombre_completo: varchar("nombre_completo", { length: 255 }).notNull(),
  grado: varchar("grado", { length: 50 }),
  grupo: varchar("grupo", { length: 50 }),
  status: varchar("status", { length: 50 }).default("activo"), // 'activo', 'baja', 'suspendido', 'egresado'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// GUARDIANS (Parents, Companies)
export const guardians = pgTable("guardians", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  password_hash: varchar("password_hash", { length: 255 }),
  telefono: varchar("telefono", { length: 20 }),
  nombre_completo: varchar("nombre_completo", { length: 255 }).notNull(),
  rfc: varchar("rfc", { length: 13 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// STUDENT-GUARDIAN RELATIONSHIP
export const student_guardian = pgTable("student_guardian", {
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  guardian_id: integer("guardian_id").references(() => guardians.id, { onDelete: "cascade" }),
  porcentaje_responsabilidad: numeric("porcentaje_responsabilidad", { precision: 5, scale: 2 }).default("100.00"),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.student_id, table.guardian_id] }),
  };
});

// PAYMENT CONCEPTS
export const concepts = pgTable("concepts", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(), // 'colegiatura', 'inscripcion', 'extra'
  periodicidad: varchar("periodicidad", { length: 50 }).notNull(), // 'mensual', 'anual', 'eventual'
  monto_centavos: bigint("monto_centavos", { mode: "number" }).notNull(),
  iva: boolean("iva").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ADVANCED SCHOLARSHIPS & DISCOUNTS SYSTEM
export const scholarship_types = pgTable("scholarship_types", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  nombre: varchar("nombre", { length: 100 }).notNull(), // 'Beca Excelencia Académica', 'Descuento Hermanos'
  categoria: varchar("categoria", { length: 50 }).notNull(), // 'academica', 'socioeconomica', 'deportiva', 'descuento'
  descripcion: text("descripcion"),
  algoritmo: varchar("algoritmo", { length: 50 }).notNull(), // 'manual', 'automatico', 'promedio', 'hermanos', 'ingresos'
  activo: boolean("activo").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const scholarship_criteria = pgTable("scholarship_criteria", {
  id: serial("id").primaryKey(),
  scholarship_type_id: integer("scholarship_type_id").references(() => scholarship_types.id, { onDelete: "cascade" }),
  criterio: varchar("criterio", { length: 100 }).notNull(), // 'promedio_minimo', 'ingreso_familiar_maximo', 'hermanos_min'
  valor_minimo: numeric("valor_minimo", { precision: 10, scale: 2 }),
  valor_maximo: numeric("valor_maximo", { precision: 10, scale: 2 }),
  obligatorio: boolean("obligatorio").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

export const scholarship_benefits = pgTable("scholarship_benefits", {
  id: serial("id").primaryKey(),
  scholarship_type_id: integer("scholarship_type_id").references(() => scholarship_types.id, { onDelete: "cascade" }),
  tipo_beneficio: varchar("tipo_beneficio", { length: 50 }).notNull(), // 'porcentaje', 'monto_fijo', 'escala'
  porcentaje_descuento: integer("porcentaje_descuento"), // 0-100
  monto_fijo_centavos: bigint("monto_fijo_centavos", { mode: "number" }),
  aplica_conceptos: text("aplica_conceptos").array().default(["colegiatura"]), // conceptos donde aplica
  limite_maximo_centavos: bigint("limite_maximo_centavos", { mode: "number" }),
  vigencia_meses: integer("vigencia_meses").default(12),
  created_at: timestamp("created_at").defaultNow(),
});

export const scholarships = pgTable("scholarships", {
  id: serial("id").primaryKey(),
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  scholarship_type_id: integer("scholarship_type_id").references(() => scholarship_types.id),
  metodo_asignacion: varchar("metodo_asignacion", { length: 50 }).default("manual"), // 'manual', 'automatico'
  porcentaje_aplicado: integer("porcentaje_aplicado"),
  monto_fijo_aplicado_centavos: bigint("monto_fijo_aplicado_centavos", { mode: "number" }),
  score_evaluacion: numeric("score_evaluacion", { precision: 5, scale: 2 }), // scoring algorithm result
  vigencia_inicio: date("vigencia_inicio").notNull(),
  vigencia_fin: date("vigencia_fin"),
  estado: varchar("estado", { length: 50 }).default("activa"), // 'activa', 'suspendida', 'vencida'
  observaciones: text("observaciones"),
  created_by: integer("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// CHARGES
export const charges = pgTable("charges", {
  id: serial("id").primaryKey(),
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  concept_id: integer("concept_id").references(() => concepts.id),
  ciclo_escolar: varchar("ciclo_escolar", { length: 50 }),
  fecha_emision: date("fecha_emision").notNull(),
  fecha_vencimiento: date("fecha_vencimiento").notNull(),
  monto_base_centavos: bigint("monto_base_centavos", { mode: "number" }).notNull(),
  beca_aplicada: numeric("beca_aplicada", { precision: 5, scale: 2 }).default("0.00"),
  recargo_aplicado_centavos: bigint("recargo_aplicado_centavos", { mode: "number" }).default(0),
  estado: varchar("estado", { length: 50 }).default("pendiente"), // 'pendiente', 'pagado', 'parcial', 'cancelado'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// PAYMENTS
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  charge_id: integer("charge_id").references(() => charges.id, { onDelete: "cascade" }),
  guardian_id: integer("guardian_id").references(() => guardians.id),
  metodo: varchar("metodo", { length: 50 }).notNull(), // 'tarjeta', 'spei', 'paypal', 'efectivo', 'oxxo'
  referencia_pasarela: varchar("referencia_pasarela", { length: 255 }),
  monto_centavos: bigint("monto_centavos", { mode: "number" }).notNull(),
  fecha_pago: timestamp("fecha_pago").defaultNow(),
  estado: varchar("estado", { length: 50 }).default("exitoso"), // 'exitoso', 'fallido', 'reversado'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// PAYMENT METHODS (Tokenized)
export const payment_methods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  guardian_id: integer("guardian_id").references(() => guardians.id, { onDelete: "cascade" }),
  tipo: varchar("tipo", { length: 50 }).notNull(), // 'card', 'spei', 'paypal'
  token_pasarela: varchar("token_pasarela", { length: 255 }),
  last4: varchar("last4", { length: 4 }),
  expiry: varchar("expiry", { length: 10 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// INVOICES (CFDI)
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  payment_id: integer("payment_id").references(() => payments.id, { onDelete: "cascade" }),
  uuid_cfdi: varchar("uuid_cfdi", { length: 255 }),
  xml_url: text("xml_url"),
  pdf_url: text("pdf_url"),
  estado: varchar("estado", { length: 50 }).default("emitido"), // 'emitido', 'cancelado'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// DISCOUNTS
export const discounts = pgTable("discounts", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  nombre: varchar("nombre", { length: 255 }),
  regla_sql: text("regla_sql"),
  monto_pct: numeric("monto_pct", { precision: 5, scale: 2 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// NOTIFICATIONS
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  guardian_id: integer("guardian_id").references(() => guardians.id),
  canal: varchar("canal", { length: 50 }).notNull(), // 'email', 'sms', 'whatsapp'
  contenido: text("contenido"),
  enviado_en: timestamp("enviado_en").defaultNow(),
});

// RECONCILIATION BATCHES
export const reconciliation_batches = pgTable("reconciliation_batches", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  banco: varchar("banco", { length: 255 }),
  fecha_inicial: date("fecha_inicial").notNull(),
  fecha_final: date("fecha_final").notNull(),
  archivo_csv: text("archivo_csv"),
  estado: varchar("estado", { length: 50 }).default("pendiente"), // 'pendiente', 'conciliado', 'error'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// RELATIONS
export const tenantsRelations = relations(tenants, ({ many }) => ({
  campuses: many(campuses),
}));

export const campusesRelations = relations(campuses, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [campuses.tenant_id],
    references: [tenants.id],
  }),
  users: many(users),
  students: many(students),
  concepts: many(concepts),
}));

export const usersRelations = relations(users, ({ one }) => ({
  campus: one(campuses, {
    fields: [users.campus_id],
    references: [campuses.id],
  }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  campus: one(campuses, {
    fields: [students.campus_id],
    references: [campuses.id],
  }),
  student_guardians: many(student_guardian),
  charges: many(charges),
  scholarships: many(scholarships),
}));

export const guardiansRelations = relations(guardians, ({ many }) => ({
  student_guardians: many(student_guardian),
  payments: many(payments),
  payment_methods: many(payment_methods),
}));

export const studentGuardianRelations = relations(student_guardian, ({ one }) => ({
  student: one(students, {
    fields: [student_guardian.student_id],
    references: [students.id],
  }),
  guardian: one(guardians, {
    fields: [student_guardian.guardian_id],
    references: [guardians.id],
  }),
}));

export const conceptsRelations = relations(concepts, ({ one, many }) => ({
  campus: one(campuses, {
    fields: [concepts.campus_id],
    references: [campuses.id],
  }),
  charges: many(charges),
}));

export const chargesRelations = relations(charges, ({ one, many }) => ({
  student: one(students, {
    fields: [charges.student_id],
    references: [students.id],
  }),
  concept: one(concepts, {
    fields: [charges.concept_id],
    references: [concepts.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  charge: one(charges, {
    fields: [payments.charge_id],
    references: [charges.id],
  }),
  guardian: one(guardians, {
    fields: [payments.guardian_id],
    references: [guardians.id],
  }),
  invoices: many(invoices),
}));

// INSERT SCHEMAS
export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertCampusSchema = createInsertSchema(campuses).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertGuardianSchema = createInsertSchema(guardians).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertConceptSchema = createInsertSchema(concepts).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertChargeSchema = createInsertSchema(charges).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// TYPES
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type InsertCampus = z.infer<typeof insertCampusSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type InsertGuardian = z.infer<typeof insertGuardianSchema>;
export type InsertConcept = z.infer<typeof insertConceptSchema>;
export type InsertCharge = z.infer<typeof insertChargeSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type Tenant = typeof tenants.$inferSelect;
export type Campus = typeof campuses.$inferSelect;
export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Guardian = typeof guardians.$inferSelect;
export type Concept = typeof concepts.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentMethod = typeof payment_methods.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;

// PAYMENT RULES TABLES
export const payment_rules = pgTable("payment_rules", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  rule_type: text("rule_type").notNull(), // 'percentage', 'fixed_amount', 'progressive', 'compound'
  is_active: boolean("is_active").default(true).notNull(),
  
  // Configuración básica
  grace_period_days: integer("grace_period_days").default(0).notNull(),
  grace_period_unit: text("grace_period_unit").default('days').notNull(), // 'days', 'weeks'
  
  // Reglas de recargo
  late_fee_percentage: numeric("late_fee_percentage", { precision: 5, scale: 2 }), // Para tipo 'percentage'
  late_fee_fixed_amount_centavos: integer("late_fee_fixed_amount_centavos"), // Para tipo 'fixed_amount'
  
  // Reglas progresivas (JSON)
  progressive_rules: text("progressive_rules"), // JSON string de ProgressiveRule[]
  
  // Configuración avanzada
  max_late_fee_centavos: integer("max_late_fee_centavos"), // Límite máximo de recargo
  min_late_fee_centavos: integer("min_late_fee_centavos"), // Mínimo de recargo
  compound_daily: boolean("compound_daily").default(false).notNull(), // Si se calcula diariamente
  applies_to_weekends: boolean("applies_to_weekends").default(false).notNull(), // Si aplica en fines de semana
  applies_to_holidays: boolean("applies_to_holidays").default(false).notNull(), // Si aplica en días festivos
  
  // Configuración de conceptos (JSON array)
  applies_to_concepts: text("applies_to_concepts"), // JSON string de conceptos
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const late_fee_calculations = pgTable("late_fee_calculations", {
  id: serial("id").primaryKey(),
  charge_id: integer("charge_id").references(() => charges.id).notNull(),
  payment_rule_id: integer("payment_rule_id").references(() => payment_rules.id).notNull(),
  original_amount_centavos: integer("original_amount_centavos").notNull(),
  due_date: timestamp("due_date").notNull(),
  adjusted_due_date: timestamp("adjusted_due_date").notNull(), // Fecha ajustada por días hábiles
  calculation_date: timestamp("calculation_date").notNull(),
  days_late: integer("days_late").notNull(),
  late_fee_amount_centavos: integer("late_fee_amount_centavos").notNull(),
  calculation_details: text("calculation_details"), // Descripción del cálculo
  is_applied: boolean("is_applied").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Relations for payment rules
export const paymentRulesRelations = relations(payment_rules, ({ one }) => ({
  campus: one(campuses, {
    fields: [payment_rules.campus_id],
    references: [campuses.id],
  }),
}));

export const lateFeeCalculationsRelations = relations(late_fee_calculations, ({ one }) => ({
  charge: one(charges, {
    fields: [late_fee_calculations.charge_id],
    references: [charges.id],
  }),
  payment_rule: one(payment_rules, {
    fields: [late_fee_calculations.payment_rule_id],
    references: [payment_rules.id],
  }),
}));

// Insert schemas for payment rules
export const insertPaymentRuleSchema = createInsertSchema(payment_rules).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertLateFeeCalculationSchema = createInsertSchema(late_fee_calculations).omit({
  id: true,
  created_at: true,
});

// Types for payment rules
export type PaymentRule = typeof payment_rules.$inferSelect;
export type InsertPaymentRule = z.infer<typeof insertPaymentRuleSchema>;
export type LateFeeCalculation = typeof late_fee_calculations.$inferSelect;
export type InsertLateFeeCalculation = z.infer<typeof insertLateFeeCalculationSchema>;

// ========================================
// SUPER ADMIN PLATFORM MANAGEMENT TABLES
// ========================================

// Platform metrics and monitoring
export const platform_metrics = pgTable("platform_metrics", {
  id: serial("id").primaryKey(),
  metric_type: varchar("metric_type", { length: 100 }).notNull(), // 'schools_active', 'total_payments', 'security_events'
  metric_value: bigint("metric_value", { mode: "number" }).notNull(),
  metric_date: date("metric_date").notNull(),
  tenant_id: integer("tenant_id").references(() => tenants.id), // null for platform-wide metrics
  created_at: timestamp("created_at").defaultNow(),
});

// Security events for platform monitoring
export const security_events = pgTable("security_events", {
  id: serial("id").primaryKey(),
  event_type: varchar("event_type", { length: 100 }).notNull(), // 'sql_injection', 'brute_force', 'suspicious_login'
  severity: varchar("severity", { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'
  tenant_id: integer("tenant_id").references(() => tenants.id),
  campus_id: integer("campus_id").references(() => campuses.id),
  user_id: integer("user_id").references(() => users.id),
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: text("user_agent"),
  event_details: text("event_details"), // JSON string with event details
  is_blocked: boolean("is_blocked").default(false),
  created_at: timestamp("created_at").defaultNow(),
});

// Platform subscriptions and billing
export const platform_subscriptions = pgTable("platform_subscriptions", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id).notNull(),
  plan_type: varchar("plan_type", { length: 50 }).notNull(), // 'basic', 'premium', 'enterprise'
  status: varchar("status", { length: 50 }).notNull(), // 'active', 'suspended', 'cancelled'
  students_limit: integer("students_limit").notNull(),
  current_students: integer("current_students").default(0),
  monthly_fee_centavos: integer("monthly_fee_centavos").notNull(),
  billing_date: date("billing_date").notNull(),
  next_billing_date: date("next_billing_date").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// System health checks
export const system_health = pgTable("system_health", {
  id: serial("id").primaryKey(),
  service_name: varchar("service_name", { length: 100 }).notNull(), // 'database', 'payment_gateway', 'email_service'
  status: varchar("status", { length: 20 }).notNull(), // 'healthy', 'warning', 'critical'
  response_time_ms: integer("response_time_ms"),
  error_message: text("error_message"),
  checked_at: timestamp("checked_at").defaultNow(),
});

// Insert schemas for platform tables
export const insertPlatformMetricSchema = createInsertSchema(platform_metrics).omit({
  id: true,
  created_at: true,
});

export const insertSecurityEventSchema = createInsertSchema(security_events).omit({
  id: true,
  created_at: true,
});

export const insertPlatformSubscriptionSchema = createInsertSchema(platform_subscriptions).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertSystemHealthSchema = createInsertSchema(system_health).omit({
  id: true,
  checked_at: true,
});

// Types for platform tables
export type PlatformMetric = typeof platform_metrics.$inferSelect;
export type InsertPlatformMetric = z.infer<typeof insertPlatformMetricSchema>;
export type SecurityEvent = typeof security_events.$inferSelect;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type PlatformSubscription = typeof platform_subscriptions.$inferSelect;
export type InsertPlatformSubscription = z.infer<typeof insertPlatformSubscriptionSchema>;
export type SystemHealth = typeof system_health.$inferSelect;
export type InsertSystemHealth = z.infer<typeof insertSystemHealthSchema>;

// Platform profiles schema and types
export const insertPlatformProfileSchema = createInsertSchema(platform_profiles).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type PlatformProfile = typeof platform_profiles.$inferSelect;
export type InsertPlatformProfile = z.infer<typeof insertPlatformProfileSchema>;

// ========================================
// SISTEMA DE VALIDACIÓN Y APROBACIÓN
// ========================================

// PENDING APPROVALS (Sistema de validación para cambios críticos)
export const pending_approvals = pgTable("pending_approvals", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  requested_by: integer("requested_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  approved_by: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  action_type: varchar("action_type", { length: 100 }).notNull(), // 'modify_scholarship', 'modify_late_fee', 'modify_price', 'modify_payment_due_date', 'delete_concept', 'modify_concept'
  entity_type: varchar("entity_type", { length: 50 }).notNull(), // 'scholarship', 'late_fee', 'concept', 'payment_rule', 'product'
  entity_id: integer("entity_id").notNull(), // ID del elemento a modificar
  original_data: text("original_data").notNull(), // JSON con datos originales
  requested_data: text("requested_data").notNull(), // JSON con datos solicitados
  reason: text("reason"), // Justificación del cambio
  status: varchar("status", { length: 50 }).default("pending"), // 'pending', 'approved', 'rejected', 'expired'
  priority: varchar("priority", { length: 20 }).default("medium"), // 'low', 'medium', 'high', 'critical'
  approval_notes: text("approval_notes"), // Notas del aprobador
  expires_at: timestamp("expires_at"), // Fecha de expiración de la solicitud
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// APPROVAL NOTIFICATIONS (Notificaciones de aprobación)
export const approval_notifications = pgTable("approval_notifications", {
  id: serial("id").primaryKey(),
  approval_id: integer("approval_id").references(() => pending_approvals.id, { onDelete: "cascade" }).notNull(),
  recipient_id: integer("recipient_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  notification_type: varchar("notification_type", { length: 50 }).notNull(), // 'approval_request', 'approval_granted', 'approval_denied', 'approval_expired'
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  is_read: boolean("is_read").default(false),
  sent_at: timestamp("sent_at").defaultNow(),
  read_at: timestamp("read_at"),
});

// APPROVAL WORKFLOW LOGS (Auditoría del flujo de aprobación)
export const approval_workflow_logs = pgTable("approval_workflow_logs", {
  id: serial("id").primaryKey(),
  approval_id: integer("approval_id").references(() => pending_approvals.id, { onDelete: "cascade" }).notNull(),
  user_id: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  action: varchar("action", { length: 100 }).notNull(), // 'created', 'approved', 'rejected', 'expired', 'viewed', 'commented'
  details: text("details"), // Detalles adicionales de la acción
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at").defaultNow(),
});

// Relations para el sistema de aprobación
export const pendingApprovalsRelations = relations(pending_approvals, ({ one, many }) => ({
  requester: one(users, {
    fields: [pending_approvals.requested_by],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [pending_approvals.approved_by],
    references: [users.id],
  }),
  campus: one(campuses, {
    fields: [pending_approvals.campus_id],
    references: [campuses.id],
  }),
  tenant: one(tenants, {
    fields: [pending_approvals.tenant_id],
    references: [tenants.id],
  }),
  notifications: many(approval_notifications),
  workflow_logs: many(approval_workflow_logs),
}));

export const approvalNotificationsRelations = relations(approval_notifications, ({ one }) => ({
  approval: one(pending_approvals, {
    fields: [approval_notifications.approval_id],
    references: [pending_approvals.id],
  }),
  recipient: one(users, {
    fields: [approval_notifications.recipient_id],
    references: [users.id],
  }),
}));

export const approvalWorkflowLogsRelations = relations(approval_workflow_logs, ({ one }) => ({
  approval: one(pending_approvals, {
    fields: [approval_workflow_logs.approval_id],
    references: [pending_approvals.id],
  }),
  user: one(users, {
    fields: [approval_workflow_logs.user_id],
    references: [users.id],
  }),
}));

// Insert schemas para el sistema de aprobación
export const insertPendingApprovalSchema = createInsertSchema(pending_approvals).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertApprovalNotificationSchema = createInsertSchema(approval_notifications).omit({
  id: true,
  sent_at: true,
});

export const insertApprovalWorkflowLogSchema = createInsertSchema(approval_workflow_logs).omit({
  id: true,
  created_at: true,
});

// Types para el sistema de aprobación
export type PendingApproval = typeof pending_approvals.$inferSelect;
export type InsertPendingApproval = z.infer<typeof insertPendingApprovalSchema>;
export type ApprovalNotification = typeof approval_notifications.$inferSelect;
export type InsertApprovalNotification = z.infer<typeof insertApprovalNotificationSchema>;
export type ApprovalWorkflowLog = typeof approval_workflow_logs.$inferSelect;
export type InsertApprovalWorkflowLog = z.infer<typeof insertApprovalWorkflowLogSchema>;
