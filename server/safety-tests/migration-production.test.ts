import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  ProdMigrationError,
  assertApplyConfirmation,
  assertLedgerCompatible,
  assertLocalTarget,
  assertNoTestMarker,
  assertProdMigrationEnvironment,
  assertTargetDatabaseMatches,
  parseDatabaseTarget,
  parseProdMigrationArgs,
  pendingMigrations,
} from "../lib/migration-production";

const entries = [
  { tag: "0000_baseline", when: 100 },
  { tag: "0001_a", when: 200 },
  { tag: "0002_b", when: 300 },
];

describe("db:migrate:prod · argumentos y entorno", () => {
  it("el simulacro es el valor por defecto", () => {
    expect(parseProdMigrationArgs([])).toEqual({ apply: false, confirm: null });
  });
  it("lee --apply y --confirm", () => {
    expect(parseProdMigrationArgs(["--apply", "--confirm=edupay"])).toEqual({ apply: true, confirm: "edupay" });
  });
  it("rechaza argumentos desconocidos", () => {
    expect(() => parseProdMigrationArgs(["--force"])).toThrow("Argumento no reconocido");
  });
  it.each([undefined, "development", "test", "Production", ""])("exige APP_ENV=production exacto (%s)", value => {
    expect(() => assertProdMigrationEnvironment({ APP_ENV: value, DATABASE_URL: "postgresql://u@127.0.0.1/db" }))
      .toThrow("APP_ENV=production");
  });
  it("exige DATABASE_URL y rechaza ALLOW_DEMO_SEED=true", () => {
    expect(() => assertProdMigrationEnvironment({ APP_ENV: "production" })).toThrow("DATABASE_URL");
    expect(() => assertProdMigrationEnvironment({ APP_ENV: "production", DATABASE_URL: "x", ALLOW_DEMO_SEED: "TRUE" }))
      .toThrow("ALLOW_DEMO_SEED");
    expect(() => assertProdMigrationEnvironment({ APP_ENV: "production", DATABASE_URL: "x" })).not.toThrow();
  });
});

describe("db:migrate:prod · destino (U8, U9)", () => {
  it("lee usuario, host, puerto y base sin devolver la contraseña", () => {
    const target = parseDatabaseTarget("postgresql://edupay_app:S3creto@127.0.0.1:5432/edupay");
    expect(target).toEqual({ host: "127.0.0.1", port: "5432", database: "edupay", user: "edupay_app" });
    expect(JSON.stringify(target)).not.toContain("S3creto");
  });
  it("el parámetro host= (socket) tiene prioridad, igual que en pg", () => {
    const target = parseDatabaseTarget("postgresql://u:p@localhost/edupay?host=/cloudsql/p:us-central1:edupay-pg");
    expect(target.host).toBe("/cloudsql/p:us-central1:edupay-pg");
    expect(() => assertLocalTarget(target)).not.toThrow();
  });
  it.each(["127.0.0.1", "localhost", "[::1]"])("acepta el proxy local %s", host => {
    expect(() => assertLocalTarget(parseDatabaseTarget(`postgresql://u:p@${host}:5432/db`))).not.toThrow();
  });
  it.each([
    "postgresql://u:p@34.135.247.111:5432/edupay",
    "postgresql://u:p@ep-algo.neon.tech/neondb",
    "postgresql://u:p@db.example.com/edupay",
    "postgresql://u:p@localhost.evil.test/edupay",
  ])("rechaza el servidor remoto %s", url => {
    expect(() => assertLocalTarget(parseDatabaseTarget(url))).toThrow("proxy local");
  });
  it("rechaza una URL sin servidor (pg tomaría PGHOST del entorno)", () => {
    expect(() => parseDatabaseTarget("postgresql:///edupay")).toThrow("servidor");
  });
  it("rechaza URL inválida o de otro protocolo sin repetir el valor", () => {
    let message = "";
    try { parseDatabaseTarget("contraseña-secreta"); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("no es una URL válida");
    expect(message).not.toContain("contraseña-secreta");
    expect(() => parseDatabaseTarget("mysql://u:p@127.0.0.1/db")).toThrow("postgresql://");
  });
  it("la base conectada debe coincidir con la de la URL", () => {
    const target = parseDatabaseTarget("postgresql://u:p@127.0.0.1/edupay");
    expect(() => assertTargetDatabaseMatches(target, "edupay")).not.toThrow();
    expect(() => assertTargetDatabaseMatches(target, "otra")).toThrow("no coincide");
  });
  it("aplicar exige --confirm con el nombre exacto; el simulacro no", () => {
    expect(() => assertApplyConfirmation({ apply: false, confirm: null }, "edupay")).not.toThrow();
    expect(() => assertApplyConfirmation({ apply: true, confirm: null }, "edupay")).toThrow("--confirm");
    expect(() => assertApplyConfirmation({ apply: true, confirm: "Edupay" }, "edupay")).toThrow("--confirm");
    expect(() => assertApplyConfirmation({ apply: true, confirm: "edupay" }, "edupay")).not.toThrow();
  });
});

describe("db:migrate:prod · marcador e historial (U5, U6, U7)", () => {
  it.each(["edupay:test", "edupay:demo"])("rechaza la base marcada %s", marker => {
    expect(() => assertNoTestMarker(marker)).toThrow("pruebas o demo");
  });
  it.each([null, undefined, "otro comentario"])("acepta una base sin marcador de pruebas (%s)", marker => {
    expect(() => assertNoTestMarker(marker)).not.toThrow();
  });
  it("base vacía sin historial: permitido", () => {
    expect(() => assertLedgerCompatible({ ledgerExists: false, publicTableCount: 0, ledgerCount: 0, baselineCount: 0 })).not.toThrow();
  });
  it("tablas sin historial: adopción de línea base requerida", () => {
    expect(() => assertLedgerCompatible({ ledgerExists: false, publicTableCount: 3, ledgerCount: 0, baselineCount: 0 }))
      .toThrow("Baseline adoption required");
  });
  it("historial con línea base distinta: incompatible", () => {
    expect(() => assertLedgerCompatible({ ledgerExists: true, publicTableCount: 69, ledgerCount: 9, baselineCount: 0 }))
      .toThrow("Ledger incompatible");
  });
  it("historial vacío para una base poblada: adopción requerida", () => {
    expect(() => assertLedgerCompatible({ ledgerExists: true, publicTableCount: 5, ledgerCount: 0, baselineCount: 0 }))
      .toThrow("Baseline adoption required");
  });
  it("historial correcto: permitido", () => {
    expect(() => assertLedgerCompatible({ ledgerExists: true, publicTableCount: 69, ledgerCount: 9, baselineCount: 1 })).not.toThrow();
  });
});

describe("db:migrate:prod · migraciones pendientes (U2, U3)", () => {
  it("base vacía: todas pendientes", () => {
    expect(pendingMigrations(entries, null).map(e => e.tag)).toEqual(["0000_baseline", "0001_a", "0002_b"]);
  });
  it("base al día: ninguna pendiente", () => {
    expect(pendingMigrations(entries, 300)).toEqual([]);
  });
  it("migración futura: solo la nueva", () => {
    const future = [...entries, { tag: "0003_nueva", when: 400 }];
    expect(pendingMigrations(future, 300).map(e => e.tag)).toEqual(["0003_nueva"]);
  });
});

describe("db:migrate:prod · el script se niega antes de conectar", () => {
  const script = path.resolve(import.meta.dirname, "../../scripts/migrate-prod.ts");
  const run = (env: NodeJS.ProcessEnv, ...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    // El servidor 192.0.2.1 es de documentación: si el script intentara conectar, tardaría; aquí debe fallar de inmediato.
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_OPTIONS: "", ...env },
    encoding: "utf8",
    timeout: 20000,
  });
  it.each([undefined, "development", "test"])("sin APP_ENV=production (%s) no ejecuta nada", appEnv => {
    const result = run({ APP_ENV: appEnv, DATABASE_URL: "postgresql://u:p@127.0.0.1:1/db" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("APP_ENV=production");
  });
  it("con un servidor remoto no abre ninguna conexión", () => {
    const result = run({ APP_ENV: "production", DATABASE_URL: "postgresql://u:clave-secreta@192.0.2.1:5432/edupay" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("proxy local");
    expect(result.stderr + result.stdout).not.toContain("clave-secreta");
  });
  it("rechaza argumentos desconocidos", () => {
    const result = run({ APP_ENV: "production", DATABASE_URL: "postgresql://u:p@127.0.0.1:1/db" }, "--force");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Argumento no reconocido");
  });
  it("el error es un ProdMigrationError identificable", () => {
    expect(new ProdMigrationError("x").name).toBe("ProdMigrationError");
  });
});
