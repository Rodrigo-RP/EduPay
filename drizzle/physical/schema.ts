import { pgTable, index, foreignKey, unique, check, serial, integer, date, text, jsonb, timestamp, varchar, boolean, bigint, numeric, pgPolicy, uniqueIndex, smallint, time, bigserial, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const accionStatus = pgEnum("accion_status", ['pendiente', 'asignado', 'en_progreso', 'resuelto', 'ignorado', 'escalado'])


export const chargeSurchargePeriods = pgTable("charge_surcharge_periods", {
	id: serial().primaryKey().notNull(),
	chargeId: integer("charge_id").notNull(),
	paymentRuleId: integer("payment_rule_id"),
	tenantId: integer("tenant_id").notNull(),
	campusId: integer("campus_id").notNull(),
	periodoMes: date("periodo_mes").notNull(),
	modoAcumulacion: text("modo_acumulacion").notNull(),
	saldoBaseCentavos: integer("saldo_base_centavos").notNull(),
	recargoAnteriorCentavos: integer("recargo_anterior_centavos").notNull(),
	incrementoCentavos: integer("incremento_centavos").notNull(),
	recargoTotalCentavos: integer("recargo_total_centavos").notNull(),
	formulaDetalle: jsonb("formula_detalle").default({}).notNull(),
	aplicadoAt: timestamp("aplicado_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
index("idx_charge_surcharge_periods_scope").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.periodoMes.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "charge_surcharge_periods_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [charges.id],
			name: "charge_surcharge_periods_charge_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.paymentRuleId],
			foreignColumns: [paymentSurchargeRules.id],
			name: "charge_surcharge_periods_payment_rule_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "charge_surcharge_periods_tenant_id_fkey"
		}),
	unique("charge_surcharge_periods_charge_month_unique").on(table.chargeId, table.periodoMes),
	check("charge_surcharge_periods_incremento_centavos_check", sql`incremento_centavos >= 0`),
	check("charge_surcharge_periods_modo_acumulacion_check", sql`modo_acumulacion = ANY (ARRAY['ninguno'::text, 'incremento_fijo'::text, 'compuesto'::text])`),
	check("charge_surcharge_periods_recargo_anterior_centavos_check", sql`recargo_anterior_centavos >= 0`),
	check("charge_surcharge_periods_recargo_total_centavos_check", sql`recargo_total_centavos >= 0`),
	check("charge_surcharge_periods_saldo_base_centavos_check", sql`saldo_base_centavos >= 0`),
]);

export const paymentDueDatePeriods = pgTable("payment_due_date_periods", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	campusId: integer("campus_id").notNull(),
	conceptId: integer("concept_id").notNull(),
	cicloEscolar: varchar("ciclo_escolar", { length: 50 }).notNull(),
	periodoClave: varchar("periodo_clave", { length: 50 }).notNull(),
	fechaInicio: date("fecha_inicio").notNull(),
	fechaFin: date("fecha_fin").notNull(),
	fechaVencimiento: date("fecha_vencimiento").notNull(),
	activo: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
index("idx_payment_due_date_periods_scope").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.conceptId.asc().nullsLast().op("int4_ops"), table.cicloEscolar.asc().nullsLast().op("text_ops"), table.activo.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "payment_due_date_periods_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conceptId],
			foreignColumns: [concepts.id],
			name: "payment_due_date_periods_concept_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payment_due_date_periods_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("payment_due_date_periods_unique").on(table.tenantId, table.campusId, table.conceptId, table.cicloEscolar, table.periodoClave),
	check("payment_due_date_periods_dates_check", sql`fecha_fin >= fecha_inicio`),
]);

export const familyCredits = pgTable("family_credits", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	campusId: integer("campus_id").notNull(),
	familyId: integer("family_id"),
	studentId: integer("student_id"),
	paymentId: integer("payment_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCentavos: bigint("amount_centavos", { mode: "number" }).notNull(),
	origen: varchar({ length: 50 }).default('excedente_caja').notNull(),
	descripcion: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	status: varchar({ length: 20 }).default('activo').notNull(),
	consumedApplicationId: integer("consumed_application_id"),
	consumedAt: timestamp("consumed_at", { mode: 'string' }),
}, (table) => [
	index("idx_family_credits_family").using("btree", table.familyId.asc().nullsLast().op("int4_ops")),
	index("idx_family_credits_payment").using("btree", table.paymentId.asc().nullsLast().op("int4_ops")),
	index("idx_family_credits_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_family_credits_student").using("btree", table.studentId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.consumedApplicationId],
			foreignColumns: [paymentApplications.id],
			name: "family_credits_consumed_application_id_fkey"
		}),
	foreignKey({
			columns: [table.familyId],
			foreignColumns: [families.id],
			name: "family_credits_family_id_fkey"
		}),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "family_credits_payment_id_fkey"
		}),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "family_credits_student_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "family_credits_tenant_id_fkey"
		}),
	check("family_credits_amount_centavos_check", sql`amount_centavos > 0`),
]);

export const scholarshipCriteria = pgTable("scholarship_criteria", {
	id: serial().primaryKey().notNull(),
	scholarshipTypeId: integer("scholarship_type_id"),
	criterio: varchar({ length: 100 }).notNull(),
	valorMinimo: numeric("valor_minimo", { precision: 10, scale:  2 }),
	valorMaximo: numeric("valor_maximo", { precision: 10, scale:  2 }),
	obligatorio: boolean().default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.scholarshipTypeId],
			foreignColumns: [scholarshipTypes.id],
			name: "scholarship_criteria_scholarship_type_id_fkey"
		}).onDelete("cascade"),
]);

export const families = pgTable("families", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	campusId: integer("campus_id").notNull(),
	nombre: varchar({ length: 300 }).notNull(),
	clabeVirtual: varchar("clabe_virtual", { length: 18 }),
	guardianIdPrincipal: integer("guardian_id_principal"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	status: varchar({ length: 20 }).default('activo').notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	archivedBy: integer("archived_by"),
}, (table) => [
	index("idx_families_campus").using("btree", table.campusId.asc().nullsLast().op("int4_ops")),
	index("idx_families_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
index("idx_families_tenant_campus_status").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.archivedBy],
			foreignColumns: [users.id],
			name: "families_archived_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "families_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.guardianIdPrincipal],
			foreignColumns: [guardians.id],
			name: "families_guardian_id_principal_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "families_tenant_id_fkey"
		}).onDelete("cascade"),
	check("families_status_check", sql`(status)::text = ANY ((ARRAY['activo'::character varying, 'archivada'::character varying])::text[])`),
]);

export const scholarshipBenefits = pgTable("scholarship_benefits", {
	id: serial().primaryKey().notNull(),
	scholarshipTypeId: integer("scholarship_type_id"),
	tipoBeneficio: varchar("tipo_beneficio", { length: 50 }).notNull(),
	porcentajeDescuento: integer("porcentaje_descuento"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoFijoCentavos: bigint("monto_fijo_centavos", { mode: "number" }),
aplicaConceptos: text("aplica_conceptos").array().default(sql`ARRAY['colegiatura'::text]`),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	limiteMaximoCentavos: bigint("limite_maximo_centavos", { mode: "number" }),
	vigenciaMeses: integer("vigencia_meses").default(12),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.scholarshipTypeId],
			foreignColumns: [scholarshipTypes.id],
			name: "scholarship_benefits_scholarship_type_id_fkey"
		}).onDelete("cascade"),
]);

export const systemHealth = pgTable("system_health", {
	id: serial().primaryKey().notNull(),
	serviceName: varchar("service_name", { length: 100 }).notNull(),
	status: varchar({ length: 20 }).notNull(),
	responseTimeMs: integer("response_time_ms"),
	errorMessage: text("error_message"),
	checkedAt: timestamp("checked_at", { mode: 'string' }).defaultNow(),
});

export const products = pgTable("products", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	tenantId: integer("tenant_id").notNull(),
	codigo: varchar({ length: 50 }).notNull(),
	nombre: varchar({ length: 255 }).notNull(),
	descripcion: text(),
	categoria: varchar({ length: 50 }).notNull(),
	unidadMedida: varchar("unidad_medida", { length: 20 }).default('SERVICIO').notNull(),
	claveSat: varchar("clave_sat", { length: 20 }),
	activo: boolean().default(true).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	precioKinder: bigint("precio_kinder", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	precioPrimaria: bigint("precio_primaria", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	precioSecundaria: bigint("precio_secundaria", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	precioBachillerato: bigint("precio_bachillerato", { mode: "number" }).default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_products_campus").using("btree", table.campusId.asc().nullsLast().op("int4_ops")),
	index("idx_products_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "products_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "products_tenant_id_fkey"
		}),
	unique("products_campus_codigo_unique").on(table.campusId, table.codigo),
]);

export const auditLog = pgTable("audit_log", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	userId: integer("user_id"),
	guardianId: integer("guardian_id"),
	action: varchar({ length: 100 }).notNull(),
	entityType: varchar("entity_type", { length: 50 }).notNull(),
	entityId: integer("entity_id").notNull(),
	previousValue: text("previous_value"),
	newValue: text("new_value"),
	ipAddress: varchar("ip_address", { length: 45 }),
	metadata: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_audit_log_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
index("idx_audit_log_entity").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	index("idx_audit_log_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	index("idx_audit_log_user").using("btree", table.userId.asc().nullsLast().op("int4_ops")).where(sql`(user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.guardianId],
			foreignColumns: [guardians.id],
			name: "audit_log_guardian_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "audit_log_tenant_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "audit_log_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("audit_log_no_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`false` }),
pgPolicy("audit_log_no_update", { as: "permissive", for: "update", to: ["public"], using: sql`false` }),
pgPolicy("audit_log_insert_policy", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true` }),
pgPolicy("audit_log_select_policy", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
]);

export const charges = pgTable("charges", {
	id: serial().primaryKey().notNull(),
	studentId: integer("student_id"),
	conceptId: integer("concept_id"),
	cicloEscolar: varchar("ciclo_escolar", { length: 50 }),
	fechaEmision: date("fecha_emision").notNull(),
	fechaVencimiento: date("fecha_vencimiento").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoBaseCentavos: bigint("monto_base_centavos", { mode: "number" }).notNull(),
	becaAplicada: numeric("beca_aplicada", { precision: 5, scale:  2 }).default('0.00'),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	recargoAplicadoCentavos: bigint("recargo_aplicado_centavos", { mode: "number" }).default(0),
	estado: varchar({ length: 50 }).default('pendiente'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	planId: integer("plan_id"),
	esAdeudoMigrado: boolean("es_adeudo_migrado").default(false).notNull(),
	descripcion: text(),
	manualOverride: boolean("manual_override").default(false).notNull(),
	manualOverrideReason: text("manual_override_reason"),
}, (table) => [
	foreignKey({
			columns: [table.conceptId],
			foreignColumns: [concepts.id],
			name: "charges_concept_id_concepts_id_fk"
		}),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [paymentPlans.id],
			name: "charges_plan_id_fkey"
		}),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "charges_student_id_students_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "charges_tenant_id_fkey"
		}),
	pgPolicy("tenant_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`, withCheck: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`  }),
]);

export const magicLinkTokens = pgTable("magic_link_tokens", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	guardianId: integer("guardian_id").notNull(),
	token: varchar({ length: 128 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	uses: integer().default(0).notNull(),
	maxUses: integer("max_uses").default(3).notNull(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_magic_link_tokens_guardian_active").using("btree", table.guardianId.asc().nullsLast().op("int4_ops")).where(sql`(revoked_at IS NULL)`),
	unique("magic_link_tokens_token_key").on(table.token),
]);

export const paymentApplications = pgTable("payment_applications", {
	id: serial().primaryKey().notNull(),
	paymentId: integer("payment_id").notNull(),
	chargeId: integer("charge_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCentavos: bigint("amount_centavos", { mode: "number" }).notNull(),
	appliedAt: timestamp("applied_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_payment_applications_charge").using("btree", table.chargeId.asc().nullsLast().op("int4_ops")),
	index("idx_payment_applications_payment").using("btree", table.paymentId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [charges.id],
			name: "payment_applications_charge_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "payment_applications_payment_id_fkey"
		}).onDelete("cascade"),
]);

export const institutionalSettings = pgTable("institutional_settings", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	tenantId: integer("tenant_id").notNull(),
	rfc: varchar({ length: 13 }),
	direccionFiscal: text("direccion_fiscal"),
	ciudad: varchar({ length: 100 }),
	codigoPostal: varchar("codigo_postal", { length: 10 }),
	telefonoPrincipal: varchar("telefono_principal", { length: 20 }),
	emailInstitucional: varchar("email_institucional", { length: 255 }),
	sitioWeb: varchar("sitio_web", { length: 255 }),
	nombreLegal: varchar("nombre_legal", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	logoUrl: text("logo_url"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "institutional_settings_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "institutional_settings_tenant_id_fkey"
		}).onDelete("cascade"),
]);

export const campusPaymentConfig = pgTable("campus_payment_config", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	tenantId: integer("tenant_id").notNull(),
	paymentProvider: varchar("payment_provider", { length: 50 }).default('stripe').notNull(),
	stripeAccountId: varchar("stripe_account_id", { length: 255 }),
	chargesEnabled: boolean("charges_enabled").default(false).notNull(),
	payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
	detailsSubmitted: boolean("details_submitted").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_campus_payment_config_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "campus_payment_config_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "campus_payment_config_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("campus_payment_config_campus_id_unique").on(table.campusId),
]);

export const bankTransactions = pgTable("bank_transactions", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	fecha: date().notNull(),
	descripcion: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
	tipo: varchar({ length: 10 }).default('credito'),
	referencia: varchar({ length: 255 }),
	clabeOrdenante: varchar("clabe_ordenante", { length: 18 }),
	nombreOrdenante: varchar("nombre_ordenante", { length: 255 }),
	estadoConciliacion: varchar("estado_conciliacion", { length: 20 }).default('pendiente'),
	chargeId: integer("charge_id"),
	paymentId: integer("payment_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	notaConciliacion: text("nota_conciliacion"),
	confianzaPct: smallint("confianza_pct"),
	conciliadoAt: timestamp("conciliado_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
uniqueIndex("bank_transactions_dedup").using("btree", table.campusId.asc().nullsLast().op("int4_ops"), table.fecha.asc().nullsLast().op("date_ops"), table.montoCentavos.asc().nullsLast().op("int8_ops"), table.referencia.asc().nullsLast().op("text_ops")).where(sql`(referencia IS NOT NULL)`),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "bank_transactions_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [charges.id],
			name: "bank_transactions_charge_id_fkey"
		}),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "bank_transactions_payment_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "bank_transactions_tenant_id_fkey"
		}),
]);

export const paymentPlanInstallments = pgTable("payment_plan_installments", {
	id: serial().primaryKey().notNull(),
	planId: integer("plan_id"),
	numero: integer().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
	fechaVencimiento: date("fecha_vencimiento").notNull(),
	fechaPago: date("fecha_pago"),
	estado: varchar({ length: 20 }).default('pendiente'),
}, (table) => [
	foreignKey({
			columns: [table.planId],
			foreignColumns: [paymentPlans.id],
			name: "payment_plan_installments_plan_id_fkey"
		}).onDelete("cascade"),
]);

export const paymentPlans = pgTable("payment_plans", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	studentId: integer("student_id"),
	guardianId: integer("guardian_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalAdeudoCentavos: bigint("total_adeudo_centavos", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoInicialCentavos: bigint("monto_inicial_centavos", { mode: "number" }).default(0),
	numeroPagos: integer("numero_pagos").notNull(),
	frecuencia: varchar({ length: 20 }).default('mensual'),
	fechaInicio: date("fecha_inicio").notNull(),
	estado: varchar({ length: 20 }).default('activo'),
	observaciones: text(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	tipoOrigen: varchar("tipo_origen", { length: 20 }).default('futuro'),
	chargeIdsOrigen: jsonb("charge_ids_origen"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "payment_plans_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "payment_plans_created_by_fkey"
		}),
	foreignKey({
			columns: [table.guardianId],
			foreignColumns: [guardians.id],
			name: "payment_plans_guardian_id_fkey"
		}),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "payment_plans_student_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payment_plans_tenant_id_fkey"
		}),
]);

export const scholarshipAutoRules = pgTable("scholarship_auto_rules", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	nombre: varchar({ length: 255 }).notNull(),
	tipo: varchar({ length: 50 }).notNull(),
	condicionJson: text("condicion_json"),
	descuentoPorcentaje: numeric("descuento_porcentaje", { precision: 5, scale:  2 }).notNull(),
	aplicaA: varchar("aplica_a", { length: 50 }).default('todos'),
	activo: boolean().default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	cicloEscolar: varchar("ciclo_escolar", { length: 50 }),
	vigenciaInicio: date("vigencia_inicio"),
	vigenciaFin: date("vigencia_fin"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "scholarship_auto_rules_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "scholarship_auto_rules_tenant_id_fkey"
		}),
]);

export const crmProspects = pgTable("crm_prospects", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	nombre: varchar({ length: 200 }).notNull(),
	email: varchar({ length: 200 }),
	telefono: varchar({ length: 30 }),
	nivelInteres: varchar("nivel_interes", { length: 20 }).default('medio'),
	nivelEscolar: varchar("nivel_escolar", { length: 50 }),
	notas: text(),
	status: varchar({ length: 30 }).default('interested'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const migrationProjects = pgTable("migration_projects", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	nombre: varchar({ length: 200 }).notNull(),
	estado: varchar({ length: 30 }).default('pendiente'),
	tipo: varchar({ length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const paymentSurchargeRules = pgTable("payment_surcharge_rules", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	nombre: varchar({ length: 255 }).notNull(),
	tipo: varchar({ length: 50 }).notNull(),
	diasGracia: integer("dias_gracia").default(0),
	porcentaje: numeric({ precision: 5, scale:  2 }),
	montoFijoCentavos: integer("monto_fijo_centavos"),
	reglasProgresivas: text("reglas_progresivas"),
	aplicaFinesSemana: boolean("aplica_fines_semana").default(false),
	aplicaFestivos: boolean("aplica_festivos").default(false),
	montoMaximoCentavos: integer("monto_maximo_centavos"),
	activo: boolean().default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	concepto: text().default('Concepto general').notNull(),
	tenantId: integer("tenant_id"),
	conceptId: integer("concept_id"),
	modoAcumulacion: text("modo_acumulacion").default('ninguno').notNull(),
	tipoIncrementoMensual: text("tipo_incremento_mensual"),
	incrementoMensualCentavos: integer("incremento_mensual_centavos"),
	incrementoMensualPorcentaje: numeric("incremento_mensual_porcentaje", { precision: 5, scale:  2 }),
	fechaInicioAcumulacion: date("fecha_inicio_acumulacion"),
}, (table) => [
	index("idx_surcharge_rules_active_concept_scope").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.conceptId.asc().nullsLast().op("int4_ops")).where(sql`((activo = true) AND (concept_id IS NOT NULL))`),
	index("idx_surcharge_rules_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.conceptId],
			foreignColumns: [concepts.id],
			name: "payment_surcharge_rules_concept_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payment_surcharge_rules_tenant_id_fkey"
		}),
	check("payment_surcharge_rules_modo_acumulacion_check", sql`modo_acumulacion = ANY (ARRAY['ninguno'::text, 'incremento_fijo'::text, 'compuesto'::text])`),
	check("payment_surcharge_rules_tipo_check", sql`(tipo)::text = ANY (ARRAY[('porcentaje'::character varying)::text, ('fijo'::character varying)::text, ('progresivo'::character varying)::text])`),
	check("payment_surcharge_rules_tipo_incremento_mensual_check", sql`(tipo_incremento_mensual IS NULL) OR (tipo_incremento_mensual = ANY (ARRAY['monto'::text, 'porcentaje'::text]))`),
]);

export const guardians = pgTable("guardians", {
	id: serial().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	telefono: varchar({ length: 20 }),
	nombreCompleto: varchar("nombre_completo", { length: 255 }).notNull(),
	rfc: varchar({ length: 13 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	fotoUrl: text("foto_url"),
	correoInstitucionalFamiliar: varchar("correo_institucional_familiar", { length: 255 }),
	nombres: varchar({ length: 255 }),
	apellidoPaterno: varchar("apellido_paterno", { length: 255 }),
	apellidoMaterno: varchar("apellido_materno", { length: 255 }),
	curp: varchar({ length: 18 }),
	celular: varchar({ length: 20 }),
	telefonoCasaOficina: varchar("telefono_casa_oficina", { length: 20 }),
	tipoGuardian: varchar("tipo_guardian", { length: 20 }).default('padre'),
	esPadre: boolean("es_padre").default(false),
	esMadre: boolean("es_madre").default(false),
	campusId: integer("campus_id"),
	tenantId: integer("tenant_id"),
	passwordChangedAt: timestamp("password_changed_at", { withTimezone: true, mode: 'string' }),
	stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
	calle: varchar({ length: 255 }),
	numeroExterior: varchar("numero_exterior", { length: 30 }),
	numeroInterior: varchar("numero_interior", { length: 30 }),
	colonia: varchar({ length: 255 }),
	codigoPostal: varchar("codigo_postal", { length: 5 }),
	municipio: varchar({ length: 255 }),
	estado: varchar({ length: 100 }),
	contactoEmergenciaNombre: varchar("contacto_emergencia_nombre", { length: 255 }),
	contactoEmergenciaTelefono: varchar("contacto_emergencia_telefono", { length: 20 }),
	contactoEmergenciaRelacion: varchar("contacto_emergencia_relacion", { length: 100 }),
}, (table) => [
	index("idx_guardians_stripe_customer_id").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")).where(sql`(stripe_customer_id IS NOT NULL)`),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "guardians_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "guardians_tenant_id_fkey"
		}),
	pgPolicy("tenant_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`, withCheck: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`  }),
]);

export const paymentRules = pgTable("payment_rules", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	tenantId: integer("tenant_id"),
	name: text().notNull(),
	description: text(),
	ruleType: text("rule_type").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	gracePeriodDays: integer("grace_period_days").default(0).notNull(),
	gracePeriodUnit: text("grace_period_unit").default('days').notNull(),
	lateFeePercentage: numeric("late_fee_percentage", { precision: 5, scale:  2 }),
	lateFeeFixedAmountCentavos: integer("late_fee_fixed_amount_centavos"),
	progressiveRules: text("progressive_rules"),
	maxLateFeeCentavos: integer("max_late_fee_centavos"),
	minLateFeeCentavos: integer("min_late_fee_centavos"),
	compoundDaily: boolean("compound_daily").default(false).notNull(),
	appliesToWeekends: boolean("applies_to_weekends").default(false).notNull(),
	appliesToHolidays: boolean("applies_to_holidays").default(false).notNull(),
	appliesToConcepts: text("applies_to_concepts"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "payment_rules_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payment_rules_tenant_id_fkey"
		}).onDelete("cascade"),
]);

export const collectionActivities = pgTable("collection_activities", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	campusId: integer("campus_id").notNull(),
	chargeId: integer("charge_id").notNull(),
	studentId: integer("student_id").notNull(),
	createdBy: integer("created_by"),
	tipo: varchar({ length: 40 }).notNull(),
	estado: varchar({ length: 40 }).default('registrado').notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descripcion: text(),
	fechaProgramada: date("fecha_programada"),
	horaProgramada: time("hora_programada"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoCentavos: bigint("monto_centavos", { mode: "number" }),
	canal: varchar({ length: 30 }),
	prioridad: varchar({ length: 20 }),
	motivo: varchar({ length: 100 }),
	supervisor: varchar({ length: 255 }),
	urgencia: varchar({ length: 20 }),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_collection_activities_charge_created").using("btree", table.chargeId.asc().nullsLast().op("int4_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
index("idx_collection_activities_tenant_campus_created").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "collection_activities_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [charges.id],
			name: "collection_activities_charge_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "collection_activities_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "collection_activities_student_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "collection_activities_tenant_id_fkey"
		}).onDelete("cascade"),
	check("collection_activities_estado_check", sql`(estado)::text = ANY ((ARRAY['pendiente'::character varying, 'programado'::character varying, 'registrado'::character varying, 'iniciado'::character varying, 'enviado'::character varying, 'escalado'::character varying, 'prometido'::character varying])::text[])`),
	check("collection_activities_tipo_check", sql`(tipo)::text = ANY ((ARRAY['cobranza'::character varying, 'recordatorio'::character varying, 'promesa'::character varying, 'seguimiento'::character varying, 'nota'::character varying, 'escalacion'::character varying])::text[])`),
]);

export const auditRetryQueue = pgTable("audit_retry_queue", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	payload: jsonb().notNull(),
	attempts: integer().default(0).notNull(),
	maxAttempts: integer("max_attempts").default(3).notNull(),
	lastError: text("last_error"),
	status: varchar({ length: 20 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const paymentEvents = pgTable("payment_events", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	provider: varchar({ length: 50 }).notNull(),
	providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
	payload: text(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	status: varchar({ length: 20 }).default('received').notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_payment_events_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payment_events_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("uq_payment_events_provider").on(table.provider, table.providerEventId),
]);

export const invoices = pgTable("invoices", {
	id: serial().primaryKey().notNull(),
	paymentId: integer("payment_id"),
	uuidCfdi: varchar("uuid_cfdi", { length: 255 }),
	xmlUrl: text("xml_url"),
	pdfUrl: text("pdf_url"),
	estado: varchar({ length: 50 }).default('emitido'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	curpAlumno: varchar("curp_alumno", { length: 18 }),
	nivelEducativo: varchar("nivel_educativo", { length: 50 }),
	autRvoe: varchar("aut_rvoe", { length: 20 }),
	rfcPago: varchar("rfc_pago", { length: 13 }),
	usoCfdi: varchar("uso_cfdi", { length: 10 }).default('D10'),
	formaPago: varchar("forma_pago", { length: 2 }),
	claveProdServ: varchar("clave_prod_serv", { length: 20 }),
	claveUnidad: varchar("clave_unidad", { length: 10 }).default('E48'),
	xmlContent: text("xml_content"),
	pdfBase64: text("pdf_base64"),
}, (table) => [
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "invoices_payment_id_payments_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "invoices_tenant_id_fkey"
		}),
	pgPolicy("tenant_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`, withCheck: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`  }),
	check("invoices_curp_alumno_check", sql`(curp_alumno IS NULL) OR ((curp_alumno)::text ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[0-9A-Z][0-9]$'::text)`),
	check("invoices_forma_pago_check", sql`(forma_pago IS NULL) OR ((forma_pago)::text = ANY ((ARRAY['01'::character varying, '02'::character varying, '03'::character varying, '04'::character varying, '05'::character varying, '06'::character varying, '08'::character varying, '12'::character varying, '13'::character varying, '17'::character varying, '23'::character varying, '24'::character varying, '25'::character varying, '28'::character varying, '29'::character varying, '30'::character varying, '99'::character varying])::text[]))`),
	check("invoices_nivel_educativo_check", sql`(nivel_educativo IS NULL) OR ((nivel_educativo)::text = ANY ((ARRAY['Preescolar'::character varying, 'Primaria'::character varying, 'Secundaria'::character varying, 'Profesional técnico'::character varying, 'Bachillerato o su equivalente'::character varying])::text[]))`),
]);

export const cashClosures = pgTable("cash_closures", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	campusId: integer("campus_id").notNull(),
	closedByUserId: integer("closed_by_user_id").notNull(),
	fecha: date().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	efectivoCapturadoCentavos: bigint("efectivo_capturado_centavos", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	efectivoRegistradoCentavos: bigint("efectivo_registrado_centavos", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	ingresosBancariosCentavos: bigint("ingresos_bancarios_centavos", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalCobradoCentavos: bigint("total_cobrado_centavos", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	diferenciaEfectivoCentavos: bigint("diferencia_efectivo_centavos", { mode: "number" }).notNull(),
	pagosProcesados: integer("pagos_procesados").notNull(),
	observaciones: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
uniqueIndex("cash_closures_campus_fecha_unique").using("btree", table.campusId.asc().nullsLast().op("int4_ops"), table.fecha.asc().nullsLast().op("date_ops")),
index("cash_closures_tenant_campus_created_idx").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "cash_closures_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.closedByUserId],
			foreignColumns: [users.id],
			name: "cash_closures_closed_by_user_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "cash_closures_tenant_id_fkey"
		}).onDelete("cascade"),
	check("cash_closures_amounts_non_negative", sql`(efectivo_capturado_centavos >= 0) AND (efectivo_registrado_centavos >= 0) AND (ingresos_bancarios_centavos >= 0) AND (total_cobrado_centavos >= 0) AND (pagos_procesados >= 0)`),
]);

export const accionesSeguimiento = pgTable("acciones_seguimiento", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	campusId: integer("campus_id").notNull(),
	entityType: varchar("entity_type", { length: 50 }).notNull(),
	entityId: integer("entity_id").notNull(),
	tipoHallazgo: varchar("tipo_hallazgo", { length: 50 }).notNull(),
	status: accionStatus().default('pendiente').notNull(),
	titulo: varchar({ length: 255 }).notNull(),
	descripcion: text(),
	assignedTo: integer("assigned_to"),
	resolutionNotes: text("resolution_notes"),
	metadata: jsonb(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	assignedAt: timestamp("assigned_at", { mode: 'string' }),
	startedAt: timestamp("started_at", { mode: 'string' }),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	escalatedAt: timestamp("escalated_at", { mode: 'string' }),
}, (table) => [
	index("acciones_seg_assigned_idx").using("btree", table.assignedTo.asc().nullsLast().op("int4_ops")),
index("acciones_seg_campus_status_idx").using("btree", table.campusId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("enum_ops")),
	index("acciones_seg_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("acciones_seg_tipo_idx").using("btree", table.tipoHallazgo.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "acciones_seguimiento_assigned_to_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "acciones_seguimiento_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "acciones_seguimiento_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "acciones_seguimiento_tenant_id_fkey"
		}).onDelete("cascade"),
unique("acciones_seg_entity_campus_uniq").on(table.entityType, table.entityId, table.campusId),
	check("acciones_seguimiento_tipo_hallazgo_check", sql`(tipo_hallazgo)::text = ANY ((ARRAY['excepcion_conciliacion'::character varying, 'riesgo_financiero'::character varying, 'override_condonacion'::character varying, 'pago_manual_sugerido'::character varying, 'cfdi_sin_timbrar'::character varying, 'otro'::character varying])::text[])`),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	email: varchar({ length: 255 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	role: varchar({ length: 50 }).notNull(),
	twofaSecret: varchar("twofa_secret", { length: 255 }),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	isSuperAdmin: boolean("is_super_admin").default(false),
	platformPermissions: text("platform_permissions").array(),
	name: varchar({ length: 255 }),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
	telefono: varchar({ length: 20 }),
	fotoUrl: text("foto_url"),
	customPermissions: text("custom_permissions").array(),
	passwordChangedAt: timestamp("password_changed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "users_campus_id_campuses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "users_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("users_email_unique").on(table.email),
]);

export const scholarshipAutoAssignments = pgTable("scholarship_auto_assignments", {
	id: serial().primaryKey().notNull(),
	ruleId: integer("rule_id").notNull(),
	scholarshipId: integer("scholarship_id"),
	studentId: integer("student_id").notNull(),
	campusId: integer("campus_id").notNull(),
	tenantId: integer("tenant_id").notNull(),
	cicloEscolar: varchar("ciclo_escolar", { length: 50 }).notNull(),
	porcentajeAplicado: numeric("porcentaje_aplicado", { precision: 5, scale:  2 }).notNull(),
	porcentajeManual: numeric("porcentaje_manual", { precision: 5, scale:  2 }),
	estado: varchar({ length: 40 }).default('aplicada').notNull(),
	motivoResultado: varchar("motivo_resultado", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
index("idx_scholarship_auto_assignments_alerts").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.estado.asc().nullsLast().op("text_ops")),
index("idx_scholarship_auto_assignments_scope").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.cicloEscolar.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "scholarship_auto_assignments_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.ruleId],
			foreignColumns: [scholarshipAutoRules.id],
			name: "scholarship_auto_assignments_rule_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.scholarshipId],
			foreignColumns: [scholarships.id],
			name: "scholarship_auto_assignments_scholarship_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "scholarship_auto_assignments_student_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "scholarship_auto_assignments_tenant_id_fkey"
		}),
	unique("scholarship_auto_assignments_rule_student_cycle_uq").on(table.ruleId, table.studentId, table.cicloEscolar),
]);

export const chargeScholarshipApplications = pgTable("charge_scholarship_applications", {
	id: serial().primaryKey().notNull(),
	chargeId: integer("charge_id").notNull(),
	scholarshipId: integer("scholarship_id").notNull(),
	tenantId: integer("tenant_id").notNull(),
	effectivePercentage: numeric("effective_percentage", { precision: 5, scale:  2 }).notNull(),
	source: varchar({ length: 20 }).default('automatico').notNull(),
	appliedAt: timestamp("applied_at", { mode: 'string' }).defaultNow(),
	recalculatedAt: timestamp("recalculated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_charge_scholarship_applications_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.chargeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [charges.id],
			name: "charge_scholarship_applications_charge_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.scholarshipId],
			foreignColumns: [scholarships.id],
			name: "charge_scholarship_applications_scholarship_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "charge_scholarship_applications_tenant_id_fkey"
		}),
	unique("charge_scholarship_applications_charge_scholarship_uq").on(table.chargeId, table.scholarshipId),
]);

export const payments = pgTable("payments", {
	id: serial().primaryKey().notNull(),
	chargeId: integer("charge_id"),
	guardianId: integer("guardian_id"),
	metodo: varchar({ length: 50 }).notNull(),
	referenciaPasarela: varchar("referencia_pasarela", { length: 255 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
	fechaPago: timestamp("fecha_pago", { mode: 'string' }).defaultNow(),
	estado: varchar({ length: 50 }).default('exitoso'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	subtipoTarjeta: varchar("subtipo_tarjeta", { length: 10 }),
}, (table) => [
uniqueIndex("payments_tenant_referencia_pasarela_uidx").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.referenciaPasarela.asc().nullsLast().op("text_ops")).where(sql`((referencia_pasarela)::text ~~ 'manual:%'::text)`),
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [charges.id],
			name: "payments_charge_id_charges_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.guardianId],
			foreignColumns: [guardians.id],
			name: "payments_guardian_id_guardians_id_fk"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payments_tenant_id_fkey"
		}),
	pgPolicy("tenant_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`, withCheck: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`  }),
	check("payments_subtipo_tarjeta_check", sql`(subtipo_tarjeta IS NULL) OR ((subtipo_tarjeta)::text = ANY ((ARRAY['credito'::character varying, 'debito'::character varying])::text[]))`),
]);

export const scholarshipTypes = pgTable("scholarship_types", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	nombre: varchar({ length: 100 }).notNull(),
	categoria: varchar({ length: 50 }).notNull(),
	descripcion: text(),
	algoritmo: varchar({ length: 50 }).notNull(),
	activo: boolean().default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "scholarship_types_campus_id_fkey"
		}),
]);

export const concepts = pgTable("concepts", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	nombre: varchar({ length: 255 }).notNull(),
	tipo: varchar({ length: 50 }).notNull(),
	periodicidad: varchar({ length: 50 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
	iva: boolean().default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "concepts_campus_id_campuses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "concepts_tenant_id_fkey"
		}),
	pgPolicy("tenant_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`, withCheck: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`  }),
]);

export const pendingApprovals = pgTable("pending_approvals", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	requestedBy: integer("requested_by").notNull(),
	actionType: varchar("action_type", { length: 255 }).notNull(),
	actionDescription: text("action_description").notNull(),
	currentValue: varchar("current_value", { length: 255 }),
	proposedValue: varchar("proposed_value", { length: 255 }),
	reason: text().notNull(),
	additionalData: text("additional_data"),
	status: varchar({ length: 50 }).default('pending'),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	approvedBy: integer("approved_by"),
	approvalNotes: text("approval_notes"),
	tenantId: integer("tenant_id"),
	entityType: varchar("entity_type", { length: 50 }),
	entityId: integer("entity_id"),
	originalData: text("original_data"),
	requestedData: text("requested_data"),
	priority: varchar({ length: 20 }).default('medium'),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
});

export const approvalNotifications = pgTable("approval_notifications", {
	id: serial().primaryKey().notNull(),
	approvalId: integer("approval_id").notNull(),
	recipientId: integer("recipient_id").notNull(),
	notificationType: varchar("notification_type", { length: 100 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	isRead: boolean("is_read").default(false),
	sentAt: timestamp("sent_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	readAt: timestamp("read_at", { mode: 'string' }),
	additionalData: text("additional_data"),
});

export const approvalWorkflowLogs = pgTable("approval_workflow_logs", {
	id: serial().primaryKey().notNull(),
	approvalId: integer("approval_id").notNull(),
	userId: integer("user_id").notNull(),
	action: varchar({ length: 100 }).notNull(),
	previousStatus: varchar("previous_status", { length: 50 }),
	newStatus: varchar("new_status", { length: 50 }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	additionalData: text("additional_data"),
});

export const students = pgTable("students", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	curp: varchar({ length: 18 }),
	nombreCompleto: varchar("nombre_completo", { length: 255 }).notNull(),
	grado: varchar({ length: 50 }),
	grupo: varchar({ length: 50 }),
	status: varchar({ length: 50 }).default('activo'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	nombres: varchar({ length: 255 }),
	apellidoPaterno: varchar("apellido_paterno", { length: 255 }),
	apellidoMaterno: varchar("apellido_materno", { length: 255 }),
	fechaNacimiento: date("fecha_nacimiento"),
	tipoSangre: varchar("tipo_sangre", { length: 10 }),
	correoInstitucional: varchar("correo_institucional", { length: 255 }),
	nivelEscolar: varchar("nivel_escolar", { length: 100 }),
	claveCentroTrabajo: varchar("clave_centro_trabajo", { length: 50 }),
	turno: varchar({ length: 50 }),
	idReferencia: varchar("id_referencia", { length: 50 }),
	username: varchar({ length: 100 }),
	passwordHash: varchar("password_hash", { length: 255 }),
	tenantId: integer("tenant_id"),
	sexo: varchar({ length: 10 }),
	estadoOrigen: varchar("estado_origen", { length: 60 }),
	nacionalidad: varchar({ length: 60 }),
	idiomaNatal: varchar("idioma_natal", { length: 40 }),
	hablaDialecto: boolean("habla_dialecto").default(false),
	necesidadesEspeciales: boolean("necesidades_especiales").default(false),
	repetidor: boolean().default(false),
	nivelEducativo: varchar("nivel_educativo", { length: 50 }),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "students_campus_id_campuses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "students_tenant_id_fkey"
		}),
	pgPolicy("tenant_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`, withCheck: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`  }),
	check("students_nivel_educativo_check", sql`(nivel_educativo IS NULL) OR ((nivel_educativo)::text = ANY ((ARRAY['Preescolar'::character varying, 'Primaria'::character varying, 'Secundaria'::character varying, 'Profesional técnico'::character varying, 'Bachillerato o su equivalente'::character varying])::text[]))`),
]);

export const paymentDueDates = pgTable("payment_due_dates", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	concepto: varchar({ length: 255 }).notNull(),
	diaVencimiento: integer("dia_vencimiento").notNull(),
	mesAplicacion: text("mes_aplicacion").notNull(),
	activo: boolean().default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	conceptId: integer("concept_id"),
}, (table) => [
index("idx_payment_due_dates_scope_concept").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.campusId.asc().nullsLast().op("int4_ops"), table.conceptId.asc().nullsLast().op("int4_ops"), table.activo.asc().nullsLast().op("bool_ops")),
	index("idx_payment_due_dates_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.conceptId],
			foreignColumns: [concepts.id],
			name: "payment_due_dates_concept_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payment_due_dates_tenant_id_fkey"
		}),
]);

export const paymentMethods = pgTable("payment_methods", {
	id: serial().primaryKey().notNull(),
	guardianId: integer("guardian_id"),
	tipo: varchar({ length: 50 }).notNull(),
	tokenPasarela: varchar("token_pasarela", { length: 255 }),
	last4: varchar({ length: 4 }),
	expiry: varchar({ length: 10 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.guardianId],
			foreignColumns: [guardians.id],
			name: "payment_methods_guardian_id_guardians_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "payment_methods_tenant_id_fkey"
		}),
	pgPolicy("tenant_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`, withCheck: sql`((current_setting('app.current_tenant'::text, true) = ''::text) OR ((tenant_id)::text = current_setting('app.current_tenant'::text, true)) OR (current_setting('app.current_tenant'::text, true) IS NULL))`  }),
]);

export const scholarships = pgTable("scholarships", {
	id: serial().primaryKey().notNull(),
	studentId: integer("student_id"),
	porcentaje: numeric({ precision: 5, scale:  2 }).notNull(),
	vigenciaInicio: date("vigencia_inicio").notNull(),
	vigenciaFin: date("vigencia_fin").notNull(),
	motivo: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	scholarshipTypeId: integer("scholarship_type_id"),
	estado: varchar({ length: 20 }).default('activa'),
}, (table) => [
index("idx_scholarships_effective_scope").using("btree", table.tenantId.asc().nullsLast().op("int4_ops"), table.studentId.asc().nullsLast().op("int4_ops"), table.estado.asc().nullsLast().op("text_ops"), table.vigenciaInicio.asc().nullsLast().op("date_ops"), table.vigenciaFin.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.scholarshipTypeId],
			foreignColumns: [scholarshipTypes.id],
			name: "scholarships_scholarship_type_id_fkey"
		}),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "scholarships_student_id_students_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "scholarships_tenant_id_fkey"
		}),
]);

export const discounts = pgTable("discounts", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	nombre: varchar({ length: 255 }),
	reglaSql: text("regla_sql"),
	montoPct: numeric("monto_pct", { precision: 5, scale:  2 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "discounts_campus_id_campuses_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "discounts_tenant_id_fkey"
		}),
]);

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id"),
	guardianId: integer("guardian_id"),
	canal: varchar({ length: 50 }).notNull(),
	contenido: text(),
	enviadoEn: timestamp("enviado_en", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
	tipo: varchar({ length: 100 }),
	destinatario: varchar({ length: 255 }),
	asunto: text(),
	mensaje: text(),
	estado: varchar({ length: 50 }).default('pendiente'),
	intentos: integer().default(0),
	studentId: integer("student_id"),
}, (table) => [
	index("idx_notifications_enviado").using("btree", table.enviadoEn.desc().nullsFirst().op("timestamp_ops")),
	index("idx_notifications_estado").using("btree", table.estado.asc().nullsLast().op("text_ops")),
	index("idx_notifications_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.guardianId],
			foreignColumns: [guardians.id],
			name: "notifications_guardian_id_guardians_id_fk"
		}),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "notifications_student_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "notifications_tenant_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_users_id_fk"
		}),
]);

export const campuses = pgTable("campuses", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id"),
	nombre: varchar({ length: 255 }).notNull(),
	claveSep: varchar("clave_sep", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	onboardingCompletado: boolean("onboarding_completado").default(false).notNull(),
	onboardingStepsCompletados: jsonb("onboarding_steps_completados").default({}).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "campuses_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
]);

export const tenants = pgTable("tenants", {
	id: serial().primaryKey().notNull(),
	nombreLegal: varchar("nombre_legal", { length: 255 }).notNull(),
	rfc: varchar({ length: 13 }).notNull(),
	cfdiPacId: varchar("cfdi_pac_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const institutionalCredentials = pgTable("institutional_credentials", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	campusId: integer("campus_id").notNull(),
	credentialType: varchar("credential_type", { length: 50 }).notNull(),
	credentialName: varchar("credential_name", { length: 255 }),
	username: varchar({ length: 255 }),
	passwordEncrypted: text("password_encrypted"),
	expirationDate: date("expiration_date"),
	lastNotificationSent: date("last_notification_sent"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	tenantId: integer("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "institutional_credentials_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "institutional_credentials_tenant_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "institutional_credentials_user_id_fkey"
		}).onDelete("cascade"),
]);

export const institutionalInfo = pgTable("institutional_info", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	seccionEducativa: varchar("seccion_educativa", { length: 50 }).notNull(),
	rfc: varchar({ length: 13 }),
	cct: varchar({ length: 20 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	tenantId: integer("tenant_id"),
	rvoe: varchar({ length: 20 }),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "institutional_info_tenant_id_fkey"
		}),
	unique("institutional_info_campus_id_seccion_educativa_key").on(table.campusId, table.seccionEducativa),
]);

export const platformMetrics = pgTable("platform_metrics", {
	id: serial().primaryKey().notNull(),
	metricType: varchar("metric_type", { length: 100 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	metricValue: bigint("metric_value", { mode: "number" }).notNull(),
	metricDate: date("metric_date").notNull(),
	tenantId: integer("tenant_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "platform_metrics_tenant_id_fkey"
		}),
]);

export const reconciliationBatches = pgTable("reconciliation_batches", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	banco: varchar({ length: 255 }),
	fechaInicial: date("fecha_inicial").notNull(),
	fechaFinal: date("fecha_final").notNull(),
	archivoCsv: text("archivo_csv"),
	estado: varchar({ length: 50 }).default('pendiente'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "reconciliation_batches_campus_id_campuses_id_fk"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "reconciliation_batches_tenant_id_fkey"
		}),
]);

export const securityEvents = pgTable("security_events", {
	id: serial().primaryKey().notNull(),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	severity: varchar({ length: 20 }).notNull(),
	tenantId: integer("tenant_id"),
	campusId: integer("campus_id"),
	userId: integer("user_id"),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	eventDetails: text("event_details"),
	isBlocked: boolean("is_blocked").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "security_events_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "security_events_tenant_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "security_events_user_id_fkey"
		}),
]);

export const financialEvents = pgTable("financial_events", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id"),
	titulo: varchar({ length: 255 }).notNull(),
	descripcion: text(),
	fecha: date().notNull(),
	tipo: varchar({ length: 50 }).notNull(),
	urgencia: varchar({ length: 20 }).default('normal'),
	completado: boolean().default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	tenantId: integer("tenant_id"),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "financial_events_campus_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "financial_events_tenant_id_fkey"
		}),
]);

export const campusInvoicingConfig = pgTable("campus_invoicing_config", {
	id: serial().primaryKey().notNull(),
	campusId: integer("campus_id").notNull(),
	tenantId: integer("tenant_id").notNull(),
	proveedor: varchar({ length: 50 }).default('facturapi').notNull(),
	organizacionId: varchar("organizacion_id", { length: 255 }),
	rfc: varchar({ length: 13 }),
	razonSocial: varchar("razon_social", { length: 255 }),
	regimenFiscal: varchar("regimen_fiscal", { length: 4 }).default('601').notNull(),
	usoCfdiDefault: varchar("uso_cfdi_default", { length: 10 }).default('D10').notNull(),
	timbradoAutomatico: boolean("timbrado_automatico").default(false).notNull(),
	ambiente: varchar({ length: 20 }).default('sandbox').notNull(),
	fechaVencimientoCsd: date("fecha_vencimiento_csd"),
	estado: varchar({ length: 20 }).default('pendiente').notNull(),
	ultimoError: text("ultimo_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [campuses.id],
			name: "campus_invoicing_config_campus_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "campus_invoicing_config_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("uq_campus_invoicing_config_campus").on(table.campusId),
]);

export const lateFeeCalculations = pgTable("late_fee_calculations", {
	id: serial().primaryKey().notNull(),
	chargeId: integer("charge_id").notNull(),
	paymentRuleId: integer("payment_rule_id").notNull(),
	tenantId: integer("tenant_id"),
	originalAmountCentavos: integer("original_amount_centavos").notNull(),
	dueDate: timestamp("due_date", { mode: 'string' }).notNull(),
	adjustedDueDate: timestamp("adjusted_due_date", { mode: 'string' }).notNull(),
	calculationDate: timestamp("calculation_date", { mode: 'string' }).notNull(),
	daysLate: integer("days_late").notNull(),
	lateFeeAmountCentavos: integer("late_fee_amount_centavos").notNull(),
	calculationDetails: text("calculation_details"),
	isApplied: boolean("is_applied").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [charges.id],
			name: "late_fee_calculations_charge_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.paymentRuleId],
			foreignColumns: [paymentRules.id],
			name: "late_fee_calculations_payment_rule_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "late_fee_calculations_tenant_id_fkey"
		}),
]);

export const familyPaymentSources = pgTable("family_payment_sources", {
	id: serial().primaryKey().notNull(),
	tenantId: integer("tenant_id").notNull(),
	familyId: integer("family_id").notNull(),
	clabe: varchar({ length: 18 }).notNull(),
	nombreInferido: varchar("nombre_inferido", { length: 255 }),
	confirmaciones: integer().default(1).notNull(),
	primeraVezAt: timestamp("primera_vez_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ultimaVezAt: timestamp("ultima_vez_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_family_payment_sources_clabe").using("btree", table.clabe.asc().nullsLast().op("text_ops")),
	index("idx_family_payment_sources_tenant").using("btree", table.tenantId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.familyId],
			foreignColumns: [families.id],
			name: "family_payment_sources_family_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "family_payment_sources_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("family_payment_sources_uniq").on(table.familyId, table.clabe),
]);

export const familyStudents = pgTable("family_students", {
	familyId: integer("family_id").notNull(),
	studentId: integer("student_id").notNull(),
}, (table) => [
	index("idx_family_students_family").using("btree", table.familyId.asc().nullsLast().op("int4_ops")),
	index("idx_family_students_student").using("btree", table.studentId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.familyId],
			foreignColumns: [families.id],
			name: "family_students_family_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "family_students_student_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.familyId, table.studentId], name: "family_students_pkey"}),
]);

export const studentGuardian = pgTable("student_guardian", {
	studentId: integer("student_id").notNull(),
	guardianId: integer("guardian_id").notNull(),
	porcentajeResponsabilidad: numeric("porcentaje_responsabilidad", { precision: 5, scale:  2 }).default('100.00'),
	esResponsablePago: boolean("es_responsable_pago").default(true).notNull(),
}, (table) => [
	index("idx_sg_responsable").using("btree", table.studentId.asc().nullsLast().op("int4_ops")).where(sql`(es_responsable_pago = true)`),
	foreignKey({
			columns: [table.guardianId],
			foreignColumns: [guardians.id],
			name: "student_guardian_guardian_id_guardians_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "student_guardian_student_id_students_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.studentId, table.guardianId], name: "student_guardian_student_id_guardian_id_pk"}),
]);
