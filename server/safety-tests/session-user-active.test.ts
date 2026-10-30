import { afterAll, beforeAll, expect, it, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
const state = vi.hoisted(() => ({ exists: true, active: true, failed: false }));
const account = () => state.exists ? {
  id: 701, role: "super_admin", is_super_admin: true, is_active: state.active,
  password_changed_at: null, custom_permissions: [],
} : undefined;
vi.mock("../db", () => ({ db: {}, pool: { query: vi.fn(async () => {
  if (state.failed) throw new Error("fallo simulado");
  return { rows: state.exists ? [{ is_active: state.active, password_changed_at: null, custom_permissions: [] }] : [] };
}) } }));
vi.mock("../storage", () => ({ storage: { getUser: async () => account() } }));
import { authenticateToken, requireAuth, requireSuperAdmin, JWT_SECRET, loadUserAuthData } from "../routes/shared";
import { registerAuthRoutes } from "../routes/auth";
let server: any, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  for (const [route, guard] of Object.entries({ token: authenticateToken, auth: requireAuth, super: requireSuperAdmin })) {
    app.get(`/probe/${route}`, guard, (_req, res) => res.json({ success: true }));
  }
  registerAuthRoutes(app); server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));
for (const scenario of ["inexistente", "desactivado", "activo"] as const) {
  it(`usuario ${scenario}: guardas y refresh normal/expirado verifican estado actual`, async () => {
    // Se emite ANTES de desactivar/eliminar, con una versión todavía coincidente.
    state.exists = true; state.active = true;
    const payload = { id: 701, type: "user", role: "super_admin", password_version: 0, twofa_verified: true };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
    const expired = jwt.sign({ ...payload, iat: Math.floor(Date.now() / 1000) - 120, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET);
    state.exists = scenario !== "inexistente"; state.active = scenario !== "desactivado";
    for (const route of ["token", "auth", "super", "refresh", "refresh-expired"]) {
      const refresh = route.startsWith("refresh");
      const response = await fetch(`${base}${refresh ? "/api/auth/refresh" : `/probe/${route}`}`, {
        method: refresh ? "POST" : "GET", headers: { Authorization: `Bearer ${route === "refresh-expired" ? expired : token}` },
      });
      expect(response.status, route).toBe(scenario === "activo" ? 200 : 401);
    }
  });
}
it("sin id no hay usuario activo y su token es rechazado", async () => {
  state.exists = true; state.active = true;
  expect((await loadUserAuthData(undefined)).active).toBe(false);
  const response = await fetch(`${base}/probe/token`, { headers: {
    Authorization: `Bearer ${jwt.sign({ password_version: 0 }, JWT_SECRET)}`,
  } });
  expect(response.status).toBe(401);
});
it("un JWT malformado conserva el contrato 403 sin consultar datos", async () => {
  state.failed = true;
  try {
    const response = await fetch(`${base}/probe/token`, { headers: { Authorization: "Bearer jwt-administrativo-expirado" } });
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe("Token inválido");
  } finally { state.failed = false; }
});
it("un error de base no se transforma en usuario activo", async () => {
  state.failed = true;
  await expect(loadUserAuthData(701)).rejects.toThrow("No se pudo validar la versión de sesión");
  state.failed = false;
});
