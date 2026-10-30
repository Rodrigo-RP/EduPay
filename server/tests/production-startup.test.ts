import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { build } from "esbuild";
import path from "node:path";
import { validateProductionStartup } from "../lib/production-startup";

const env = (): NodeJS.ProcessEnv => ({
  APP_ENV: "production", NODE_ENV: "production",
  DATABASE_URL: "postgresql://localhost/never_connected",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  JWT_SECRET: randomBytes(32).toString("hex"),
  STRIPE_SECRET_KEY: randomBytes(32).toString("hex"),
});

describe("arranque seguro de producción", () => {
  it.each(["SESSION_SECRET", "JWT_SECRET", "DATABASE_URL", "STRIPE_SECRET_KEY", "APP_ENV"])("sin %s rechaza antes de conectar", async key => {
    const values = env();
    delete values[key];
    const read = vi.fn();
    await expect(validateProductionStartup(values, read)).rejects.toThrow(key);
    expect(read).not.toHaveBeenCalled();
  });
  it("rechaza ALLOW_DEMO_SEED sin consultar la base", async () => {
    const read = vi.fn();
    await expect(validateProductionStartup({ ...env(), ALLOW_DEMO_SEED: "true" }, read)).rejects.toThrow("ALLOW_DEMO_SEED");
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["edupay:test", "edupay:demo"])("rechaza marcador %s", async marker => {
    await expect(validateProductionStartup(env(), async () => marker)).rejects.toThrow("marcada");
  });
  it("acepta configuración válida y base no marcada; no conecta en desarrollo", async () => {
    await expect(validateProductionStartup(env(), async () => null)).resolves.toBeUndefined();
    const read = vi.fn();
    await validateProductionStartup({ APP_ENV: "development" }, read);
    expect(read).not.toHaveBeenCalled();
  });
  it("el grafo real del servidor no importa test-support", async () => {
    const result = await build({
      entryPoints: [path.resolve(import.meta.dirname, "../index.ts")],
      bundle: true, packages: "external", platform: "node", format: "esm",
      write: false, metafile: true, logLevel: "silent",
    });
    expect(Object.keys(result.metafile?.inputs ?? {}).filter(file => file.split("/").includes("test-support"))).toEqual([]);
  });
});
