import { describe, expect, it } from "vitest";
import {
  decodeTokenPayload, isSsoToken, tokenRemainingSeconds, isIdle, shouldRenew,
  SSO_IDLE_MS, SSO_RENEW_BELOW_SECONDS, SSO_RENEW_ACTIVITY_WINDOW_MS,
} from "../../client/src/lib/sso-session";

// Lógica pura del vigilante de sesión del cliente (sin navegador): cuándo se cierra y cuándo se renueva.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokenWith = (payload: Record<string, unknown>) => `${b64({ alg: "HS256" })}.${b64(payload)}.firma`;

describe("Sesión SSO en el cliente", () => {
  it("reconoce un token de SSO y descarta los demás", () => {
    expect(isSsoToken(tokenWith({ sso: true }))).toBe(true);
    expect(isSsoToken(tokenWith({ id: 1 }))).toBe(false);
    expect(isSsoToken(tokenWith({ sso: "true" }))).toBe(false);
    expect(isSsoToken("basura")).toBe(false);
    expect(isSsoToken(null)).toBe(false);
    expect(decodeTokenPayload("a.b")).toBeNull();
  });

  it("calcula lo que le queda al token", () => {
    const now = 1_700_000_000_000;
    expect(tokenRemainingSeconds(tokenWith({ exp: now / 1000 + 600 }), now)).toBe(600);
    expect(tokenRemainingSeconds(tokenWith({ exp: now / 1000 - 5 }), now)).toBe(-5);
    expect(tokenRemainingSeconds(tokenWith({}), now)).toBeNull();
    expect(tokenRemainingSeconds(null, now)).toBeNull();
  });

  it("cierra la sesión a la hora exacta de inactividad, no antes", () => {
    const now = 1_700_000_000_000;
    expect(isIdle(now - SSO_IDLE_MS + 1000, now)).toBe(false);
    expect(isIdle(now - SSO_IDLE_MS, now)).toBe(true);
    expect(isIdle(now - 2 * SSO_IDLE_MS, now)).toBe(true);
  });

  it("renueva solo con uso reciente y cuando al token le queda poco", () => {
    const now = 1_700_000_000_000;
    const recent = now - 60_000;
    // Token recién emitido: no hace falta.
    expect(shouldRenew(3600, recent, now)).toBe(false);
    expect(shouldRenew(SSO_RENEW_BELOW_SECONDS, recent, now)).toBe(false);
    // Pasados 10 min de token y con uso: renueva.
    expect(shouldRenew(SSO_RENEW_BELOW_SECONDS - 1, recent, now)).toBe(true);
    // Sin uso en los últimos 5 min: no se mantiene viva la sesión.
    expect(shouldRenew(1200, now - SSO_RENEW_ACTIVITY_WINDOW_MS - 1, now)).toBe(false);
    // Token vencido o ilegible: no se renueva (el servidor tampoco lo aceptaría).
    expect(shouldRenew(0, recent, now)).toBe(false);
    expect(shouldRenew(-10, recent, now)).toBe(false);
    expect(shouldRenew(null, recent, now)).toBe(false);
  });

  it("sin uso, el token vence antes de que la sesión pueda pasar de ~1 h de inactividad", () => {
    // Última interacción en el minuto 0; el token se renovó ahí mismo (vale 60 min). Sin más uso:
    // a los 5 min deja de renovarse y el token vence a los 60 min, igual que el límite de inactividad.
    const t0 = 1_700_000_000_000;
    const tokenExpiry = t0 + 3600_000;
    for (const minute of [6, 20, 40, 59]) {
      const now = t0 + minute * 60_000;
      expect(shouldRenew((tokenExpiry - now) / 1000, t0, now)).toBe(false);
    }
    expect(isIdle(t0, t0 + SSO_IDLE_MS)).toBe(true);
  });
});
