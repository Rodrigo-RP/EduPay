CREATE TABLE "email_webhook_events" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"provider_message_id" text,
	"occurred_at" timestamp with time zone,
	"receipt_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"recipient_id" text,
	"tenant_id" integer,
	"campus_id" integer,
	"claim_id" text,
	"claimed_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "email_webhook_events_state_check" CHECK ("email_webhook_events"."status" IN ('pendiente','procesando','procesado','sin_correlacion','ignorado','revision')),
	CONSTRAINT "email_webhook_events_scope_check" CHECK ((
    ("email_webhook_events"."recipient_id" IS NULL AND "email_webhook_events"."tenant_id" IS NULL AND "email_webhook_events"."campus_id" IS NULL AND "email_webhook_events"."status" <> 'procesado')
    OR ("email_webhook_events"."recipient_id" IS NOT NULL AND "email_webhook_events"."tenant_id" IS NOT NULL AND "email_webhook_events"."campus_id" IS NOT NULL
      AND "email_webhook_events"."tenant_id" > 0 AND "email_webhook_events"."campus_id" > 0 AND "email_webhook_events"."status" = 'procesado'
      AND "email_webhook_events"."processed_at" IS NOT NULL AND "email_webhook_events"."provider_message_id" IS NOT NULL AND "email_webhook_events"."occurred_at" IS NOT NULL
      AND "email_webhook_events"."event_type" IN ('email.sent','email.delivered','email.bounced','email.complained'))
  )),
	CONSTRAINT "email_webhook_events_bounds_check" CHECK (length("email_webhook_events"."provider_event_id") BETWEEN 1 AND 256 AND length("email_webhook_events"."event_type") BETWEEN 1 AND 128
    AND ("email_webhook_events"."provider_message_id" IS NULL OR length("email_webhook_events"."provider_message_id") <= 256) AND "email_webhook_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "email_webhook_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"payload_base64" text NOT NULL,
	"payload_size" integer NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "email_webhook_receipts_size_check" CHECK ("email_webhook_receipts"."payload_size" BETWEEN 0 AND 65536 AND length("email_webhook_receipts"."payload_base64") <= 87384),
	CONSTRAINT "email_webhook_receipts_ttl_check" CHECK ("email_webhook_receipts"."expires_at" > "email_webhook_receipts"."received_at" AND "email_webhook_receipts"."expires_at" <= "email_webhook_receipts"."received_at" + INTERVAL '24 hours')
);
--> statement-breakpoint
ALTER TABLE "email_notification_recipients" ADD CONSTRAINT "email_recipients_id_scope_unique" UNIQUE("id","tenant_id","campus_id");--> statement-breakpoint
ALTER TABLE "email_webhook_events" ADD CONSTRAINT "email_webhook_events_recipient_scope_fk" FOREIGN KEY ("recipient_id","tenant_id","campus_id") REFERENCES "public"."email_notification_recipients"("id","tenant_id","campus_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_webhook_events_claim_idx" ON "email_webhook_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_webhook_events_message_idx" ON "email_webhook_events" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "email_webhook_events_scope_idx" ON "email_webhook_events" USING btree ("tenant_id","campus_id","recipient_id");--> statement-breakpoint
CREATE INDEX "email_webhook_receipts_expiry_idx" ON "email_webhook_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_recipients_provider_message_idx" ON "email_notification_recipients" USING btree ("provider_message_id");