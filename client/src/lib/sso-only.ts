/**
 * SSO_ONLY en el cliente: decide qué mostrar cuando no hay sesión.
 * La configuración pública viene de `/api/auth/sso/config` (`sso_only` solo se anuncia con un SSO válido).
 */
import { httpUrl } from "./dashboard-link";

/** Ruta del acceso de emergencia del superadministrador (solo existe si el servidor la habilita). */
export const EMERGENCY_PATH = "/acceso-emergencia";

export type LoginDecision =
  | { kind: "normal" }
  | { kind: "emergency" }
  | { kind: "redirect"; url: string }
  | { kind: "blocked" };

export function decideLogin(cfg: unknown, pathname: string): LoginDecision {
  const c = cfg as { enabled?: unknown; dashboard_url?: unknown; sso_only?: unknown; emergency_login?: unknown } | null | undefined;
  if (!c || c.enabled !== true || c.sso_only !== true) return { kind: "normal" };
  if (pathname === EMERGENCY_PATH && c.emergency_login === true) return { kind: "emergency" };
  const url = httpUrl(c.dashboard_url);
  return url ? { kind: "redirect", url } : { kind: "blocked" };
}

/**
 * Para las pantallas de tutores, que no pueden consultar la configuración antes de iniciar sesión (solo llaman a
 * `/api/guardian/*`): si el servidor responde LOGIN_DISABLED, se manda a la persona al Dashboard. Devuelve true si redirigió.
 */
/**
 * Lleva al navegador al Dashboard. No redirige a la dirección en la que ya está (si `SSO_DASHBOARD_URL` apuntara a EduPay
 * mismo, cada carga volvería a redirigir en bucle). Devuelve true si navegó.
 */
export function goToDashboard(url: string): boolean {
  if (url === window.location.href) return false;
  window.location.replace(url);
  return true;
}

export async function redirectWhenLoginDisabled(serverReply: string | { code?: unknown } | null | undefined): Promise<boolean> {
  const disabled = typeof serverReply === "string" ? serverReply.includes("LOGIN_DISABLED") : serverReply?.code === "LOGIN_DISABLED";
  if (!disabled) return false;
  const decision = await fetchLoginDecision("/");
  if (decision.kind !== "redirect") return false;
  return goToDashboard(decision.url);
}

export async function fetchLoginDecision(pathname: string): Promise<LoginDecision> {
  try {
    const res = await fetch("/api/auth/sso/config", { cache: "no-store" });
    if (!res.ok) return { kind: "normal" };
    return decideLogin(await res.json(), pathname);
  } catch {
    // Sin respuesta del servidor no se puede saber: se muestra el acceso normal (el servidor sigue siendo quien decide).
    return { kind: "normal" };
  }
}
