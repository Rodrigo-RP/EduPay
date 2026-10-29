import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(), getUser: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), updateUserPassword: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: mocks.query }, db: {} }));
vi.mock("../storage", () => ({ storage: mocks }));
import { registerSystemRoutes } from "../routes/system";
import { JWT_SECRET } from "../routes/shared";
let server: any, url: string, target: any;
const actor = { id: 1, role: "super_admin", tenant_id: 29, campus_id: 48, is_super_admin: true };
beforeAll(async () => {
  const app = express(); app.use(express.json()); registerSystemRoutes(app);
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });
beforeEach(() => {
  vi.clearAllMocks();
  target = { id: 2, role: "asistente", tenant_id: 29, campus_id: 48, is_active: true };
  mocks.getUser.mockImplementation(async id => Number(id) === 1 ? actor : target);
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.createUser.mockImplementation(async data => ({ id: 2, ...data }));
});
async function request(path: string, body: object) {
  return fetch(url + path, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign(actor, JWT_SECRET)}` },
    body: JSON.stringify(body),
  });
}
it.each(["/api/super-admin/create", "/api/super-admin/create-user"])("%s no asigna un rol máximo igual al propio", async path => {
  expect((await request(path, { role: "super_admin" })).status).toBe(403);
  expect(mocks.createUser).not.toHaveBeenCalled();
});
it.each(["/api/super-admin/update-user-status", "/api/super-admin/reset-password"])("%s no toca pares ni destinos fuera de ámbito", async path => {
  for (const foreign of [{ role: "super_admin" }, { tenant_id: 30 }, { campus_id: 49 }]) {
    target = { id: 2, role: "asistente", tenant_id: 29, campus_id: 48, ...foreign };
    expect((await request(path, { userId: 2, status: false })).status).toBe("role" in foreign ? 403 : 404);
  }
  expect(mocks.updateUser).not.toHaveBeenCalled();
  expect(mocks.updateUserPassword).not.toHaveBeenCalled();
});
it("desactiva un inferior y revoca sesiones, admitiendo status=false", async () => {
  expect((await request("/api/super-admin/update-user-status", { userId: 2, status: false })).status).toBe(200);
  expect(mocks.updateUser).toHaveBeenCalledWith(2, { is_active: false, password_changed_at: expect.any(Date) });
});
it("crear usuario del alias tampoco toma tenant ni campus del cuerpo", async () => {
  expect((await request("/api/super-admin/create-user", {
    email: "scope-create@example.test", nombre_completo: "Scope create", password: randomUUID(),
    role: "asistente", tenant_id: 99, campus_id: 99,
  })).status).toBe(200);
  expect(mocks.createUser.mock.calls[0][0]).toMatchObject({ tenant_id: 29, campus_id: 48, is_super_admin: false });
});
