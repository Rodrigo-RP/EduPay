import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function manifest(directory: string): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  async function visit(relative: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else entries[name] = crypto.createHash("sha256")
        .update(await fs.readFile(path.join(directory, name))).digest("hex");
    }
  }
  await visit("");
  return entries;
}

// El generador sólo recibe copias y una URL inaccesible. Nunca carga heliumdb.
const root = process.cwd();
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "edupay-drizzle-generate-"));
try {
  for (const name of ["drizzle", "shared", "drizzle.config.ts", "package.json"]) {
    await fs.cp(path.join(root, name), path.join(temporary, name), { recursive: true });
  }
  await fs.symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
  const original = await manifest(path.join(root, "drizzle/migrations"));
  const generated = path.join(temporary, "drizzle/migrations");
  const result = spawnSync("npm", ["run", "db:generate"], {
    cwd: temporary, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env, APP_ENV: "test",
      DATABASE_URL: "postgresql://127.0.0.1:1/edupay_drizzle_unreachable",
      NEON_DATABASE_URL: "postgresql://127.0.0.1:1/edupay_drizzle_unreachable",
    },
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Falló npm run db:generate");
  assert.match(result.stdout, /No schema changes, nothing to migrate/);
  assert.deepEqual(await manifest(generated), original, "Cambió una migración o su metadata");
  console.log("[drizzle:generate] Cero archivos nuevos o modificados; snapshots y journal idénticos.");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
