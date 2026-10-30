import express from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: new Map<number, { id: number; email: string; role: string; tenant_id: number; campus_id: number;
    is_active: boolean; is_super_admin: boolean; twofa_secret: string | null; twofa_backup_hashes: string[] | null;
    password_changed_at: Date | null }>(),
  audits: [] as string[],
  query: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: state.query, connect: async () => ({ query: state.query, release() {} }) } }));
vi.mock("../storage", () => ({ storage: { getUser: async (id: number) => state.users.get(id) } }));
import { registerTwoFactorRoutes } from "../routes/two-factor";
import { authenticateToken, serializeUser, JWT_SECRET } from "../routes/shared";
import { pendingTotp } from "../lib/totp-service";
import { encryptTotp } from "../lib/totp-crypto";

const speakeasy: typeof import("speakeasy") = createRequire(import.meta.url)("speakeasy");
const roles = ["super_admin", "administrador_general", "administrador_campus", "contador_general", "auxiliar_contable", "asistente", "admisiones"];
beforeEach(() => {
  vi.stubEnv("TOTP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  state.users.clear(); state.audits.length = 0;
  for (const id of [1, 2]) state.users.set(id, { id, email: `u${id}@example.invalid`,
    role: id === 1 ? "administrador_general" : "asistente", tenant_id: 1, campus_id: 1,
    is_active: true, is_super_admin: false, twofa_secret: null, twofa_backup_hashes: null, password_changed_at: null });
  state.query.mockReset().mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT u.custom_permissions")) {
      const user = state.users.get(Number(params[0]));
      return { rows: user ? [{ ...user, custom_permissions: [], requires_password_change: false }] : [] };
    }
    if (sql.startsWith("SELECT twofa_secret")) return { rows: [state.users.get(Number(params[0]))].filter(Boolean) };
    if (sql.startsWith("UPDATE users SET twofa_secret=$1")) {
      const user = state.users.get(Number(params[2]))!;
      user.twofa_secret = String(params[0]); user.twofa_backup_hashes = [...(params[1] as string[])];
    }
    if (sql.includes("SET twofa_secret=NULL")) {
      const user = state.users.get(Number(params[0]))!;
      user.twofa_secret = null; user.twofa_backup_hashes = null; user.password_changed_at = new Date();
    }
    if (sql.includes("INSERT INTO audit_retry_queue")) state.audits.push(String(params[0]));
    return { rows: [] };
  });
});
afterEach(() => { pendingTotp.clear(1); pendingTotp.clear(2); vi.unstubAllEnvs(); });
async function serverFor(action: (request: (path: string, body?: unknown, id?: number, verified?: boolean, method?: string) => Promise<Response>) => Promise<void>) {
  const app = express(); app.use(express.json());
  registerTwoFactorRoutes(app);
  app.get("/api/protected", authenticateToken, (_req, res) => res.json({ allowed: true }));
  app.get("/api/auth/user", authenticateToken, (_req, res) => res.json(serializeUser(state.users.get(1))));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Sin dirección de pruebas");
  try {
    await action(async (path, body, id = 1, verified = true, method = body === undefined ? "GET" : "POST") => {
      const user = state.users.get(id)!;
      const token = jwt.sign({ ...user, password_version: user.password_changed_at?.getTime() ?? 0,
        twofa_secret: undefined, twofa_backup_hashes: undefined, type: "user", twofa_verified: verified }, JWT_SECRET, { expiresIn: "1h" });
      return fetch(`http://127.0.0.1:${addr.port}${path}`, { method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

describe("2FA obligatoria y secreto sólo durante enrolamiento propio", () => {
  it.each(roles)("%s no accede a negocio antes de configurar y sí a su QR", async role => {
    state.users.get(1)!.role = role;
    await serverFor(async request => {
      const blocked = await request("/api/protected", undefined, 1, false);
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).code).toBe("TWOFA_SETUP_REQUIRED");
      const setup = await request("/api/auth/2fa/setup", {}, 1, false);
      expect(setup.status).toBe(200);
      expect(setup.headers.get("cache-control")).toBe("no-store");
      expect(await setup.json()).toMatchObject({ manual_code: expect.any(String), qr_data_url: expect.any(String), expires_in: 600 });
    });
  });
  it("tras confirmar no entrega el secreto ni sus hashes en ninguna respuesta", async () => {
    await serverFor(async request => {
      const setup = await request("/api/auth/2fa/setup", {}, 1, false);
      const pending = await setup.json();
      const code = speakeasy.totp({ secret: pending.manual_code, encoding: "base32" });
      const confirmation = await request("/api/auth/2fa/confirm", { totp_code: code }, 1, false);
      expect(confirmation.status).toBe(200);
      expect(confirmation.headers.get("cache-control")).toBe("no-store");
      const confirmed = await confirmation.json();
      expect(confirmed.backup_codes).toHaveLength(10);
      expect(jwt.verify(confirmed.token, JWT_SECRET)).toMatchObject({ twofa_verified: true });
      const stored = state.users.get(1)!;
      expect(stored.twofa_secret).toMatch(/^v1:/);
      const responses = [confirmed];
      for (const [path, body] of [
        ["/api/auth/2fa/setup", {}], ["/api/auth/2fa/confirm", { totp_code: code }], ["/api/auth/user", undefined],
      ] as const) responses.push(await (await request(path, body)).json());
      expect(JSON.stringify(responses)).not.toContain(pending.manual_code);
      expect(JSON.stringify(responses)).not.toContain(stored.twofa_secret!);
      for (const hash of stored.twofa_backup_hashes!) expect(JSON.stringify(responses)).not.toContain(hash);
      expect(state.audits).toHaveLength(1);
      expect(state.audits.join("")).not.toContain(pending.manual_code);
    });
  });
  it("un QR nuevo invalida el anterior y un pendiente vencido devuelve 410 sin UPDATE", async () => {
    await serverFor(async request => {
      pendingTotp.begin(state.users.get(1)!, Date.now() - 600_001);
      expect((await request("/api/auth/2fa/confirm", { totp_code: "123456" }, 1, false)).status).toBe(410);
      expect(state.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    });
  });
});
describe("restablecimiento con jerarquía, motivo, doble confirmación y auditoría", () => {
  beforeEach(() => { state.users.get(2)!.twofa_secret = encryptTotp("JBSWY3DPEHPK3PXP", 2); });
  it.each(roles.filter(role => role !== "administrador_general"))("%s no puede restablecer", async role => {
    state.users.get(1)!.role = role;
    await serverFor(async request => {
      expect((await request("/api/admin/users/2/2fa/reset-preview", { reason: "Pérdida de dispositivo", confirmation: true })).status).toBe(403);
      expect(state.audits).toHaveLength(0);
    });
  });
  it.each(["tenant_id", "campus_id"])("otro %s recibe 404", async key => {
    if (key === "tenant_id") state.users.get(2)!.tenant_id = 2; else state.users.get(2)!.campus_id = 2;
    await serverFor(async request => {
      expect((await request("/api/admin/users/2/2fa/reset-preview", { reason: "Pérdida de dispositivo", confirmation: true })).status).toBe(404);
    });
  });
  it("sin motivo no cambia; doble confirmación y reintento dejan un único cambio y auditoría", async () => {
    await serverFor(async request => {
      expect((await request("/api/admin/users/2/2fa/reset-preview", { reason: "", confirmation: true })).status).toBe(400);
      expect((await request("/api/admin/users/2/2fa/reset", { confirmation: true })).status).toBe(400);
      const preview = await request("/api/admin/users/2/2fa/reset-preview", { reason: "Pérdida de dispositivo", confirmation: true });
      const { confirmation_token } = await preview.json();
      expect(preview.status).toBe(200);
      const body = { confirmation_token, confirmation: true };
      expect((await request("/api/admin/users/2/2fa/reset", body)).status).toBe(200);
      expect((await request("/api/admin/users/2/2fa/reset", body)).status).toBe(409);
      expect(state.users.get(2)!.twofa_secret).toBeNull();
      expect(state.users.get(2)!.password_changed_at).toBeInstanceOf(Date);
      expect(state.audits).toHaveLength(1);
      expect(JSON.parse(state.audits[0])).toMatchObject({ action: "twofa_reset", metadata: { reason: "Pérdida de dispositivo" } });
    });
  });
});
