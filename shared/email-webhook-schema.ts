import { pgTable, text, integer, timestamp, index, check, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { emailNotificationRecipients } from "./email-schema";

// Provider-level quarantine. No scope is trusted before correlation; never exposed
// through tenant APIs. Only bounded raw bytes are kept, no signature/secret/headers.
export const emailWebhookReceipts = pgTable("email_webhook_receipts", {
  id:text("id").primaryKey(),
  payloadBase64:text("payload_base64").notNull(),
  payloadSize:integer("payload_size").notNull(),
  payloadHash:text("payload_hash").notNull(),
  receivedAt:timestamp("received_at",{withTimezone:true}).defaultNow().notNull(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
},t=>[
  index("email_webhook_receipts_expiry_idx").on(t.expiresAt),
  check("email_webhook_receipts_size_check",sql`${t.payloadSize} BETWEEN 0 AND 65536 AND length(${t.payloadBase64}) <= 87384`),
  check("email_webhook_receipts_ttl_check",sql`${t.expiresAt} > ${t.receivedAt} AND ${t.expiresAt} <= ${t.receivedAt} + INTERVAL '24 hours'`),
]);

export const emailWebhookEvents = pgTable("email_webhook_events", {
  providerEventId:text("provider_event_id").primaryKey(), // only after authentication
  eventType:text("event_type").notNull(),
  providerMessageId:text("provider_message_id"),
  occurredAt:timestamp("occurred_at",{withTimezone:true}),
  receiptId:text("receipt_id").notNull(), // provenance ID, intentionally survives raw TTL
  payloadHash:text("payload_hash").notNull(),
  receivedAt:timestamp("received_at",{withTimezone:true}).defaultNow().notNull(),
  status:text("status").default("pendiente").notNull(),
  recipientId:text("recipient_id"),
  tenantId:integer("tenant_id"),
  campusId:integer("campus_id"),
  claimId:text("claim_id"),
  claimedUntil:timestamp("claimed_until",{withTimezone:true}),
  attempts:integer("attempts").default(0).notNull(),
  nextAttemptAt:timestamp("next_attempt_at",{withTimezone:true}).defaultNow().notNull(),
  processedAt:timestamp("processed_at",{withTimezone:true}),
  errorCode:text("error_code"),
},t=>[
  index("email_webhook_events_claim_idx").on(t.status,t.nextAttemptAt),
  index("email_webhook_events_message_idx").on(t.providerMessageId),
  index("email_webhook_events_scope_idx").on(t.tenantId,t.campusId,t.recipientId),
  foreignKey({name:"email_webhook_events_recipient_scope_fk",
    columns:[t.recipientId,t.tenantId,t.campusId],
    foreignColumns:[emailNotificationRecipients.id,emailNotificationRecipients.tenantId,emailNotificationRecipients.campusId]}),
  check("email_webhook_events_state_check",sql`${t.status} IN ('pendiente','procesando','procesado','sin_correlacion','ignorado','revision')`),
  check("email_webhook_events_scope_check",sql`(
    (${t.recipientId} IS NULL AND ${t.tenantId} IS NULL AND ${t.campusId} IS NULL AND ${t.status} <> 'procesado')
    OR (${t.recipientId} IS NOT NULL AND ${t.tenantId} IS NOT NULL AND ${t.campusId} IS NOT NULL
      AND ${t.tenantId} > 0 AND ${t.campusId} > 0 AND ${t.status} = 'procesado'
      AND ${t.processedAt} IS NOT NULL AND ${t.providerMessageId} IS NOT NULL AND ${t.occurredAt} IS NOT NULL
      AND ${t.eventType} IN ('email.sent','email.delivered','email.bounced','email.complained'))
  )`),
  check("email_webhook_events_bounds_check",sql`length(${t.providerEventId}) BETWEEN 1 AND 256 AND length(${t.eventType}) BETWEEN 1 AND 128
    AND (${t.providerMessageId} IS NULL OR length(${t.providerMessageId}) <= 256) AND ${t.attempts} >= 0`),
]);
