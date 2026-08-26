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
const expectedTableCount = (originalSql.match(/\bCREATE TABLE\b/g) ?? []).length;

const client = await migrationPool.connect();
try {
  await client.query("BEGIN");
  await client.query(`DROP SCHEMA IF EXISTS "${validationSchema}" CASCADE`);
  await client.query(`CREATE SCHEMA "${validationSchema}"`);
  await client.query(`SET LOCAL search_path TO "${validationSchema}"`);
  for (const [index, statement] of statements.entries()) {
    try {
      await client.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Sentencia ${index + 1}/${statements.length} inválida: ${message}\n${statement}`,
      );
    }
  }
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'p')`,
    [validationSchema],
  );
  if (Number(result.rows[0].count) !== expectedTableCount) {
    throw new Error(
      `El baseline creó ${result.rows[0].count} tablas; se esperaban ${expectedTableCount}`,
    );
  }
  console.log(
    `[db:validate-baseline] ${statements.length} sentencias y ${expectedTableCount} tablas validadas en PostgreSQL`,
  );
  await client.query("ROLLBACK");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await migrationPool.end();
}