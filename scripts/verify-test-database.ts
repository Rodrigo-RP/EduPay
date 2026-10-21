import { pool } from "../server/db";
import { assertTestDatabase } from "../server/lib/database-safety";

async function main(): Promise<void> {
  try {
    await assertTestDatabase(pool);
    console.log("Base de pruebas autorizada por marcador explícito.");
  } catch {
    console.error("Arranque de pruebas bloqueado: exige APP_ENV development/test y marcador edupay:test. No se inició el servidor.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
