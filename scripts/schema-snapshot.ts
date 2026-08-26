import fs from "node:fs/promises";
import { migrationPool } from "./migration-db";

function readArg(name: string): string | undefined {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1];
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

const output = readArg("--output") ?? "/tmp/edupay-schema.json";
if (!output) throw new Error("Falta la ruta de --output");

const relations = await migrationPool.query(`
  SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r', 'p')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
   ORDER BY n.nspname, c.relname
`);
const columns = await migrationPool.query(`
  SELECT table_schema, table_name, ordinal_position, column_name, data_type,
         udt_name, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')
   ORDER BY table_schema, table_name, ordinal_position
`);
const constraints = await migrationPool.query(`
  SELECT n.nspname AS schema_name, c.relname AS table_name,
         con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
   ORDER BY n.nspname, c.relname, con.conname
`);
const indexes = await migrationPool.query(`
  SELECT schemaname AS schema_name, tablename AS table_name, indexname, indexdef
    FROM pg_indexes
   WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
   ORDER BY schemaname, tablename, indexname
`);
const counts: Record<string, string> = {};
for (const relation of relations.rows) {
  const identifier = `"${String(relation.schema_name).replace(/"/g, '""')}"."${String(relation.table_name).replace(/"/g, '""')}"`;
  const result = await migrationPool.query(`SELECT COUNT(*)::text AS count FROM ${identifier}`);
  counts[`${relation.schema_name}.${relation.table_name}`] = result.rows[0].count;
}

await fs.writeFile(output, JSON.stringify({
  relations: relations.rows,
  columns: columns.rows,
  constraints: constraints.rows,
  indexes: indexes.rows,
  counts,
}, null, 2));
console.log(`[db:snapshot] Esquema guardado en ${output}`);
await migrationPool.end();