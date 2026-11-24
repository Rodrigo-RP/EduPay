import jwt from "jsonwebtoken";
import type { SsoConfig } from "./config";

export type SsoPurpose = "sso_login" | "sso_eligibility";

export type SsoErrorCode =
  | "not_configured"
  | "invalid_assertion"
  | "replayed"
  | "school_not_enabled"
  | "not_linked"
  | "tenant_mismatch"
  | "account_disabled"
  | "forbidden_role"
  | "no_active_family"
  | "invalid_totp"
  | "session_ended"
  | "already_linked"
  | "invalid_request";

export class SsoError extends Error {
  constructor(public readonly code: SsoErrorCode, message: string) {
    super(message);
    this.name = "SsoError";
  }
}

export interface SsoClaims {
  /** uid de Firebase Auth */
  sub: string;
  jti: string;
  /** idEscuela de Firebase */
  idEscuela: string;
  email: string | null;
  rol: string | null;
  iat: number;
  exp: number;
  purpose: SsoPurpose;
}

const SUB_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const JTI_RE = /^[A-Za-z0-9_-]{16,128}$/;
const ESCUELA_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CLOCK_TOLERANCE_SECONDS = 5;

export const FIREBASE_UID_RE = SUB_RE;

const reject = (why: string): never => {
  // El motivo exacto no se devuelve al cliente (evita orientar a un atacante); solo se registra.
  throw new SsoError("invalid_assertion", why);
};

/**
 * Verifica una aserción firmada por el Dashboard: firma ES256, emisor, audiencia, vigencia,
 * propósito y forma de los claims. No toca la base de datos; el uso único (`jti`) lo aplica el servicio.
 */
export function verifySsoAssertion(
  token: string,
  cfg: SsoConfig,
  purpose: SsoPurpose,
  nowMs: number = Date.now(),
): SsoClaims {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) reject("token ausente o fuera de rango");

  let payload: any;
  try {
    payload = jwt.verify(token, cfg.publicKey, {
      algorithms: ["ES256"],
      issuer: cfg.issuer,
      audience: cfg.audience,
      clockTimestamp: Math.floor(nowMs / 1000),
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
  } catch (err) {
    return reject(`firma o vigencia inválidas (${(err as Error).name})`);
  }
  if (!payload || typeof payload !== "object") return reject("payload inválido");

  const { sub, jti, idEscuela, email, rol, iat, exp } = payload;
  if (payload.purpose !== purpose) return reject(`propósito esperado ${purpose}`);
  if (typeof sub !== "string" || !SUB_RE.test(sub)) return reject("sub inválido");
  if (typeof jti !== "string" || !JTI_RE.test(jti)) return reject("jti inválido");
  if (typeof idEscuela !== "string" || !ESCUELA_RE.test(idEscuela)) return reject("idEscuela inválido");
  if (typeof iat !== "number" || typeof exp !== "number") return reject("iat/exp ausentes");
  if (exp - iat > cfg.assertionMaxAgeSeconds) return reject("la aserción dura más de lo permitido");
  if (iat > Math.floor(nowMs / 1000) + CLOCK_TOLERANCE_SECONDS) return reject("iat en el futuro");
  if (email !== undefined && (typeof email !== "string" || email.length > 254)) return reject("email inválido");
  if (rol !== undefined && (typeof rol !== "string" || rol.length > 64)) return reject("rol inválido");

  return { sub, jti, idEscuela, email: email ?? null, rol: rol ?? null, iat, exp, purpose };
}
