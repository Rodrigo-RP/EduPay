CREATE TABLE "credit_refund_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"refund_id" integer NOT NULL,
	"provider_event_id" varchar(100) NOT NULL,
	"payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_refund_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "credit_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"credit_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"method" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'preparada' NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"business_date" date,
	"tracking_key" varchar(100),
	"idempotency_key" varchar(100) NOT NULL,
	"stripe_refund_id" varchar(100),
	"payment_intent_id" varchar(100),
	"destination" varchar(100),
	"stripe_status" varchar(30),
	"attempted_at" timestamp with time zone,
	"last_event_created" bigint DEFAULT 0 NOT NULL,
	"return_status" varchar(24) DEFAULT 'no_necesario' NOT NULL,
	"return_key" varchar(100) NOT NULL,
	"return_transfer_id" varchar(100),
	"return_attempted_at" timestamp with time zone,
	"incident" text,
	CONSTRAINT "credit_refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_refunds_stripe_refund_id_unique" UNIQUE("stripe_refund_id"),
	CONSTRAINT "credit_refunds_return_key_unique" UNIQUE("return_key"),
	CONSTRAINT "credit_refunds_return_transfer_id_unique" UNIQUE("return_transfer_id"),
	CONSTRAINT "credit_refunds_amount_positive" CHECK ("credit_refunds"."amount_centavos" > 0),
	CONSTRAINT "credit_refunds_method" CHECK ("credit_refunds"."method" IN ('stripe','efectivo','transferencia_escuela')),
	CONSTRAINT "credit_refunds_status" CHECK ("credit_refunds"."status" IN ('preparada','pendiente','requiere_accion','exitosa','fallida','rechazada')),
	CONSTRAINT "credit_refunds_return_status" CHECK ("credit_refunds"."return_status" IN ('no_necesario','esperando_fondos','pendiente','fallido','completo')),
	CONSTRAINT "credit_refunds_manual_evidence" CHECK ("credit_refunds"."method" <> 'transferencia_escuela' OR "credit_refunds"."status" <> 'exitosa' OR ("credit_refunds"."tracking_key" IS NOT NULL AND "credit_refunds"."business_date" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "credit_refund_events" ADD CONSTRAINT "credit_refund_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refund_events" ADD CONSTRAINT "credit_refund_events_refund_id_credit_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."credit_refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_credit_id_family_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."family_credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_refunds_scope" ON "credit_refunds" USING btree ("tenant_id","campus_id");--> statement-breakpoint
CREATE INDEX "credit_refunds_payment" ON "credit_refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_refunds_one_live_credit" ON "credit_refunds" USING btree ("credit_id") WHERE "credit_refunds"."status" IN ('preparada','pendiente','requiere_accion','exitosa') OR "credit_refunds"."return_status" IN ('esperando_fondos','pendiente','fallido');