import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
const database = vi.hoisted(() => ({ query: vi.fn(async (sql: string) => ({
  rows: sql.includes("UPDATE magic_link_tokens") ? [{ guardian_id: 42, tenant_id: 7, uses: 1, max_uses: 3 }] :
    sql.includes("FROM guardians") ? [{ nombre_completo: "Tutor de prueba", password_changed_at: null }] : [],
})) }));
vi.mock("../db", () => ({ db: {}, pool: database }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../lib/family-access", () => ({ guardianHasActiveFamily: async () => true }));
import { registerAuthRoutes } from "../routes/auth";
import { authenticateGuardian, JWT_SECRET } from "../routes/shared";
import { GUARDIAN_SESSION_SECONDS, GUARDIAN_TOKEN_SECONDS } from "../lib/guardian-session-limits";

let server: Server;
let base: string;
const now = 2_000_000_000;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now * 1000);
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app);
  app.get("/guardian-probe", authenticateGuardian, (_req, res) => res.json({ allowed: true }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Puerto de prueba no disponible");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  vi.useRealTimers();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
function token(start: number, expired: boolean, legacy = false) {
  return jwt.sign({ id: 42, tenant_id: 7, type: "guardian", password_version: 0,
    iat: legacy ? start : expired ? now - GUARDIAN_TOKEN_SECONDS - 1 : now,
    ...(legacy ? {} : { session_started_at: start }),
  }, JWT_SECRET, { expiresIn: GUARDIAN_TOKEN_SECONDS });
}
const refresh = (value: string) => fetch(`${base}/api/auth/refresh`, {
  method: "POST", headers: { Authorization: `Bearer ${value}` },
});
function claims(value: string) {
  const decoded = jwt.verify(value, JWT_SECRET);
  if (typeof decoded === "string") throw new Error("Se esperaban claims de tutor");
  return decoded;
}
for (const expired of [false, true]) {
  it(`renovación ${expired ? "ignoreExpiration" : "normal"}: ocho días -> 401 sin consultar datos`, async () => {
    database.query.mockClear();
    const response = await refresh(token(now - 8 * 86400, expired));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Tu sesión terminó. Solicita una nueva liga de acceso." });
    expect(database.query).not.toHaveBeenCalled();
  });
  it(`renovación ${expired ? "ignoreExpiration" : "normal"}: seis días conserva inicio y cuatro horas`, async () => {
    const start = now - 6 * 86400;
    const response = await refresh(token(start, expired));
    expect(response.status).toBe(200);
    const decoded = claims((await response.json()).token);
    expect(decoded.session_started_at).toBe(start);
    expect(decoded.exp).toBe(now + GUARDIAN_TOKEN_SECONDS);
    expect(decoded.exp).toBeLessThanOrEqual(start + GUARDIAN_SESSION_SECONDS);
  });
  it(`renovación ${expired ? "ignoreExpiration" : "normal"}: cerca del tope no lo sobrepasa`, async () => {
    const start = now - GUARDIAN_SESSION_SECONDS + 30;
    const response = await refresh(token(start, expired));
    expect(response.status).toBe(200);
    const decoded = claims((await response.json()).token);
    expect(decoded.session_started_at).toBe(start);
    expect(decoded.exp).toBe(start + GUARDIAN_SESSION_SECONDS);
  });
}
it("token viejo sin session_started_at usa iat en renovación y en la guarda", async () => {
  const start = now - 6 * 86400;
  const renewed = await refresh(token(start, true, true));
  expect(renewed.status).toBe(200);
  expect(claims((await renewed.json()).token).session_started_at).toBe(start);
  expect((await refresh(token(now - 8 * 86400, true, true))).status).toBe(401);
});
it("authenticateGuardian rechaza una sesión de ocho días aunque el JWT aún sea válido", async () => {
  database.query.mockClear();
  const response = await fetch(`${base}/guardian-probe`, {
    headers: { Authorization: `Bearer ${token(now - 8 * 86400, false)}` },
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "Tu sesión terminó. Solicita una nueva liga de acceso." });
  expect(database.query).not.toHaveBeenCalled();
});
it("canje de liga inicia una sesión nueva y JWT de cuatro horas", async () => {
  const response = await fetch(`${base}/api/auth/magic/${crypto.randomUUID()}`);
  expect(response.status).toBe(200);
  const decoded = claims((await response.json()).token);
  expect(decoded.type).toBe("guardian");
  expect(decoded.session_started_at).toBe(now);
  expect(decoded.exp).toBe(now + GUARDIAN_TOKEN_SECONDS);
});
