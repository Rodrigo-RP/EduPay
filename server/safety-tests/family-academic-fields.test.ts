import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { registerMiscRoutes } from "../routes/misc";

const { query, getCampusScoped, getFamiliesByTenant, getFamilyBalance } = vi.hoisted(() => ({
  query: vi.fn(), getCampusScoped: vi.fn(), getFamiliesByTenant: vi.fn(), getFamilyBalance: vi.fn(),
}));
vi.mock("../db", () => ({ db: {}, pool: { query } }));
vi.mock("../storage", () => ({ storage: { getCampusScoped, getFamiliesByTenant, getFamilyBalance } }));
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn() }));
vi.mock("../routes/shared", () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-access"]) return res.sendStatus(401);
    req.user = { tenant_id: 8, campus_id: 9, allowed: req.headers["x-test-access"] === "allowed" };
    next();
  },
  requireAuth: (_req: any, _res: any, next: any) => next(),
  checkCampusTenant: vi.fn(),
  hasPermissionForUser: (user: any) => user.allowed,
  JWT_SECRET: "isolated-test",
}));

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  registerMiscRoutes(app);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  getCampusScoped.mockImplementation(async (campus, tenant) => campus === 9 && tenant === 8 ? { id: 9 } : null);
  getFamiliesByTenant.mockResolvedValue([{ id: 10 }]);
  getFamilyBalance.mockResolvedValue({ saldo_pendiente_centavos: 0 });
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("JOIN students")) {
      expect(sql).toMatch(/SELECT\s+s\.id,[\s\S]*s\.nivel_escolar[\s\S]*FROM family_students/);
      return { rows: [{ id: 11, nombre_completo: "Alumno aislado", nivel_escolar: "Primaria", grado: "1", grupo: "A" }] };
    }
    return { rows: [] };
  });
});

it("la respuesta de Familias incluye el nivel real que usa el filtro de sección", async () => {
  const res = await fetch(`${base}/api/families/9`, { headers: { "x-test-access": "allowed" } });
  expect(res.status).toBe(200);
  expect((await res.json())[0].estudiantes[0].nivel_escolar).toBe("Primaria");
  expect(getFamiliesByTenant).toHaveBeenCalledWith(8, 9);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("JOIN students"), [10]);
});

for (const [access, campus, status] of [["", 9, 401], ["denied", 9, 403], ["allowed", 99, 403]] as const) {
  it(`rechaza acceso=${access || "sin sesión"}, campus=${campus} sin consultar alumnos`, async () => {
    const res = await fetch(`${base}/api/families/${campus}`, { headers: access ? { "x-test-access": access } : {} });
    expect(res.status).toBe(status);
    expect(query).not.toHaveBeenCalled();
    expect(getFamiliesByTenant).not.toHaveBeenCalled();
  });
}
