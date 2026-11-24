import { createPublicKey } from "node:crypto";

/**
 * Configuración del inicio de sesión único (SSO) desde el Dashboard-Refereence.
 *
 * El Dashboard firma una aserción de vida corta con una llave privada ES256 que vive
 * en su Secret Manager; EduPay solo conserva la llave PÚBLICA, así que EduPay no guarda
 * ningún secreto con el que se puedan fabricar aserciones.
 *
 *   SSO_ENABLED                 "true" para activar los endpoints (por defecto apagado)
 *   SSO_PUBLIC_KEY              llave pública ES256 (P-256) en PEM; acepta "\n" escapados
 *   SSO_ISSUER                  `iss` esperado (p. ej. "dashboard-refereence")
 *   SSO_AUDIENCE                `aud` esperado (por defecto "edupay")
 *   SSO_SESSION_TTL_MINUTES     TOPE ABSOLUTO de la sesión de EduPay desde la entrada (5 a 240, por defecto 60)
 *   SSO_IDLE_MINUTES            inactividad máxima: cada token vale esto y solo se renueva con uso (5 a 240, por defecto 60)
 *   SSO_ASSERTION_MAX_AGE_SECONDS  vida máxima de una aserción, exp - iat (10 a 300, por defecto 120)
 *   SSO_DASHBOARD_URL           URL https del Dashboard, solo para el botón "Volver al Dashboard" (opcional)
 */
export interface SsoConfig {
  publicKey: string;
  issuer: string;
  audience: string;
  sessionTtlMinutes: number;
  /** Vida de cada token de sesión: pasado este tiempo sin renovarse, la sesión termina. */
  idleMinutes: number;
  assertionMaxAgeSeconds: number;
  /** URL del Dashboard para el botón "Volver al Dashboard"; null si no se configuró o no es https. */
  dashboardUrl: string | null;
}

export type SsoConfigResult =
  | { ok: true; config: SsoConfig }
  | { ok: false; reason: "disabled" | "misconfigured"; detail?: string };

/** Solo https (o http en localhost para desarrollo); cualquier otra cosa se descarta. */
const safeUrl = (raw: string | undefined): string | null => {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) return u.origin + (u.pathname === "/" ? "" : u.pathname);
  } catch { /* se descarta */ }
  return null;
};

const clampInt = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

export function loadSsoConfig(env: NodeJS.ProcessEnv = process.env): SsoConfigResult {
  if (env.SSO_ENABLED !== "true") return { ok: false, reason: "disabled" };

  const publicKey = (env.SSO_PUBLIC_KEY ?? "").replace(/\\n/g, "\n").trim();
  const issuer = (env.SSO_ISSUER ?? "").trim();
  if (!publicKey) return { ok: false, reason: "misconfigured", detail: "Falta SSO_PUBLIC_KEY" };
  if (!issuer) return { ok: false, reason: "misconfigured", detail: "Falta SSO_ISSUER" };

  try {
    const key = createPublicKey(publicKey);
    const curve = key.asymmetricKeyDetails?.namedCurve;
    if (key.asymmetricKeyType !== "ec" || curve !== "prime256v1") {
      return { ok: false, reason: "misconfigured", detail: "SSO_PUBLIC_KEY debe ser una llave EC P-256 (ES256)" };
    }
  } catch {
    return { ok: false, reason: "misconfigured", detail: "SSO_PUBLIC_KEY no es un PEM público válido" };
  }

  return {
    ok: true,
    config: {
      publicKey,
      issuer,
      audience: (env.SSO_AUDIENCE ?? "edupay").trim() || "edupay",
      sessionTtlMinutes: clampInt(env.SSO_SESSION_TTL_MINUTES, 60, 5, 240),
      idleMinutes: clampInt(env.SSO_IDLE_MINUTES, 60, 5, 240),
      assertionMaxAgeSeconds: clampInt(env.SSO_ASSERTION_MAX_AGE_SECONDS, 120, 10, 300),
      dashboardUrl: safeUrl(env.SSO_DASHBOARD_URL),
    },
  };
}
