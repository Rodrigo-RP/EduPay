/**
 * Marca física fuera de las tablas truncables. Nunca se crea automáticamente.
 * Sólo el dueño de una base DESECHABLE debe marcar su comentario como
 * "edupay:test" o "edupay:demo". Un nombre de tenant no autoriza escrituras.
 */
export const DATABASE_MARKER_SQL =
  "SELECT shobj_description(oid, 'pg_database') AS environment_marker FROM pg_database WHERE datname = current_database()";

type Reader = { query: (sql: string) => Promise<{ rows: any[] }> };

export function assertNonProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.APP_ENV !== "development" && env.APP_ENV !== "test") {
    throw new Error("Operación bloqueada: APP_ENV debe ser development o test; no se ejecutó SQL.");
  }
}

export async function assertDatabaseMarker(
  reader: Reader,
  purpose: "seed" | "tests",
): Promise<void> {
  const result = await reader.query(DATABASE_MARKER_SQL);
  const marker = result.rows[0]?.environment_marker;
  const allowed = purpose === "tests"
    ? marker === "edupay:test"
    : marker === "edupay:test" || marker === "edupay:demo";
  if (!allowed) {
    throw new Error(
      `Operación bloqueada: la base no tiene el marcador explícito ${
        purpose === "tests" ? "edupay:test" : "edupay:demo o edupay:test"
      }. No se autoriza ninguna escritura.`,
    );
  }
}

export async function assertTestDatabase(reader: Reader): Promise<void> {
  assertNonProductionEnvironment();
  await assertDatabaseMarker(reader, "tests");
}
