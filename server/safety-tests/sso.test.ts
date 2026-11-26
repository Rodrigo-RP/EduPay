import express from "express";
import jwt from "jsonwebtoken";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Pruebas aisladas: la base es un fake en memoria con la semántica que importa (unicidad y
// ON CONFLICT DO NOTHING). Nunca se conectan a una base real.
const state = vi.hoisted(() => ({
  tenants: [] as any[], identities: [] as any[], users: [] as any[], guardians: [] as any[],
  usedJti: new Set<string>(), audit: [] as any[], activeFamily: true, nextId: 100, failDb: false,
  actor: { id: 1, tenant_id: 7, is_super_admin: false } as any,
}));

vi.mock("../db", () => ({
  db: {},
  pool: {
    query: vi.fn(async (sql: string, p: any[] = []) => {
      if (state.failDb) throw new Error("db down");
      const s = sql.replace(/\s+/g, " ").trim();
      if (/FROM tenants WHERE firebase_id_escuela/.test(s)) return { rows: state.tenants.filter(t => t.firebase_id_escuela === p[0]).map(t => ({ id: t.id })) };
      // Renovación de sesión: busca la identidad por persona (no por uid). Va antes de la búsqueda por uid.
      if (/FROM external_identities WHERE provider = \$1 AND user_id = \$2/.test(s)) return { rows: state.identities.filter(i => i.provider === p[0] && i.user_id === p[1]) };
      if (/FROM external_identities WHERE provider = \$1 AND guardian_id = \$2/.test(s)) return { rows: state.identities.filter(i => i.provider === p[0] && i.guardian_id === p[1]) };
      if (/SELECT id, email, role, campus_id, tenant_id, is_active, is_super_admin, password_changed_at FROM users WHERE id = \$1/.test(s)) return { rows: state.users.filter(u => u.id === p[0]) };
      if (/FROM external_identities WHERE provider/.test(s)) return { rows: state.identities.filter(i => i.provider === p[0] && i.subject === p[1]) };
      if (/SELECT tenant_id, is_super_admin, role FROM users/.test(s)) return { rows: state.users.filter(u => u.id === p[0]) };
      if (/SELECT tenant_id FROM guardians/.test(s)) return { rows: state.guardians.filter(g => g.id === p[0]) };
      if (/FROM users WHERE id = \$1/.test(s) && /twofa_secret/.test(s)) return { rows: state.users.filter(u => u.id === p[0]) };
      if (/FROM guardians WHERE id = \$1/.test(s)) return { rows: state.guardians.filter(g => g.id === p[0]) };
      if (/INSERT INTO sso_assertions_used/.test(s)) {
        if (state.usedJti.has(p[0])) return { rows: [] };
        state.usedJti.add(p[0]); return { rows: [{ jti: p[0] }] };
      }
      if (/DELETE FROM sso_assertions_used/.test(s) || /UPDATE external_identities SET last_login_at/.test(s)) return { rows: [] };
      if (/INSERT INTO audit_log/.test(s)) { state.audit.push({ action: p[3], tenant_id: p[0], user_id: p[1], guardian_id: p[2], metadata: JSON.parse(p[6]) }); return { rows: [] }; }
      if (/INSERT INTO external_identities/.test(s)) {
        const [provider, subject, tenant_id, user_id, guardian_id, linked_by] = p;
        const dup = state.identities.some(i => i.provider === provider && (i.subject === subject || (user_id && i.user_id === user_id) || (guardian_id && i.guardian_id === guardian_id)));
        if (dup) throw Object.assign(new Error("duplicate key"), { code: "23505" });
        const row = { id: state.nextId++, provider, subject, tenant_id, user_id, guardian_id, linked_by };
        state.identities.push(row); return { rows: [{ id: row.id }] };
      }
      throw new Error("consulta no prevista en el fake: " + s.slice(0, 90));
    }),
  },
}));
vi.mock("../routes/shared", () => ({
  JWT_SECRET: "j".repeat(48),
  authenticateToken: (req: any, _res: any, next: any) => { req.user = state.actor; next(); },
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
  hasPermissionForUser: () => true,
}));
vi.mock("../audit-retry", () => ({
  auditLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  enqueueAuditLog: vi.fn(),
}));
vi.mock("../lib/family-access", () => ({ guardianHasActiveFamily: vi.fn(async () => state.activeFamily) }));
// El secreto del 2FA está cifrado en la base; la verificación real vive en totp-service (con sus propias pruebas).
// Aquí se comprueba que el SSO la use y respete su resultado.
vi.mock("../lib/totp-service", () => ({
  validTotp: vi.fn((_encrypted: string, _id: number, code: unknown) => code === "123456"),
  consumeBackupCode: vi.fn(async (_pool: unknown, _user: unknown, code: unknown) => code === "respaldo-ok"),
}));

import { loadSsoConfig } from "../lib/sso/config";
import { verifySsoAssertion, SsoError } from "../lib/sso/assertion";
import { exchangeAssertion, renewSsoSession, linkExternalIdentity } from "../lib/sso/service";
import { ssoTokenSeconds } from "../lib/sso/session";
import { registerSsoRoutes } from "../routes/sso";

const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicPem = ec.publicKey.export({ type: "spki", format: "pem" }).toString();
const otherKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });

const ENV = { SSO_ENABLED: "true", SSO_PUBLIC_KEY: publicPem, SSO_ISSUER: "dashboard-refereence", SSO_AUDIENCE: "edupay" } as NodeJS.ProcessEnv;
const cfgResult = loadSsoConfig(ENV);
if (!cfgResult.ok) throw new Error("config de prueba inválida");
const CFG = cfgResult.config;

const jtiOf = () => randomBytes(16).toString("hex");
function assertion(over: Record<string, unknown> = {}, opts: { key?: any; alg?: any; purpose?: string; expiresIn?: number; issuer?: string; audience?: string } = {}) {
  return jwt.sign(
    { sub: "uidTutor1", jti: jtiOf(), idEscuela: "ESC_JFR", email: "padre@correo.mx", rol: "Padre de familia", purpose: opts.purpose ?? "sso_login", ...over },
    (opts.key ?? ec.privateKey) as any,
    { algorithm: opts.alg ?? "ES256", issuer: opts.issuer ?? "dashboard-refereence", audience: opts.audience ?? "edupay", expiresIn: opts.expiresIn ?? 60 },
  );
}
const rejectsWith = (fn: () => unknown, code: string) => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(SsoError); expect((e as SsoError).code).toBe(code); return; }
  throw new Error("se esperaba un rechazo " + code);
};

function seed() {
  state.tenants = [{ id: 7, firebase_id_escuela: "ESC_JFR" }];
  state.users = [
    { id: 11, email: "admin@escuela.mx", name: "Admin", role: "administrador_general", campus_id: 1, tenant_id: 7, is_active: true, is_super_admin: false, twofa_secret: null, password_changed_at: null },
    { id: 12, email: "caja@escuela.mx", name: "Caja", role: "contador_general", campus_id: 1, tenant_id: 7, is_active: true, is_super_admin: false, twofa_secret: "cifrado:abc", password_changed_at: null },
    { id: 13, email: "baja@escuela.mx", name: "Baja", role: "asistente", campus_id: 1, tenant_id: 7, is_active: false, is_super_admin: false, twofa_secret: null, password_changed_at: null },
    { id: 14, email: "otra@escuela.mx", name: "Otra", role: "asistente", campus_id: 2, tenant_id: 99, is_active: true, is_super_admin: false, twofa_secret: null, password_changed_at: null },
    { id: 15, email: "plataforma@refereence.io", name: "Plataforma", role: "super_admin", campus_id: null, tenant_id: null, is_active: true, is_super_admin: true, twofa_secret: null, password_changed_at: null },
  ];
  state.guardians = [{ id: 21, email: "padre@correo.mx", nombre_completo: "Tutor Uno", tenant_id: 7, campus_id: 1, password_changed_at: null }];
  state.identities = [
    { id: 1, provider: "firebase", subject: "uidAdmin", tenant_id: 7, user_id: 11, guardian_id: null },
    { id: 2, provider: "firebase", subject: "uidCaja", tenant_id: 7, user_id: 12, guardian_id: null },
    { id: 3, provider: "firebase", subject: "uidTutor1", tenant_id: 7, user_id: null, guardian_id: 21 },
    { id: 4, provider: "firebase", subject: "uidBaja", tenant_id: 7, user_id: 13, guardian_id: null },
    { id: 5, provider: "firebase", subject: "uidOtra", tenant_id: 7, user_id: 14, guardian_id: null },
  ];
  state.usedJti = new Set(); state.audit = []; state.activeFamily = true; state.failDb = false; state.nextId = 100;
  state.actor = { id: 11, tenant_id: 7, is_super_admin: false };
}
beforeEach(seed);

const claimsOf = (over: Record<string, unknown> = {}, opts = {}) => verifySsoAssertion(assertion(over, opts), CFG, "sso_login");

describe("Configuración del SSO", () => {
  it("está apagado por defecto y exige llave y emisor", () => {
    expect(loadSsoConfig({} as NodeJS.ProcessEnv)).toMatchObject({ ok: false, reason: "disabled" });
    expect(loadSsoConfig({ SSO_ENABLED: "true", SSO_ISSUER: "x" } as NodeJS.ProcessEnv)).toMatchObject({ ok: false, reason: "misconfigured" });
    expect(loadSsoConfig({ SSO_ENABLED: "true", SSO_PUBLIC_KEY: publicPem } as NodeJS.ProcessEnv)).toMatchObject({ ok: false, reason: "misconfigured" });
  });
  it("rechaza una llave que no es EC P-256", () => {
    const pem = rsa.publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(loadSsoConfig({ SSO_ENABLED: "true", SSO_PUBLIC_KEY: pem, SSO_ISSUER: "x" } as NodeJS.ProcessEnv)).toMatchObject({ ok: false, reason: "misconfigured" });
  });
  it("acota la vida máxima de la aserción", () => {
    const r = loadSsoConfig({ ...ENV, SSO_ASSERTION_MAX_AGE_SECONDS: "9999" } as NodeJS.ProcessEnv);
    expect(r.ok && r.config.assertionMaxAgeSeconds).toBe(300);
  });
});

describe("Verificación de la aserción", () => {
  it("acepta una aserción válida de 60 s", () => {
    const c = claimsOf();
    expect(c).toMatchObject({ sub: "uidTutor1", idEscuela: "ESC_JFR", purpose: "sso_login" });
    expect(c.exp - c.iat).toBe(60);
  });
  it("rechaza firma de otra llave, emisor y audiencia equivocados", () => {
    rejectsWith(() => claimsOf({}, { key: otherKey.privateKey }), "invalid_assertion");
    rejectsWith(() => claimsOf({}, { issuer: "otro" }), "invalid_assertion");
    rejectsWith(() => claimsOf({}, { audience: "otra" }), "invalid_assertion");
  });
  it("rechaza algoritmo distinto de ES256 (HS256 y RS256)", () => {
    rejectsWith(() => verifySsoAssertion(jwt.sign({ sub: "u", jti: jtiOf(), idEscuela: "E", purpose: "sso_login" }, publicPem, { algorithm: "HS256", issuer: "dashboard-refereence", audience: "edupay", expiresIn: 60 }), CFG, "sso_login"), "invalid_assertion");
    rejectsWith(() => claimsOf({}, { key: rsa.privateKey, alg: "RS256" }), "invalid_assertion");
  });
  it("no deja usar una aserción de elegibilidad para entrar, ni al revés", () => {
    rejectsWith(() => verifySsoAssertion(assertion({}, { purpose: "sso_eligibility" }), CFG, "sso_login"), "invalid_assertion");
    rejectsWith(() => verifySsoAssertion(assertion({}, { purpose: "sso_login" }), CFG, "sso_eligibility"), "invalid_assertion");
  });
  it("rechaza vencidas, demasiado longevas y con claims mal formados", () => {
    rejectsWith(() => verifySsoAssertion(assertion({}, { expiresIn: 60 }), CFG, "sso_login", Date.now() + 3600_000), "invalid_assertion");
    rejectsWith(() => claimsOf({}, { expiresIn: 600 }), "invalid_assertion");
    rejectsWith(() => claimsOf({ jti: "corto" }), "invalid_assertion");
    rejectsWith(() => claimsOf({ sub: "uid con espacios" }), "invalid_assertion");
    rejectsWith(() => claimsOf({ idEscuela: "../x" }), "invalid_assertion");
  });
});

describe("Canje de la aserción por una sesión", () => {
  it("personal sin 2FA: sesión SSO que obliga a configurar el segundo factor", async () => {
    const out: any = await exchangeAssertion(claimsOf({ sub: "uidAdmin" }), CFG);
    expect(out.kind).toBe("user");
    expect(out.user.requires_twofa_setup).toBe(true);
    const c: any = jwt.decode(out.token);
    expect(c).toMatchObject({ id: 11, type: "user", sso: true, twofa_verified: false, tenant_id: 7 });
    expect(typeof c.session_started_at).toBe("number");
    expect(c.exp - c.iat).toBeLessThanOrEqual(8 * 3600);
    expect(state.audit.map(a => a.action)).toContain("sso.login");
  });

  it("personal con 2FA: pide el código antes de consumir la aserción", async () => {
    const c = claimsOf({ sub: "uidCaja" });
    expect(await exchangeAssertion(c, CFG)).toEqual({ requiresTotp: true });
    expect(state.usedJti.has(c.jti)).toBe(false);
    await expect(exchangeAssertion(c, CFG, "000000")).rejects.toMatchObject({ code: "invalid_totp" });
    expect(state.usedJti.has(c.jti)).toBe(false);
    const ok: any = await exchangeAssertion(c, CFG, "123456");
    expect(jwt.decode(ok.token)).toMatchObject({ id: 12, sso: true, twofa_verified: true });
    expect(state.usedJti.has(c.jti)).toBe(true);
  });

  it("acepta un código de respaldo en lugar del TOTP", async () => {
    const ok: any = await exchangeAssertion(claimsOf({ sub: "uidCaja" }), CFG, "respaldo-ok");
    expect(jwt.decode(ok.token)).toMatchObject({ twofa_verified: true });
  });

  it("tutor: sesión de tutor con marca SSO, sin datos de contraseña y con vida acotada", async () => {
    const out: any = await exchangeAssertion(claimsOf(), CFG);
    expect(out.kind).toBe("guardian");
    expect(out.guardian).not.toHaveProperty("password_changed_at");
    const c: any = jwt.decode(out.token);
    expect(c).toMatchObject({ id: 21, type: "guardian", sso: true, tenant_id: 7, campus_id: 1 });
    expect(c.exp - c.iat).toBeLessThanOrEqual(4 * 3600);
    expect(c).not.toHaveProperty("twofa_verified");
  });

  it("una aserción solo se canjea una vez, también con solicitudes simultáneas", async () => {
    const c = claimsOf();
    const results = await Promise.allSettled([exchangeAssertion(c, CFG), exchangeAssertion(c, CFG), exchangeAssertion(c, CFG)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected").every((r: any) => r.reason.code === "replayed")).toBe(true);
  });

  it("no da acceso a quien no está vinculado, a otra escuela ni a cuentas desactivadas", async () => {
    await expect(exchangeAssertion(claimsOf({ sub: "uidSinVinculo" }), CFG)).rejects.toMatchObject({ code: "not_linked" });
    await expect(exchangeAssertion(claimsOf({ idEscuela: "OTRA_ESCUELA" }), CFG)).rejects.toMatchObject({ code: "school_not_enabled" });
    await expect(exchangeAssertion(claimsOf({ sub: "uidBaja" }), CFG)).rejects.toMatchObject({ code: "account_disabled" });
    await expect(exchangeAssertion(claimsOf({ sub: "uidOtra" }), CFG)).rejects.toMatchObject({ code: "tenant_mismatch" });
    expect(state.usedJti.size).toBe(0);
  });

  it("suspende al tutor sin familia activa", async () => {
    state.activeFamily = false;
    await expect(exchangeAssertion(claimsOf(), CFG)).rejects.toMatchObject({ code: "no_active_family" });
  });

  it("un fallo de la base no deja pasar a nadie", async () => {
    state.failDb = true;
    await expect(exchangeAssertion(claimsOf(), CFG)).rejects.toThrow("db down");
  });
});

describe("Sesión con inactividad de 1 h y tope absoluto", () => {
  const CAP_CFG = (() => {
    const r = loadSsoConfig({ ...ENV, SSO_SESSION_TTL_MINUTES: "240", SSO_IDLE_MINUTES: "60" } as NodeJS.ProcessEnv);
    if (!r.ok) throw new Error("config de prueba inválida");
    return r.config;
  })();
  const SECRET = "j".repeat(48);
  const NOW = () => Math.floor(Date.now() / 1000);
  const staffToken = (over: Record<string, unknown> = {}, expiresIn = 3600) =>
    jwt.sign({ id: 11, type: "user", sso: true, role: "administrador_general", twofa_verified: false, password_version: 0, session_started_at: NOW(), ...over }, SECRET, { expiresIn });
  const guardianToken = (over: Record<string, unknown> = {}) =>
    jwt.sign({ id: 21, type: "guardian", sso: true, password_version: 0, session_started_at: NOW(), ...over }, SECRET, { expiresIn: 3600 });

  it("la configuración trae 60 min de inactividad por defecto y los acota", () => {
    const d = loadSsoConfig(ENV);
    expect(d.ok && d.config.idleMinutes).toBe(60);
    const lo = loadSsoConfig({ ...ENV, SSO_IDLE_MINUTES: "1" } as NodeJS.ProcessEnv);
    const hi = loadSsoConfig({ ...ENV, SSO_IDLE_MINUTES: "9999" } as NodeJS.ProcessEnv);
    expect(lo.ok && lo.config.idleMinutes).toBe(5);
    expect(hi.ok && hi.config.idleMinutes).toBe(240);
  });

  it("cada token vive la ventana de inactividad y nunca pasa del tope", () => {
    const now = 1_000_000;
    expect(ssoTokenSeconds("user", now, CAP_CFG, now)).toBe(3600);
    expect(ssoTokenSeconds("user", now - 3 * 3600, CAP_CFG, now)).toBe(3600);
    // Faltan 10 min para las 4 h: el token se acorta al tope.
    expect(ssoTokenSeconds("user", now - (240 - 10) * 60, CAP_CFG, now)).toBe(600);
    // Tope alcanzado o pasado: no se renueva.
    expect(ssoTokenSeconds("user", now - 240 * 60, CAP_CFG, now)).toBe(0);
    expect(ssoTokenSeconds("guardian", now - 5 * 3600, CAP_CFG, now)).toBe(0);
    // Un inicio de sesión del futuro no sirve.
    expect(ssoTokenSeconds("user", now + 3600, CAP_CFG, now)).toBe(0);
  });

  it("el canje entrega un token de 1 h, no de 4", async () => {
    const out: any = await exchangeAssertion(claimsOf({ sub: "uidAdmin" }), CAP_CFG);
    const c: any = jwt.decode(out.token);
    expect(c.exp - c.iat).toBe(3600);
    expect(out.expiresInSeconds).toBe(3600);
  });

  it("renueva al personal conservando el inicio de sesión y el 2FA verificado", async () => {
    const startedAt = NOW() - 1800;
    const out = await renewSsoSession(jwt.decode(staffToken({ id: 12, twofa_verified: true, session_started_at: startedAt })) as any, CAP_CFG);
    const c: any = jwt.decode(out.token);
    expect(c).toMatchObject({ id: 12, sso: true, type: "user", twofa_verified: true, session_started_at: startedAt });
    expect(out.expiresInSeconds).toBe(3600);
  });

  it("al renovar relee el rol de la base: un cambio de rol aplica sin volver a entrar", async () => {
    state.users.find(u => u.id === 11).role = "contador_general";
    const out = await renewSsoSession(jwt.decode(staffToken()) as any, CAP_CFG);
    expect((jwt.decode(out.token) as any).role).toBe("contador_general");
  });

  it("al acercarse el tope el token se acorta; en el tope ya no se renueva", async () => {
    const near = await renewSsoSession(jwt.decode(staffToken({ session_started_at: NOW() - (240 - 5) * 60 })) as any, CAP_CFG);
    expect(near.expiresInSeconds).toBeGreaterThan(0);
    expect(near.expiresInSeconds).toBeLessThanOrEqual(300);
    await expect(renewSsoSession(jwt.decode(staffToken({ session_started_at: NOW() - 241 * 60 })) as any, CAP_CFG))
      .rejects.toMatchObject({ code: "session_ended" });
  });

  it("no renueva a una cuenta desactivada, desvinculada ni con la contraseña cambiada", async () => {
    await expect(renewSsoSession(jwt.decode(staffToken({ id: 13 })) as any, CAP_CFG)).rejects.toMatchObject({ code: "account_disabled" });
    state.identities = state.identities.filter(i => i.user_id !== 11);
    await expect(renewSsoSession(jwt.decode(staffToken()) as any, CAP_CFG)).rejects.toMatchObject({ code: "not_linked" });
    state.users.find(u => u.id === 12).password_changed_at = new Date(Date.now() + 1000).toISOString();
    await expect(renewSsoSession(jwt.decode(staffToken({ id: 12 })) as any, CAP_CFG)).rejects.toMatchObject({ code: "session_ended" });
  });

  it("no renueva al personal de otra escuela", async () => {
    await expect(renewSsoSession(jwt.decode(staffToken({ id: 14 })) as any, CAP_CFG)).rejects.toMatchObject({ code: "tenant_mismatch" });
  });

  it("renueva a un tutor con familia activa y lo suspende sin ella", async () => {
    const out = await renewSsoSession(jwt.decode(guardianToken()) as any, CAP_CFG);
    expect(jwt.decode(out.token)).toMatchObject({ id: 21, type: "guardian", sso: true });
    expect(out.expiresInSeconds).toBeLessThanOrEqual(3600);
    state.activeFamily = false;
    await expect(renewSsoSession(jwt.decode(guardianToken()) as any, CAP_CFG)).rejects.toMatchObject({ code: "no_active_family" });
  });

  describe("ruta POST /api/auth/sso/renew", () => {
    let server: import("node:http").Server;
    let offServer: import("node:http").Server;
    let base = "";
    let offBase = "";
    const boot = (env: NodeJS.ProcessEnv) => new Promise<{ s: import("node:http").Server; url: string }>((resolve) => {
      const app = express(); app.use(express.json()); registerSsoRoutes(app, env);
      const s = app.listen(0, "127.0.0.1", () => resolve({ s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` }));
    });
    beforeAll(async () => {
      const a = await boot({ ...ENV, SSO_SESSION_TTL_MINUTES: "240" } as NodeJS.ProcessEnv); server = a.s; base = a.url;
      const b = await boot({} as NodeJS.ProcessEnv); offServer = b.s; offBase = b.url;
    });
    afterAll(async () => { await new Promise(r => server.close(r)); await new Promise(r => offServer.close(r)); });
    const renew = (url: string, token?: string) => fetch(`${url}/api/auth/sso/renew`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

    it("renueva con un token vigente", async () => {
      const r = await renew(base, staffToken());
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      const body = await r.json();
      expect(body.expires_in).toBe(3600);
      expect(jwt.decode(body.token)).toMatchObject({ sso: true, id: 11 });
    });
    it("un token vencido (inactividad) no se revive", async () => {
      const r = await renew(base, staffToken({}, -30));
      expect(r.status).toBe(401);
      expect((await r.json()).code).toBe("SSO_SESSION_ENDED");
    });
    it("sin token, con token ajeno o de una sesión que no es de SSO", async () => {
      expect((await renew(base)).status).toBe(401);
      expect((await renew(base, jwt.sign({ id: 11, sso: true }, "otra-clave-distinta-de-48-caracteres-o-mas-xxxx", { expiresIn: 60 }))).status).toBe(401);
      const normal = await renew(base, jwt.sign({ id: 11, type: "user", session_started_at: NOW() }, SECRET, { expiresIn: 60 }));
      expect(normal.status).toBe(400);
      expect((await normal.json()).code).toBe("SSO_INVALID_REQUEST");
    });
    it("pasado el tope absoluto responde 401 y pide entrar de nuevo", async () => {
      const r = await renew(base, staffToken({ session_started_at: NOW() - 250 * 60 }));
      expect(r.status).toBe(401);
      expect((await r.json()).code).toBe("SSO_SESSION_ENDED");
    });
    it("apagado el SSO responde 503", async () => {
      expect((await renew(offBase, staffToken())).status).toBe(503);
    });
  });
});

describe("Vincular identidades", () => {
  const link = (over: Record<string, unknown> = {}) =>
    linkExternalIdentity({ tenantId: 7, subject: "uidNuevo", userId: null, guardianId: null, linkedBy: 11, ...over } as any);

  it("vincula por uid a una persona de la misma escuela", async () => {
    // El tutor 21 ya tiene identidad: un segundo uid no puede tomarlo.
    await expect(link({ guardianId: 21 })).rejects.toMatchObject({ code: "already_linked" });
    state.users.push({ id: 16, tenant_id: 7, is_super_admin: false, role: "asistente" });
    expect(await link({ userId: 16 })).toHaveProperty("id");
    expect(state.identities.some(i => i.subject === "uidNuevo" && i.user_id === 16 && i.linked_by === 11)).toBe(true);
  });
  it("rechaza uid inválido, ambos o ninguno, y personas de otra escuela", async () => {
    await expect(link({ subject: "uid malo!", userId: 11 })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(link({ userId: 11, guardianId: 21 })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(link({})).rejects.toMatchObject({ code: "invalid_request" });
    await expect(link({ userId: 14 })).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("solo un superadministrador vincula la cuenta de la plataforma", async () => {
    await expect(link({ userId: 15, actorIsSuperAdmin: false })).rejects.toMatchObject({ code: "forbidden_role" });
    expect(await link({ userId: 15, actorIsSuperAdmin: true })).toHaveProperty("id");
  });
  it("un uid no se vincula dos veces", async () => {
    state.users.push({ id: 17, tenant_id: 7, is_super_admin: false, role: "asistente" });
    await expect(link({ subject: "uidAdmin", userId: 17 })).rejects.toMatchObject({ code: "already_linked" });
  });
});

describe("Rutas del SSO", () => {
  let server: import("node:http").Server;
  let base = "";
  let disabledServer: import("node:http").Server;
  let disabledBase = "";
  const start = (env: NodeJS.ProcessEnv) => new Promise<{ s: import("node:http").Server; url: string }>((resolve) => {
    const app = express(); app.use(express.json()); registerSsoRoutes(app, env);
    const s = app.listen(0, "127.0.0.1", () => resolve({ s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` }));
  });
  beforeAll(async () => {
    const a = await start(ENV); server = a.s; base = a.url;
    const b = await start({} as NodeJS.ProcessEnv); disabledServer = b.s; disabledBase = b.url;
  });
  afterAll(async () => { await new Promise(r => server.close(r)); await new Promise(r => disabledServer.close(r)); });

  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("la configuración pública solo dice si está habilitado, a dónde volver y si el acceso directo está cerrado (sin llaves ni emisor)", async () => {
    expect(await (await fetch(`${base}/api/auth/sso/config`)).json()).toEqual({ enabled: true, dashboard_url: null, sso_only: false, emergency_login: false });
    expect(await (await fetch(`${disabledBase}/api/auth/sso/config`)).json()).toEqual({ enabled: false, dashboard_url: null, sso_only: false, emergency_login: false });
  });
  it("apagado, el canje responde 503", async () => {
    const r = await post(`${disabledBase}/api/auth/sso/exchange`, { assertion: assertion() });
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("SSO_NOT_CONFIGURED");
  });
  it("una aserción inválida da 401 sin explicar el motivo", async () => {
    const r = await post(`${base}/api/auth/sso/exchange`, { assertion: assertion({}, { key: otherKey.privateKey }) });
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.code).toBe("SSO_INVALID_ASSERTION");
    expect(JSON.stringify(body)).not.toMatch(/firma|JsonWebTokenError|signature/i);
  });
  it("canjea una aserción válida y la segunda vez responde 401 por reutilización", async () => {
    const a = assertion();
    const ok = await post(`${base}/api/auth/sso/exchange`, { assertion: a });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({ kind: "guardian" });
    expect(typeof body.token).toBe("string");
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const again = await post(`${base}/api/auth/sso/exchange`, { assertion: a });
    expect(again.status).toBe(401);
    expect((await again.json()).code).toBe("SSO_REPLAYED");
  });
  it("personal con 2FA responde que falta el código y luego lo acepta", async () => {
    const a = assertion({ sub: "uidCaja" });
    expect(await (await post(`${base}/api/auth/sso/exchange`, { assertion: a })).json()).toEqual({ requires_totp: true });
    const bad = await post(`${base}/api/auth/sso/exchange`, { assertion: a, totp_code: "111111" });
    expect(bad.status).toBe(401);
    expect((await bad.json()).code).toBe("SSO_INVALID_TOTP");
    expect((await post(`${base}/api/auth/sso/exchange`, { assertion: a, totp_code: "123456" })).status).toBe(200);
  });
  it("la elegibilidad exige una aserción de ese propósito", async () => {
    const wrong = await post(`${base}/api/sso/eligibility`, {}, { Authorization: `Bearer ${assertion()}` });
    expect(wrong.status).toBe(401);
    const ok = await post(`${base}/api/sso/eligibility`, {}, { Authorization: `Bearer ${assertion({}, { purpose: "sso_eligibility" })}` });
    expect(await ok.json()).toEqual({ eligible: true, kind: "guardian" });
    const none = await post(`${base}/api/sso/eligibility`, {}, { Authorization: `Bearer ${assertion({ sub: "nadie" }, { purpose: "sso_eligibility" })}` });
    expect(await none.json()).toEqual({ eligible: false, reason: "not_linked" });
  });
  it("un administrador de escuela no puede vincular la cuenta de la plataforma", async () => {
    const r = await post(`${base}/api/admin/external-identities`, { subject: "uidNuevo", user_id: 15 });
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("SSO_FORBIDDEN_ROLE");
  });
});
