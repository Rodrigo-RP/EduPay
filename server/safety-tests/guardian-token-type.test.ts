import { afterAll, beforeAll, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
const state = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [{
  is_active: true, password_changed_at: null, custom_permissions: ["SYSTEM.CONFIG"],
  requires_password_change: false,
}] })) }));
vi.mock("../db", () => ({ db: {}, pool: state }));
vi.mock("../storage", () => ({ storage: {} }));
import { authenticateToken, JWT_SECRET } from "../routes/shared";
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.get("/staff", authenticateToken,
    (req: express.Request & { user?: { custom_permissions: string[] } }, res) =>
      res.json({ permissions: req.user?.custom_permissions }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Puerto de prueba no disponible");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
it("tutor y personal con el mismo ID y versión 0: sólo personal obtiene permisos", async () => {
  const token = (type: string) => jwt.sign({ id: 42, type, password_version: 0,
    twofa_verified: true, role: "administrador_general", tenant_id: 1, campus_id: 1 },
  JWT_SECRET, { expiresIn: "1h" });
  const staff = await fetch(`${base}/staff`, { headers: { Authorization: `Bearer ${token("user")}` } });
  expect(staff.status).toBe(200);
  expect(await staff.json()).toEqual({ permissions: ["SYSTEM.CONFIG"] });
  state.query.mockClear();
  const guardian = await fetch(`${base}/staff`, { headers: { Authorization: `Bearer ${token("guardian")}` } });
  expect(guardian.status).toBe(403);
  expect(await guardian.json()).toEqual({ message: "Acceso no permitido para esta sesión", code: "TOKEN_TYPE_INVALID" });
  expect(state.query).not.toHaveBeenCalled();
});
