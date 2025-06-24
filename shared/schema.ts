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

// USERS (Admin, Caja, Contador)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(), // 'super_admin', 'admin', 'caja', 'contador'
  twofa_secret: varchar("twofa_secret", { length: 255 }),
  is_active: boolean("is_active").default(true),
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

// SCHOLARSHIPS
export const scholarships = pgTable("scholarships", {
  id: serial("id").primaryKey(),
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  porcentaje: numeric("porcentaje", { precision: 5, scale: 2 }).notNull(),
  vigencia_inicio: date("vigencia_inicio").notNull(),
  vigencia_fin: date("vigencia_fin").notNull(),
  motivo: varchar("motivo", { length: 255 }),
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
