import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), clientQuery: vi.fn(), release: vi.fn(), refresh: vi.fn(),
}));
vi.mock("../db", () => ({ pool: { query: mocks.query, connect: mocks.connect }, db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn() }));
vi.mock("../websocket-manager", () => ({ wsManager: { refreshExcepcionesCount: mocks.refresh } }));
vi.mock("../routes/shared", () => ({
  authenticateToken: vi.fn(), requireAuth: vi.fn(), checkCampusTenant: vi.fn(),
  hasPermissionForUser: () => true, upload: { single: () => vi.fn() }, uploadBinary: { single: () => vi.fn() },
  JWT_SECRET: "isolated-safety-tests-not-a-real-secret",
}));
import { registerConciliacionRoutes } from "../routes/conciliacion";

const handlers = new Map<string, (...args: any[]) => Promise<void>>();
registerConciliacionRoutes(new Proxy({}, {
  get: (_target, method) => (url: string, ...callbacks: any[]) => {
    handlers.set(`${String(method)} ${url}`, callbacks.at(-1));
  },
}) as any);

async function invoke(url: string, body: any = {}, overrides = {}) {
  const res: any = { statusCode: 200, status: vi.fn(), json: vi.fn() };
  res.status.mockImplementation((code: number) => { res.statusCode = code; return res; });
  res.json.mockReturnValue(res);
  await handlers.get(`post ${url}`)!({
    user: { id: 1, tenant_id: 8, campus_id: 9, role: "administrador_campus", ...overrides },
    params: { id: "10" }, body,
  }, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM bank_transactions")) return { rows: [{
      id: 10, campus_id: 9, estado_conciliacion: "pendiente", monto_centavos: 5000,
    }] };
    if (sql.includes("FROM charges c")) return { rows: [{ id: 20, monto_neto: 5000 }] };
    if (sql.includes("INSERT INTO payments")) return { rows: [{ id: 30 }] };
    return { rows: [], rowCount: 1 };
  });
});

describe("Emisión después de persistir (rutas reales, base sustituida)", () => {
  it.each([
    { accion: "descartar", motivo: "No escolar" },
    { accion: "ignorar", nota: "No escolar" },
    { accion: "aplicar", charge_id: 20 },
  ])("resolver %j emite sólo después del COMMIT", async body => {
    const res = await invoke("/api/conciliacion/excepciones/:id/resolver", body);
    expect(res.statusCode).toBe(200);
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(8, 9);
    const commitIndex = mocks.clientQuery.mock.calls.findIndex(([sql]) => sql === "COMMIT");
    expect(commitIndex).toBeGreaterThan(-1);
    expect(mocks.clientQuery.mock.invocationCallOrder[commitIndex]).toBeLessThan(mocks.refresh.mock.invocationCallOrder[0]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("no emite si COMMIT falla", async () => {
    const implementation = mocks.clientQuery.getMockImplementation()!;
    mocks.clientQuery.mockImplementation((sql: string) => {
      if (sql === "COMMIT") throw new Error("fallo de persistencia");
      return implementation(sql);
    });
    const res = await invoke("/api/conciliacion/excepciones/:id/resolver", { accion: "ignorar", nota: "No escolar" });
    expect(res.statusCode).toBe(500);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("otro campus no resuelve ni emite", async () => {
    const res = await invoke("/api/conciliacion/excepciones/:id/resolver", { accion: "ignorar", nota: "No escolar" }, { campus_id: 90 });
    expect(res.statusCode).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("sin permiso no abre transacción ni emite", async () => {
    const res = await invoke("/api/conciliacion/excepciones/:id/resolver", { accion: "ignorar", nota: "No escolar" }, { role: "maestro" });
    expect(res.statusCode).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("conciliación sin pendientes refresca la cifra actual sin inventarla", async () => {
    const res = await invoke("/api/caja/ejecutar-conciliacion");
    expect(res.statusCode).toBe(200);
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(8, 9);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ conciliados: 0 }));
  });
});
