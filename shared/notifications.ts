// Notification system según especificaciones - SMS, WhatsApp, Email
export const notification_templates = pgTable("notification_templates", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  tipo: varchar("tipo", { length: 50 }).notNull(), // CARGO_EMITIDO, RECORDATORIO, MORA
  canal: varchar("canal", { length: 20 }).notNull(), // EMAIL, SMS, WHATSAPP
  asunto: varchar("asunto", { length: 255 }),
  mensaje: text("mensaje").notNull(),
  variables_disponibles: text("variables_disponibles"), // JSON con variables
  activo: boolean("activo").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const notification_queue = pgTable("notification_queue", {
  id: serial("id").primaryKey(),
  guardian_id: integer("guardian_id").references(() => guardians.id),
  template_id: integer("template_id").references(() => notification_templates.id),
  canal: varchar("canal", { length: 20 }).notNull(),
  destinatario: varchar("destinatario", { length: 255 }).notNull(), // email, phone
  asunto: varchar("asunto", { length: 255 }),
  mensaje: text("mensaje").notNull(),
  estado: varchar("estado", { length: 20 }).default("pendiente"), // pendiente, enviado, error
  intentos: integer("intentos").default(0),
  fecha_programada: timestamp("fecha_programada").defaultNow(),
  fecha_enviado: timestamp("fecha_enviado"),
  error_mensaje: text("error_mensaje"),
  created_at: timestamp("created_at").defaultNow(),
});