import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), getUser: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: mocks.query }, db: {} }));
vi.mock("../storage", () => ({ storage: mocks }));
vi.mock("../websocket-manager", () => ({ wsManager: { notifyUserUpdate: vi.fn() } }));
import { registerUserRoutes } from "../routes/users";
import { JWT_SECRET } from "../routes/shared";

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let url: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); registerUserRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [{ custom_permissions: [] }] });
  mocks.createUser.mockImplementation(async data => ({ ...data, id: 2 }));
  mocks.updateUser.mockImplementation(async (id, data) => ({ id, ...data }));
  mocks.deleteUser.mockResolvedValue(true);
});
async function request(role: string, method: string, path: string, body: object) {
  return fetch(url + path, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({
      id: 1, role, tenant_id: 1, campus_id: 1,
    }, JWT_SECRET)}` }, body: JSON.stringify(body),
  });
}
it("super_admin no edita a otro super_admin", async () => {
  mocks.getUser.mockResolvedValue({ id: 2, role: "super_admin", tenant_id: 1, campus_id: 1 });
  expect((await request("super_admin", "PUT", "/api/users/2", { name: "Cambio" })).status).toBe(403);
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it("no eleva a un inferior al rol superior del actor", async () => {
  mocks.getUser.mockResolvedValue({ id: 2, role: "contador_general", tenant_id: 1, campus_id: 1 });
  expect((await request("administrador_general", "PUT", "/api/users/2", { role: "super_admin" })).status).toBe(403);
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it("mismo campus y distinto tenant devuelve 404", async () => {
  mocks.getUser.mockResolvedValue({ id: 2, role: "contador_general", tenant_id: 2, campus_id: 1 });
  expect((await request("administrador_general", "PUT", "/api/users/2", { name: "Cambio" })).status).toBe(404);
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it("no crea un superadministrador por un flag de un rol inferior", async () => {
  expect((await request("super_admin", "POST", "/api/users", {
    role: "contador_general", is_super_admin: true,
  })).status).toBe(403);
  expect(mocks.createUser).not.toHaveBeenCalled();
});
it("permite sólo datos básicos propios, nunca rol o estado propios", async () => {
  mocks.getUser.mockResolvedValue({ id: 1, role: "asistente", tenant_id: 1, campus_id: 1 });
  expect((await request("asistente", "PUT", "/api/users/1", { name: "Propio" })).status).toBe(200);
  mocks.updateUser.mockClear();
  expect((await request("asistente", "PUT", "/api/users/1", { role: "super_admin" })).status).toBe(403);
  expect((await request("asistente", "PUT", "/api/users/1", { is_active: false })).status).toBe(403);
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it("permite editar un inferior del mismo ámbito y usar sólo el ámbito de sesión al crear", async () => {
  mocks.getUser.mockResolvedValue({ id: 2, role: "contador_general", tenant_id: 1, campus_id: 1 });
  expect((await request("administrador_general", "PUT", "/api/users/2", { name: "Inferior" })).status).toBe(200);
  expect((await request("administrador_general", "POST", "/api/users", {
    role: "contador_general", tenant_id: 99, campus_id: 99,
  })).status).toBe(201);
  expect(mocks.createUser.mock.calls[0][0]).toMatchObject({ tenant_id: 1, campus_id: 1, is_super_admin: false });
});
