import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import { hasPermission } from "../../shared/permissions";
import { isExcepcionesCount } from "../../shared/excepciones-realtime";

const mocks = vi.hoisted(() => ({ query: vi.fn(), limit: vi.fn() }));
vi.mock("../db", () => ({
  pool: { query: mocks.query },
  db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }) },
}));
vi.mock("../routes/shared", () => ({
  JWT_SECRET: "isolated-safety-tests-not-a-real-secret",
  hasPermissionForUser: (user: any, module: string, action: string) =>
    hasPermission(user.role, module, action) || user.custom_permissions?.includes(`${module}.${action}`),
}));
import { wsManager } from "../websocket-manager";

const manager = wsManager as any;
const user = { id: 1, tenant_id: 8, campus_id: 9, role: "administrador_campus", is_active: true };
function socket(overrides = {}) {
  const ws = { user: { ...user, ...overrides }, readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
  manager.addClient(ws);
  return ws;
}
const messages = (ws: ReturnType<typeof socket>) => ws.send.mock.calls.map(([raw]) => JSON.parse(raw));

beforeEach(() => {
  vi.clearAllMocks();
  manager.clients.clear();
  manager.campusClients.clear();
  mocks.query.mockResolvedValue({ rows: [{ total_pendiente: 3 }] });
});

describe("Conteo WebSocket aislado, sin base de datos ni escrituras", () => {
  it("envía el conteo a todas las pestañas autorizadas y sólo al mismo tenant/campus", async () => {
    const first = socket();
    const tab = socket();
    const otherTenant = socket({ id: 2, tenant_id: 80 });
    const otherCampus = socket({ id: 3, campus_id: 90 });
    const denied = socket({ id: 4, role: "maestro" });
    const unauthenticated = socket({ id: 5 });
    delete (unauthenticated as any).user;
    await wsManager.refreshExcepcionesCount(8, 9);
    for (const ws of [first, tab]) {
      expect(messages(ws)).toEqual([expect.objectContaining({
        type: "excepciones_count", data: { total_pendiente: 3, tenant_id: 8, campus_id: 9 },
      })]);
    }
    for (const ws of [otherTenant, otherCampus, denied, unauthenticated]) expect(ws.send).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("tenant_id = $1 AND campus_id = $2"), [8, 9]);
  });

  it("envía cero sin conservar el conteo anterior", async () => {
    const ws = socket();
    await wsManager.refreshExcepcionesCount(8, 9);
    mocks.query.mockResolvedValueOnce({ rows: [{ total_pendiente: 0 }] });
    await wsManager.refreshExcepcionesCount(8, 9);
    expect(messages(ws).map(message => message.data.total_pendiente)).toEqual([3, 0]);
  });

  it("snapshot al autenticar y al reconectar sin HTTP ni suscripción de otro campus", async () => {
    mocks.limit.mockResolvedValue([user]);
    const token = jwt.sign({ id: 1 }, "isolated-safety-tests-not-a-real-secret");
    for (let i = 0; i < 2; i++) {
      const ws = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
      await manager.authenticateUser(ws, token);
      expect(messages(ws as any).map(message => message.type)).toEqual(["auth_success", "excepciones_count"]);
      await manager.handleMessage(ws, { type: "subscribe_campus", campus_id: 90 });
      expect(manager.campusClients.has(90)).toBe(false);
      manager.removeClient(ws);
    }
  });

  it("JWT inválido no recibe cifras", async () => {
    const ws = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
    await manager.authenticateUser(ws, "invalid");
    expect(messages(ws as any).map(message => message.type)).toEqual(["auth_error"]);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("sin destinatarios autorizados no consulta la base", async () => {
    socket({ role: "maestro" });
    await wsManager.refreshExcepcionesCount(8, 9);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("fallo de lectura no inventa cero ni impide un siguiente envío", async () => {
    const ws = socket();
    mocks.query.mockRejectedValueOnce(new Error("lectura no disponible"));
    await expect(wsManager.refreshExcepcionesCount(8, 9)).resolves.toBeUndefined();
    expect(ws.send).not.toHaveBeenCalled();
    await wsManager.refreshExcepcionesCount(8, 9);
    expect(messages(ws)[0].data.total_pendiente).toBe(3);
  });

  it("serializa actualizaciones concurrentes para no enviar una cifra vieja después de la nueva", async () => {
    const ws = socket();
    let resolve!: (value: any) => void;
    mocks.query.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const first = wsManager.refreshExcepcionesCount(8, 9);
    const second = wsManager.refreshExcepcionesCount(8, 9);
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(1));
    resolve({ rows: [{ total_pendiente: 5 }] });
    await Promise.all([first, second]);
    expect(messages(ws).map(message => message.data.total_pendiente)).toEqual([5, 3]);
  });

  it.each([null, {}, { total_pendiente: -1, tenant_id: 8, campus_id: 9 },
    { total_pendiente: "3", tenant_id: 8, campus_id: 9 },
    { total_pendiente: 3, tenant_id: 0, campus_id: 9 }])("ignora eventos malformados: %j", value => {
    expect(isExcepcionesCount(value)).toBe(false);
  });
});
