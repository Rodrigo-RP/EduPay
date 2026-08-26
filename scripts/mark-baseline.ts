import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { migrationPool } from "./migration-db";
import { assertBaselineCompatible } from "./baseline-compatibility";

const migrationFolder = path.resolve(process.cwd(), "drizzle/migrations");
const journalPath = path.join(migrationFolder, "meta", "_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
  entries: Array<{ tag: string; when: number }>;
};
if (journal.entries.length < 1 || !journal.entries[0].tag.includes("baseline")) {
  throw new Error("La primera migración del journal debe ser el baseline");
}

const entry = journal.entries[0];
const migrationPath = path.join(migrationFolder, `${entry.tag}.sql`);
const sql = fs.readFileSync(migrationPath);
const hash = crypto.createHash("sha256").update(sql).digest("hex");
const client = await migrationPool.connect();

try {
  await client.query("BEGIN");
  await assertBaselineCompatible(client, sql.toString("utf8"));
  console.log("[db:baseline:mark] Catálogo compatible con el baseline");
  await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  const existing = await client.query(
    `SELECT id, hash, created_at
       FROM "drizzle"."__drizzle_migrations"
      WHERE hash = $1 AND created_at = $2
      LIMIT 1`,
    [hash, entry.when],
  );
  if (existing.rows.length > 0) {
    console.log("[db:baseline:mark] El baseline ya estaba marcado");
  } else {
    const ledger = await client.query(
      `SELECT COUNT(*)::int AS count FROM "drizzle"."__drizzle_migrations"`,
    );
    if (Number(ledger.rows[0].count) > 0) {
      throw new Error("El ledger de Drizzle ya contiene un historial incompatible con este baseline");
    }
    await client.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
       VALUES ($1, $2)`,
      [hash, entry.when],
    );
    console.log(`[db:baseline:mark] Baseline marcado: ${entry.tag}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await migrationPool.end();
}