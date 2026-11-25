/**
 * Enlace de regreso al Dashboard. La URL viene de `/api/auth/sso/config` (la fija el servidor, no el usuario).
 * Solo se acepta http(s): cualquier otro esquema (javascript:, data:) se descarta.
 */
export function safeDashboardUrl(cfg: unknown): string | null {
  const c = cfg as { enabled?: unknown; dashboard_url?: unknown } | null | undefined;
  if (!c || c.enabled !== true || typeof c.dashboard_url !== "string") return null;
  try {
    const url = new URL(c.dashboard_url);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function fetchDashboardUrl(): Promise<string | null> {
  const res = await fetch("/api/auth/sso/config", { cache: "no-store" });
  if (!res.ok) return null;
  return safeDashboardUrl(await res.json());
}
