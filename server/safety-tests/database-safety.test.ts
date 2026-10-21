import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }));
vi.mock("../db", () => ({ pool: mocks, db: {} }));

import { seedDemoData } from "../seed-demo";
import { assertDatabaseMarker, assertTestDatabase } from "../lib/database-safety";
import vitestSetup from "../tests/global-setup";
import playwrightSetup from "../../e2e/global-setup";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Barreras de base de datos (sin conexión real)", () => {
  it("seed en production falla antes de ejecutar cualquier SQL", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("ALLOW_DEMO_SEED", "true");
    await expect(seedDemoData()).rejects.toThrow("APP_ENV");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("seed sin bandera falla antes de ejecutar SQL", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("ALLOW_DEMO_SEED", "false");
    await expect(seedDemoData()).rejects.toThrow("ALLOW_DEMO_SEED");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("seed sin marcador hace sólo SELECT y nunca ejecuta el seed", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("ALLOW_DEMO_SEED", "true");
    mocks.query.mockResolvedValue({ rows: [{ environment_marker: null }] });
    await expect(seedDemoData()).rejects.toThrow("marcador explícito");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][0]).toMatch(/^SELECT /);
  });

  it.each(["edupay:demo", "edupay:test"])("seed admite marcador %s (sin ejecutar seed)", async marker => {
    mocks.query.mockResolvedValue({ rows: [{ environment_marker: marker }] });
    await expect(assertDatabaseMarker(mocks, "seed")).resolves.toBeUndefined();
  });

  it("la suite rechaza marcador demo; exige test", async () => {
    vi.stubEnv("APP_ENV", "test");
    mocks.query.mockResolvedValue({ rows: [{ environment_marker: "edupay:demo" }] });
    await expect(assertTestDatabase(mocks)).rejects.toThrow("edupay:test");
  });

  it("la suite admite test explícito", async () => {
    vi.stubEnv("APP_ENV", "test");
    mocks.query.mockResolvedValue({ rows: [{ environment_marker: "edupay:test" }] });
    await expect(assertTestDatabase(mocks)).resolves.toBeUndefined();
  });

  it.each([
    ["Vitest", vitestSetup],
    ["Playwright", playwrightSetup],
  ] as const)("%s aborta sin marcador antes de POST o escritura", async (_name, setup) => {
    vi.stubEnv("APP_ENV", "test");
    mocks.query.mockResolvedValue({ rows: [{ environment_marker: null }] });
    const network = vi.spyOn(globalThis, "fetch");
    await expect(setup()).rejects.toThrow("marcador explícito edupay:test");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][0]).toMatch(/^SELECT /);
    expect(network).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
