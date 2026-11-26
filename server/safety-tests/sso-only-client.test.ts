import { afterEach, describe, expect, it, vi } from "vitest";
import { decideLogin, EMERGENCY_PATH, fetchLoginDecision, goToDashboard, redirectWhenLoginDisabled } from "../../client/src/lib/sso-only";

const cfg = (over: Record<string, unknown> = {}) => ({
  enabled: true, sso_only: true, emergency_login: false, dashboard_url: "https://dashboard.example.invalid", ...over,
});

describe("Cliente: qué mostrar sin sesión", () => {
  it("con SSO_ONLY apagado o ausente, el inicio de sesión normal", () => {
    for (const c of [null, undefined, {}, cfg({ sso_only: false }), cfg({ enabled: false })]) {
      expect(decideLogin(c, "/")).toEqual({ kind: "normal" });
    }
  });

  it("con SSO_ONLY encendido manda al Dashboard", () => {
    expect(decideLogin(cfg(), "/")).toEqual({ kind: "redirect", url: "https://dashboard.example.invalid/" });
    expect(decideLogin(cfg(), "/acceso-padres")).toMatchObject({ kind: "redirect" });
  });

  it("la ruta de emergencia solo vale si el servidor la habilita", () => {
    expect(decideLogin(cfg({ emergency_login: true }), EMERGENCY_PATH)).toEqual({ kind: "emergency" });
    expect(decideLogin(cfg({ emergency_login: false }), EMERGENCY_PATH)).toMatchObject({ kind: "redirect" });
    expect(decideLogin(cfg({ emergency_login: true }), "/")).toMatchObject({ kind: "redirect" });
  });

  it("sin una URL válida del Dashboard no redirige (pantalla informativa) y descarta esquemas peligrosos", () => {
    expect(decideLogin(cfg({ dashboard_url: null }), "/")).toEqual({ kind: "blocked" });
    expect(decideLogin(cfg({ dashboard_url: "javascript:alert(1)" }), "/")).toEqual({ kind: "blocked" });
  });
});

describe("Cliente: consulta y redirección de tutores", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as any).window;
  afterEach(() => { globalThis.fetch = originalFetch; (globalThis as any).window = originalWindow; vi.restoreAllMocks(); });

  it("si el servidor no responde, se muestra el acceso normal (el servidor sigue siendo quien decide)", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("sin red"); }) as any;
    expect(await fetchLoginDecision("/")).toEqual({ kind: "normal" });
    globalThis.fetch = vi.fn(async () => ({ ok: false }) as any) as any;
    expect(await fetchLoginDecision("/")).toEqual({ kind: "normal" });
  });

  it("solo redirige a un tutor cuando el servidor respondió LOGIN_DISABLED", async () => {
    const replace = vi.fn();
    (globalThis as any).window = { location: { replace, href: "https://edupay.example.invalid/" } };
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => cfg() }) as any) as any;
    expect(await redirectWhenLoginDisabled("401: Invalid credentials")).toBe(false);
    expect(await redirectWhenLoginDisabled({ code: "OTRO" })).toBe(false);
    expect(await redirectWhenLoginDisabled(null)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(await redirectWhenLoginDisabled('403: {"code":"LOGIN_DISABLED","message":"x"}')).toBe(true);
    expect(replace).toHaveBeenCalledWith("https://dashboard.example.invalid/");
    expect(await redirectWhenLoginDisabled({ code: "LOGIN_DISABLED" })).toBe(true);
  });
});

describe("Cliente: no redirigir a la misma dirección", () => {
  const originalWindow = (globalThis as any).window;
  afterEach(() => { (globalThis as any).window = originalWindow; });

  it("si el Dashboard configurado es la dirección actual, no navega (evita un bucle)", () => {
    const replace = vi.fn();
    (globalThis as any).window = { location: { replace, href: "https://edupay.example.invalid/dashboard" } };
    expect(goToDashboard("https://edupay.example.invalid/dashboard")).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(goToDashboard("https://dashboard.example.invalid/")).toBe(true);
    expect(replace).toHaveBeenCalledWith("https://dashboard.example.invalid/");
  });
});
