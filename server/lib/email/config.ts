import { z } from "zod";
import type { EmailConfig } from "./types";

const address = z.string().trim().email().max(254);
// EMAIL_FROM accepts a bare address or the provider's documented Name <address> form.
const sender = z.string().trim().max(320).refine(v => {
  if (/[\r\n]/.test(v)) return false;
  return address.safeParse(v.match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? v).success;
});
const secrets = z.object({
  RESEND_API_KEY: z.string().trim().regex(/^re_[A-Za-z0-9_-]{10,}$/),
  EMAIL_FROM: sender,
  EMAIL_ALLOWED_RECIPIENTS: z.string().default("").transform(v =>
    v.split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean),
  ).pipe(z.array(address)),
});

export function readEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const environment = ["production", "development", "test"].includes(env.APP_ENV ?? "")
    ? env.APP_ENV as EmailConfig["environment"] : "unknown";
  const parsed = secrets.safeParse({
    RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM: env.EMAIL_FROM,
    EMAIL_ALLOWED_RECIPIENTS: env.EMAIL_ALLOWED_RECIPIENTS,
  });
  // No Zod error object escapes: it could contain secret input.
  if (!parsed.success || environment === "unknown") {
    return { configured: false, environment, apiKey: "", from: "", allowed: new Set() };
  }
  return {
    configured: true, environment, apiKey: parsed.data.RESEND_API_KEY,
    from: parsed.data.EMAIL_FROM, allowed: new Set(parsed.data.EMAIL_ALLOWED_RECIPIENTS),
  };
}

export function emailAllowed(email: string, config: EmailConfig): boolean {
  return config.environment === "production" ||
    (["development", "test"].includes(config.environment) && config.allowed.has(email));
}
