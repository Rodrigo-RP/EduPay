import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrationDb, migrationPool } from "./migration-db";

try {
  const migrationFolder = path.resolve(process.cwd(), "drizzle/migrations");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string; when: number }> };
  const baseline = journal.entries[0];
  if (!baseline?.tag.includes("baseline")) {
    throw new Error("La primera migración debe ser el baseline");
  }
  const baselineSql = fs.readFileSync(
    path.join(migrationFolder, `${baseline.tag}.sql`),
  );
  const baselineHash = crypto.createHash("sha256").update(baselineSql).digest("hex");
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
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE hash = $1 AND created_at = $2)::int AS baseline_count
         FROM "drizzle"."__drizzle_migrations"`,
      [baselineHash, baseline.when],
    );
    const ledgerCount = Number(ledger.rows[0].count);
    const baselineCount = Number(ledger.rows[0].baseline_count);
    if (ledgerCount > 0 && baselineCount !== 1) {
      throw new Error(
        "Ledger incompatible: no contiene exactamente el baseline esperado. No se ejecutó DDL.",
      );
    }
    if (ledgerCount === 0 && publicTableCount > 0) {
      throw new Error(
        "Baseline adoption required: el ledger está vacío para una base poblada. No se ejecutó DDL.",
      );
    }
  }
  await migrate(migrationDb, {
    migrationsFolder: migrationFolder,
  });
  console.log("[db:migrate] Migraciones aplicadas correctamente");
} finally {
  await migrationPool.end();
}