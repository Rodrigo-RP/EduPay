import express from "express";
import jwt from "jsonwebtoken";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ seed: vi.fn(), getUser: vi.fn(), query: vi.fn() }));
vi.mock("../seed-demo", () => ({ seedDemoData: mocks.seed }));
vi.mock("../storage", () => ({ storage: { getUser: mocks.getUser } }));
vi.mock("../db", () => ({ pool: { query: mocks.query }, db: {} }));

import { registerDemoSeedRoute } from "../routes/demo-seed";
import { JWT_SECRET } from "../routes/shared";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function post(token?: string) {
  const app = express();
  registerDemoSeedRoute(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address() as { port: number };
    return await fetch(`http://127.0.0.1:${address.port}/api/demo/seed`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

describe("Única ruta de seed, autenticación real y seed mock", () => {
  it("sin token devuelve 401 y no invoca seed ni consulta DB", async () => {
    expect((await post()).status).toBe(401);
    expect(mocks.seed).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("usuario no super_admin devuelve 403 sin invocar seed", async () => {
    mocks.getUser.mockResolvedValue({ id: 123, is_super_admin: false });
    const token = jwt.sign({ id: 123 }, JWT_SECRET);
    expect((await post(token)).status).toBe(403);
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("super admin sin bandera devuelve 403 sin invocar seed", async () => {
    vi.stubEnv("ALLOW_DEMO_SEED", "false");
    mocks.getUser.mockResolvedValue({ id: 123, is_super_admin: true });
    expect((await post(jwt.sign({ id: 123 }, JWT_SECRET))).status).toBe(403);
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("super admin con bandera invoca sólo el mock", async () => {
    vi.stubEnv("ALLOW_DEMO_SEED", "true");
    mocks.getUser.mockResolvedValue({ id: 123, is_super_admin: true });
    mocks.seed.mockResolvedValue({ success: true });
    expect((await post(jwt.sign({ id: 123 }, JWT_SECRET))).status).toBe(200);
    expect(mocks.seed).toHaveBeenCalledTimes(1);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rechazo de seguridad del seed se devuelve sin éxito falso", async () => {
    vi.stubEnv("ALLOW_DEMO_SEED", "true");
    mocks.getUser.mockResolvedValue({ id: 123, is_super_admin: true });
    mocks.seed.mockRejectedValue(new Error("bloqueado"));
    expect((await post(jwt.sign({ id: 123 }, JWT_SECRET))).status).toBe(403);
  });

  it("ruta registrada una sola vez y montada sólo desde system", () => {
    const files = readdirSync(new URL("../routes/", import.meta.url)).filter(f => f.endsWith(".ts"));
    const source = files.map(f => readFileSync(new URL(`../routes/${f}`, import.meta.url), "utf8")).join("\n");
    expect(source.match(/app\.post\(["']\/api\/demo\/seed["']/g)).toHaveLength(1);
    expect(source.match(/registerDemoSeedRoute\(app\)/g)).toHaveLength(1);
  });

  it("Playwright verifica el marcador antes de arrancar el servidor", () => {
    const source = readFileSync(new URL("../../playwright.config.ts", import.meta.url), "utf8");
    expect(source).toContain("npx tsx scripts/verify-test-database.ts && npm run dev");
    const vitestSource = readFileSync(new URL("../vitest.config.ts", import.meta.url), "utf8");
    expect(vitestSource).toContain('globalSetup: ["tests/global-setup.ts"]');
  });
});
