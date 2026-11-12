import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { DATABASE_MARKER_SQL } from "../server/lib/database-safety";
import {
  PROD_MIGRATION_LOCK_KEY,
  assertApplyConfirmation,
  assertLedgerCompatible,
  assertLocalTarget,
  assertNoTestMarker,
  assertProdMigrationEnvironment,
  assertTargetDatabaseMatches,
  parseDatabaseTarget,
  parseProdMigrationArgs,
  pendingMigrations,
  ProdMigrationError,
  type JournalEntry,
} from "../server/lib/migration-production";

/**
 * Aplica la estructura en la base de producción (Cloud SQL) desde una máquina
 * autorizada, a través del proxy de Cloud SQL. Sin --apply solo lee y reporta.
 *
 *   APP_ENV=production DATABASE_URL=postgresql://usuario:clave@127.0.0.1:5432/edupay \
 *     npm run db:migrate:prod                          # simulacro
 *   ... npm run db:migrate:prod -- --apply --confirm=edupay
 *
 * No imprime nunca la cadena de conexión. Ver docs/PUBLICACION.md, sección 1.
 */
const log = (message: string) => console.log(`[db:migrate:prod] ${message}`);

async function main(): Promise<void> {
  const args = parseProdMigrationArgs(process.argv.slice(2));
  assertProdMigrationEnvironment(process.env);
  const target = parseDatabaseTarget(process.env.DATABASE_URL as string);
  // Antes de abrir cualquier conexión.
  assertLocalTarget(target);

  const migrationFolder = path.resolve(process.cwd(), "drizzle/migrations");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  const baseline = journal.entries[0];
  if (!baseline?.tag.includes("baseline")) {
    throw new ProdMigrationError("La primera migración debe ser el baseline");
  }
  const baselineHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(migrationFolder, `${baseline.tag}.sql`)))
    .digest("hex");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const info = (await pool.query(
      "SELECT current_database() AS db, current_user AS usr, current_setting('server_version') AS version",
    )).rows[0];
    assertTargetDatabaseMatches(target, info.db);
    assertNoTestMarker((await pool.query(DATABASE_MARKER_SQL)).rows[0]?.environment_marker);

    const state = (await pool.query(`
      SELECT
        to_regclass('"drizzle"."__drizzle_migrations"') IS NOT NULL AS ledger_exists,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')) AS public_table_count
    `)).rows[0];
    const ledgerExists = state.ledger_exists === true;
    let ledgerCount = 0;
    let baselineCount = 0;
    let lastApplied: number | null = null;
    if (ledgerExists) {
      const ledger = (await pool.query(
        `SELECT COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE hash = $1 AND created_at = $2)::int AS baseline_count,
                MAX(created_at) AS last_applied
           FROM "drizzle"."__drizzle_migrations"`,
        [baselineHash, baseline.when],
      )).rows[0];
      ledgerCount = Number(ledger.count);
      baselineCount = Number(ledger.baseline_count);
      lastApplied = ledger.last_applied === null ? null : Number(ledger.last_applied);
    }
    assertLedgerCompatible({
      ledgerExists,
      publicTableCount: Number(state.public_table_count),
      ledgerCount,
      baselineCount,
    });

    const pending = pendingMigrations(journal.entries, lastApplied);
    log(`Servidor: PostgreSQL ${info.version} · base: ${info.db} · usuario: ${info.usr}`);
    log(`Tablas en public: ${state.public_table_count} · historial: ${ledgerCount} de ${journal.entries.length} migraciones`);
    log(pending.length
      ? `Pendientes (${pending.length}): ${pending.map(entry => entry.tag).join(", ")}`
      : "Pendientes: ninguna");

    if (!args.apply) {
      log("Simulacro: no se escribió nada. Para aplicar agrega --apply --confirm=" + info.db);
      return;
    }
    assertApplyConfirmation(args, info.db);
    if (pending.length === 0) {
      log("Nada que aplicar.");
      return;
    }

    const lockClient = await pool.connect();
    try {
      const lock = await lockClient.query("SELECT pg_try_advisory_lock($1) AS ok", [PROD_MIGRATION_LOCK_KEY]);
      if (lock.rows[0].ok !== true) {
        throw new ProdMigrationError("Hay otra migración de producción en curso. No se ejecutó DDL.");
      }
      try {
        // Drizzle aplica todas las pendientes en una sola transacción: si una falla, no queda nada.
        await migrate(drizzle(pool), { migrationsFolder: migrationFolder });
      } finally {
        await lockClient.query("SELECT pg_advisory_unlock($1)", [PROD_MIGRATION_LOCK_KEY]);
      }
    } finally {
      lockClient.release();
    }

    const after = (await pool.query(`SELECT COUNT(*)::int AS count FROM "drizzle"."__drizzle_migrations"`)).rows[0];
    if (Number(after.count) !== journal.entries.length) {
      throw new ProdMigrationError(
        `El historial quedó con ${after.count} de ${journal.entries.length} migraciones. Revisar antes de continuar.`,
      );
    }
    log(`Migraciones aplicadas correctamente (${after.count} en el historial).`);
  } finally {
    await pool.end();
  }
}

/** Drizzle envuelve el error de PostgreSQL: se muestra la causa, que es la que explica el fallo. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "Error desconocido";
  const cause = error.cause;
  return cause instanceof Error && cause.message ? cause.message : error.message;
}

main().catch(error => {
  // Solo un mensaje: nunca la cadena de conexión ni el objeto de error completo.
  console.error(`[db:migrate:prod] ${describeError(error)}`);
  process.exitCode = 1;
});
