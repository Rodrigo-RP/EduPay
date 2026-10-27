export const WEBHOOK_MAX_BODY_BYTES = 64 * 1024;
export const WEBHOOK_RAW_MAX_ROWS = 2000;
export const WEBHOOK_RAW_MAX_BYTES = 16 * 1024 * 1024;
export const WEBHOOK_RAW_TTL_HOURS = 24;
export const WEBHOOK_LEASE_MS = 60_000;
export const EMAIL_EVENT_TYPES = ["email.sent", "email.delivered", "email.bounced", "email.complained"] as const;
export type EmailEventType = typeof EMAIL_EVENT_TYPES[number];
export interface VerifiedEmailEvent {
  eventId: string;
  eventType: string;
  messageId: string | null;
  occurredAt: string | null;
  receiptId: string;
  payloadHash: string;
}
export interface EmailEventClaim extends VerifiedEmailEvent { claimId: string }
export interface EmailWebhookRepository {
  // Quarantine only: no trusted event ID, scope, headers or signature.
  saveRaw(payload: Buffer): Promise<string>;
  enqueue(event: VerifiedEmailEvent): Promise<void>;
  pruneRaw(): Promise<void>;
  claim(): Promise<EmailEventClaim | null>;
  process(claim: EmailEventClaim): Promise<void>;
}
export function isEmailEventType(value: string): value is EmailEventType {
  return (EMAIL_EVENT_TYPES as readonly string[]).includes(value);
}
