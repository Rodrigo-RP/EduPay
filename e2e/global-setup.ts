import { pool } from "../server/db";
import { assertTestDatabase } from "../server/lib/database-safety";

export default async function globalSetup(): Promise<void> {
  try {
    // Debe preceder tanto al POST como al UPDATE y a todos los fixtures E2E.
    await assertTestDatabase(pool);
    const response = await fetch("http://127.0.0.1:5000/api/test/reset-auth-rate-limit", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`No se pudo reiniciar el rate limiter de autenticación: HTTP ${response.status}`);
    }
    await pool.query(
      "UPDATE campuses SET onboarding_completado = true WHERE id IN (1, 48)",
    );
  } finally {
    await pool.end();
  }
}