import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve(import.meta.dirname, "../../scripts/lockfile-public.mjs");

describe("lockfile público en una copia de instalación", () => {
  it("sólo cambia URLs internas y una segunda ejecución no cambia el archivo", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "edupay-lockfile-"));
    const filename = resolve(directory, "package-lock.json");
    const lock = {
      name: "fixture",
      lockfileVersion: 3,
      packages: {
        "": { name: "fixture", dependencies: { example: "1.2.3" } },
        "node_modules/example": {
          version: "1.2.3",
          resolved: "http://package-firewall.replit.internal/npm/example/-/example-1.2.3.tgz",
          integrity: "sha512-fixture",
          engines: { node: ">=20" },
        },
        "node_modules/@scope/example": {
          version: "2.0.0",
          resolved: "http://package-firewall.replit.internal/npm/@scope/example/-/example-2.0.0.tgz",
          integrity: "sha512-scoped-fixture",
        },
        "node_modules/public": {
          version: "3.0.0",
          resolved: "https://registry.npmjs.org/public/-/public-3.0.0.tgz",
          integrity: "sha512-public-fixture",
        },
      },
    };
    try {
      writeFileSync(filename, JSON.stringify(lock, null, 2) + "\n");
      const first = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
      expect(first.status, first.stderr).toBe(0);
      expect(first.stdout).toContain("instalación: 2");
      const output = readFileSync(filename, "utf8");
      const expected = structuredClone(lock);
      expected.packages["node_modules/example"].resolved =
        "https://registry.npmjs.org/example/-/example-1.2.3.tgz";
      expected.packages["node_modules/@scope/example"].resolved =
        "https://registry.npmjs.org/@scope/example/-/example-2.0.0.tgz";
      expect(JSON.parse(output)).toEqual(expected);
      const second = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain("instalación: 0");
      expect(readFileSync(filename, "utf8")).toBe(output);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
