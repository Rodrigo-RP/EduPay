import type { Express } from "express";
import type { EmailDatabase } from "./repository";
import { PgEmailRepository } from "./pg-repository";
import { EmailService } from "./service";
import { readEmailConfig } from "./config";
import { registerEmailNotificationRoutes, type EmailRouteDependencies } from "../../routes/email-notifications";

// Registration only. No timers, workers, network calls, schema creation or transport
// construction at import time. Worker activation requires separate authorization.
export function registerEmailRuntime(app: Express, database: EmailDatabase,
  authenticate: EmailRouteDependencies["authenticate"], can: EmailRouteDependencies["can"]) {
  registerEmailNotificationRoutes(app,{
    service:new EmailService(new PgEmailRepository(database),()=>readEmailConfig()),authenticate,can,
  });
}
