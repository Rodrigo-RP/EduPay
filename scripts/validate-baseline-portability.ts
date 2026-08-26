import fs from "node:fs/promises";
import path from "node:path";
import { migrationPool } from "./migration-db";

const baselinePath = path.resolve(process.cwd(), "drizzle/migrations/0000_baseline.sql");
const originalSql = await fs.readFile(baselinePath, "utf8");
const validationSchema = "drizzle_baseline_validation";
const portableSql = originalSql.replaceAll('"public".', `"${validationSchema}".`);
const statements = portableSql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

const client = await migrationPool.connect();
try {
  await client.query("BEGIN");
  await client.query(`DROP SCHEMA IF EXISTS "${validationSchema}" CASCADE`);
  await client.query(`CREATE SCHEMA "${validationSchema}"`);
  await client.query(`SET LOCAL search_path TO "${validationSchema}"`);
  for (const statement of statements) {
    await client.query(statement);
  }
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'p')`,
    [validationSchema],
  );
  if (Number(result.rows[0].count) !== 58) {
    throw new Error(`El baseline creó ${result.rows[0].count} tablas; se esperaban 58`);
  }
  console.log(
    `[db:validate-baseline] ${statements.length} sentencias y 58 tablas validadas en PostgreSQL`,
  );
  await client.query("ROLLBACK");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await migrationPool.end();
}