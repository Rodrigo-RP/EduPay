import type { Express } from "express";
import type { EmailDatabase } from "./repository";
import { PgEmailWebhookRepository } from "./pg-webhooks";
import { createResendWebhookVerifier } from "./webhook-signature";
import { registerResendWebhookRoute } from "../../routes/email-webhooks";

// Registration/config validation only. No connection, schema creation or worker.
export function registerEmailWebhookRuntime(app: Express, database: EmailDatabase) {
  registerResendWebhookRoute(app,new PgEmailWebhookRepository(database),createResendWebhookVerifier());
}
