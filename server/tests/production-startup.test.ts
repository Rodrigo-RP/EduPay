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
  TOTP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  STRIPE_SECRET_KEY: randomBytes(32).toString("hex"),
});

describe("arranque seguro de producción", () => {
  it.each(["SESSION_SECRET", "JWT_SECRET", "DATABASE_URL", "STRIPE_SECRET_KEY", "APP_ENV", "TOTP_ENCRYPTION_KEY"])("sin %s rechaza antes de conectar", async key => {
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

describe("arranque de producción · motivo del fallo de conexión (sin datos sensibles)", () => {
  const fails = (error: unknown) => validateProductionStartup(env(), async () => { throw error; });

  it.each([
    [Object.assign(new Error("password authentication failed for user \"edupay_app\""), { code: "28P01" }), "28P01"],
    [Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" }), "ECONNREFUSED"],
    [Object.assign(new Error("database \"x\" does not exist"), { code: "3D000" }), "3D000"],
  ])("incluye el código del error %#", async (error, code) => {
    await expect(fails(error)).rejects.toThrow(code);
  });

  it("detecta una contraseña vacía (el cliente nunca la envía)", async () => {
    await expect(fails(new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"))).rejects.toThrow(/contraseña de DATABASE_URL está vacía/);
  });

  it("nunca filtra la cadena de conexión, el usuario ni el mensaje original", async () => {
    const secret = "postgresql://edupay_app:SuperClave123@10.9.8.7/edupay";
    const error = Object.assign(new Error("connect failed for " + secret), { code: "ECONNREFUSED" });
    const thrown = await fails(error).catch(e => String(e.message));
    expect(thrown).not.toContain("SuperClave123");
    expect(thrown).not.toContain("10.9.8.7");
    expect(thrown).not.toContain("edupay_app");
    expect(thrown).toContain("no se pudo verificar el marcador");
  });

  it("ignora códigos con formato raro y no falla con errores que no son Error", async () => {
    await expect(fails(Object.assign(new Error("x"), { code: "<script>alert(1)</script>" }))).rejects.toThrow(/causa no identificada/);
    await expect(fails("texto suelto")).rejects.toThrow(/causa no identificada/);
    await expect(fails(null)).rejects.toThrow(/causa no identificada/);
  });
});
