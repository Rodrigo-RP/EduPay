import jwt, { type JwtPayload } from "jsonwebtoken";
import { passwordVersion } from "./session-version";

export const STAFF_SESSION_SECONDS = 8 * 60 * 60;
export function staffSessionExpired(claims: JwtPayload, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const start = claims.session_started_at ?? claims.iat;
  return typeof start !== "number" || start > nowSeconds + 30 || nowSeconds - start >= STAFF_SESSION_SECONDS;
}
export function signStaffSession(user: {
  id: number; email: string; role: string; campus_id: number | null; tenant_id: number | null;
  is_super_admin?: boolean | null; password_changed_at?: Date | string | null;
}, key: string, verified: boolean, sessionStartedAt = Math.floor(Date.now() / 1000)): string {
  return jwt.sign({
    id: user.id, email: user.email, role: user.role, campus_id: user.campus_id,
    tenant_id: user.tenant_id, is_super_admin: user.is_super_admin, type: "user",
    password_version: passwordVersion(user.password_changed_at ? new Date(user.password_changed_at) : null),
    twofa_verified: verified, session_started_at: sessionStartedAt,
  }, key, { expiresIn: Math.max(1, sessionStartedAt + STAFF_SESSION_SECONDS - Math.floor(Date.now() / 1000)) });
}

export function staffAccessDenial(claims: JwtPayload, method: string, url: string): { code: string; message: string } | null {
  if (claims.type === "guardian" || staffSessionExpired(claims)) {
    return { code: "SESSION_EXPIRED", message: "Tu sesión terminó. Inicia sesión de nuevo." };
  }
  if (claims.twofa_verified === true) return null;
  const path = url.split("?")[0];
  // Lista exacta: una sesión que sólo pasó contraseña no accede a datos de negocio.
  if ((method === "GET" && path === "/api/auth/user") ||
      (method === "PUT" && path === "/api/profile/password") ||
      (method === "POST" && ["/api/auth/2fa/setup", "/api/auth/2fa/confirm"].includes(path))) return null;
  return { code: "TWOFA_SETUP_REQUIRED", message: "Configura la autenticación de dos factores antes de continuar." };
}
