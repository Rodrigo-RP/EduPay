import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { migrationPool } from "./migration-db";

const migrationFolder = path.resolve(process.cwd(), "drizzle/migrations");
const journalPath = path.join(migrationFolder, "meta", "_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
  entries: Array<{ tag: string; when: number }>;
};
if (journal.entries.length !== 1 || !journal.entries[0].tag.includes("baseline")) {
  throw new Error("El directorio de migraciones debe contener únicamente el baseline antes de marcarlo");
}

const entry = journal.entries[0];
const migrationPath = path.join(migrationFolder, `${entry.tag}.sql`);
const sql = fs.readFileSync(migrationPath);
const hash = crypto.createHash("sha256").update(sql).digest("hex");

try {
  await migrationPool.query("BEGIN");
  await migrationPool.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await migrationPool.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  const existing = await migrationPool.query(
    `SELECT id, hash, created_at
       FROM "drizzle"."__drizzle_migrations"
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.hash !== hash || Number(row.created_at) !== entry.when) {
      throw new Error("El ledger de Drizzle ya contiene un historial incompatible con este baseline");
    }
    console.log("[db:baseline:mark] El baseline ya estaba marcado");
  } else {
    await migrationPool.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
       VALUES ($1, $2)`,
      [hash, entry.when],
    );
    console.log(`[db:baseline:mark] Baseline marcado: ${entry.tag}`);
  }
  await migrationPool.query("COMMIT");
} catch (error) {
  await migrationPool.query("ROLLBACK");
  throw error;
} finally {
  await migrationPool.end();
}