import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasPermission, MODULES, ACTIONS } from "@shared/permissions";

const writes = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
vi.mock("../db", () => ({ db: { execute: writes.execute }, pool: { query: writes.query } }));
import { registerUnavailableSecurityRoutes } from "../routes/unavailable-security";
import { registerSatStatisticsRoute } from "../routes/sat-statistics";
import { getInvoicingProviderStatus } from "../lib/invoicing/get-invoicing-provider";

const query = vi.fn();
const loadConfig = vi.fn();
const checkScope = vi.fn();
let server: Server;
let base: string;
const authenticate: express.RequestHandler = (req: any, res, next) => {
  const role = req.get("X-Test-Role");
  if (!role) return res.status(401).json({ message: "Token requerido" });
  req.user = { role, campus_id: 48, tenant_id: 29 };
  next();
};
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerUnavailableSecurityRoutes(app, authenticate, (req: any) =>
    hasPermission(req.user.role, MODULES.SECURITY, ACTIONS.READ),
  );
  registerSatStatisticsRoute(app, {
    authenticate,
    canRead: (req: any) => hasPermission(req.user.role, MODULES.FISCAL, ACTIONS.READ),
    checkScope, query, loadConfig,
    providerStatus: config => getInvoicingProviderStatus(config, {
      FACTURAPI_SECRET_KEY: "sk_test_ISOLATED_FIXTURE_NOT_A_CREDENTIAL",
    }),
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  query.mockReset().mockResolvedValue({ rows: [{ total_cfdis: "5", emitidos: "3", cancelados: "1", pendientes: "1" }] });
  loadConfig.mockReset().mockResolvedValue({ proveedor: "facturapi", ambiente: "sandbox", organizacion_id: "sandbox" });
  checkScope.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  expect(writes.execute).not.toHaveBeenCalled();
  expect(writes.query).not.toHaveBeenCalled();
});
const headers = (role: string) => ({ "X-Test-Role": role });

describe.each(["scan", "block-ip", "enable-2fa"])("Seguridad retirada: %s", action => {
  it("501 exacto con permiso, sin SQL ni proveedor (incluso sin body)", async () => {
    const r = await fetch(`${base}/api/security/${action}`, { method: "POST", headers: headers("super_admin") });
    expect(r.status).toBe(501);
    expect(await r.json()).toEqual({ code: "NO_DISPONIBLE", message: "Esta función no está disponible todavía" });
    expect(query).not.toHaveBeenCalled();
    expect(loadConfig).not.toHaveBeenCalled();
  });
  it("403 sin permiso, sin consultas ni escrituras", async () => {
    const r = await fetch(`${base}/api/security/${action}`, { method: "POST", headers: headers("asistente") });
    expect(r.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("401 sin autenticación", async () => {
    expect((await fetch(`${base}/api/security/${action}`, { method: "POST" })).status).toBe(401);
  });
});

describe("Estadísticas SAT sin éxitos inventados", () => {
  it("usa la configuración y el mismo resolvedor de credenciales que la fábrica", async () => {
    const r = await fetch(`${base}/api/fiscal/estadisticas-sat`, { headers: headers("contador_general") });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      total_cfdis: 5, emitidos: 3, cancelados: 1, pendientes: 1,
      pac: "facturapi", modo: "sandbox", conexion_verificada: false, operacion_habilitada: true,
    });
    expect(loadConfig).toHaveBeenCalledWith(48, 29);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("s.tenant_id = $2"), [48, 29]);
    expect(query.mock.calls[0][0]).toMatch(/^\s*SELECT/);
  });
  it("sin configuración no informa proveedor activo", async () => {
    loadConfig.mockResolvedValue(null);
    const r = await fetch(`${base}/api/fiscal/estadisticas-sat`, { headers: headers("contador_general") });
    expect(await r.json()).toMatchObject({ pac: null, modo: "sin configurar", conexion_verificada: false, operacion_habilitada: false });
  });
  it.each(["query", "config"])("error de base en %s → 500, sin métricas cero ni detalles", async failure => {
    (failure === "query" ? query : loadConfig).mockRejectedValue(new Error("detalle interno de base"));
    const r = await fetch(`${base}/api/fiscal/estadisticas-sat`, { headers: headers("contador_general") });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ message: "No se pudieron obtener las estadísticas SAT" });
  });
  it("403 sin permiso fiscal y sin consultar la base", async () => {
    const r = await fetch(`${base}/api/fiscal/estadisticas-sat`, { headers: headers("asistente") });
    expect(r.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(loadConfig).not.toHaveBeenCalled();
  });
  it("conserva bloqueo de campus/tenant", async () => {
    checkScope.mockImplementation(async (_campus, _tenant, res) => { res.status(403).json({ message: "Campus ajeno" }); return false; });
    const r = await fetch(`${base}/api/fiscal/estadisticas-sat`, { headers: headers("contador_general") });
    expect(r.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    [undefined, "sandbox", "sin configurar", false],
    ["sk_live_ISOLATED_FIXTURE_NOT_A_CREDENTIAL", "produccion", "produccion", false],
    ["sk_test_ISOLATED_FIXTURE_NOT_A_CREDENTIAL", "produccion", "sin configurar", false],
  ])("describe modo sin afirmar conexión ni habilitar Live", (key, ambiente, modo, enabled) => {
    const result = getInvoicingProviderStatus(
      { proveedor: "facturapi", ambiente, organizacion_id: "sandbox" },
      key ? { FACTURAPI_SECRET_KEY: key } : {},
    );
    expect(result).toMatchObject({ modo, conexion_verificada: false, operacion_habilitada: enabled });
    expect(JSON.stringify(result)).not.toContain(key ?? "ISOLATED_FIXTURE");
  });
});
