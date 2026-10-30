import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertMigrationEnvironment } from "../lib/migration-environment";

describe("migraciones nunca en producción", () => {
  it.each(["APP_ENV", "NODE_ENV"])("rechaza %s=production", key => {
    expect(() => assertMigrationEnvironment({ [key]: "production" }))
      .toThrow("la estructura la aplica Replit al publicar");
  });
  it("permite desarrollo y pruebas", () => {
    expect(() => assertMigrationEnvironment({ APP_ENV: "test" })).not.toThrow();
    expect(() => assertMigrationEnvironment({ APP_ENV: "development" })).not.toThrow();
  });
  it.each(["migrate.ts", "mark-baseline.ts"])("%s se niega sin importar ni conectar el pool", script => {
    const result = spawnSync(process.execPath, [
      "--import", "tsx", path.resolve(import.meta.dirname, "../../scripts", script),
    ], {
      // La negativa debe ejecutar el script, sin módulos precargados de pruebas.
      env: { ...process.env, APP_ENV: "production", DATABASE_URL: "", NODE_OPTIONS: "" },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Migraciones bloqueadas en producción");
    expect(result.stderr).not.toContain("DATABASE_URL es obligatoria");
  });
});
