/**
 * Sesión iniciada desde el Dashboard (SSO): se cierra tras 1 hora sin uso y regresa al Dashboard.
 *
 * - Cada token de EduPay vale 1 hora. Mientras la persona usa EduPay (mouse, teclado, toque o desplazamiento)
 *   se renueva en POST /api/auth/sso/renew. Sin uso, el token vence solo y no se puede revivir.
 * - El servidor impone además el tope absoluto de la sesión desde la entrada (4 h en producción).
 * - Las consultas automáticas en segundo plano NO cuentan como uso: solo la interacción de la persona.
 * - La última actividad se comparte entre pestañas por localStorage.
 */
export const SSO_IDLE_MS = 60 * 60 * 1000;
/** Se renueva cuando al token le quedan menos de 50 min (o sea, como mucho cada 10 min de uso). */
export const SSO_RENEW_BELOW_SECONDS = 50 * 60;
/** Solo se renueva si hubo uso en los últimos 5 min. */
export const SSO_RENEW_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const ACTIVITY_WRITE_EVERY_MS = 10_000;
const TICK_MS = 30_000;
const ACTIVITY_KEY = "sso_last_activity";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel", "click"] as const;

type TokenPayload = { sso?: boolean; exp?: number } | null;

export function decodeTokenPayload(token: string | null): TokenPayload {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** ¿El token guardado pertenece a una sesión iniciada desde el Dashboard? */
export function isSsoToken(token: string | null): boolean {
  return decodeTokenPayload(token)?.sso === true;
}

export function isSsoSession(): boolean {
  try { return isSsoToken(localStorage.getItem("auth_token")); } catch { return false; }
}

/** Segundos que le quedan al token; negativo si ya venció; null si no se puede leer. */
export function tokenRemainingSeconds(token: string | null, nowMs = Date.now()): number | null {
  const exp = decodeTokenPayload(token)?.exp;
  return typeof exp === "number" ? exp - nowMs / 1000 : null;
}

export function isIdle(lastActivityMs: number, nowMs = Date.now()): boolean {
  return nowMs - lastActivityMs >= SSO_IDLE_MS;
}

/** Renovar solo si hubo uso reciente y al token le queda poco. */
export function shouldRenew(remainingSeconds: number | null, lastActivityMs: number, nowMs = Date.now()): boolean {
  if (remainingSeconds === null || remainingSeconds <= 0) return false;
  if (nowMs - lastActivityMs > SSO_RENEW_ACTIVITY_WINDOW_MS) return false;
  return remainingSeconds < SSO_RENEW_BELOW_SECONDS;
}

function readLastActivity(): number {
  try {
    const raw = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch { return 0; }
}
function writeLastActivity(ms: number) {
  try { localStorage.setItem(ACTIVITY_KEY, String(ms)); } catch { /* sin almacenamiento: se usa solo la memoria */ }
}

/** Se llama al entrar por SSO: la entrada cuenta como uso y descarta cualquier marca de una sesión anterior. */
export function markSsoActivity(): void {
  writeLastActivity(Date.now());
}

/** Se llama al cerrar sesión a mano: borra la marca de uso para que no afecte a la siguiente entrada. */
export function clearSsoActivity(): void {
  try { localStorage.removeItem(ACTIVITY_KEY); } catch { /* nada */ }
}

let ending = false;

/** Cierra la sesión local y regresa al Dashboard (o a la raíz de EduPay si no se conoce su URL). */
export async function endSsoSession(): Promise<void> {
  if (ending || typeof window === "undefined") return;
  ending = true;
  for (const key of ["auth_token", "auth_type", "auth_user", ACTIVITY_KEY]) {
    try { localStorage.removeItem(key); } catch { /* nada */ }
  }
  let target = "/";
  try {
    const res = await fetch("/api/auth/sso/config", { cache: "no-store" });
    const cfg = await res.json();
    if (typeof cfg?.dashboard_url === "string") target = cfg.dashboard_url;
  } catch { /* se queda en EduPay */ }
  window.location.href = target;
}

export type RenewResult = "renewed" | "ended" | "error";

let renewing: Promise<RenewResult> | null = null;

/** Pide un token nuevo. 401 = la sesión terminó (inactividad, tope, baja o desvinculación): se cierra. */
export function renewSsoToken(): Promise<RenewResult> {
  if (renewing) return renewing;
  renewing = (async (): Promise<RenewResult> => {
    const token = localStorage.getItem("auth_token");
    if (!token || !isSsoToken(token)) return "error";
    try {
      const res = await fetch("/api/auth/sso/renew", { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        // No pisa una sesión distinta (otra pestaña que ya cerró o volvió a entrar).
        if (data?.token && localStorage.getItem("auth_token") === token) localStorage.setItem("auth_token", data.token);
        return "renewed";
      }
      if (res.status === 401 || res.status === 403) { await endSsoSession(); return "ended"; }
    } catch { /* red caída: se reintenta en el siguiente ciclo */ }
    return "error";
  })().finally(() => { renewing = null; });
  return renewing;
}

/**
 * Para la conexión en vivo: el servidor la cierra (4001) cuando vence el token con el que se abrió.
 * Si la persona sigue en una sesión vigente, basta renovar y reconectar; si no, se cierra la sesión.
 */
export async function recoverRealtimeAfterExpiry(): Promise<"reconnect" | "ended"> {
  const result = await renewSsoToken();
  return result === "ended" ? "ended" : "reconnect";
}

/** Arranca el vigilante de la sesión SSO; devuelve la función que lo detiene. */
export function startSsoSessionKeeper(): () => void {
  if (typeof window === "undefined" || !isSsoSession()) return () => undefined;

  // Una pestaña que se abre tras más de una hora sin uso no debe revivir la sesión.
  let last = readLastActivity();
  if (last === 0) { last = Date.now(); writeLastActivity(last); }
  if (isIdle(last)) { void endSsoSession(); return () => undefined; }

  let lastWritten = last;

  const evaluate = () => {
    if (!isSsoSession()) return;
    const now = Date.now();
    const shared = readLastActivity();
    if (shared > last) last = shared;
    const remaining = tokenRemainingSeconds(localStorage.getItem("auth_token"), now);
    if (isIdle(last, now) || (remaining !== null && remaining <= 0)) { void endSsoSession(); return; }
    if (shouldRenew(remaining, last, now)) void renewSsoToken();
  };

  const onActivity = () => {
    const now = Date.now();
    last = now;
    if (now - lastWritten >= ACTIVITY_WRITE_EVERY_MS) {
      lastWritten = now;
      writeLastActivity(now);
      evaluate();
    }
  };

  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { passive: true });
  const timer = window.setInterval(evaluate, TICK_MS);
  evaluate();

  return () => {
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity);
    window.clearInterval(timer);
  };
}
