import { z } from "zod";

export const STRICT_LOGIN_RATE = Object.freeze({ windowMs: 15 * 60 * 1000, max: 10 });
const limits = z.object({
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000_000).default(STRICT_LOGIN_RATE.max),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(86_400_000).default(STRICT_LOGIN_RATE.windowMs),
});

export function loginRateConfig(env: NodeJS.ProcessEnv = process.env) {
  // Producción ignora incluso overrides malformados; nunca hereda los de desarrollo.
  const development = env.NODE_ENV !== "production" && ["development", "test"].includes(env.APP_ENV ?? "");
  const config = limits.parse(development ? {
    AUTH_RATE_LIMIT_MAX: env.AUTH_RATE_LIMIT_MAX,
    AUTH_RATE_LIMIT_WINDOW_MS: env.AUTH_RATE_LIMIT_WINDOW_MS,
  } : {});
  return { max: config.AUTH_RATE_LIMIT_MAX, windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS };
}
