import { pool } from "../db";
import { assertTestDatabase } from "../lib/database-safety";

export default async function globalSetup(): Promise<void> {
  try {
    await assertTestDatabase(pool);
  } finally {
    await pool.end();
  }
}
