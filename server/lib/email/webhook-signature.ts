import { z } from "zod/v4";
import { Webhook } from "svix";
import type { IncomingHttpHeaders } from "node:http";
import type { VerifiedEmailEvent } from "./webhook-types";

// Official Svix SDK, exact pinned release. No homemade cryptography.
// No secret/Zod error is returned or logged. Missing configuration fails closed.
const signingSecret = z.string().trim().max(256)
  .regex(/^whsec_[A-Za-z0-9+/]{32,}={0,2}$/)
  .refine(value => {
    const encoded = value.slice(6);
    const decoded = Buffer.from(encoded, "base64");
    return decoded.length >= 24 && decoded.toString("base64").replace(/=+$/, "") === encoded.replace(/=+$/, "");
  });
const headersSchema = z.object({
  id: z.string().min(1).max(256),
  timestamp: z.string().regex(/^\d{1,12}$/),
  signature: z.string().min(1).max(2048),
});
const providerCode = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const eventSchema = z.object({
  type: z.string().min(1).max(128),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({
    email_id: z.guid({ error: "Invalid uuid" }),
    bounce: z.object({type:providerCode,subType:providerCode}).optional(),
    failed: z.object({reason:providerCode}).optional(),
  }),
});
export type WebhookVerifier = (payload: Buffer, headers: IncomingHttpHeaders) =>
  Pick<VerifiedEmailEvent, "eventId" | "eventType" | "messageId" | "occurredAt" | "details">;
export function hasRequiredWebhookHeaders(headers:IncomingHttpHeaders):boolean {
  return headersSchema.safeParse({id:headers["svix-id"],timestamp:headers["svix-timestamp"],
    signature:headers["svix-signature"]}).success;
}

export function createResendWebhookVerifier(env: NodeJS.ProcessEnv = process.env): WebhookVerifier | null {
  const parsed = signingSecret.safeParse(env.RESEND_WEBHOOK_SECRET);
  if (!parsed.success) return null;
  const webhook = new Webhook(parsed.data);
  return (payload, headers) => {
    const h = headersSchema.parse({
      id: headers["svix-id"], timestamp: headers["svix-timestamp"], signature: headers["svix-signature"],
    });
    // The library checks the timestamp (five-minute tolerance), signature versions,
    // multiple signatures during rotation, and constant-time comparison.
    const authenticated = webhook.verify(payload, {
      "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature,
    });
    const event = eventSchema.safeParse(authenticated);
    if (event.success) return {
      eventId: h.id, eventType: event.data.type,
      messageId: event.data.data.email_id, occurredAt: event.data.created_at,
      details: {
        ...(event.data.data.bounce ? {bounceType:event.data.data.bounce.type,bounceSubType:event.data.data.bounce.subType} : {}),
        ...(event.data.data.failed ? {failedReason:event.data.data.failed.reason} : {}),
      },
    };
    // Authenticated but unsupported/malformed events remain durable for review.
    // No email addresses, SMTP diagnostics, tags or payload-supplied scope escape.
    const type = z.object({ type: z.string().min(1).max(128) }).safeParse(authenticated);
    return { eventId: h.id, eventType: type.success ? type.data.type : "desconocido",
      messageId: null, occurredAt: null };
  };
}
