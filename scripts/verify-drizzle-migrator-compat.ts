import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { z } from "zod/v4";
import { assertNonProductionEnvironment, assertTestDatabase, DATABASE_MARKER_SQL } from "../server/lib/database-safety";
import { CATALOG_QUERIES, readSchemaCatalog, compareSchemaCatalog } from "./lib/schema-catalog";

assertNonProductionEnvironment();
assert.equal(process.env.APP_ENV, "test", "Esta verificación exige APP_ENV=test");
const destination = new URL(process.env.DATABASE_URL || "");
assert.ok(["postgres:", "postgresql:"].includes(destination.protocol));
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(destination.hostname));
assert.match(destination.pathname, /^\/edupay_drizzle_[a-z0-9_]+$/);
const legacyDirectory = path.resolve(process.argv[2] || "");
z.object({ version: z.literal("0.39.3") }).parse(
  JSON.parse(await fs.readFile(path.join(legacyDirectory, "package.json"), "utf8")),
);
z.object({ version: z.literal("0.45.4") }).parse(
  JSON.parse(await fs.readFile("node_modules/drizzle-orm/package.json", "utf8")),
);
const journal = z.object({
  entries: z.array(z.object({ tag: z.string(), when: z.number() })).length(7),
}).parse(JSON.parse(await fs.readFile("drizzle/migrations/meta/_journal.json", "utf8")));
const expectedCatalog = z.record(z.string(), z.array(z.unknown())).parse(
  JSON.parse(await fs.readFile("drizzle/schema-catalog.json", "utf8")),
);
const ledgerSQL = 'SELECT id, hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id';
const emptySQL = "SELECT count(*)::integer AS total FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')";
const identitySQL = "SELECT current_database() AS database_name";
const pool = new Pool({ connectionString: destination.href });

try {
  await assertTestDatabase(pool);
  for (const sql of [identitySQL, DATABASE_MARKER_SQL, emptySQL]) {
    const result = await pool.query(sql);
    console.log(sql, JSON.stringify(result.rows));
    if (sql === emptySQL) assert.equal(result.rows[0]?.total, 0, "La base debe estar vacía");
  }
  const oldDriver: unknown = await import(pathToFileURL(path.join(legacyDirectory, "node-postgres/index.js")).href);
  const oldMigrator: unknown = await import(pathToFileURL(path.join(legacyDirectory, "node-postgres/migrator.js")).href);
  if (typeof oldDriver !== "object" || oldDriver === null ||
      !("drizzle" in oldDriver) || typeof oldDriver.drizzle !== "function" ||
      typeof oldMigrator !== "object" || oldMigrator === null ||
      !("migrate" in oldMigrator) || typeof oldMigrator.migrate !== "function") {
    throw new Error("El paquete anterior no exporta el controlador y migrador esperados");
  }
  const legacyDb: unknown = oldDriver.drizzle(pool);
  await oldMigrator.migrate(legacyDb, { migrationsFolder: "drizzle/migrations" });
  console.log("[drizzle:compat] Las siete migraciones se aplicaron con ORM 0.39.3.");

  const before = await pool.query<{ id: number; hash: string; created_at: string }>(ledgerSQL);
  console.log(ledgerSQL, JSON.stringify(before.rows));
  assert.equal(before.rows.length, 7);
  for (const [index, entry] of journal.entries.entries()) {
    const hash = crypto.createHash("sha256")
      .update(await fs.readFile(`drizzle/migrations/${entry.tag}.sql`)).digest("hex");
    assert.deepEqual(before.rows[index], { id: index + 1, hash, created_at: String(entry.when) });
  }
  for (const [category, sql] of Object.entries(CATALOG_QUERIES)) {
    console.log(`[schema:query:${category}] ${sql}`);
  }
  const oldCatalog = await readSchemaCatalog(pool);
  assert.deepEqual(compareSchemaCatalog(expectedCatalog, oldCatalog), []);

  const submitted: string[] = [];
  const currentDb = drizzle(pool, { logger: { logQuery(query: string) { submitted.push(query); } } });
  await migrate(currentDb, { migrationsFolder: "drizzle/migrations" });
  const after = await pool.query<{ id: number; hash: string; created_at: string }>(ledgerSQL);
  console.log(ledgerSQL, JSON.stringify(after.rows));
  assert.deepEqual(after.rows, before.rows, "Se modificó el ledger anterior");
  const afterCatalog = await readSchemaCatalog(pool);
  assert.deepEqual(compareSchemaCatalog(expectedCatalog, afterCatalog), []);
  assert.deepEqual(afterCatalog, oldCatalog, "El migrador nuevo modificó la estructura");
  assert.ok(submitted.length > 0, "Debe haber evidencia SQL de la consulta del ledger");
  for (const query of submitted) {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    assert.ok(
      normalized === "begin" || normalized === "commit" ||
      normalized === 'create schema if not exists "drizzle"' ||
      normalized.startsWith('create table if not exists "drizzle"."__drizzle_migrations" (') ||
      normalized.startsWith('select id, hash, created_at from "drizzle"."__drizzle_migrations" '),
      "El migrador nuevo ejecutó SQL fuera de la comprobación del ledger",
    );
    console.log("[drizzle:compat:sql]", query);
  }
  console.log("[drizzle:compat] ORM 0.45.4 reconoce 7/7; cero migraciones reejecutadas, ledger idéntico y cero diferencias en 12 categorías.");
} finally {
  await pool.end();
}
