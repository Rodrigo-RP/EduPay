import express from "express";
import jwt from "../test-support/session-jwt";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [{ is_active: true, custom_permissions: [], password_changed_at: null, requires_password_change: true }] })),
}));
vi.mock("../db", () => ({ pool: { query: mocks.query } }));
vi.mock("../storage", () => ({ storage: {} }));
import { authenticateToken, requireAuth, JWT_SECRET } from "../routes/shared";

afterEach(() => { vi.clearAllMocks(); });

describe("contraseña temporal bloquea las APIs", () => {
  it.each(["token", "alias"])("%s no permite operaciones hasta cambiarla", async kind => {
    const app = express();
    const middleware = kind === "token" ? authenticateToken : requireAuth;
    app.get("/api/protected", middleware, (_req, res) => res.json({ success: true }));
    app.put("/api/profile/password", middleware, (_req, res) => res.json({ allowed: true }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin dirección de prueba");
    const headers = { Authorization: `Bearer ${jwt.sign({ id: 1 }, JWT_SECRET)}` };
    try {
      const blocked = await fetch(`http://127.0.0.1:${address.port}/api/protected`, { headers });
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).code).toBe("PASSWORD_CHANGE_REQUIRED");
      const password = await fetch(`http://127.0.0.1:${address.port}/api/profile/password`, { method: "PUT", headers });
      expect(password.status).toBe(kind === "token" ? 200 : 403);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
