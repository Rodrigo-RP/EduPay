import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrationDb, migrationPool } from "./migration-db";

try {
  const state = await migrationPool.query(`
    SELECT
      to_regclass('"drizzle"."__drizzle_migrations"') IS NOT NULL AS ledger_exists,
      (
        SELECT COUNT(*)::int
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p')
      ) AS public_table_count
  `);
  const ledgerExists = state.rows[0].ledger_exists === true;
  const publicTableCount = Number(state.rows[0].public_table_count);
  if (!ledgerExists && publicTableCount > 0) {
    throw new Error(
      "Baseline adoption required: la base ya contiene tablas y no tiene ledger verificado. No se ejecutó DDL.",
    );
  }
  if (ledgerExists) {
    const ledger = await migrationPool.query(
      `SELECT COUNT(*)::int AS count FROM "drizzle"."__drizzle_migrations"`,
    );
    if (Number(ledger.rows[0].count) === 0 && publicTableCount > 0) {
      throw new Error(
        "Baseline adoption required: el ledger está vacío para una base poblada. No se ejecutó DDL.",
      );
    }
  }
  await migrate(migrationDb, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle/migrations"),
  });
  console.log("[db:migrate] Migraciones aplicadas correctamente");
} finally {
  await migrationPool.end();
}