CREATE TYPE "public"."accion_status" AS ENUM('pendiente', 'asignado', 'en_progreso', 'resuelto', 'ignorado', 'escalado');--> statement-breakpoint
CREATE TABLE "acciones_seguimiento" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"tipo_hallazgo" varchar(50) NOT NULL,
	"status" "accion_status" DEFAULT 'pendiente' NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descripcion" text,
	"assigned_to" integer,
	"resolution_notes" text,
	"metadata" jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"assigned_at" timestamp,
	"started_at" timestamp,
	"resolved_at" timestamp,
	"escalated_at" timestamp,
	CONSTRAINT "acciones_seguimiento_tipo_hallazgo_check" CHECK (((tipo_hallazgo)::text = ANY ((ARRAY['excepcion_conciliacion'::character varying, 'riesgo_financiero'::character varying, 'override_condonacion'::character varying, 'pago_manual_sugerido'::character varying, 'cfdi_sin_timbrar'::character varying, 'otro'::character varying])::text[])))
);
--> statement-breakpoint
CREATE TABLE "approval_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"approval_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false,
	"sent_at" timestamp DEFAULT now(),
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "approval_workflow_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"approval_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" varchar(100) NOT NULL,
	"notes" text,
	"additional_data" text,
	"previous_status" varchar(50),
	"new_status" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"guardian_id" integer,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"previous_value" text,
	"new_value" text,
	"ip_address" varchar(45),
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"fecha" date NOT NULL,
	"descripcion" text,
	"monto_centavos" bigint NOT NULL,
	"tipo" varchar(10) DEFAULT 'credito',
	"referencia" varchar(255),
	"clabe_ordenante" varchar(18),
	"nombre_ordenante" varchar(255),
	"estado_conciliacion" varchar(20) DEFAULT 'pendiente',
	"charge_id" integer,
	"payment_id" integer,
	"nota_conciliacion" text,
	"confianza_pct" smallint,
	"conciliado_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campus_invoicing_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"proveedor" varchar(50) DEFAULT 'facturapi' NOT NULL,
	"organizacion_id" varchar(255),
	"rfc" varchar(13),
	"razon_social" varchar(255),
	"regimen_fiscal" varchar(4) DEFAULT '601' NOT NULL,
	"uso_cfdi_default" varchar(10) DEFAULT 'D10' NOT NULL,
	"timbrado_automatico" boolean DEFAULT false NOT NULL,
	"ambiente" varchar(20) DEFAULT 'sandbox' NOT NULL,
	"fecha_vencimiento_csd" date,
	"estado" varchar(20) DEFAULT 'pendiente' NOT NULL,
	"ultimo_error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campus_payment_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"payment_provider" varchar(50) DEFAULT 'stripe' NOT NULL,
	"stripe_account_id" varchar(255),
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"nombre" varchar(255) NOT NULL,
	"clave_sep" varchar(50),
	"onboarding_completado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_closures" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"closed_by_user_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"efectivo_capturado_centavos" bigint NOT NULL,
	"efectivo_registrado_centavos" bigint NOT NULL,
	"ingresos_bancarios_centavos" bigint NOT NULL,
	"total_cobrado_centavos" bigint NOT NULL,
	"diferencia_efectivo_centavos" bigint NOT NULL,
	"pagos_procesados" integer NOT NULL,
	"observaciones" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_closures_amounts_non_negative" CHECK ("cash_closures"."efectivo_capturado_centavos" >= 0
      AND "cash_closures"."efectivo_registrado_centavos" >= 0
      AND "cash_closures"."ingresos_bancarios_centavos" >= 0
      AND "cash_closures"."total_cobrado_centavos" >= 0
      AND "cash_closures"."pagos_procesados" >= 0)
);
--> statement-breakpoint
CREATE TABLE "charge_scholarship_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"charge_id" integer NOT NULL,
	"scholarship_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"effective_percentage" numeric(5, 2) NOT NULL,
	"source" varchar(20) DEFAULT 'automatico' NOT NULL,
	"applied_at" timestamp DEFAULT now(),
	"recalculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "charge_surcharge_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"charge_id" integer NOT NULL,
	"payment_rule_id" integer,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"periodo_mes" date NOT NULL,
	"modo_acumulacion" text NOT NULL,
	"saldo_base_centavos" integer NOT NULL,
	"recargo_anterior_centavos" integer NOT NULL,
	"incremento_centavos" integer NOT NULL,
	"recargo_total_centavos" integer NOT NULL,
	"formula_detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aplicado_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charge_surcharge_periods_modo_acumulacion_check" CHECK (modo_acumulacion IN ('ninguno', 'incremento_fijo', 'compuesto')),
	CONSTRAINT "charge_surcharge_periods_non_negative_check" CHECK (
    saldo_base_centavos >= 0
    AND recargo_anterior_centavos >= 0
    AND incremento_centavos >= 0
    AND recargo_total_centavos >= 0
  )
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"student_id" integer,
	"concept_id" integer,
	"ciclo_escolar" varchar(50),
	"fecha_emision" date NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"monto_base_centavos" bigint NOT NULL,
	"beca_aplicada" numeric(5, 2) DEFAULT '0.00',
	"recargo_aplicado_centavos" bigint DEFAULT 0,
	"estado" varchar(50) DEFAULT 'pendiente',
	"plan_id" integer,
	"es_adeudo_migrado" boolean DEFAULT false NOT NULL,
	"descripcion" text,
	"manual_override" boolean DEFAULT false NOT NULL,
	"manual_override_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collection_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"charge_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"created_by" integer,
	"tipo" varchar(40) NOT NULL,
	"estado" varchar(40) DEFAULT 'registrado' NOT NULL,
	"titulo" varchar(255) NOT NULL,
	"descripcion" text,
	"fecha_programada" date,
	"hora_programada" varchar(8),
	"monto_centavos" bigint,
	"canal" varchar(30),
	"prioridad" varchar(20),
	"motivo" varchar(100),
	"supervisor" varchar(255),
	"urgencia" varchar(20),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"nombre" varchar(255) NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"periodicidad" varchar(50) NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"iva" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_prospects" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"email" varchar(200),
	"telefono" varchar(30),
	"nivel_interes" varchar(20) DEFAULT 'medio',
	"nivel_escolar" varchar(50),
	"notas" text,
	"status" varchar(30) DEFAULT 'interested',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"nombre" varchar(255),
	"regla_sql" text,
	"monto_pct" numeric(5, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"nombre" varchar(300) NOT NULL,
	"clabe_virtual" varchar(18),
	"guardian_id_principal" integer,
	"status" varchar(20) DEFAULT 'activo' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"family_id" integer,
	"student_id" integer,
	"payment_id" integer,
	"amount_centavos" bigint NOT NULL,
	"origen" varchar(50) DEFAULT 'excedente_caja' NOT NULL,
	"descripcion" text,
	"status" varchar(20) DEFAULT 'activo' NOT NULL,
	"consumed_application_id" integer,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "family_credits_amount_centavos_check" CHECK ((amount_centavos > 0))
);
--> statement-breakpoint
CREATE TABLE "family_payment_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"family_id" integer NOT NULL,
	"clabe" varchar(18) NOT NULL,
	"nombre_inferido" varchar(255),
	"confirmaciones" integer DEFAULT 1 NOT NULL,
	"primera_vez_at" timestamp with time zone DEFAULT now(),
	"ultima_vez_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_students" (
	"family_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	CONSTRAINT "family_students_family_id_student_id_pk" PRIMARY KEY("family_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "financial_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"titulo" varchar(255) NOT NULL,
	"descripcion" text,
	"fecha" date NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"urgencia" varchar(20) DEFAULT 'normal',
	"completado" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo_guardian" varchar(20) DEFAULT 'padre',
	"es_padre" boolean DEFAULT false,
	"es_madre" boolean DEFAULT false,
	"correo_institucional_familiar" varchar(255) NOT NULL,
	"nombres" varchar(255) NOT NULL,
	"apellido_paterno" varchar(255),
	"apellido_materno" varchar(255),
	"curp" varchar(18),
	"celular" varchar(20),
	"telefono_casa_oficina" varchar(20),
	"email" varchar(255),
	"password_hash" varchar(255),
	"telefono" varchar(20),
	"nombre_completo" varchar(300),
	"rfc" varchar(13),
	"calle" varchar(255),
	"numero_exterior" varchar(30),
	"numero_interior" varchar(30),
	"colonia" varchar(255),
	"codigo_postal" varchar(5),
	"municipio" varchar(255),
	"estado" varchar(100),
	"contacto_emergencia_nombre" varchar(255),
	"contacto_emergencia_telefono" varchar(20),
	"contacto_emergencia_relacion" varchar(100),
	"campus_id" integer,
	"tenant_id" integer,
	"foto_url" text,
	"stripe_customer_id" varchar(255),
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "institutional_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"campus_id" integer,
	"tenant_id" integer,
	"credential_type" varchar(50) NOT NULL,
	"credential_name" varchar(255),
	"username" varchar(255),
	"password_encrypted" varchar(500),
	"expiration_date" date,
	"last_notification_sent" date,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "institutional_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"seccion_educativa" varchar(50) NOT NULL,
	"rfc" varchar(13),
	"cct" varchar(20),
	"rvoe" varchar(20),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "institutional_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"rfc" varchar(13),
	"direccion_fiscal" text,
	"ciudad" varchar(100),
	"codigo_postal" varchar(10),
	"telefono_principal" varchar(20),
	"email_institucional" varchar(255),
	"sitio_web" varchar(255),
	"nombre_legal" varchar(255),
	"logo_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"payment_id" integer,
	"uuid_cfdi" varchar(255),
	"xml_url" text,
	"pdf_url" text,
	"estado" varchar(50) DEFAULT 'pendiente',
	"curp_alumno" varchar(18),
	"nivel_educativo" varchar(50),
	"aut_rvoe" varchar(20),
	"rfc_pago" varchar(13),
	"uso_cfdi" varchar(10) DEFAULT 'D10',
	"forma_pago" varchar(2),
	"clave_prod_serv" varchar(20),
	"clave_unidad" varchar(10) DEFAULT 'E48',
	"xml_content" text,
	"pdf_base64" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "invoices_curp_alumno_check" CHECK (((curp_alumno IS NULL) OR ((curp_alumno)::text ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[0-9A-Z][0-9]$'::text))),
	CONSTRAINT "invoices_nivel_educativo_check" CHECK (((nivel_educativo IS NULL) OR ((nivel_educativo)::text = ANY ((ARRAY['Preescolar'::character varying, 'Primaria'::character varying, 'Secundaria'::character varying, 'Profesional técnico'::character varying, 'Bachillerato o su equivalente'::character varying])::text[])))),
	CONSTRAINT "invoices_forma_pago_check" CHECK (((forma_pago IS NULL) OR ((forma_pago)::text = ANY ((ARRAY['01'::character varying, '02'::character varying, '03'::character varying, '04'::character varying, '05'::character varying, '06'::character varying, '08'::character varying, '12'::character varying, '13'::character varying, '17'::character varying, '23'::character varying, '24'::character varying, '25'::character varying, '28'::character varying, '29'::character varying, '30'::character varying, '99'::character varying])::text[]))))
);
--> statement-breakpoint
CREATE TABLE "late_fee_calculations" (
	"id" serial PRIMARY KEY NOT NULL,
	"charge_id" integer NOT NULL,
	"payment_rule_id" integer NOT NULL,
	"tenant_id" integer,
	"original_amount_centavos" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"adjusted_due_date" timestamp NOT NULL,
	"calculation_date" timestamp NOT NULL,
	"days_late" integer NOT NULL,
	"late_fee_amount_centavos" integer NOT NULL,
	"calculation_details" text,
	"is_applied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"guardian_id" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"max_uses" integer DEFAULT 3 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "migration_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"nombre" varchar(200) NOT NULL,
	"estado" varchar(30) DEFAULT 'pendiente',
	"tipo" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"user_id" integer,
	"guardian_id" integer,
	"student_id" integer,
	"canal" varchar(50) NOT NULL,
	"tipo" varchar(100),
	"destinatario" varchar(255),
	"asunto" text,
	"mensaje" text,
	"contenido" text,
	"estado" varchar(50) DEFAULT 'pendiente',
	"intentos" integer DEFAULT 0,
	"enviado_en" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"charge_id" integer NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_due_date_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"concept_id" integer NOT NULL,
	"ciclo_escolar" varchar(50) NOT NULL,
	"periodo_clave" varchar(50) NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_due_date_periods_dates_check" CHECK ("payment_due_date_periods"."fecha_fin" >= "payment_due_date_periods"."fecha_inicio")
);
--> statement-breakpoint
CREATE TABLE "payment_due_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer,
	"concept_id" integer,
	"concepto" text NOT NULL,
	"dia_vencimiento" integer NOT NULL,
	"mes_aplicacion" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_event_id" varchar(255) NOT NULL,
	"payload" text,
	"processed_at" timestamp,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"guardian_id" integer,
	"tipo" varchar(50) NOT NULL,
	"token_pasarela" varchar(255),
	"last4" varchar(4),
	"expiry" varchar(10),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_plan_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer,
	"numero" integer NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"fecha_pago" date,
	"estado" varchar(20) DEFAULT 'pendiente'
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"student_id" integer,
	"guardian_id" integer,
	"total_adeudo_centavos" bigint NOT NULL,
	"monto_inicial_centavos" bigint DEFAULT 0,
	"numero_pagos" integer NOT NULL,
	"frecuencia" varchar(20) DEFAULT 'mensual',
	"fecha_inicio" date NOT NULL,
	"estado" varchar(20) DEFAULT 'activo',
	"tipo_origen" varchar(20) DEFAULT 'futuro',
	"charge_ids_origen" jsonb,
	"observaciones" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"grace_period_days" integer DEFAULT 0 NOT NULL,
	"grace_period_unit" text DEFAULT 'days' NOT NULL,
	"late_fee_percentage" numeric(5, 2),
	"late_fee_fixed_amount_centavos" integer,
	"progressive_rules" text,
	"max_late_fee_centavos" integer,
	"min_late_fee_centavos" integer,
	"compound_daily" boolean DEFAULT false NOT NULL,
	"applies_to_weekends" boolean DEFAULT false NOT NULL,
	"applies_to_holidays" boolean DEFAULT false NOT NULL,
	"applies_to_concepts" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_surcharge_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer,
	"concept_id" integer,
	"concepto" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"dias_gracia" integer DEFAULT 0 NOT NULL,
	"porcentaje" numeric(5, 2),
	"monto_fijo_centavos" integer,
	"reglas_progresivas" text,
	"aplica_fines_semana" boolean DEFAULT false NOT NULL,
	"aplica_festivos" boolean DEFAULT false NOT NULL,
	"monto_maximo_centavos" integer,
	"modo_acumulacion" text DEFAULT 'ninguno' NOT NULL,
	"tipo_incremento_mensual" text,
	"incremento_mensual_centavos" integer,
	"incremento_mensual_porcentaje" numeric(5, 2),
	"fecha_inicio_acumulacion" date,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_surcharge_rules_tipo_check" CHECK (((tipo)::text = ANY (ARRAY[('porcentaje'::character varying)::text, ('fijo'::character varying)::text, ('progresivo'::character varying)::text]))),
	CONSTRAINT "payment_surcharge_rules_modo_acumulacion_check" CHECK (modo_acumulacion IN ('ninguno', 'incremento_fijo', 'compuesto')),
	CONSTRAINT "payment_surcharge_rules_tipo_incremento_mensual_check" CHECK (tipo_incremento_mensual IS NULL OR tipo_incremento_mensual IN ('monto', 'porcentaje'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"charge_id" integer,
	"guardian_id" integer,
	"metodo" varchar(50) NOT NULL,
	"subtipo_tarjeta" varchar(10),
	"referencia_pasarela" varchar(255),
	"monto_centavos" bigint NOT NULL,
	"fecha_pago" timestamp DEFAULT now(),
	"estado" varchar(50) DEFAULT 'pendiente',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payments_subtipo_tarjeta_check" CHECK (((subtipo_tarjeta IS NULL) OR ((subtipo_tarjeta)::text = ANY ((ARRAY['credito'::character varying, 'debito'::character varying])::text[]))))
);
--> statement-breakpoint
CREATE TABLE "pending_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"requested_by" integer NOT NULL,
	"approved_by" integer,
	"action_type" varchar(100) NOT NULL,
	"action_description" text NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"original_data" text NOT NULL,
	"requested_data" text NOT NULL,
	"reason" text,
	"status" varchar(50) DEFAULT 'pending',
	"priority" varchar(20) DEFAULT 'medium',
	"approval_notes" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_type" varchar(100) NOT NULL,
	"metric_value" bigint NOT NULL,
	"metric_date" date NOT NULL,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"profile_type" varchar(50) NOT NULL,
	"specialization" varchar(100),
	"access_level" varchar(50) NOT NULL,
	"assigned_schools" text[],
	"permissions" text[],
	"support_tier" varchar(20),
	"implementation_phase" varchar(50),
	"metrics" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"students_limit" integer NOT NULL,
	"current_students" integer DEFAULT 0,
	"monthly_fee_centavos" integer NOT NULL,
	"billing_date" date NOT NULL,
	"next_billing_date" date NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"codigo" varchar(50) NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"descripcion" text,
	"categoria" varchar(50) NOT NULL,
	"unidad_medida" varchar(20) DEFAULT 'SERVICIO' NOT NULL,
	"clave_sat" varchar(20),
	"activo" boolean DEFAULT true NOT NULL,
	"precio_kinder" bigint DEFAULT 0 NOT NULL,
	"precio_primaria" bigint DEFAULT 0 NOT NULL,
	"precio_secundaria" bigint DEFAULT 0 NOT NULL,
	"precio_bachillerato" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reconciliation_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"banco" varchar(255),
	"fecha_inicial" date NOT NULL,
	"fecha_final" date NOT NULL,
	"archivo_csv" text,
	"estado" varchar(50) DEFAULT 'pendiente',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scholarship_auto_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"scholarship_id" integer,
	"student_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"ciclo_escolar" varchar(50) NOT NULL,
	"porcentaje_aplicado" numeric(5, 2) NOT NULL,
	"porcentaje_manual" numeric(5, 2),
	"estado" varchar(40) DEFAULT 'aplicada' NOT NULL,
	"motivo_resultado" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scholarship_auto_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"nombre" varchar(255) NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"condicion_json" text,
	"descuento_porcentaje" numeric(5, 2) NOT NULL,
	"aplica_a" varchar(50) DEFAULT 'todos',
	"activo" boolean DEFAULT true,
	"ciclo_escolar" varchar(50),
	"vigencia_inicio" date,
	"vigencia_fin" date,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scholarship_benefits" (
	"id" serial PRIMARY KEY NOT NULL,
	"scholarship_type_id" integer,
	"tipo_beneficio" varchar(50) NOT NULL,
	"porcentaje_descuento" integer,
	"monto_fijo_centavos" bigint,
	"aplica_conceptos" text[] DEFAULT '{"colegiatura"}',
	"limite_maximo_centavos" bigint,
	"vigencia_meses" integer DEFAULT 12,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scholarship_criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"scholarship_type_id" integer,
	"criterio" varchar(100) NOT NULL,
	"valor_minimo" numeric(10, 2),
	"valor_maximo" numeric(10, 2),
	"obligatorio" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scholarship_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"nombre" varchar(100) NOT NULL,
	"categoria" varchar(50) NOT NULL,
	"descripcion" text,
	"algoritmo" varchar(50) NOT NULL,
	"activo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scholarships" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"student_id" integer,
	"scholarship_type_id" integer,
	"porcentaje" numeric NOT NULL,
	"motivo" varchar(500),
	"estado" varchar(20) DEFAULT 'activa',
	"vigencia_inicio" date NOT NULL,
	"vigencia_fin" date NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"tenant_id" integer,
	"campus_id" integer,
	"user_id" integer,
	"ip_address" varchar(45),
	"user_agent" text,
	"event_details" text,
	"is_blocked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_guardian" (
	"student_id" integer,
	"guardian_id" integer,
	"porcentaje_responsabilidad" numeric(5, 2) DEFAULT '100.00',
	"es_responsable_pago" boolean DEFAULT true NOT NULL,
	CONSTRAINT "student_guardian_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"id_referencia" varchar(50),
	"username" varchar(100),
	"password_hash" varchar(255),
	"nombres" varchar(255) NOT NULL,
	"apellido_paterno" varchar(255),
	"apellido_materno" varchar(255),
	"curp" varchar(18),
	"fecha_nacimiento" date,
	"tipo_sangre" varchar(10),
	"correo_institucional" varchar(255),
	"nivel_escolar" varchar(100),
	"nivel_educativo" varchar(50),
	"clave_centro_trabajo" varchar(50),
	"grado" varchar(50),
	"grupo" varchar(50),
	"turno" varchar(50),
	"nombre_completo" varchar(300),
	"sexo" varchar(10),
	"estado_origen" varchar(60),
	"nacionalidad" varchar(60),
	"idioma_natal" varchar(40),
	"habla_dialecto" boolean DEFAULT false,
	"necesidades_especiales" boolean DEFAULT false,
	"repetidor" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'activo',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "students_nivel_educativo_check" CHECK (((nivel_educativo IS NULL) OR ((nivel_educativo)::text = ANY ((ARRAY['Preescolar'::character varying, 'Primaria'::character varying, 'Secundaria'::character varying, 'Profesional técnico'::character varying, 'Bachillerato o su equivalente'::character varying])::text[]))))
);
--> statement-breakpoint
CREATE TABLE "system_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_name" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"response_time_ms" integer,
	"error_message" text,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre_legal" varchar(255) NOT NULL,
	"rfc" varchar(13) NOT NULL,
	"cfdi_pac_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"campus_id" integer,
	"tenant_id" integer,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"telefono" varchar(20),
	"foto_url" text,
	"twofa_secret" varchar(255),
	"is_active" boolean DEFAULT true,
	"is_super_admin" boolean DEFAULT false,
	"platform_permissions" text[],
	"custom_permissions" text[],
	"last_login_at" timestamp,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "acciones_seguimiento" ADD CONSTRAINT "acciones_seguimiento_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acciones_seguimiento" ADD CONSTRAINT "acciones_seguimiento_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acciones_seguimiento" ADD CONSTRAINT "acciones_seguimiento_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acciones_seguimiento" ADD CONSTRAINT "acciones_seguimiento_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_notifications" ADD CONSTRAINT "approval_notifications_approval_id_pending_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."pending_approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_notifications" ADD CONSTRAINT "approval_notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflow_logs" ADD CONSTRAINT "approval_workflow_logs_approval_id_pending_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."pending_approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflow_logs" ADD CONSTRAINT "approval_workflow_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_invoicing_config" ADD CONSTRAINT "campus_invoicing_config_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_invoicing_config" ADD CONSTRAINT "campus_invoicing_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_payment_config" ADD CONSTRAINT "campus_payment_config_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_payment_config" ADD CONSTRAINT "campus_payment_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_scholarship_applications" ADD CONSTRAINT "charge_scholarship_applications_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_scholarship_applications" ADD CONSTRAINT "charge_scholarship_applications_scholarship_id_scholarships_id_fk" FOREIGN KEY ("scholarship_id") REFERENCES "public"."scholarships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_scholarship_applications" ADD CONSTRAINT "charge_scholarship_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_surcharge_periods" ADD CONSTRAINT "charge_surcharge_periods_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_surcharge_periods" ADD CONSTRAINT "charge_surcharge_periods_payment_rule_id_payment_surcharge_rules_id_fk" FOREIGN KEY ("payment_rule_id") REFERENCES "public"."payment_surcharge_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_surcharge_periods" ADD CONSTRAINT "charge_surcharge_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_surcharge_periods" ADD CONSTRAINT "charge_surcharge_periods_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_guardian_id_principal_guardians_id_fk" FOREIGN KEY ("guardian_id_principal") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credits" ADD CONSTRAINT "family_credits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credits" ADD CONSTRAINT "family_credits_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credits" ADD CONSTRAINT "family_credits_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credits" ADD CONSTRAINT "family_credits_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credits" ADD CONSTRAINT "family_credits_consumed_application_id_payment_applications_id_fk" FOREIGN KEY ("consumed_application_id") REFERENCES "public"."payment_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_payment_sources" ADD CONSTRAINT "family_payment_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_payment_sources" ADD CONSTRAINT "family_payment_sources_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_students" ADD CONSTRAINT "family_students_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_students" ADD CONSTRAINT "family_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_events" ADD CONSTRAINT "financial_events_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_events" ADD CONSTRAINT "financial_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_credentials" ADD CONSTRAINT "institutional_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_credentials" ADD CONSTRAINT "institutional_credentials_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_credentials" ADD CONSTRAINT "institutional_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_info" ADD CONSTRAINT "institutional_info_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_info" ADD CONSTRAINT "institutional_info_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_settings" ADD CONSTRAINT "institutional_settings_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_settings" ADD CONSTRAINT "institutional_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_calculations" ADD CONSTRAINT "late_fee_calculations_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_calculations" ADD CONSTRAINT "late_fee_calculations_payment_rule_id_payment_rules_id_fk" FOREIGN KEY ("payment_rule_id") REFERENCES "public"."payment_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_calculations" ADD CONSTRAINT "late_fee_calculations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_due_date_periods" ADD CONSTRAINT "payment_due_date_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_due_date_periods" ADD CONSTRAINT "payment_due_date_periods_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_due_date_periods" ADD CONSTRAINT "payment_due_date_periods_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_due_dates" ADD CONSTRAINT "payment_due_dates_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_due_dates" ADD CONSTRAINT "payment_due_dates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_due_dates" ADD CONSTRAINT "payment_due_dates_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_plan_id_payment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rules" ADD CONSTRAINT "payment_rules_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rules" ADD CONSTRAINT "payment_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_surcharge_rules" ADD CONSTRAINT "payment_surcharge_rules_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_surcharge_rules" ADD CONSTRAINT "payment_surcharge_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_surcharge_rules" ADD CONSTRAINT "payment_surcharge_rules_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_metrics" ADD CONSTRAINT "platform_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_profiles" ADD CONSTRAINT "platform_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_auto_assignments" ADD CONSTRAINT "scholarship_auto_assignments_rule_id_scholarship_auto_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."scholarship_auto_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_auto_assignments" ADD CONSTRAINT "scholarship_auto_assignments_scholarship_id_scholarships_id_fk" FOREIGN KEY ("scholarship_id") REFERENCES "public"."scholarships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_auto_assignments" ADD CONSTRAINT "scholarship_auto_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_auto_assignments" ADD CONSTRAINT "scholarship_auto_assignments_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_auto_assignments" ADD CONSTRAINT "scholarship_auto_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_auto_rules" ADD CONSTRAINT "scholarship_auto_rules_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_auto_rules" ADD CONSTRAINT "scholarship_auto_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_benefits" ADD CONSTRAINT "scholarship_benefits_scholarship_type_id_scholarship_types_id_fk" FOREIGN KEY ("scholarship_type_id") REFERENCES "public"."scholarship_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_criteria" ADD CONSTRAINT "scholarship_criteria_scholarship_type_id_scholarship_types_id_fk" FOREIGN KEY ("scholarship_type_id") REFERENCES "public"."scholarship_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_types" ADD CONSTRAINT "scholarship_types_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_scholarship_type_id_scholarship_types_id_fk" FOREIGN KEY ("scholarship_type_id") REFERENCES "public"."scholarship_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_closures_campus_fecha_unique" ON "cash_closures" USING btree ("campus_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "charge_surcharge_periods_charge_month_unique" ON "charge_surcharge_periods" USING btree ("charge_id","periodo_mes");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_due_date_periods_unique" ON "payment_due_date_periods" USING btree ("tenant_id","campus_id","concept_id","ciclo_escolar","periodo_clave");--> statement-breakpoint
CREATE UNIQUE INDEX "products_campus_codigo_unique" ON "products" USING btree ("campus_id","codigo");