import express from "express";
import bcrypt from "bcrypt";
import { createRequire } from "node:module";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as any,
  query: vi.fn(),
  audits: [] as string[],
}));
vi.mock("../db", () => ({
  db: {},
  pool: { query: state.query, connect: async () => ({ query: state.query, release() {} }) },
}));
vi.mock("../storage", () => ({
  storage: {
    getUserByEmail: async (email: string) => (state.user && state.user.email === email ? state.user : undefined),
    getGuardianByEmail: async () => undefined,
    getUser: async () => state.user,
  },
}));

import { registerAuthRoutes } from "../routes/auth";
import { registerSsoRoutes } from "../routes/sso";
import {
  assertSsoOnlyStartup, canUseEmergencyLogin, isEmergencyLoginEnabled, isSsoOnly, ssoOnlyGate,
} from "../lib/sso-only";
import { encryptTotp } from "../lib/totp-crypto";

const speakeasy: typeof import("speakeasy") = createRequire(import.meta.url)("speakeasy");
const publicKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ type: "spki", format: "pem" }) as string;
const ssoEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  SSO_ENABLED: "true", SSO_PUBLIC_KEY: publicKey, SSO_ISSUER: "dashboard-refereence", SSO_DASHBOARD_URL: "https://dashboard.example.invalid", ...extra,
});

describe("SSO_ONLY: banderas", () => {
  it("está apagado por defecto y el acceso de emergencia solo existe con SSO_ONLY", () => {
    expect(isSsoOnly({})).toBe(false);
    expect(isSsoOnly({ SSO_ONLY: "false" })).toBe(false);
    expect(isSsoOnly({ SSO_ONLY: "TRUE" })).toBe(true);
    expect(isEmergencyLoginEnabled({ EMERGENCY_LOGIN_ENABLED: "true" })).toBe(false);
    expect(isEmergencyLoginEnabled({ SSO_ONLY: "true" })).toBe(false);
    expect(isEmergencyLoginEnabled({ SSO_ONLY: "true", EMERGENCY_LOGIN_ENABLED: "true" })).toBe(true);
  });

  it("solo un superadministrador con TOTP puede usar la contraseña de emergencia", () => {
    const env = { SSO_ONLY: "true", EMERGENCY_LOGIN_ENABLED: "true" };
    expect(canUseEmergencyLogin({ is_super_admin: true, twofa_secret: "x" }, env)).toBe(true);
    expect(canUseEmergencyLogin({ is_super_admin: true, twofa_secret: null }, env)).toBe(false);
    expect(canUseEmergencyLogin({ is_super_admin: false, twofa_secret: "x" }, env)).toBe(false);
    expect(canUseEmergencyLogin({ is_super_admin: true, twofa_secret: "x" }, { SSO_ONLY: "true" })).toBe(false);
  });
});

describe("SSO_ONLY: arranque seguro", () => {
  it("apagado no valida nada", () => {
    expect(() => assertSsoOnlyStartup({})).not.toThrow();
    expect(() => assertSsoOnlyStartup({ SSO_ONLY: "false", SSO_ENABLED: "false" })).not.toThrow();
  });

  it("encendido sin un SSO válido o sin URL del Dashboard se niega a arrancar", () => {
    expect(() => assertSsoOnlyStartup({ SSO_ONLY: "true" })).toThrow(/SSO_ENABLED/);
    expect(() => assertSsoOnlyStartup({ SSO_ONLY: "true", SSO_ENABLED: "true", SSO_ISSUER: "x" })).toThrow(/SSO_PUBLIC_KEY/);
    expect(() => assertSsoOnlyStartup(ssoEnv({ SSO_ONLY: "true", SSO_DASHBOARD_URL: "" }))).toThrow(/SSO_DASHBOARD_URL/);
    expect(() => assertSsoOnlyStartup(ssoEnv({ SSO_ONLY: "true", SSO_DASHBOARD_URL: "http://dashboard.example.invalid" }))).toThrow(/SSO_DASHBOARD_URL/);
    expect(() => assertSsoOnlyStartup(ssoEnv({ SSO_ONLY: "true" }))).not.toThrow();
  });
});

async function appWith(action: (call: (method: string, path: string, body?: unknown) => Promise<Response>) => Promise<void>) {
  // En producción ambos módulos leen process.env; la prueba mezcla el SSO simulado con las banderas del momento.
  const env = ssoEnv({ ...(process.env.SSO_ONLY ? { SSO_ONLY: process.env.SSO_ONLY } : {}), ...(process.env.EMERGENCY_LOGIN_ENABLED ? { EMERGENCY_LOGIN_ENABLED: process.env.EMERGENCY_LOGIN_ENABLED } : {}) });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app);
  registerSsoRoutes(app, env);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Sin dirección de pruebas");
  try {
    await action((method, path, body) => fetch(`http://127.0.0.1:${addr.port}${path}`, {
      method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const PASSWORD = "Contraseña-de-prueba-1";
let totpBase32 = "";
const userRow = (over: Record<string, unknown> = {}) => ({
  id: 7, email: "persona@example.invalid", name: "Persona", role: "administrador_general", tenant_id: 1, campus_id: 1,
  is_active: true, is_super_admin: false, twofa_secret: null, password_hash: "", password_changed_at: null, ...over,
});

beforeEach(async () => {
  vi.stubEnv("TOTP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  totpBase32 = speakeasy.generateSecret({ length: 20 }).base32;
  state.audits.length = 0;
  state.query.mockReset().mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO audit_log")) state.audits.push(String(params[2]));
    if (sql.includes("SELECT u.custom_permissions")) return { rows: [{ custom_permissions: [], is_active: true, requires_password_change: false, password_changed_at: null }] };
    return { rows: [] };
  });
  state.user = userRow({ password_hash: await bcrypt.hash(PASSWORD, 4) });
});
afterEach(() => { vi.unstubAllEnvs(); delete process.env.SSO_ONLY; delete process.env.EMERGENCY_LOGIN_ENABLED; });

describe("SSO_ONLY apagado: nada cambia", () => {
  it("el inicio de sesión con contraseña sigue funcionando", async () => {
    await appWith(async (call) => {
      const res = await call("POST", "/api/auth/login", { email: state.user.email, password: PASSWORD });
      expect(res.status).toBe(200);
      expect((await res.json()).token).toBeTruthy();
    });
  });

  it("la configuración pública no anuncia sso_only", async () => {
    await appWith(async (call) => {
      expect(await (await call("GET", "/api/auth/sso/config")).json()).toMatchObject({ enabled: true, sso_only: false, emergency_login: false });
    });
  });
});

describe("SSO_ONLY encendido", () => {
  beforeEach(() => { process.env.SSO_ONLY = "true"; });

  it("cierra el inicio de sesión de personal, de tutores y los enlaces mágicos", async () => {
    await appWith(async (call) => {
      for (const [method, path, body] of [
        ["POST", "/api/auth/login", { email: state.user.email, password: PASSWORD }],
        ["POST", "/api/auth/guardian-login", { email: "tutor@example.invalid", password: PASSWORD }],
        ["GET", "/api/auth/magic/abc123", undefined],
        ["POST", "/api/admin/magic-link", { guardian_id: 1 }],
        ["GET", "/api/admin/magic-link/history/1", undefined],
      ] as const) {
        const res = await call(method, path, body);
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(await res.json()).toMatchObject({ code: "LOGIN_DISABLED" });
      }
    });
  });

  it("anuncia sso_only y, sin acceso de emergencia, no anuncia emergency_login", async () => {
    await appWith(async (call) => {
      expect(await (await call("GET", "/api/auth/sso/config")).json()).toMatchObject({
        enabled: true, sso_only: true, emergency_login: false, dashboard_url: "https://dashboard.example.invalid",
      });
    });
  });

  it("las rutas del SSO siguen abiertas", async () => {
    await appWith(async (call) => {
      const res = await call("POST", "/api/auth/sso/exchange", { assertion: "no es una aserción válida" });
      expect(res.status).not.toBe(403);
      expect((await res.json()).code).not.toBe("LOGIN_DISABLED");
    });
  });

  describe("con acceso de emergencia", () => {
    beforeEach(() => { process.env.EMERGENCY_LOGIN_ENABLED = "true"; });

    it("un usuario normal recibe el mismo error que una credencial inválida", async () => {
      await appWith(async (call) => {
        const good = await call("POST", "/api/auth/login", { email: state.user.email, password: PASSWORD });
        const bad = await call("POST", "/api/auth/login", { email: state.user.email, password: "otra" });
        expect(good.status).toBe(401);
        expect(bad.status).toBe(401);
        expect(await good.json()).toEqual(await bad.json());
      });
    });

    it("un superadministrador sin TOTP configurado no puede entrar", async () => {
      state.user = userRow({ is_super_admin: true, password_hash: await bcrypt.hash(PASSWORD, 4) });
      await appWith(async (call) => {
        expect((await call("POST", "/api/auth/login", { email: state.user.email, password: PASSWORD })).status).toBe(401);
      });
    });

    it("un superadministrador con TOTP entra con contraseña y código, y queda auditado", async () => {
      state.user = userRow({
        is_super_admin: true, twofa_secret: encryptTotp(totpBase32, 7), password_hash: await bcrypt.hash(PASSWORD, 4),
      });
      await appWith(async (call) => {
        const first = await call("POST", "/api/auth/login", { email: state.user.email, password: PASSWORD });
        expect(await first.json()).toEqual({ requires_totp: true });
        const wrong = await call("POST", "/api/auth/login", { email: state.user.email, password: PASSWORD, totp_code: "000000" });
        expect(wrong.status).toBe(401);
        const code = speakeasy.totp({ secret: totpBase32, encoding: "base32" });
        const ok = await call("POST", "/api/auth/login", { email: state.user.email, password: PASSWORD, totp_code: code });
        expect(ok.status).toBe(200);
        expect((await ok.json()).token).toBeTruthy();
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(state.audits).toContain("auth.emergency_login");
    });

    it("la configuración anuncia el acceso de emergencia", async () => {
      await appWith(async (call) => {
        expect(await (await call("GET", "/api/auth/sso/config")).json()).toMatchObject({ sso_only: true, emergency_login: true });
      });
    });

    it("los tutores y los enlaces mágicos siguen cerrados", async () => {
      await appWith(async (call) => {
        expect((await call("POST", "/api/auth/guardian-login", { email: "tutor@example.invalid", password: PASSWORD })).status).toBe(403);
        expect((await call("GET", "/api/auth/magic/abc123")).status).toBe(403);
      });
    });
  });
});

describe("SSO_ONLY: la compuerta se evalúa en cada petición", () => {
  it("responde según el entorno del momento", () => {
    const env: NodeJS.ProcessEnv = {};
    const gate = ssoOnlyGate(env);
    const res = () => { const r: any = { statusCode: 200, setHeader: vi.fn(), status(c: number) { r.statusCode = c; return r; }, json: vi.fn() }; return r; };
    const next = vi.fn();
    gate({} as any, res(), next);
    expect(next).toHaveBeenCalledTimes(1);
    env.SSO_ONLY = "true";
    const closed = res();
    gate({} as any, closed, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(closed.statusCode).toBe(403);
  });
});
