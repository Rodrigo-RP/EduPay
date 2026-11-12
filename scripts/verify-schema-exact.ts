import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod/v4";
import { assertNonProductionEnvironment, assertDatabaseMarker } from "../server/lib/database-safety";
import { readSchemaCatalog, compareSchemaCatalog } from "./lib/schema-catalog";

assertNonProductionEnvironment();
// PostgreSQL 18 guarda cada NOT NULL también como fila de pg_constraint (contype 'n').
// El catálogo de referencia se generó en PG16, donde esas filas no existen. Este modo
// descarta únicamente esas filas; las columnas siguen comparando attnotnull sin cambios.
const ignoreNotNullConstraints = process.argv.includes("--pg18-not-null");
if (ignoreNotNullConstraints && process.argv.includes("--record")) {
  throw new Error("--pg18-not-null no puede usarse para registrar el catálogo de referencia");
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await assertDatabaseMarker(client, "tests");
  let actual = await readSchemaCatalog(client);
  if (ignoreNotNullConstraints) {
    const versionNum = Number((await client.query("SHOW server_version_num")).rows[0].server_version_num);
    if (versionNum < 180000) throw new Error("--pg18-not-null solo aplica a PostgreSQL 18 o superior");
    actual = {
      ...actual,
      constraints: (actual.constraints as Array<{ type: string }>).filter(row => row.type !== "n"),
    };
  }
  const filename = path.resolve("drizzle/schema-catalog.json");
  if (process.argv.includes("--record")) {
    if (process.env.CI) throw new Error("CI nunca puede reemplazar el catálogo esperado");
    await fs.writeFile(filename, JSON.stringify(actual, null, 2) + "\n");
    console.log("[schema:exact] Catálogo de referencia registrado; solo metadatos");
  } else {
    const expected = z.record(z.string(), z.array(z.unknown())).parse(JSON.parse(await fs.readFile(filename, "utf8")));
    const differences = compareSchemaCatalog(expected, actual);
    if (differences.length) {
      throw new Error(`Diferencias exactas de esquema: ${differences.join(", ")}. No se modificó la base ni el catálogo esperado.`);
    }
    console.log("[schema:exact] 12 categorías; cero diferencias (sin normalización)");
  }
  await client.query("COMMIT");
} finally {
  client.release();
  await pool.end();
}
