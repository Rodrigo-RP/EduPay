import { pgTable, pgEnum, text, serial, integer, boolean, varchar, bigint, numeric, date, timestamp, primaryKey, jsonb, uniqueIndex, smallint, check } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
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
  // Onboarding lifecycle flag (migration 002).
  // true = campus completed the guided setup wizard at least once.
  // New campuses default to false; existing campuses were grandfathered to true.
  onboarding_completado: boolean("onboarding_completado").default(false).notNull(),
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
  role: varchar("role", { length: 50 }).notNull(), // 'administrador_general', 'administrador_campus', 'contador_general', 'auxiliar_contable', 'asistente', 'admisiones'
  telefono: varchar("telefono", { length: 20 }),
  // TEXT (sin límite): almacena la foto como data URI base64 directamente en la columna.
  // varchar(500) era insuficiente para cualquier imagen real (incluso un thumbnail de
  // 16×16 produce > 800 chars de base64). Decisión provisional: TEXT resuelve el
  // problema hoy sin infraestructura nueva. Pendiente Fase 2: migrar a almacenamiento
  // de objetos (S3/bucket) cuando se conecte el PAC de CFDI; en ese momento esta
  // columna pasará a guardar solo la URL del objeto, no el contenido en base64.
  foto_url: text("foto_url"),
  twofa_secret: varchar("twofa_secret", { length: 255 }),
  is_active: boolean("is_active").default(true),
  is_super_admin: boolean("is_super_admin").default(false),
  platform_permissions: text("platform_permissions").array(),
  custom_permissions: text("custom_permissions").array(), // Permisos personalizados asignados por el administrador general
  last_login_at: timestamp("last_login_at"),
  // Timestamp del último cambio de contraseña.
  // El middleware de autenticación compara iat del JWT contra este campo para
  // invalidar sesiones activas inmediatamente tras un cambio de contraseña.
  // DB: TIMESTAMPTZ (mig-018) — declarado con withTimezone:true para coincidir.
  password_changed_at: timestamp("password_changed_at", { withTimezone: true }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// INSTITUTIONAL CREDENTIALS - Credenciales institucionales para administradores
export const institutional_credentials = pgTable("institutional_credentials", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  credential_type: varchar("credential_type", { length: 50 }).notNull(), // 'firma_electronica', 'sellos_digitales', 'idse', 'tarjeta_patronal', 'infonavit', 'otra'
  credential_name: varchar("credential_name", { length: 255 }), // Nombre personalizado para "Otra"
  username: varchar("username", { length: 255 }),
  password_encrypted: varchar("password_encrypted", { length: 500 }), // Encrypted password
  expiration_date: date("expiration_date"),
  last_notification_sent: date("last_notification_sent"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// INSTITUTIONAL INFO - Información institucional por secciones educativas
export const institutional_info = pgTable("institutional_info", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  seccion_educativa: varchar("seccion_educativa", { length: 50 }).notNull(), // 'KINDER', 'PRIMARIA', 'SECUNDARIA', 'BACHILLERATO'
  rfc: varchar("rfc", { length: 13 }),
  cct: varchar("cct", { length: 20 }), // Clave de Centro de Trabajo — educación básica (Preescolar/Primaria/Secundaria)
  rvoe: varchar("rvoe", { length: 20 }), // Reconocimiento de Validez Oficial de Estudios — media superior (Bachillerato/Profesional técnico)
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// INSTITUTIONAL SETTINGS - Configuración general institucional
export const institutional_settings = pgTable("institutional_settings", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }).notNull(),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  rfc: varchar("rfc", { length: 13 }),
  direccion_fiscal: text("direccion_fiscal"),
  ciudad: varchar("ciudad", { length: 100 }),
  codigo_postal: varchar("codigo_postal", { length: 10 }),
  telefono_principal: varchar("telefono_principal", { length: 20 }),
  email_institucional: varchar("email_institucional", { length: 255 }),
  sitio_web: varchar("sitio_web", { length: 255 }),
  nombre_legal: varchar("nombre_legal", { length: 255 }),
  logo_url: text("logo_url"), // URL del logo institucional
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

// STUDENTS - Adaptado a estructura Excel "Concentrado_Estudiante y Padre" + campos institucionales
export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  
  // Campos institucionales importantes
  id_referencia: varchar("id_referencia", { length: 50 }), // ID de Reference/Matricula
  username: varchar("username", { length: 100 }), // Usuario del alumno
  password_hash: varchar("password_hash", { length: 255 }), // Contraseña del alumno
  
  // Campos de nombres (columnas 8-10 Excel)
  nombres: varchar("nombres", { length: 255 }).notNull(),
  apellido_paterno: varchar("apellido_paterno", { length: 255 }),
  apellido_materno: varchar("apellido_materno", { length: 255 }),
  
  // Datos personales (columnas 11-13 Excel)
  curp: varchar("curp", { length: 18 }),
  fecha_nacimiento: date("fecha_nacimiento"),
  tipo_sangre: varchar("tipo_sangre", { length: 10 }),
  
  // Datos institucionales (columnas 14-20 Excel)
  correo_institucional: varchar("correo_institucional", { length: 255 }),
  nivel_escolar: varchar("nivel_escolar", { length: 100 }),
  // Nivel educativo controlado (catálogo SAT — 5 valores exactos del XSD iedu.pdf).
  // Se puebla automáticamente desde nivel_escolar en migración 017; NULL = requiere
  // revisión manual antes de poder timbrar el CFDI del alumno.
  nivel_educativo: varchar("nivel_educativo", { length: 50 }),
  // 'Preescolar' | 'Primaria' | 'Secundaria' | 'Profesional técnico' | 'Bachillerato o su equivalente'
  clave_centro_trabajo: varchar("clave_centro_trabajo", { length: 50 }),
  grado: varchar("grado", { length: 50 }),
  grupo: varchar("grupo", { length: 50 }),
  turno: varchar("turno", { length: 50 }),
  
  // Campo calculado para compatibilidad con código existente
  nombre_completo: varchar("nombre_completo", { length: 300 }),
  
  // Datos demográficos (Task #60)
  sexo:                  varchar("sexo", { length: 10 }),
  estado_origen:         varchar("estado_origen", { length: 60 }),
  nacionalidad:          varchar("nacionalidad", { length: 60 }),
  idioma_natal:          varchar("idioma_natal", { length: 40 }),
  habla_dialecto:        boolean("habla_dialecto").default(false),
  necesidades_especiales: boolean("necesidades_especiales").default(false),
  repetidor:             boolean("repetidor").default(false),

  status: varchar("status", { length: 50 }).default("activo"), // 'activo', 'baja', 'suspendido', 'egresado'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, () => [
  // Refleja el CHECK real de DB — no genera migración nueva, solo documenta.
  check(
    "students_nivel_educativo_check",
    sql`((nivel_educativo IS NULL) OR ((nivel_educativo)::text = ANY ((ARRAY['Preescolar'::character varying, 'Primaria'::character varying, 'Secundaria'::character varying, 'Profesional técnico'::character varying, 'Bachillerato o su equivalente'::character varying])::text[])))`,
  ),
]);

// GUARDIANS - Adaptado a estructura Excel "Concentrado_Estudiante y Padre" (columnas 1-7) + separación padre/madre
export const guardians = pgTable("guardians", {
  id: serial("id").primaryKey(),
  
  // Tipo de guardian (padre, madre, tutor)
  tipo_guardian: varchar("tipo_guardian", { length: 20 }).default("padre"), // 'padre', 'madre', 'tutor'
  es_padre: boolean("es_padre").default(false),
  es_madre: boolean("es_madre").default(false),
  
  // Contacto (columna 1 Excel)
  correo_institucional_familiar: varchar("correo_institucional_familiar", { length: 255 }).notNull(),
  
  // Nombres (columnas 2-4 Excel)
  nombres: varchar("nombres", { length: 255 }).notNull(),
  apellido_paterno: varchar("apellido_paterno", { length: 255 }),
  apellido_materno: varchar("apellido_materno", { length: 255 }),
  
  // Datos personales (columna 5 Excel)
  curp: varchar("curp", { length: 18 }),
  
  // Teléfonos (columnas 6-7 Excel)
  celular: varchar("celular", { length: 20 }),
  telefono_casa_oficina: varchar("telefono_casa_oficina", { length: 20 }),
  
  // Campos para compatibilidad con sistema existente
  email: varchar("email", { length: 255 }),
  password_hash: varchar("password_hash", { length: 255 }),
  telefono: varchar("telefono", { length: 20 }),
  nombre_completo: varchar("nombre_completo", { length: 300 }),
  rfc: varchar("rfc", { length: 13 }),
  calle: varchar("calle", { length: 255 }),
  numero_exterior: varchar("numero_exterior", { length: 30 }),
  numero_interior: varchar("numero_interior", { length: 30 }),
  colonia: varchar("colonia", { length: 255 }),
  codigo_postal: varchar("codigo_postal", { length: 5 }),
  municipio: varchar("municipio", { length: 255 }),
  estado: varchar("estado", { length: 100 }),
  contacto_emergencia_nombre: varchar("contacto_emergencia_nombre", { length: 255 }),
  contacto_emergencia_telefono: varchar("contacto_emergencia_telefono", { length: 20 }),
  contacto_emergencia_relacion: varchar("contacto_emergencia_relacion", { length: 100 }),

  // Multi-tenancy: campus_id derivado del primer alumno vinculado
  campus_id: integer("campus_id").references(() => campuses.id),
  tenant_id: integer("tenant_id").references(() => tenants.id),

  // foto_url: columna real en DB (nullable, sin default). Documentada aquí para
  // alinear Drizzle con information_schema; no existe en el insertGuardianSchema.
  foto_url: text("foto_url"),

  // Customer Stripe reutilizable del tutor. Necesario para customer_balance/SPEI;
  // nullable para no alterar a los tutores que nunca han iniciado un pago Stripe.
  stripe_customer_id: varchar("stripe_customer_id", { length: 255 }),

  // Timestamp del último cambio de contraseña (parallel con users.password_changed_at).
  // DB: TIMESTAMPTZ (mig-018) — declarado con withTimezone:true para coincidir.
  password_changed_at: timestamp("password_changed_at", { withTimezone: true }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// STUDENT-GUARDIAN RELATIONSHIP
export const student_guardian = pgTable("student_guardian", {
  student_id:             integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  guardian_id:            integer("guardian_id").references(() => guardians.id, { onDelete: "cascade" }),
  porcentaje_responsabilidad: numeric("porcentaje_responsabilidad", { precision: 5, scale: 2 }).default("100.00"),
  /**
   * Marca al tutor como responsable financiero del alumno.
   * Caso de uso principal: padres divorciados donde solo uno paga.
   * - true  → recibe cargos, notificaciones y estado de cuenta (default)
   * - false → tutor de contacto pero sin responsabilidad de pago
   *
   * Un alumno puede tener múltiples tutores con es_responsable_pago = true
   * si el pago es compartido (porcentaje_responsabilidad define la proporción).
   */
  es_responsable_pago:    boolean("es_responsable_pago").default(true).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.student_id, table.guardian_id] }),
  };
});

// PAYMENT CONCEPTS
export const concepts = pgTable("concepts", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(), // 'colegiatura', 'inscripcion', 'extra'
  periodicidad: varchar("periodicidad", { length: 50 }).notNull(), // 'mensual', 'anual', 'eventual'
  monto_centavos: bigint("monto_centavos", { mode: "number" }).notNull(),
  iva: boolean("iva").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ── PRODUCT CATALOG ──────────────────────────────────────────────────────────
// Plantilla de precios por nivel académico + metadata fiscal para CFDI.
// Distinto de `concepts` (precio único operacional): aquí cada producto tiene
// 4 precios (KINDER / PRIMARIA / SECUNDARIA / BACHILLERATO) y campos SAT.
export const products = pgTable("products", {
  id:                  serial("id").primaryKey(),
  campus_id:           integer("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id:           integer("tenant_id").notNull().references(() => tenants.id),
  codigo:              varchar("codigo", { length: 50 }).notNull(),
  nombre:              varchar("nombre", { length: 255 }).notNull(),
  descripcion:         text("descripcion"),
  categoria:           varchar("categoria", { length: 50 }).notNull(),   // COLEGIATURAS | INSCRIPCIONES | REINSCRIPCIONES | SEGURO_ESCOLAR | LIBROS | OTROS
  unidad_medida:       varchar("unidad_medida", { length: 20 }).notNull().default("SERVICIO"), // SERVICIO | PIEZA | LOTE | KILOGRAMO
  clave_sat:           varchar("clave_sat", { length: 20 }),
  activo:              boolean("activo").notNull().default(true),
  precio_kinder:       bigint("precio_kinder",       { mode: "number" }).notNull().default(0),
  precio_primaria:     bigint("precio_primaria",     { mode: "number" }).notNull().default(0),
  precio_secundaria:   bigint("precio_secundaria",   { mode: "number" }).notNull().default(0),
  precio_bachillerato: bigint("precio_bachillerato", { mode: "number" }).notNull().default(0),
  // DB: TIMESTAMPTZ — withTimezone:true para coincidir con information_schema
  created_at:          timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at:          timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // código único por campus (no por tenant): el mismo código puede usarse en campus distintos del mismo tenant
  campusCodigoUnique: uniqueIndex("products_campus_codigo_unique").on(table.campus_id, table.codigo),
}));

export type Product = typeof products.$inferSelect;

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
  tenant_id: integer("tenant_id").references(() => tenants.id),
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  scholarship_type_id: integer("scholarship_type_id").references(() => scholarship_types.id),
  // Columnas reales verificadas directamente en la DB (2026-08-10).
  // Columnas ELIMINADAS que no existen en la DB: porcentaje_aplicado, monto_fijo_aplicado_centavos,
  // score_evaluacion, metodo_asignacion, observaciones, created_by.
  porcentaje: numeric("porcentaje").notNull(),
  motivo: varchar("motivo", { length: 500 }),
  // Nullable por compatibilidad con registros históricos; la migración usa
  // default 'activa' y las consultas tratan NULL histórico como activa.
  estado: varchar("estado", { length: 20 }).default("activa"),
  vigencia_inicio: date("vigencia_inicio").notNull(),
  vigencia_fin: date("vigencia_fin").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// CHARGES
export const charges = pgTable("charges", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }),
  concept_id: integer("concept_id").references(() => concepts.id),
  ciclo_escolar: varchar("ciclo_escolar", { length: 50 }),
  fecha_emision: date("fecha_emision").notNull(),
  fecha_vencimiento: date("fecha_vencimiento").notNull(),
  monto_base_centavos: bigint("monto_base_centavos", { mode: "number" }).notNull(),
  beca_aplicada: numeric("beca_aplicada", { precision: 5, scale: 2 }).default("0.00"),
  recargo_aplicado_centavos: bigint("recargo_aplicado_centavos", { mode: "number" }).default(0),
  estado: varchar("estado", { length: 50 }).default("pendiente"), // 'pendiente', 'pagado', 'parcial', 'cancelado'
  // ADR-002: FK nullable al plan de pago que generó este cargo (cuotas de plan)
  plan_id: integer("plan_id"),
  // Migración 010: bandera de adeudo heredado de sistema anterior.
  // Independiente del concept_id — el mismo concepto real (colegiatura, inscripción)
  // puede usarse para CFDI mientras la exención de recargo sigue activa.
  // Rollback: ALTER TABLE charges DROP COLUMN es_adeudo_migrado;
  es_adeudo_migrado: boolean("es_adeudo_migrado").default(false).notNull(),
  // Migración 011: texto libre del sistema origen (ej. "Colegiatura Marzo 2024").
  // Visible en estado de cuenta del tutor; no altera concept_id ni tipo fiscal.
  // Rollback: ALTER TABLE charges DROP COLUMN descripcion;
  descripcion: text("descripcion"),
  // Sólo para cargos extraordinarios con fecha manual explícita y auditada.
  manual_override: boolean("manual_override").default(false).notNull(),
  manual_override_reason: text("manual_override_reason"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// PAYMENTS
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  charge_id: integer("charge_id").references(() => charges.id, { onDelete: "cascade" }),
  guardian_id: integer("guardian_id").references(() => guardians.id),
  metodo: varchar("metodo", { length: 50 }).notNull(), // 'tarjeta', 'spei', 'paypal', 'efectivo', 'oxxo'
  // subtipo_tarjeta: 'credito' → forma_pago SAT '04', 'debito' → '28'.
  // NULL mientras Stripe Connect no esté activo — se llenará desde la respuesta del procesador.
  subtipo_tarjeta: varchar("subtipo_tarjeta", { length: 10 }), // 'credito' | 'debito' | null
  referencia_pasarela: varchar("referencia_pasarela", { length: 255 }),
  monto_centavos: bigint("monto_centavos", { mode: "number" }).notNull(),
  fecha_pago: timestamp("fecha_pago").defaultNow(),
  estado: varchar("estado", { length: 50 }).default("pendiente"), // 'pendiente' → 'exitoso' | 'fallido' → 'reversado'
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, () => [
  // Refleja el CHECK real de DB — no genera migración nueva, solo documenta.
  check(
    "payments_subtipo_tarjeta_check",
    sql`((subtipo_tarjeta IS NULL) OR ((subtipo_tarjeta)::text = ANY ((ARRAY['credito'::character varying, 'debito'::character varying])::text[])))`,
  ),
]);

// CASH CLOSURES
// Snapshot diario de caja. El efectivo capturado lo declara el operador; los
// demás importes se calculan desde pagos exitosos al momento de cerrar.
// Un campus sólo puede cerrar una fecha una vez.
export const cash_closures = pgTable("cash_closures", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campus_id: integer("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  closed_by_user_id: integer("closed_by_user_id").notNull().references(() => users.id),
  fecha: date("fecha").notNull(),
  efectivo_capturado_centavos: bigint("efectivo_capturado_centavos", { mode: "number" }).notNull(),
  efectivo_registrado_centavos: bigint("efectivo_registrado_centavos", { mode: "number" }).notNull(),
  ingresos_bancarios_centavos: bigint("ingresos_bancarios_centavos", { mode: "number" }).notNull(),
  total_cobrado_centavos: bigint("total_cobrado_centavos", { mode: "number" }).notNull(),
  diferencia_efectivo_centavos: bigint("diferencia_efectivo_centavos", { mode: "number" }).notNull(),
  pagos_procesados: integer("pagos_procesados").notNull(),
  observaciones: text("observaciones"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("cash_closures_campus_fecha_unique").on(table.campus_id, table.fecha),
  check(
    "cash_closures_amounts_non_negative",
    sql`${table.efectivo_capturado_centavos} >= 0
      AND ${table.efectivo_registrado_centavos} >= 0
      AND ${table.ingresos_bancarios_centavos} >= 0
      AND ${table.total_cobrado_centavos} >= 0
      AND ${table.pagos_procesados} >= 0`,
  ),
]);

// PAYMENT METHODS (Tokenized)
export const payment_methods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  guardian_id: integer("guardian_id").references(() => guardians.id, { onDelete: "cascade" }),
  tipo: varchar("tipo", { length: 50 }).notNull(), // 'card', 'spei', 'paypal'
  token_pasarela: varchar("token_pasarela", { length: 255 }),
  last4: varchar("last4", { length: 4 }),
  expiry: varchar("expiry", { length: 10 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// CAMPUS PAYMENT CONFIG — configuración de Stripe Connect por campus
// La clave secreta de la plataforma (sk_live_/sk_test_) vive en Replit Secrets
// como STRIPE_SECRET_KEY, nunca en esta tabla ni en ninguna fila DB.
export const campus_payment_config = pgTable("campus_payment_config", {
  id:                serial("id").primaryKey(),
  campus_id:         integer("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id:         integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  payment_provider:  varchar("payment_provider", { length: 50 }).notNull().default("stripe"),
  stripe_account_id: varchar("stripe_account_id", { length: 255 }),
  charges_enabled:   boolean("charges_enabled").notNull().default(false),
  payouts_enabled:   boolean("payouts_enabled").notNull().default(false),
  details_submitted: boolean("details_submitted").notNull().default(false),
  // DB: TIMESTAMPTZ — withTimezone:true para coincidir con information_schema
  created_at:        timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at:        timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// CAMPUS INVOICING CONFIG — configuración de timbrado por campus (multi-proveedor multi-RFC)
// Principio de seguridad: EduPay NUNCA persiste bytes de .cer / .key.
// Solo se guarda el organizacion_id devuelto por el proveedor tras registrar el CSD.
export const campus_invoicing_config = pgTable("campus_invoicing_config", {
  id:                    serial("id").primaryKey(),
  campus_id:             integer("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id:             integer("tenant_id").notNull().references(() => tenants.id,  { onDelete: "cascade" }),
  proveedor:             varchar("proveedor",      { length: 50  }).notNull().default("facturapi"),
  // 'facturapi' | (futuro: 'fiscalapi', 'sw_sapien')
  organizacion_id:       varchar("organizacion_id", { length: 255 }),
  // ID opaco del proveedor — único dato persistido del proceso de registro CSD
  rfc:                   varchar("rfc",            { length: 13  }),
  razon_social:          varchar("razon_social",   { length: 255 }),
  regimen_fiscal:        varchar("regimen_fiscal",  { length: 4   }).notNull().default("601"),
  uso_cfdi_default:      varchar("uso_cfdi_default",{ length: 10  }).notNull().default("D10"),
  timbrado_automatico:   boolean("timbrado_automatico").notNull().default(false),
  ambiente:              varchar("ambiente",        { length: 20  }).notNull().default("sandbox"),
  // 'sandbox' | 'produccion'
  fecha_vencimiento_csd: date("fecha_vencimiento_csd"),
  // El CSD dura 4 años — usada para alertas preventivas de renovación
  estado:                varchar("estado",          { length: 20  }).notNull().default("pendiente"),
  // 'pendiente' | 'activo' | 'error' | 'vencido'
  ultimo_error:          text("ultimo_error"),
  // DB: TIMESTAMPTZ (mig-019 usó TIMESTAMPTZ) — withTimezone:true para coincidir
  created_at:            timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at:            timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// INVOICES (CFDI)
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  payment_id: integer("payment_id").references(() => payments.id, { onDelete: "cascade" }),
  uuid_cfdi: varchar("uuid_cfdi", { length: 255 }),
  xml_url: text("xml_url"),
  pdf_url: text("pdf_url"),
  estado: varchar("estado", { length: 50 }).default("pendiente"), // 'pendiente' → 'emitido' | 'cancelado'

  // ── Complemento IEDU (SAT XSD iedu.pdf) ────────────────────────────────────
  // Estos campos se populan al momento de generar el CFDI real.
  // Timbrado simulado (guardian.ts / fiscal.ts) los deja NULL intencionalmente.
  curp_alumno:     varchar("curp_alumno",     { length: 18 }),
  // nivel_educativo: exactamente uno de los 5 valores del catálogo SAT
  nivel_educativo: varchar("nivel_educativo", { length: 50 }),
  // aut_rvoe: CCT (básica) o RVOE (bachillerato/profesional técnico) — ver CAMPO_AUT_RVOE en validators.ts
  aut_rvoe:        varchar("aut_rvoe",        { length: 20 }),
  // rfc_pago: solo se incluye en el nodo CFDI cuando el pagador difiere del receptor
  rfc_pago:        varchar("rfc_pago",        { length: 13 }),
  uso_cfdi:        varchar("uso_cfdi",        { length: 10 }).default("D10"),
  // forma_pago: catálogo c_FormaPago del SAT. '01' efectivo es válido pero no deducible con D10.
  forma_pago:      varchar("forma_pago",      { length: 2 }),
  // clave_prod_serv: 86121500 básica | 86121600 bachillerato/técnico — ver CLAVE_PROD_SERV en validators.ts
  clave_prod_serv: varchar("clave_prod_serv", { length: 20 }),
  clave_unidad:    varchar("clave_unidad",    { length: 10 }).default("E48"),

  // ── Contenido real del CFDI timbrado (mig-019) ──────────────────────────────
  // Null para CFDIs generados antes de mig-019 o en modo simulado (stubs).
  // xml_url / pdf_url ya existían pero siempre son null — estos campos almacenan
  // el contenido real cuando el adaptador concreto esté activo.
  xml_content: text("xml_content"),  // XML timbrado completo (~5–15 KB, UTF-8)
  pdf_base64:  text("pdf_base64"),   // PDF en base64 generado por el proveedor

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, () => [
  // ── CHECK constraints IEDU — definición exacta que ya existe en la DB real.
  // Declaradas aquí para que drizzle-kit no proponga eliminarlas.
  // Las constraints fueron creadas vía migración SQL cruda; este bloque solo
  // las refleja declarativamente sin generar ninguna migración nueva.
  check(
    "invoices_curp_alumno_check",
    sql`((curp_alumno IS NULL) OR ((curp_alumno)::text ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[0-9A-Z][0-9]$'::text))`,
  ),
  check(
    "invoices_nivel_educativo_check",
    sql`((nivel_educativo IS NULL) OR ((nivel_educativo)::text = ANY ((ARRAY['Preescolar'::character varying, 'Primaria'::character varying, 'Secundaria'::character varying, 'Profesional técnico'::character varying, 'Bachillerato o su equivalente'::character varying])::text[])))`,
  ),
  check(
    "invoices_forma_pago_check",
    sql`((forma_pago IS NULL) OR ((forma_pago)::text = ANY ((ARRAY['01'::character varying, '02'::character varying, '03'::character varying, '04'::character varying, '05'::character varying, '06'::character varying, '08'::character varying, '12'::character varying, '13'::character varying, '17'::character varying, '23'::character varying, '24'::character varying, '25'::character varying, '28'::character varying, '29'::character varying, '30'::character varying, '99'::character varying])::text[])))`,
  ),
]);

// DISCOUNTS
export const discounts = pgTable("discounts", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  nombre: varchar("nombre", { length: 255 }),
  regla_sql: text("regla_sql"),
  monto_pct: numeric("monto_pct", { precision: 5, scale: 2 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// NOTIFICATIONS
export const notifications = pgTable("notifications", {
  id:           serial("id").primaryKey(),
  tenant_id:    integer("tenant_id").references(() => tenants.id),
  user_id:      integer("user_id").references(() => users.id),
  guardian_id:  integer("guardian_id").references(() => guardians.id),
  student_id:   integer("student_id").references(() => students.id, { onDelete: "set null" }),
  canal:        varchar("canal", { length: 50 }).notNull(), // 'EMAIL','SMS','WHATSAPP'
  tipo:         varchar("tipo", { length: 100 }),           // 'RECORDATORIO_VENCIMIENTO','AVISO_MORA','CARGO_EMITIDO','PAGO_CONFIRMADO'
  destinatario: varchar("destinatario", { length: 255 }),  // email o teléfono
  asunto:       text("asunto"),                             // asunto del email (null para SMS/WhatsApp)
  mensaje:      text("mensaje"),                            // contenido completo del mensaje
  contenido:    text("contenido"),                          // alias legacy de mensaje
  estado:       varchar("estado", { length: 50 }).default("pendiente"), // 'pendiente','enviado','error'
  intentos:     integer("intentos").default(0),
  enviado_en:   timestamp("enviado_en").defaultNow(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ── COLLECTION ACTIVITIES ─────────────────────────────────────────────────────
// Historial operativo de una cuenta por cobrar: notas, seguimientos, promesas,
// recordatorios, escalaciones e inicios de cobranza. No reutilizar
// acciones_seguimiento: esa tabla representa hallazgos internos de workflow.
export const collection_activities = pgTable("collection_activities", {
  id:               serial("id").primaryKey(),
  tenant_id:        integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campus_id:        integer("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  charge_id:        integer("charge_id").notNull().references(() => charges.id, { onDelete: "cascade" }),
  student_id:       integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  created_by:       integer("created_by").references(() => users.id, { onDelete: "set null" }),
  tipo:             varchar("tipo", { length: 40 }).notNull(),
  estado:           varchar("estado", { length: 40 }).notNull().default("registrado"),
  titulo:           varchar("titulo", { length: 255 }).notNull(),
  descripcion:      text("descripcion"),
  fecha_programada: date("fecha_programada"),
  hora_programada:  varchar("hora_programada", { length: 8 }),
  monto_centavos:   bigint("monto_centavos", { mode: "number" }),
  canal:            varchar("canal", { length: 30 }),
  prioridad:        varchar("prioridad", { length: 20 }),
  motivo:           varchar("motivo", { length: 100 }),
  supervisor:       varchar("supervisor", { length: 255 }),
  urgencia:         varchar("urgencia", { length: 20 }),
  metadata:         jsonb("metadata").notNull().default({}),
  created_at:       timestamp("created_at").notNull().defaultNow(),
  updated_at:       timestamp("updated_at").notNull().defaultNow(),
});
export type CollectionActivity = typeof collection_activities.$inferSelect;
export type InsertCollectionActivity = typeof collection_activities.$inferInsert;

// RECONCILIATION BATCHES
export const reconciliation_batches = pgTable("reconciliation_batches", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  tenant_id: integer("tenant_id").references(() => tenants.id),
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
  nombre_completo: true, // Se calcula automáticamente
  created_at: true,
  updated_at: true,
});
export const insertGuardianSchema = createInsertSchema(guardians).omit({
  id: true,
  email: true, // Se usa correo_institucional_familiar
  nombre_completo: true, // Se calcula automáticamente
  telefono: true, // Se usa celular o telefono_casa_oficina
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
export const insertInstitutionalInfoSchema = createInsertSchema(institutional_info).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const insertInstitutionalSettingsSchema = createInsertSchema(institutional_settings).omit({
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
export type InsertInstitutionalInfo = z.infer<typeof insertInstitutionalInfoSchema>;
export type InsertInstitutionalSettings = z.infer<typeof insertInstitutionalSettingsSchema>;

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
export type InstitutionalInfo = typeof institutional_info.$inferSelect;
export type InstitutionalSettings = typeof institutional_settings.$inferSelect;

// PAYMENT RULES TABLES
export const payment_rules = pgTable("payment_rules", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id).notNull(),
  tenant_id: integer("tenant_id").references(() => tenants.id),
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
  tenant_id: integer("tenant_id").references(() => tenants.id),
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

// PAYMENT DUE DATES CONFIG
export const payment_due_dates = pgTable("payment_due_dates", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id).notNull(),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  // Asociación canónica introducida en la migración 031. `concepto` se
  // conserva para compatibilidad temporal con datos y rutas históricas.
  concept_id: integer("concept_id").references(() => concepts.id),
  concepto: text("concepto").notNull(),
  dia_vencimiento: integer("dia_vencimiento").notNull(),
  mes_aplicacion: text("mes_aplicacion").notNull(), // JSON array or "todos"
  activo: boolean("activo").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// EXPLICIT DUE DATES FOR LONG PERIODS
// Used by cuatrimestral, semestral and anual concepts. The period is
// institution-defined and therefore never inferred from calendar months.
export const payment_due_date_periods = pgTable("payment_due_date_periods", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campus_id: integer("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  concept_id: integer("concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  ciclo_escolar: varchar("ciclo_escolar", { length: 50 }).notNull(),
  periodo_clave: varchar("periodo_clave", { length: 50 }).notNull(),
  fecha_inicio: date("fecha_inicio").notNull(),
  fecha_fin: date("fecha_fin").notNull(),
  fecha_vencimiento: date("fecha_vencimiento").notNull(),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_due_date_periods_unique").on(
    table.tenant_id,
    table.campus_id,
    table.concept_id,
    table.ciclo_escolar,
    table.periodo_clave,
  ),
  check("payment_due_date_periods_dates_check", sql`${table.fecha_fin} >= ${table.fecha_inicio}`),
]);

// SURCHARGE RULES CONFIG
export const payment_surcharge_rules = pgTable("payment_surcharge_rules", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id).notNull(),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  // Canonical association used by the active configuration flow and the
  // surcharge engine. `concepto` remains for historic routes only.
  concept_id: integer("concept_id").references(() => concepts.id),
  concepto: text("concepto").notNull(), // Nombre del concepto
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(), // 'porcentaje_fijo', 'porcentaje_diario', 'monto_fijo'
  dias_gracia: integer("dias_gracia").default(0).notNull(),
  porcentaje: numeric("porcentaje", { precision: 5, scale: 2 }), // Para tipos de porcentaje
  monto_fijo_centavos: integer("monto_fijo_centavos"), // Para tipo 'monto_fijo' 
  reglas_progresivas: text("reglas_progresivas"), // JSON para tipo 'progresivo'
  aplica_fines_semana: boolean("aplica_fines_semana").default(false).notNull(),
  aplica_festivos: boolean("aplica_festivos").default(false).notNull(),
  monto_maximo_centavos: integer("monto_maximo_centavos"),
  modo_acumulacion: text("modo_acumulacion").default("ninguno").notNull(),
  tipo_incremento_mensual: text("tipo_incremento_mensual"),
  incremento_mensual_centavos: integer("incremento_mensual_centavos"),
  incremento_mensual_porcentaje: numeric("incremento_mensual_porcentaje", { precision: 5, scale: 2 }),
  fecha_inicio_acumulacion: date("fecha_inicio_acumulacion"),
  activo: boolean("activo").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, () => [
  // Refleja el CHECK real de DB — no genera migración nueva, solo documenta.
  check(
    "payment_surcharge_rules_tipo_check",
    sql`((tipo)::text = ANY (ARRAY[('porcentaje'::character varying)::text, ('fijo'::character varying)::text, ('progresivo'::character varying)::text]))`,
  ),
  check(
    "payment_surcharge_rules_modo_acumulacion_check",
    sql`modo_acumulacion IN ('ninguno', 'incremento_fijo', 'compuesto')`,
  ),
  check(
    "payment_surcharge_rules_tipo_incremento_mensual_check",
    sql`tipo_incremento_mensual IS NULL OR tipo_incremento_mensual IN ('monto', 'porcentaje')`,
  ),
]);

// Relations
export const paymentDueDatesRelations = relations(payment_due_dates, ({ one }) => ({
  campus: one(campuses, {
    fields: [payment_due_dates.campus_id],
    references: [campuses.id],
  }),
  concept: one(concepts, {
    fields: [payment_due_dates.concept_id],
    references: [concepts.id],
  }),
}));

export const paymentDueDatePeriodsRelations = relations(payment_due_date_periods, ({ one }) => ({
  campus: one(campuses, {
    fields: [payment_due_date_periods.campus_id],
    references: [campuses.id],
  }),
  concept: one(concepts, {
    fields: [payment_due_date_periods.concept_id],
    references: [concepts.id],
  }),
}));

export const paymentSurchargeRulesRelations = relations(payment_surcharge_rules, ({ one }) => ({
  campus: one(campuses, {
    fields: [payment_surcharge_rules.campus_id],
    references: [campuses.id],
  }),
}));

// MONTHLY SURCHARGE LEDGER
export const charge_surcharge_periods = pgTable("charge_surcharge_periods", {
  id: serial("id").primaryKey(),
  charge_id: integer("charge_id").references(() => charges.id, { onDelete: "cascade" }).notNull(),
  payment_rule_id: integer("payment_rule_id").references(() => payment_surcharge_rules.id, { onDelete: "set null" }),
  tenant_id: integer("tenant_id").references(() => tenants.id).notNull(),
  campus_id: integer("campus_id").references(() => campuses.id).notNull(),
  periodo_mes: date("periodo_mes").notNull(),
  modo_acumulacion: text("modo_acumulacion").notNull(),
  saldo_base_centavos: integer("saldo_base_centavos").notNull(),
  recargo_anterior_centavos: integer("recargo_anterior_centavos").notNull(),
  incremento_centavos: integer("incremento_centavos").notNull(),
  recargo_total_centavos: integer("recargo_total_centavos").notNull(),
  formula_detalle: jsonb("formula_detalle").$type<Record<string, unknown>>().notNull().default({}),
  aplicado_at: timestamp("aplicado_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("charge_surcharge_periods_charge_month_unique").on(table.charge_id, table.periodo_mes),
  check(
    "charge_surcharge_periods_modo_acumulacion_check",
    sql`modo_acumulacion IN ('ninguno', 'incremento_fijo', 'compuesto')`,
  ),
  check("charge_surcharge_periods_non_negative_check", sql`
    saldo_base_centavos >= 0
    AND recargo_anterior_centavos >= 0
    AND incremento_centavos >= 0
    AND recargo_total_centavos >= 0
  `),
]);

export const chargeSurchargePeriodsRelations = relations(charge_surcharge_periods, ({ one }) => ({
  charge: one(charges, {
    fields: [charge_surcharge_periods.charge_id],
    references: [charges.id],
  }),
  payment_rule: one(payment_surcharge_rules, {
    fields: [charge_surcharge_periods.payment_rule_id],
    references: [payment_surcharge_rules.id],
  }),
  campus: one(campuses, {
    fields: [charge_surcharge_periods.campus_id],
    references: [campuses.id],
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

// Insert schemas for new tables
export const insertPaymentDueDateSchema = createInsertSchema(payment_due_dates).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertPaymentDueDatePeriodSchema = createInsertSchema(payment_due_date_periods).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertPaymentSurchargeRuleSchema = createInsertSchema(payment_surcharge_rules).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertChargeSurchargePeriodSchema = createInsertSchema(charge_surcharge_periods).omit({
  id: true,
  aplicado_at: true,
});

// Types for payment rules
export type PaymentRule = typeof payment_rules.$inferSelect;
export type InsertPaymentRule = z.infer<typeof insertPaymentRuleSchema>;
export type LateFeeCalculation = typeof late_fee_calculations.$inferSelect;
export type InsertLateFeeCalculation = z.infer<typeof insertLateFeeCalculationSchema>;

export type PaymentDueDate = typeof payment_due_dates.$inferSelect;
export type InsertPaymentDueDate = z.infer<typeof insertPaymentDueDateSchema>;
export type PaymentDueDatePeriod = typeof payment_due_date_periods.$inferSelect;
export type InsertPaymentDueDatePeriod = z.infer<typeof insertPaymentDueDatePeriodSchema>;
export type PaymentSurchargeRule = typeof payment_surcharge_rules.$inferSelect;
export type InsertPaymentSurchargeRule = z.infer<typeof insertPaymentSurchargeRuleSchema>;
export type ChargeSurchargePeriod = typeof charge_surcharge_periods.$inferSelect;
export type InsertChargeSurchargePeriod = z.infer<typeof insertChargeSurchargePeriodSchema>;

// ── SEGUIMIENTO DE ACCIONES ──────────────────────────────────────────────────
// SUPER ADMIN PLATFORM MANAGEMENT TABLES
// ─────────────────────────────────────────────────────────────────────────────

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

// ── CONFIGURACIÓN INSTITUCIONAL ───────────────────────────────────────────────
// SISTEMA DE VALIDACIÓN Y APROBACIÓN
// ─────────────────────────────────────────────────────────────────────────────

// PENDING APPROVALS (Sistema de validación para cambios críticos)
export const pending_approvals = pgTable("pending_approvals", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  requested_by: integer("requested_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  approved_by: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  action_type: varchar("action_type", { length: 100 }).notNull(), // 'modify_scholarship', 'modify_late_fee', 'modify_price', 'modify_payment_due_date', 'delete_concept', 'modify_concept'
  action_description: text("action_description").notNull(), // Descripción legible de la acción a aprobar
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
  notes: text("notes"), // Detalles adicionales de la acción
  additional_data: text("additional_data"), // Datos adicionales en formato JSON
  previous_status: varchar("previous_status", { length: 50 }),
  new_status: varchar("new_status", { length: 50 }),
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

// Insert schema for institutional credentials
export const insertInstitutionalCredentialSchema = createInsertSchema(institutional_credentials).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// Types for institutional credentials
export type InstitutionalCredential = typeof institutional_credentials.$inferSelect;
export type InsertInstitutionalCredential = z.infer<typeof insertInstitutionalCredentialSchema>;

// ── NÚCLEO DE FAMILIA ─────────────────────────────────────────────────────────
/**
 * Familia: unidad de cobro consolidada.
 * El saldo NUNCA se almacena aquí — siempre se calcula desde payment_applications.
 */
export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  campus_id: integer("campus_id").references(() => campuses.id, { onDelete: "cascade" }).notNull(),
  nombre: varchar("nombre", { length: 300 }).notNull(),
  clabe_virtual: varchar("clabe_virtual", { length: 18 }), // Placeholder; CLABE real en fase posterior
  guardian_id_principal: integer("guardian_id_principal").references(() => guardians.id),
  status: varchar("status", { length: 20 }).default("activo").notNull(),
  archived_at: timestamp("archived_at", { withTimezone: true }),
  archived_by: integer("archived_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export type Family = typeof families.$inferSelect;
export type InsertFamily = typeof families.$inferInsert;

/**
 * Saldo a favor de una familia.
 * Se genera cuando caja cobra más de lo adeudado (excedente de pago en efectivo)
 * o por ajustes administrativos.  La suma de registros activos de esta tabla
 * reduce el saldo pendiente neto de la familia.
 */
export const family_credits = pgTable("family_credits", {
  id:              serial("id").primaryKey(),
  tenant_id:       integer("tenant_id").references(() => tenants.id).notNull(),
  campus_id:       integer("campus_id").notNull(),
  /** Si el alumno pertenece a una familia registrada se guarda aquí. */
  family_id:       integer("family_id").references(() => families.id),
  /** Siempre se guarda el student_id del alumno que originó el crédito. */
  student_id:      integer("student_id").references(() => students.id),
  /** Pago de caja que generó el excedente. NUNCA se modifica. */
  payment_id:      integer("payment_id").references(() => payments.id),
  /** Monto del crédito. INMUTABLE — nunca se decrementa ni borra. */
  amount_centavos: bigint("amount_centavos", { mode: "number" }).notNull(),
  origen:          varchar("origen", { length: 50 }).default("excedente_caja").notNull(),
  descripcion:     text("descripcion"),
  /**
   * 'activo'   — crédito disponible, aún no aplicado a ningún cargo.
   * 'consumido' — crédito ya aplicado; ver consumed_application_id para el registro del ledger.
   */
  status:          varchar("status", { length: 20 }).default("activo").notNull(),
  /**
   * Cuando status='consumido', apunta a la PaymentApplication que se creó
   * contra el cargo nuevo usando el payment_id original.
   * Así el ledger es 100% trazable desde charges → payment_applications.
   */
  consumed_application_id: integer("consumed_application_id").references(() => payment_applications.id),
  consumed_at:     timestamp("consumed_at"),
  created_at:      timestamp("created_at").defaultNow(),
}, () => [
  // Refleja el CHECK real de DB — no genera migración nueva, solo documenta.
  check("family_credits_amount_centavos_check", sql`(amount_centavos > 0)`),
]);
export type FamilyCredit = typeof family_credits.$inferSelect;
export type InsertFamilyCredit = typeof family_credits.$inferInsert;

/** Relación familia ↔ alumnos */
export const family_students = pgTable("family_students", {
  family_id: integer("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }).notNull(),
}, (table) => ({ pk: primaryKey({ columns: [table.family_id, table.student_id] }) }));

/**
 * Tabla puente de aplicaciones de pago.
 * Un pago puede cubrir parcialmente uno o varios cargos.
 * La suma de payment_applications por charge_id define cuánto está pagado de ese cargo.
 */
export const payment_applications = pgTable("payment_applications", {
  id: serial("id").primaryKey(),
  payment_id: integer("payment_id").references(() => payments.id, { onDelete: "cascade" }).notNull(),
  charge_id: integer("charge_id").references(() => charges.id, { onDelete: "cascade" }).notNull(),
  amount_centavos: bigint("amount_centavos", { mode: "number" }).notNull(),
  applied_at: timestamp("applied_at").defaultNow().notNull(),
});
export type PaymentApplication = typeof payment_applications.$inferSelect;
export type InsertPaymentApplication = typeof payment_applications.$inferInsert;

/**
 * Registro crudo de webhooks/eventos de pasarela de pagos.
 * La constraint UNIQUE (provider, provider_event_id) garantiza idempotencia.
 */
export const payment_events = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // 'conekta', 'stripe', 'spei', 'oxxo'
  provider_event_id: varchar("provider_event_id", { length: 255 }).notNull(), // ID único del evento en el proveedor
  payload: text("payload"), // JSON raw del webhook
  processed_at: timestamp("processed_at"),
  status: varchar("status", { length: 20 }).default("received").notNull(), // 'received', 'processed', 'failed', 'duplicate'
  error_message: text("error_message"),
  created_at: timestamp("created_at").defaultNow(),
});
export type PaymentEvent = typeof payment_events.$inferSelect;
export type InsertPaymentEvent = typeof payment_events.$inferInsert;

// ── TRANSACCIONES BANCARIAS (Conciliación SPEI) ──────────────────────────────
export const bank_transactions = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  fecha: date("fecha").notNull(),
  descripcion: text("descripcion"),
  monto_centavos: bigint("monto_centavos", { mode: "number" }).notNull(),
  tipo: varchar("tipo", { length: 10 }).default("credito"),
  referencia: varchar("referencia", { length: 255 }),
  clabe_ordenante: varchar("clabe_ordenante", { length: 18 }),
  nombre_ordenante: varchar("nombre_ordenante", { length: 255 }),
  estado_conciliacion: varchar("estado_conciliacion", { length: 20 }).default("pendiente"),
  charge_id: integer("charge_id").references(() => charges.id),
  payment_id: integer("payment_id").references(() => payments.id),
  nota_conciliacion: text("nota_conciliacion"),
  // Motor de confianza porcentual (migración 014).
  // NULL = conciliado antes de esta migración (sin score retroactivo).
  // 0–69 = aclaración manual; 70–89 = revisión sugerida;
  // 90–99 = auto+auditoría; 100 = auto sin revisión.
  confianza_pct: smallint("confianza_pct"),
  // Timestamp de conciliación. DB: TIMESTAMPTZ (nullable, sin default).
  conciliado_at: timestamp("conciliado_at", { withTimezone: true }),
  created_at: timestamp("created_at").defaultNow(),
});
export type BankTransaction = typeof bank_transactions.$inferSelect;

// ── CLABEs conocidas por familia (motor de confianza — migración 013) ─────────
// Acumula las CLABEs de origen de SPEIs conciliados exitosamente.
// applyReconciliation() hace upsert aquí en TODA conciliación, sin excepción,
// para que incluso las conciliaciones manuales (70-89%) bootstrapeen el
// aprendizaje. STRIPE_SECRET_KEY nunca va aquí ni en ninguna tabla.
export const family_payment_sources = pgTable("family_payment_sources", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  family_id: integer("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  clabe: varchar("clabe", { length: 18 }).notNull(),
  nombre_inferido: varchar("nombre_inferido", { length: 255 }),
  confirmaciones: integer("confirmaciones").notNull().default(1),
  // DB: TIMESTAMPTZ — withTimezone:true para coincidir con information_schema
  primera_vez_at: timestamp("primera_vez_at", { withTimezone: true }).defaultNow(),
  ultima_vez_at: timestamp("ultima_vez_at", { withTimezone: true }).defaultNow(),
});
export type FamilyPaymentSource = typeof family_payment_sources.$inferSelect;

// ── PLANES DE PAGO NEGOCIADOS (Convenios) ────────────────────────────────────
export const payment_plans = pgTable("payment_plans", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  student_id: integer("student_id").references(() => students.id),
  guardian_id: integer("guardian_id").references(() => guardians.id),
  total_adeudo_centavos: bigint("total_adeudo_centavos", { mode: "number" }).notNull(),
  monto_inicial_centavos: bigint("monto_inicial_centavos", { mode: "number" }).default(0),
  numero_pagos: integer("numero_pagos").notNull(),
  frecuencia: varchar("frecuencia", { length: 20 }).default("mensual"),
  fecha_inicio: date("fecha_inicio").notNull(),
  estado: varchar("estado", { length: 20 }).default("activo"),
  // ADR-002: tipo_origen distingue reestructuración de acuerdo a futuro
  tipo_origen: varchar("tipo_origen", { length: 20 }).default("futuro"),
  // ADR-002: referencia histórica inmutable de los charges cancelados en Modo A
  charge_ids_origen: jsonb("charge_ids_origen"),
  observaciones: text("observaciones"),
  created_by: integer("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
});
export type PaymentPlan = typeof payment_plans.$inferSelect;

export const payment_plan_installments = pgTable("payment_plan_installments", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id").references(() => payment_plans.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(),
  monto_centavos: bigint("monto_centavos", { mode: "number" }).notNull(),
  fecha_vencimiento: date("fecha_vencimiento").notNull(),
  fecha_pago: date("fecha_pago"),
  estado: varchar("estado", { length: 20 }).default("pendiente"),
});
export type PaymentPlanInstallment = typeof payment_plan_installments.$inferSelect;

// ── REGLAS AUTOMÁTICAS DE BECAS ──────────────────────────────────────────────
export const scholarship_auto_rules = pgTable("scholarship_auto_rules", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  condicion_json: text("condicion_json"),
  descuento_porcentaje: numeric("descuento_porcentaje", { precision: 5, scale: 2 }).notNull(),
  aplica_a: varchar("aplica_a", { length: 50 }).default("todos"),
  activo: boolean("activo").default(true),
  ciclo_escolar: varchar("ciclo_escolar", { length: 50 }),
  vigencia_inicio: date("vigencia_inicio"),
  vigencia_fin: date("vigencia_fin"),
  created_at: timestamp("created_at").defaultNow(),
});
export type ScholarshipAutoRule = typeof scholarship_auto_rules.$inferSelect;

export const scholarship_auto_assignments = pgTable("scholarship_auto_assignments", {
  id: serial("id").primaryKey(),
  rule_id: integer("rule_id").notNull().references(() => scholarship_auto_rules.id, { onDelete: "cascade" }),
  scholarship_id: integer("scholarship_id").references(() => scholarships.id, { onDelete: "set null" }),
  student_id: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  campus_id: integer("campus_id").notNull().references(() => campuses.id),
  tenant_id: integer("tenant_id").notNull().references(() => tenants.id),
  ciclo_escolar: varchar("ciclo_escolar", { length: 50 }).notNull(),
  porcentaje_aplicado: numeric("porcentaje_aplicado", { precision: 5, scale: 2 }).notNull(),
  porcentaje_manual: numeric("porcentaje_manual", { precision: 5, scale: 2 }),
  estado: varchar("estado", { length: 40 }).notNull().default("aplicada"),
  motivo_resultado: varchar("motivo_resultado", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export type ScholarshipAutoAssignment = typeof scholarship_auto_assignments.$inferSelect;

export const charge_scholarship_applications = pgTable("charge_scholarship_applications", {
  id: serial("id").primaryKey(),
  charge_id: integer("charge_id").notNull().references(() => charges.id, { onDelete: "cascade" }),
  scholarship_id: integer("scholarship_id").notNull().references(() => scholarships.id, { onDelete: "cascade" }),
  tenant_id: integer("tenant_id").notNull().references(() => tenants.id),
  effective_percentage: numeric("effective_percentage", { precision: 5, scale: 2 }).notNull(),
  source: varchar("source", { length: 20 }).notNull().default("automatico"),
  applied_at: timestamp("applied_at").defaultNow(),
  recalculated_at: timestamp("recalculated_at").defaultNow(),
});
export type ChargeScholarshipApplication = typeof charge_scholarship_applications.$inferSelect;

// ── CALENDARIO FINANCIERO ─────────────────────────────────────────────────────
export const financial_events = pgTable("financial_events", {
  id: serial("id").primaryKey(),
  campus_id: integer("campus_id").references(() => campuses.id),
  tenant_id: integer("tenant_id").references(() => tenants.id),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descripcion: text("descripcion"),
  fecha: date("fecha").notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  urgencia: varchar("urgencia", { length: 20 }).default("normal"),
  completado: boolean("completado").default(false),
  created_at: timestamp("created_at").defaultNow(),
});
export type FinancialEvent = typeof financial_events.$inferSelect;

// ── MAGIC LINK TOKENS (Portal de padres sin contraseña) ──────────────────────
export const magic_link_tokens = pgTable("magic_link_tokens", {
  id:         serial("id").primaryKey(),
  tenant_id:  integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  guardian_id: integer("guardian_id").references(() => guardians.id, { onDelete: "cascade" }).notNull(),
  token:      varchar("token", { length: 128 }).notNull().unique(),
  // DB: TIMESTAMPTZ — withTimezone:true para coincidir con information_schema
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  uses:       integer("uses").default(0).notNull(),
  max_uses:   integer("max_uses").default(3).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_by: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type MagicLinkToken = typeof magic_link_tokens.$inferSelect;

// ── AUDIT LOG (Inmutable) ─────────────────────────────────────────────────────
/**
 * Registro de auditoría inmutable para acciones financieras sensibles.
 * RLS: solo INSERT; UPDATE y DELETE bloqueados a nivel de base de datos.
 * Nunca borres ni actualices registros de esta tabla desde el código.
 */
// ── ACCIONES DE SEGUIMIENTO — Motor genérico de workflow ─────────────────────
// Tabla polimórfica para rastrear hallazgos detectados por el sistema y su
// resolución: desde excepciones de conciliación hasta riesgos financieros.
// La fuente de verdad del estado real (ej. estado_conciliacion en bank_transactions)
// no se duplica aquí; acciones_seguimiento es la capa de gestión encima.

export const accion_status_enum = pgEnum("accion_status", [
  "pendiente",    // detectado, sin responsable asignado
  "asignado",     // responsable designado, aún no inicia
  "en_progreso",  // responsable marcó inicio de trabajo
  "resuelto",     // cierre exitoso con acción efectiva
  "ignorado",     // cerrado deliberadamente sin resolver
  "escalado",     // reasignado a nivel superior
]);

export const acciones_seguimiento = pgTable("acciones_seguimiento", {
  id:               serial("id").primaryKey(),
  tenant_id:        integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campus_id:        integer("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
  // Referencia polimórfica (patrón audit_log, sin FK rígida para extensibilidad)
  entity_type:      varchar("entity_type", { length: 50 }).notNull(),
  entity_id:        integer("entity_id").notNull(),
  // Tipo: varchar + check constraint en DB (extensible sin migrar el pgEnum)
  tipo_hallazgo:    varchar("tipo_hallazgo", { length: 50 }).notNull(),
  status:           accion_status_enum("status").notNull().default("pendiente"),
  titulo:           varchar("titulo", { length: 255 }).notNull(),
  descripcion:      text("descripcion"),
  assigned_to:      integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
  resolution_notes: text("resolution_notes"),
  metadata:         jsonb("metadata"),
  created_by:       integer("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at:       timestamp("created_at").defaultNow().notNull(),
  assigned_at:      timestamp("assigned_at"),
  started_at:       timestamp("started_at"),
  resolved_at:      timestamp("resolved_at"),
  escalated_at:     timestamp("escalated_at"),
}, () => [
  // Refleja el CHECK real de DB — no genera migración nueva, solo documenta.
  check(
    "acciones_seguimiento_tipo_hallazgo_check",
    sql`((tipo_hallazgo)::text = ANY ((ARRAY['excepcion_conciliacion'::character varying, 'riesgo_financiero'::character varying, 'override_condonacion'::character varying, 'pago_manual_sugerido'::character varying, 'cfdi_sin_timbrar'::character varying, 'otro'::character varying])::text[]))`,
  ),
]);
export type AccionSeguimiento       = typeof acciones_seguimiento.$inferSelect;
export type InsertAccionSeguimiento = typeof acciones_seguimiento.$inferInsert;

export const audit_log = pgTable("audit_log", {
  id:              serial("id").primaryKey(),
  tenant_id:       integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  user_id:         integer("user_id").references(() => users.id, { onDelete: "set null" }),       // null si acción de sistema/guardian
  guardian_id:     integer("guardian_id").references(() => guardians.id, { onDelete: "set null" }), // null si acción de admin
  action:          varchar("action", { length: 100 }).notNull(),         // 'charge.status_changed', 'payment.confirmed', etc.
  entity_type:     varchar("entity_type", { length: 50 }).notNull(),     // 'charge', 'payment', 'invoice'
  entity_id:       integer("entity_id").notNull(),
  previous_value:  text("previous_value"),  // JSON del estado/valor anterior
  new_value:       text("new_value"),       // JSON del estado/valor nuevo
  ip_address:      varchar("ip_address", { length: 45 }),
  metadata:        text("metadata"),        // JSON con contexto adicional (monto, alumno, etc.)
  created_at:      timestamp("created_at").defaultNow().notNull(),
});
export type AuditLogEntry = typeof audit_log.$inferSelect;
export type InsertAuditLogEntry = typeof audit_log.$inferInsert;

// ── CRM PROSPECTOS (tabla existente en DB — creada en 001_create_missing_tables.sql) ──────
// Usada por GET/POST /api/crm/prospects en server/routes/misc.ts.
// Sin FK explícita en DB; campus_id filtra por campus del usuario autenticado.
export const crm_prospects = pgTable("crm_prospects", {
  id:            serial("id").primaryKey(),
  campus_id:     integer("campus_id").notNull(),
  nombre:        varchar("nombre", { length: 200 }).notNull(),
  email:         varchar("email", { length: 200 }),
  telefono:      varchar("telefono", { length: 30 }),
  nivel_interes: varchar("nivel_interes", { length: 20 }).default("medio"),
  nivel_escolar: varchar("nivel_escolar", { length: 50 }),
  notas:         text("notas"),
  status:        varchar("status", { length: 30 }).default("interested"),
  created_at:    timestamp("created_at").defaultNow(),
});
export type CrmProspect = typeof crm_prospects.$inferSelect;

// ── PROYECTOS DE MIGRACIÓN (tabla existente en DB — creada en 001_create_missing_tables.sql) ──
// Usada por GET /api/migration/projects y GET /api/migration/project/:id en payments.ts.
// Sin FK explícita en DB; campus_id filtra por campus del usuario autenticado.
export const migration_projects = pgTable("migration_projects", {
  id:         serial("id").primaryKey(),
  campus_id:  integer("campus_id").notNull(),
  nombre:     varchar("nombre", { length: 200 }).notNull(),
  estado:     varchar("estado", { length: 30 }).default("pendiente"),
  tipo:       varchar("tipo", { length: 50 }),
  created_at: timestamp("created_at").defaultNow(),
});
export type MigrationProject = typeof migration_projects.$inferSelect;
