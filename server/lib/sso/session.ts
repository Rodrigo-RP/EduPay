import { STAFF_SESSION_SECONDS } from "./../staff-session";
import { GUARDIAN_TOKEN_SECONDS } from "./../guardian-session-limits";
import type { SsoConfig } from "./config";

/**
 * Vida de un token de sesión por SSO, en segundos.
 *
 * Cada token dura como máximo `idleMinutes` (la inactividad tolerada) y nunca pasa del tope absoluto de la
 * sesión contado desde la entrada (`sessionTtlMinutes`; el personal además respeta el tope de 8 h del sistema).
 * Devuelve 0 cuando el tope ya se alcanzó: en ese caso no se renueva y hay que entrar de nuevo desde el Dashboard.
 */
export function ssoTokenSeconds(
  kind: "user" | "guardian",
  sessionStartedAt: number,
  cfg: SsoConfig,
  nowSec = Math.floor(Date.now() / 1000),
): number {
  const absoluteCap = Math.min(cfg.sessionTtlMinutes * 60, kind === "user" ? STAFF_SESSION_SECONDS : Number.POSITIVE_INFINITY);
  const idle = Math.min(cfg.idleMinutes * 60, kind === "user" ? STAFF_SESSION_SECONDS : GUARDIAN_TOKEN_SECONDS);
  if (!Number.isFinite(sessionStartedAt) || sessionStartedAt > nowSec + 30) return 0;
  const untilCap = sessionStartedAt + absoluteCap - nowSec;
  return Math.max(0, Math.min(idle, untilCap));
}
