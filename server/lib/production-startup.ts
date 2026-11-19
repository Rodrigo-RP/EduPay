import { z } from "zod/v4";
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

/**
 * Motivo legible de un fallo al leer el marcador de la base, sin datos sensibles: solo el código del error
 * (p. ej. 28P01 = contraseña rechazada) y una explicación fija. Nunca incluye la cadena de conexión ni el mensaje original.
 */
export function describeMarkerFailure(error: unknown): string {
  const raw = (error as { code?: unknown } | null)?.code;
  const code = typeof raw === "string" && /^[A-Za-z0-9_]{3,20}$/.test(raw) ? raw : null;
  const message = error instanceof Error ? error.message : "";
  if (/password must be a string/i.test(message)) return "la contraseña de DATABASE_URL está vacía";
  switch (code) {
    case "28P01": return "la base rechazó la contraseña del usuario (28P01)";
    case "28000": return "la base rechazó al usuario (28000)";
    case "3D000": return "la base indicada en DATABASE_URL no existe (3D000)";
    case "ECONNREFUSED": case "ENOENT": case "ETIMEDOUT": case "ENOTFOUND":
      return "no hay conexión con la base; revisa el host o el socket de Cloud SQL (" + code + ")";
    default: return code ? "código de error " + code : "causa no identificada";
  }
}

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
  catch (error) { throw new ProductionStartupError("Arranque de producción bloqueado: no se pudo verificar el marcador de la base (" + describeMarkerFailure(error) + ")."); }
  if (marker === "edupay:test" || marker === "edupay:demo") {
    throw new ProductionStartupError("Arranque de producción bloqueado: la base está marcada como pruebas o demo.");
  }
}
