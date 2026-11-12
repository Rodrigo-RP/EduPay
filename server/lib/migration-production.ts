/**
 * Guardas de `npm run db:migrate:prod`: el único camino autorizado para aplicar
 * la estructura en una base de producción (Cloud SQL). Son funciones puras:
 * no abren conexiones y ninguna imprime ni conserva la cadena de conexión.
 *
 * `db:migrate` y `db:baseline:mark` siguen rechazando producción sin cambios.
 */

export class ProdMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProdMigrationError";
  }
}

/** Candado de sesión de PostgreSQL: impide dos migraciones de producción a la vez. */
export const PROD_MIGRATION_LOCK_KEY = 7348220117;

export type ProdMigrationArgs = { apply: boolean; confirm: string | null };

export function parseProdMigrationArgs(argv: readonly string[]): ProdMigrationArgs {
  let apply = false;
  let confirm: string | null = null;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--confirm=")) confirm = arg.slice("--confirm=".length);
    else throw new ProdMigrationError(`Argumento no reconocido: ${arg.split("=")[0]}. Se admiten --apply y --confirm=<base>.`);
  }
  return { apply, confirm };
}

export function assertProdMigrationEnvironment(env: NodeJS.ProcessEnv): void {
  if (env.APP_ENV !== "production") {
    throw new ProdMigrationError(
      "db:migrate:prod exige APP_ENV=production de forma explícita. No se ejecutó SQL.",
    );
  }
  if (env.ALLOW_DEMO_SEED?.trim().toLowerCase() === "true") {
    throw new ProdMigrationError("ALLOW_DEMO_SEED=true es incompatible con una migración de producción. No se ejecutó SQL.");
  }
  if (!env.DATABASE_URL) {
    throw new ProdMigrationError("DATABASE_URL es obligatoria. No se ejecutó SQL.");
  }
}

export type DatabaseTarget = { host: string; port: string; database: string; user: string };

/** Lee el destino sin guardar ni devolver la contraseña. */
export function parseDatabaseTarget(connectionString: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // No se repite el valor: puede contener la contraseña.
    throw new ProdMigrationError("DATABASE_URL no es una URL válida. No se ejecutó SQL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new ProdMigrationError("DATABASE_URL debe empezar con postgresql://. No se ejecutó SQL.");
  }
  // Igual que pg: el parámetro host= (socket Unix) tiene prioridad sobre el host de la URL.
  const host = (url.searchParams.get("host") ?? decodeURIComponent(url.hostname)).trim();
  if (!host) {
    // Sin host, pg tomaría PGHOST del entorno y se saltaría la guarda de destino.
    throw new ProdMigrationError("DATABASE_URL debe indicar el servidor de forma explícita. No se ejecutó SQL.");
  }
  return {
    host,
    port: url.port,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    user: decodeURIComponent(url.username),
  };
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Solo se acepta el proxy de Cloud SQL en la máquina local o un socket Unix.
 * Una DATABASE_URL que apunte a cualquier servidor remoto se rechaza antes de conectar.
 */
export function assertLocalTarget(target: DatabaseTarget): void {
  if (target.host.startsWith("/") || LOOPBACK_HOSTS.has(target.host.toLowerCase())) return;
  throw new ProdMigrationError(
    "El servidor debe ser el proxy local (127.0.0.1 o localhost) o un socket Unix. No se ejecutó SQL.",
  );
}

export function assertTargetDatabaseMatches(target: DatabaseTarget, currentDatabase: string): void {
  if (target.database !== currentDatabase) {
    throw new ProdMigrationError("La base conectada no coincide con la indicada en DATABASE_URL. No se ejecutó DDL.");
  }
}

/** Aplicar exige escribir el nombre exacto de la base; el simulacro no. */
export function assertApplyConfirmation(args: ProdMigrationArgs, currentDatabase: string): void {
  if (!args.apply) return;
  if (args.confirm !== currentDatabase) {
    throw new ProdMigrationError(
      "Para aplicar pasa --confirm=<nombre exacto de la base que muestra el simulacro>. No se ejecutó DDL.",
    );
  }
}

/** Igual que la guarda de arranque: una base marcada de pruebas o demo no es producción. */
export function assertNoTestMarker(marker: unknown): void {
  if (marker === "edupay:test" || marker === "edupay:demo") {
    throw new ProdMigrationError(
      "La base está marcada como pruebas o demo (edupay:test / edupay:demo). No se ejecutó DDL.",
    );
  }
}

export type LedgerState = {
  ledgerExists: boolean;
  publicTableCount: number;
  ledgerCount: number;
  baselineCount: number;
};

/** Las mismas tres comprobaciones de scripts/migrate.ts, sin el marcador de pruebas. */
export function assertLedgerCompatible(state: LedgerState): void {
  if (!state.ledgerExists && state.publicTableCount > 0) {
    throw new ProdMigrationError(
      "Baseline adoption required: la base ya contiene tablas y no tiene ledger verificado. No se ejecutó DDL.",
    );
  }
  if (!state.ledgerExists) return;
  if (state.ledgerCount > 0 && state.baselineCount !== 1) {
    throw new ProdMigrationError(
      "Ledger incompatible: no contiene exactamente el baseline esperado. No se ejecutó DDL.",
    );
  }
  if (state.ledgerCount === 0 && state.publicTableCount > 0) {
    throw new ProdMigrationError(
      "Baseline adoption required: el ledger está vacío para una base poblada. No se ejecutó DDL.",
    );
  }
}

export type JournalEntry = { tag: string; when: number };

/** Drizzle aplica las entradas cuya fecha es posterior a la última registrada. */
export function pendingMigrations(
  entries: readonly JournalEntry[],
  lastAppliedWhen: number | null,
): JournalEntry[] {
  return entries.filter(entry => lastAppliedWhen === null || entry.when > lastAppliedWhen);
}
