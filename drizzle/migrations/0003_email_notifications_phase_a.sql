CREATE TABLE "email_notification_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"outcome" text NOT NULL,
	"code" text,
	"actor_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_notification_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_batches_id_scope_unique" UNIQUE("id","tenant_id","campus_id")
);
--> statement-breakpoint
CREATE TABLE "email_notification_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"canonical_key" text NOT NULL,
	"selection" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"config_fingerprint" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_intents_id_scope_unique" UNIQUE("id","tenant_id","campus_id"),
	CONSTRAINT "email_intents_scope_positive" CHECK ("email_notification_intents"."tenant_id" > 0 AND "email_notification_intents"."campus_id" > 0 AND "email_notification_intents"."requested_by" > 0)
);
--> statement-breakpoint
CREATE TABLE "email_notification_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"tenant_id" integer NOT NULL,
	"campus_id" integer NOT NULL,
	"recipient_key" text NOT NULL,
	"email" text,
	"student_ids" jsonb NOT NULL,
	"guardian_ids" jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"motivo" text,
	"provider_key" text NOT NULL,
	"provider_message_id" text,
	"accepted_at" timestamp with time zone,
	"enviado_en" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"claim_id" text,
	"claimed_until" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_recipients_state_check" CHECK ("email_notification_recipients"."estado" IN ('pendiente','enviando','aceptado','entregado','rebotado','queja','error','incierto','omitido')),
	CONSTRAINT "email_recipients_evidence_check" CHECK ((
    ("email_notification_recipients"."provider_message_id" IS NULL AND "email_notification_recipients"."accepted_at" IS NULL AND "email_notification_recipients"."enviado_en" IS NULL AND "email_notification_recipients"."estado" NOT IN ('aceptado','entregado','rebotado','queja'))
    OR ("email_notification_recipients"."provider_message_id" IS NOT NULL AND length("email_notification_recipients"."provider_message_id") > 0 AND "email_notification_recipients"."accepted_at" IS NOT NULL AND "email_notification_recipients"."enviado_en" IS NOT NULL AND "email_notification_recipients"."enviado_en" = "email_notification_recipients"."accepted_at")
  )),
	CONSTRAINT "email_recipients_retry_check" CHECK ("email_notification_recipients"."attempts" >= 0 AND "email_notification_recipients"."retries" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "email_provider_gate" (
	"provider" text PRIMARY KEY NOT NULL,
	"next_allowed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pause_reason" text
);
--> statement-breakpoint
ALTER TABLE "email_notification_attempts" ADD CONSTRAINT "email_notification_attempts_recipient_id_email_notification_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."email_notification_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_batches" ADD CONSTRAINT "email_batches_intent_scope_fk" FOREIGN KEY ("intent_id","tenant_id","campus_id") REFERENCES "public"."email_notification_intents"("id","tenant_id","campus_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notification_recipients" ADD CONSTRAINT "email_recipients_batch_scope_fk" FOREIGN KEY ("batch_id","tenant_id","campus_id") REFERENCES "public"."email_notification_batches"("id","tenant_id","campus_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_attempts_recipient_idx" ON "email_notification_attempts" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_batches_intent_unique" ON "email_notification_batches" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "email_batches_scope_created_idx" ON "email_notification_batches" USING btree ("tenant_id","campus_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_intents_scope_key_unique" ON "email_notification_intents" USING btree ("tenant_id","campus_id","canonical_key");--> statement-breakpoint
CREATE UNIQUE INDEX "email_recipients_batch_address_unique" ON "email_notification_recipients" USING btree ("batch_id","recipient_key");--> statement-breakpoint
CREATE UNIQUE INDEX "email_recipients_provider_key_unique" ON "email_notification_recipients" USING btree ("provider_key");--> statement-breakpoint
CREATE INDEX "email_recipients_claim_idx" ON "email_notification_recipients" USING btree ("estado","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_recipients_scope_idx" ON "email_notification_recipients" USING btree ("tenant_id","campus_id","batch_id");