import { pool } from "../server/db";
import { assertTestDatabase } from "../server/lib/database-safety";
import { ADMIN_EMAIL } from "./helpers/auth";

export default async function globalSetup(): Promise<void> {
  try {
    // Debe preceder al UPDATE y a todos los fixtures E2E.
    await assertTestDatabase(pool);
    const updated = await pool.query(
      `UPDATE campuses SET onboarding_completado = true
        WHERE id IN (SELECT campus_id FROM users
                      WHERE email = $1 AND campus_id IS NOT NULL)`,
      [ADMIN_EMAIL],
    );
    if (updated.rowCount !== 1) {
      throw new Error(`No se encontró el campus del administrador E2E (${updated.rowCount} filas)`);
    }
  } finally {
    await pool.end();
  }
}