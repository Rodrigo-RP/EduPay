// Sistema de conciliación bancaria - Módulo 4: Caja y conciliación
import { pgTable, serial, integer, varchar, text, boolean, timestamp, date, bigint, decimal } from "drizzle-orm/pg-core";

export const bank_accounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id"),
  banco: varchar("banco", { length: 100 }).notNull(),
  numero_cuenta: varchar("numero_cuenta", { length: 50 }).notNull(),
  clabe: varchar("clabe", { length: 18 }),
  tipo_cuenta: varchar("tipo_cuenta", { length: 50 }).default("CORRIENTE"), // CORRIENTE, AHORRO
  moneda: varchar("moneda", { length: 3 }).default("MXN"),
  saldo_inicial_centavos: bigint("saldo_inicial_centavos", { mode: "number" }).default(0),
  conciliacion_automatica: boolean("conciliacion_automatica").default(true),
  activa: boolean("activa").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const bank_movements = pgTable("bank_movements", {
  id: serial("id").primaryKey(),
  bank_account_id: integer("bank_account_id").references(() => bank_accounts.id),
  fecha_movimiento: date("fecha_movimiento").notNull(),
  referencia: varchar("referencia", { length: 100 }),
  concepto: text("concepto"),
  tipo: varchar("tipo", { length: 20 }).notNull(), // INGRESO, EGRESO
  monto_centavos: bigint("monto_centavos", { mode: "number" }).notNull(),
  saldo_centavos: bigint("saldo_centavos", { mode: "number" }),
  conciliado: boolean("conciliado").default(false),
  payment_id: integer("payment_id").references(() => payments.id), // Referencia al pago si coincide
  observaciones: text("observaciones"),
  created_at: timestamp("created_at").defaultNow(),
});