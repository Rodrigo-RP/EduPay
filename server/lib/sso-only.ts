/**
 * server/lib/sso-only.ts
 *
 * SSO_ONLY: EduPay deja de tener inicio de sesión propio; solo se entra desde el Dashboard (SSO). Apagado por defecto.
 *
 * - `SSO_ONLY=true` cierra el inicio de sesión con contraseña (personal y tutores) y los enlaces mágicos.
 * - Acceso de emergencia: con `EMERGENCY_LOGIN_ENABLED=true`, `POST /api/auth/login` solo acepta a un superadministrador
 *   con TOTP configurado (contraseña + código), para no quedar fuera si el Dashboard falla. Cualquier otro usuario recibe
 *   el mismo error que una credencial inválida, así que la ruta no revela qué cuentas existen.
 * - Es arranque seguro: con `SSO_ONLY=true` el servicio se niega a iniciar si el SSO no está bien configurado o si falta
 *   la URL del Dashboard (sin ellas nadie podría entrar y el cliente no sabría adónde mandar a la persona).
 */
import type { NextFunction, Request, Response } from "express";
import { loadSsoConfig } from "./sso/config";

const flag = (value: string | undefined): boolean => (value ?? "").trim().toLowerCase() === "true";

export function isSsoOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return flag(env.SSO_ONLY);
}

export function isEmergencyLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isSsoOnly(env) && flag(env.EMERGENCY_LOGIN_ENABLED);
}

export const LOGIN_DISABLED_MESSAGE = "El acceso directo a EduPay está deshabilitado. Entra desde el Dashboard.";

/** Lanza si `SSO_ONLY` está encendido sin un SSO utilizable. Se llama al arrancar. */
export function assertSsoOnlyStartup(env: NodeJS.ProcessEnv = process.env): void {
  if (!isSsoOnly(env)) return;
  const sso = loadSsoConfig(env);
  if (!sso.ok) {
    const detail = sso.reason === "disabled" ? "SSO_ENABLED no es true" : sso.detail;
    throw new Error(`SSO_ONLY=true exige un SSO válido (${detail}). Se evita arrancar para no dejar a todos sin acceso.`);
  }
  if (!sso.config.dashboardUrl) {
    throw new Error("SSO_ONLY=true exige SSO_DASHBOARD_URL (https) para regresar a las personas al Dashboard.");
  }
}

/** Cierra una ruta de acceso directo cuando `SSO_ONLY` está encendido. Se evalúa en cada petición. */
export function ssoOnlyGate(env: NodeJS.ProcessEnv = process.env) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!isSsoOnly(env)) return next();
    res.setHeader("Cache-Control", "no-store");
    return res.status(403).json({ code: "LOGIN_DISABLED", message: LOGIN_DISABLED_MESSAGE });
  };
}

interface EmergencyCandidate { is_super_admin?: boolean | null; twofa_secret?: string | null }

/** Con `SSO_ONLY` encendido, solo un superadministrador con TOTP configurado puede usar la contraseña. */
export function canUseEmergencyLogin(user: EmergencyCandidate, env: NodeJS.ProcessEnv = process.env): boolean {
  return isEmergencyLoginEnabled(env) && user.is_super_admin === true && Boolean(user.twofa_secret);
}
