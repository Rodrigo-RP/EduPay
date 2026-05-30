// Notification system - Módulo 3: Notificaciones automáticas (email, WhatsApp, SMS)
import { pgTable, serial, integer, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { guardians } from "./schema";

export const notification_templates = pgTable("notification_templates", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id"),
  tipo: varchar("tipo", { length: 50 }).notNull(), // CARGO_EMITIDO, RECORDATORIO_VENCIMIENTO, AVISO_MORA
  canal: varchar("canal", { length: 20 }).notNull(), // EMAIL, SMS, WHATSAPP
  asunto: varchar("asunto", { length: 255 }),
  mensaje: text("mensaje").notNull(),
  variables_disponibles: text("variables_disponibles"), // JSON: {alumno}, {monto}, {fecha_vencimiento}
  dias_antes_vencimiento: integer("dias_antes_vencimiento"), // Para recordatorios
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