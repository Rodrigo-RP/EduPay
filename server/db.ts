import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Driver estándar de PostgreSQL (TCP o socket Unix). Sirve igual para Neon,
// Cloud SQL (`?host=/cloudsql/PROYECTO:REGION:INSTANCIA`) y el PostgreSQL del CI.
// POOL_MAX limita las conexiones por instancia; Cloud SQL tiene su propio tope.
const poolMax = Number.parseInt(process.env.POOL_MAX ?? "", 10);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...(Number.isInteger(poolMax) && poolMax > 0 ? { max: poolMax } : {}),
});
export const db = drizzle({ client: pool, schema });
