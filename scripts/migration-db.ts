import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL es obligatoria para ejecutar migraciones");
}

export const migrationPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
export const migrationDb = drizzle(migrationPool);