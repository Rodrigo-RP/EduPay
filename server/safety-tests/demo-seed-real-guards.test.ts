import express from "express";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getUser: vi.fn(), insert: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: mocks.query }, db: { insert: mocks.insert } }));
vi.mock("../storage", () => ({ storage: { getUser: mocks.getUser } }));
// Se importa el seed REAL: no reemplazarlo por una excepción simulada.
import { registerDemoSeedRoute } from "../routes/demo-seed";
import { JWT_SECRET } from "../routes/shared";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("Excepción demo: guardas reales antes de cualquier borrado", () => {
  it.each(["production", "sin bandera", "sin marcador"])("%s: 403 y ningún borrado", async scenario => {
    vi.stubEnv("APP_ENV", scenario === "production" ? "production" : "development");
    vi.stubEnv("ALLOW_DEMO_SEED", scenario === "sin bandera" ? "" : "true");
    mocks.getUser.mockResolvedValue({ id: 80, is_super_admin: true });
    mocks.query.mockResolvedValue({ rows: [{ environment_marker: null }] });
    const app = express();
    registerDemoSeedRoute(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/demo/seed`, {
        method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id: 80 }, JWT_SECRET)}` },
      });
      expect(response.status).toBe(403);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(true);
      expect(mocks.query).toHaveBeenCalledTimes(scenario === "sin marcador" ? 1 : 0);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
