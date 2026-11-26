/**
 * Enlace de regreso al Dashboard. La URL viene de `/api/auth/sso/config` (la fija el servidor, no el usuario).
 * Solo se acepta http(s): cualquier otro esquema (javascript:, data:) se descarta.
 *
 * El portal de tutores solo puede llamar a `/api/guardian/*` (lo exige la prueba e2e 36), así que la URL se guarda
 * al entrar por SSO (página /sso) y el portal la lee de localStorage sin hacer ninguna petición.
 */
export const DASHBOARD_URL_KEY = "sso_dashboard_url";

export function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function safeDashboardUrl(cfg: unknown): string | null {
  const c = cfg as { enabled?: unknown; dashboard_url?: unknown } | null | undefined;
  if (!c || c.enabled !== true) return null;
  return httpUrl(c.dashboard_url);
}

/** Guarda la URL del Dashboard al entrar por SSO. Si no hay almacenamiento, el botón simplemente no aparece. */
export function rememberDashboardUrl(cfg: unknown): void {
  const url = safeDashboardUrl(cfg);
  try {
    if (url) localStorage.setItem(DASHBOARD_URL_KEY, url);
  } catch { /* nada */ }
}

export function storedDashboardUrl(): string | null {
  try {
    return httpUrl(localStorage.getItem(DASHBOARD_URL_KEY));
  } catch {
    return null;
  }
}

export async function fetchDashboardUrl(): Promise<string | null> {
  const res = await fetch("/api/auth/sso/config", { cache: "no-store" });
  if (!res.ok) return null;
  return safeDashboardUrl(await res.json());
}
