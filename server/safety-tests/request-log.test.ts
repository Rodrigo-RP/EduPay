import { beforeAll, afterAll, expect, it, vi } from "vitest";
import express from "express";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { requestMetadataLogger } from "../lib/request-log";
const mocks = vi.hoisted(() => ({ query: vi.fn(), getUserByEmail: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: mocks.query }, db: {} }));
vi.mock("../storage", () => ({ storage: { getUserByEmail: mocks.getUserByEmail } }));
vi.mock("../lib/family-access", () => ({ guardianHasActiveFamily: async () => true }));
import { registerAuthRoutes } from "../routes/auth";
const lines: string[] = [];
let server: any, base: string;
beforeAll(async () => {
  const app = express();
  app.use(requestMetadataLogger(line => lines.push(line)));
  app.use(express.json());
  registerAuthRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));
it("login real y canje real no registran JWT, liga, credenciales, PII ni headers", async () => {
  const credential = randomUUID(), email = `${randomUUID()}@fixture.invalid`;
  mocks.getUserByEmail.mockResolvedValue({ id: 1, email, role: "asistente",
    password_hash: await bcrypt.hash(credential, 4), password_changed_at: null });
  mocks.query.mockResolvedValue({ rows: [{
    is_active: true, password_changed_at: null, custom_permissions: [], requires_password_change: false,
  }] });
  const login = await fetch(`${base}/api/auth/login?correo=${email}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Correlation-ID": credential },
    body: JSON.stringify({ email, password: credential, curp: credential, rfc: credential, telefono: credential }),
  });
  expect(login.status).toBe(200);
  const loggedIn = await login.json();
  const rawLink = randomUUID();
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("UPDATE magic_link_tokens") ? [{ guardian_id: 1, tenant_id: 29, max_uses: 3, uses: 1 }]
      : sql.includes("FROM guardians") ? [{ id: 1, email, password_changed_at: null }] : [],
  }));
  const exchanged = await fetch(`${base}/api/auth/magic/${rawLink}?jwt=${loggedIn.token}`);
  expect(exchanged.status).toBe(200);
  const guardian = await exchanged.json();
  await fetch(`${base}/not-found/${rawLink}?token=${loggedIn.token}`);
  const output = lines.join("\n");
  for (const secret of [credential, email, rawLink, loggedIn.token, guardian.token]) expect(output).not.toContain(secret);
  expect(lines.map(s => JSON.parse(s).route)).toEqual(["/api/auth/login", "/api/auth/magic/:token", "[unmatched]"]);
  for (const line of lines) {
    const record = JSON.parse(line);
    expect(Object.keys(record).sort()).toEqual(["method", "route", "status", "durationMs", "correlationId"].sort());
    expect(record.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  }
});
