import { z } from "zod";
import { Webhook } from "standardwebhooks";
import type { IncomingHttpHeaders } from "node:http";
import type { VerifiedEmailEvent } from "./webhook-types";

// Same verifier and header mapping as Resend's official SDK, not homemade crypto.
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
const eventSchema = z.object({
  type: z.string().min(1).max(128),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({ email_id: z.string().uuid() }),
});
export type WebhookVerifier = (payload: Buffer, headers: IncomingHttpHeaders) =>
  Pick<VerifiedEmailEvent, "eventId" | "eventType" | "messageId" | "occurredAt">;

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
      "webhook-id": h.id, "webhook-timestamp": h.timestamp, "webhook-signature": h.signature,
    });
    const event = eventSchema.safeParse(authenticated);
    if (event.success) return {
      eventId: h.id, eventType: event.data.type,
      messageId: event.data.data.email_id, occurredAt: event.data.created_at,
    };
    // Authenticated but unsupported/malformed events remain durable for review.
    // No email addresses, SMTP diagnostics, tags or payload-supplied scope escape.
    const type = z.object({ type: z.string().min(1).max(128) }).safeParse(authenticated);
    return { eventId: h.id, eventType: type.success ? type.data.type : "desconocido",
      messageId: null, occurredAt: null };
  };
}
