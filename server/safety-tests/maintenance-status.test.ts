import { beforeAll, afterAll, expect, it, vi } from "vitest";
import express from "express";
const operations = vi.hoisted(() => ({
  optimizeDatabase: vi.fn(), cleanupObsoleteData: vi.fn(),
  runMaintenanceTask: vi.fn(), checkQueryPerformance: vi.fn(),
}));
vi.mock("../optimize-database", () => operations);
vi.mock("../db", () => ({ db: {}, pool: { query: vi.fn() } }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../routes/shared", async importOriginal => ({
  ...await importOriginal<typeof import("../routes/shared")>(),
  requireAuth: (req: any, _res: any, next: any) => { req.user = { role: "super_admin" }; next(); },
}));
import { registerSystemRoutes } from "../routes/system";
let server: any, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); registerSystemRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));
for (const [endpoint, operation] of [
  ["optimize-database", "optimizeDatabase"], ["cleanup-database", "cleanupObsoleteData"],
] as const) {
  it(`${endpoint}: éxito 200; error devuelto o excepción 500`, async () => {
    for (const expected of [200, 500, 500]) {
      if (expected === 200) operations[operation].mockResolvedValueOnce({ success: true });
      else if (!operations[operation].mock.calls.length || operations[operation].mock.calls.length === 1) operations[operation].mockResolvedValueOnce({ success: false });
      else operations[operation].mockRejectedValueOnce(new Error("fallo simulado"));
      expect((await fetch(`${base}/api/admin/${endpoint}`, { method: "POST" })).status).toBe(expected);
    }
  });
}
it("mantenimiento falla si falla cualquiera de sus tres operaciones", async () => {
  for (const failed of ["optimization", "performance", "cleanup", null]) {
    operations.runMaintenanceTask.mockResolvedValueOnce(Object.fromEntries(
      ["optimization", "performance", "cleanup"].map(step => [step, { success: step !== failed }])));
    const response = await fetch(`${base}/api/admin/database-maintenance`, { method: "POST" });
    expect(response.status).toBe(failed ? 500 : 200);
    expect((await response.json()).success).toBe(!failed);
  }
  operations.runMaintenanceTask.mockRejectedValueOnce(new Error("fallo simulado"));
  expect((await fetch(`${base}/api/admin/database-maintenance`, { method: "POST" })).status).toBe(500);
});
