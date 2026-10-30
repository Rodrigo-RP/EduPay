import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { assertNonProductionEnvironment, assertDatabaseMarker } from "../server/lib/database-safety";
import { readSchemaCatalog, compareSchemaCatalog } from "./lib/schema-catalog";

assertNonProductionEnvironment();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await assertDatabaseMarker(client, "tests");
  const actual = await readSchemaCatalog(client);
  const filename = path.resolve("drizzle/schema-catalog.json");
  if (process.argv.includes("--record")) {
    if (process.env.CI) throw new Error("CI nunca puede reemplazar el catálogo esperado");
    await fs.writeFile(filename, JSON.stringify(actual, null, 2) + "\n");
    console.log("[schema:exact] Catálogo de referencia registrado; solo metadatos");
  } else {
    const expected = z.record(z.array(z.unknown())).parse(JSON.parse(await fs.readFile(filename, "utf8")));
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
