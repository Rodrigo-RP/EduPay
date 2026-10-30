import { assertNonProductionEnvironment } from "../server/lib/database-safety";
import { migratePlaintextTotp } from "../server/lib/migrate-totp";

assertNonProductionEnvironment();
const { migrationPool } = await import("./migration-db");
const client = await migrationPool.connect();
try {
  const counts = await migratePlaintextTotp(client);
  console.log("[totp:encrypt]", counts); // Sólo conteos, nunca filas ni secretos.
} catch {
  console.error("[totp:encrypt] Operación rechazada o fallida; transacción revertida.");
  process.exitCode = 1;
} finally {
  client.release();
  await migrationPool.end();
}
