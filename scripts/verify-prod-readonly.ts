import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod/v4";
import {
  assertLocalTarget,
  assertProdMigrationEnvironment,
  parseDatabaseTarget,
} from "../server/lib/migration-production";
import { compareSchemaCatalog, readSchemaCatalog, withoutPg18NotNullConstraints } from "./lib/schema-catalog";

/**
 * Verificación posterior de solo lectura de la base de producción (Cloud SQL), por el proxy local.
 * Compara la estructura con drizzle/schema-catalog.json (generado en PG16) ignorando únicamente
 * las filas NOT NULL de pg_constraint que PG18 agrega. No escribe nada: la transacción es READ ONLY.
 *
 *   APP_ENV=production DATABASE_URL=postgresql://usuario:clave@127.0.0.1:5432/edupay npm run db:verify:prod
 */
const log = (message: string) => console.log(`[db:verify:prod] ${message}`);

async function main(): Promise<void> {
  assertProdMigrationEnvironment(process.env);
  assertLocalTarget(parseDatabaseTarget(process.env.DATABASE_URL as string));

  const journal = z.object({ entries: z.array(z.object({ tag: z.string() })) }).parse(
    JSON.parse(await fs.readFile(path.resolve("drizzle/migrations/meta/_journal.json"), "utf8")),
  );
  const expected = z.record(z.string(), z.array(z.unknown())).parse(
    JSON.parse(await fs.readFile(path.resolve("drizzle/schema-catalog.json"), "utf8")),
  );

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const info = (await client.query(
      "SELECT current_database() AS db, current_setting('server_version') AS version",
    )).rows[0];
    const ledger = Number((await client.query('SELECT COUNT(*)::int AS n FROM "drizzle"."__drizzle_migrations"')).rows[0].n);
    const tables = Number((await client.query(
      "SELECT COUNT(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relkind IN ('r','p')",
    )).rows[0].n);
    const rows = Number((await client.query(
      "SELECT COALESCE(SUM(n_live_tup),0)::bigint AS n FROM pg_stat_user_tables WHERE schemaname='public'",
    )).rows[0].n);
    const marker = (await client.query(
      "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
    )).rows[0]?.marker ?? null;
    const bridge = Number((await client.query(
      "SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename IN ('external_identities','firebase_students','firebase_campus_map')",
    )).rows[0].n);

    const actual = await withoutPg18NotNullConstraints(client, await readSchemaCatalog(client));
    const differences = compareSchemaCatalog(expected, actual);
    await client.query("ROLLBACK");

    log(`PostgreSQL ${info.version} · base ${info.db} · marcador: ${marker ?? "ninguno"}`);
    log(`Historial: ${ledger} de ${journal.entries.length} · tablas en public: ${tables} · tablas del puente: ${bridge} de 3 · filas estimadas: ${rows}`);
    const problems: string[] = [];
    if (ledger !== journal.entries.length) problems.push("el historial no coincide con el diario");
    if (bridge !== 3) problems.push("faltan tablas del puente");
    if (marker === "edupay:test" || marker === "edupay:demo") problems.push("la base tiene marcador de pruebas o demo");
    if (differences.length) problems.push(`diferencias de estructura en: ${differences.join(", ")}`);
    if (problems.length) throw new Error(`Verificación fallida: ${problems.join("; ")}`);
    log("Estructura idéntica al catálogo verificado (12 categorías, sin los NOT NULL de PG18). Nada se escribió.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(`[db:verify:prod] ${error instanceof Error ? error.message : "Error desconocido"}`);
  process.exitCode = 1;
});
