import { z } from "zod";
import { totpEncryptionKeySchema } from "./totp-crypto";

export class ProductionStartupError extends Error {}
const productionEnvironment = z.object({
  APP_ENV: z.literal("production"),
  NODE_ENV: z.literal("production"),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  TOTP_ENCRYPTION_KEY: totpEncryptionKeySchema,
  // El módulo de pagos construye su SDK al importarse; no se llama al proveedor.
  STRIPE_SECRET_KEY: z.string().min(1),
  BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  ALLOW_DEMO_SEED: z.string().optional().refine(value => value?.trim().toLowerCase() !== "true"),
});

export async function validateProductionStartup(
  env: NodeJS.ProcessEnv,
  readMarker: () => Promise<unknown>,
): Promise<void> {
  if (env.APP_ENV !== "production" && env.NODE_ENV !== "production") return;
  const config = productionEnvironment.safeParse(env);
  if (!config.success) {
    // No imprimir ZodError ni valores: sólo nombres de variables.
    throw new ProductionStartupError(`Arranque de producción bloqueado. Revisa: ${Array.from(new Set(config.error.issues.map(issue => issue.path.join(".")))).join(", ")}.`);
  }
  let marker: unknown;
  try { marker = await readMarker(); }
  catch { throw new ProductionStartupError("Arranque de producción bloqueado: no se pudo verificar el marcador de la base."); }
  if (marker === "edupay:test" || marker === "edupay:demo") {
    throw new ProductionStartupError("Arranque de producción bloqueado: la base está marcada como pruebas o demo.");
  }
}
