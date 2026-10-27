import { pgTable, text, integer, timestamp, jsonb, uniqueIndex, unique, index, check, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Additive, isolated ledger. Legacy notifications and approvals remain untouched.
export const emailNotificationIntents = pgTable("email_notification_intents", {
  id: text("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  campusId: integer("campus_id").notNull(),
  requestedBy: integer("requested_by").notNull(),
  canonicalKey: text("canonical_key").notNull(),
  selection: jsonb("selection").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  content: jsonb("content").notNull(),
  configFingerprint: text("config_fingerprint").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  uniqueIndex("email_intents_scope_key_unique").on(t.tenantId, t.campusId, t.canonicalKey),
  unique("email_intents_id_scope_unique").on(t.id, t.tenantId, t.campusId),
  check("email_intents_scope_positive", sql`${t.tenantId} > 0 AND ${t.campusId} > 0 AND ${t.requestedBy} > 0`),
]);

export const emailNotificationBatches = pgTable("email_notification_batches", {
  id: text("id").primaryKey(),
  intentId: text("intent_id").notNull(),
  tenantId: integer("tenant_id").notNull(),
  campusId: integer("campus_id").notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  uniqueIndex("email_batches_intent_unique").on(t.intentId),
  unique("email_batches_id_scope_unique").on(t.id, t.tenantId, t.campusId),
  index("email_batches_scope_created_idx").on(t.tenantId, t.campusId, t.createdAt),
  foreignKey({ name: "email_batches_intent_scope_fk", columns: [t.intentId, t.tenantId, t.campusId],
    foreignColumns: [emailNotificationIntents.id, emailNotificationIntents.tenantId, emailNotificationIntents.campusId] }),
]);

export const emailNotificationRecipients = pgTable("email_notification_recipients", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  tenantId: integer("tenant_id").notNull(),
  campusId: integer("campus_id").notNull(),
  recipientKey: text("recipient_key").notNull(),
  email: text("email"),
  studentIds: jsonb("student_ids").notNull(),
  guardianIds: jsonb("guardian_ids").notNull(),
  estado: text("estado").notNull().default("pendiente"),
  motivo: text("motivo"),
  providerKey: text("provider_key").notNull(),
  providerMessageId: text("provider_message_id"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  enviadoEn: timestamp("enviado_en", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  retries: integer("retries").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
  claimId: text("claim_id"),
  claimedUntil: timestamp("claimed_until", { withTimezone: true }),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  uniqueIndex("email_recipients_batch_address_unique").on(t.batchId, t.recipientKey),
  uniqueIndex("email_recipients_provider_key_unique").on(t.providerKey),
  unique("email_recipients_id_scope_unique").on(t.id,t.tenantId,t.campusId),
  index("email_recipients_provider_message_idx").on(t.providerMessageId),
  index("email_recipients_claim_idx").on(t.estado, t.nextAttemptAt),
  index("email_recipients_scope_idx").on(t.tenantId, t.campusId, t.batchId),
  foreignKey({ name: "email_recipients_batch_scope_fk", columns: [t.batchId, t.tenantId, t.campusId],
    foreignColumns: [emailNotificationBatches.id, emailNotificationBatches.tenantId, emailNotificationBatches.campusId] }),
  check("email_recipients_state_check", sql`${t.estado} IN ('pendiente','enviando','aceptado','entregado','rebotado','queja','error','incierto','omitido')`),
  check("email_recipients_evidence_check", sql`(
    (${t.providerMessageId} IS NULL AND ${t.acceptedAt} IS NULL AND ${t.enviadoEn} IS NULL AND ${t.estado} NOT IN ('aceptado','entregado','rebotado','queja'))
    OR (${t.providerMessageId} IS NOT NULL AND length(${t.providerMessageId}) > 0 AND ${t.acceptedAt} IS NOT NULL AND ${t.enviadoEn} IS NOT NULL AND ${t.enviadoEn} = ${t.acceptedAt})
  )`),
  check("email_recipients_retry_check", sql`${t.attempts} >= 0 AND ${t.retries} BETWEEN 0 AND 3`),
]);

export const emailProviderGate = pgTable("email_provider_gate", {
  provider: text("provider").primaryKey(),
  nextAllowedAt: timestamp("next_allowed_at", { withTimezone: true }).defaultNow().notNull(),
  pauseReason: text("pause_reason"),
});

export const emailNotificationAttempts = pgTable("email_notification_attempts", {
  id: text("id").primaryKey(),
  recipientId: text("recipient_id").notNull().references(() => emailNotificationRecipients.id),
  tenantId: integer("tenant_id").notNull(),
  campusId: integer("campus_id").notNull(),
  outcome: text("outcome").notNull(),
  code: text("code"),
  actorId: integer("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("email_attempts_recipient_idx").on(t.recipientId, t.createdAt)]);
