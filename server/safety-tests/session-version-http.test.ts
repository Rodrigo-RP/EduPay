import { beforeAll, afterAll, expect, it, vi } from "vitest";
import express from "express";
// Librería real: NO usar el adaptador de fixtures para probar ausencia de versión.
import jwt from "jsonwebtoken";
const state = vi.hoisted(() => ({ changed: new Date(Math.floor(Date.now() / 1000) * 1000 + 900) }));
vi.mock("../db", () => ({ db: {}, pool: { query: async () => ({
  rows: [{ password_changed_at: state.changed, custom_permissions: [] }],
}) } }));
vi.mock("../storage", () => ({ storage: { getUser: async () => ({
  id: 1, is_super_admin: true, password_changed_at: state.changed,
}) } }));
import { authenticateToken, authenticateGuardian, requireAuth, requireSuperAdmin, JWT_SECRET } from "../routes/shared";
import { registerAuthRoutes } from "../routes/auth";
let server: any, base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  for (const [route, guard] of Object.entries({ token: authenticateToken, guardian: authenticateGuardian, auth: requireAuth, super: requireSuperAdmin })) {
    app.get(`/probe/${route}`, guard, (_req, res) => res.json({ success: true }));
  }
  registerAuthRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));
it("HTTP: cuatro guardas y refresh rechazan antes del cambio en el mismo segundo y aceptan versión nueva", async () => {
  const before = state.changed.getTime() - 800;
  for (const route of ["token", "guardian", "auth", "super", "refresh"]) {
    const issue = (password_version?: number) => jwt.sign({
      id: 1, type: route === "guardian" ? "guardian" : "user",
      twofa_verified: true,
      iat: Math.floor(before / 1000), password_version,
    }, JWT_SECRET, { expiresIn: "10y" });
    const request = (token: string) => fetch(`${base}${route === "refresh" ? "/api/auth/refresh" : `/probe/${route}`}`, {
      method: route === "refresh" ? "POST" : "GET", headers: { Authorization: `Bearer ${token}` },
    });
    expect((await request(issue(before))).status, route).toBe(401);
    expect((await request(issue())).status, `${route}: versión ausente`).toBe(401);
    const fresh = await request(issue(state.changed.getTime()));
    expect(fresh.status, route).toBe(200);
    if (route === "refresh") expect((jwt.verify((await fresh.json()).token, JWT_SECRET) as any).password_version).toBe(state.changed.getTime());
  }
});
