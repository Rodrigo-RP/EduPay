import { z } from "zod";
import { assertNonProductionEnvironment, assertDatabaseMarker } from "./database-safety";
import { decryptTotp, encryptTotp, readTotpKey } from "./totp-crypto";

/** Backfill explícito, no DDL ni parte del arranque. Una sola transacción. */
export async function migratePlaintextTotp(client: {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}): Promise<{ encrypted: number; unchanged: number }> {
  assertNonProductionEnvironment(); // Antes incluso del primer SELECT.
  const key = readTotpKey();
  await client.query("BEGIN");
  try {
    await assertDatabaseMarker(client, "tests");
    const identity = await client.query("SELECT current_database() AS name");
    if (identity.rows[0]?.name !== "heliumdb") throw new Error("El cifrado sólo está autorizado en heliumdb.");
    const result = await client.query(
      "SELECT id, twofa_secret FROM users WHERE twofa_secret IS NOT NULL ORDER BY id FOR UPDATE",
    );
    let encrypted = 0, unchanged = 0;
    const rows = z.array(z.object({ id: z.number().int(), twofa_secret: z.string() })).parse(result.rows);
    for (const row of rows) {
      if (row.twofa_secret.startsWith("v1:")) {
        decryptTotp(row.twofa_secret, row.id, key); // Verifica integridad/clave antes de declarar idempotencia.
        unchanged++;
      } else {
        if (!/^[A-Z2-7]+=*$/.test(row.twofa_secret)) throw new Error("Configuración TOTP no reconocida; no se cambió ninguna cuenta.");
        await client.query("UPDATE users SET twofa_secret = $1 WHERE id = $2", [encryptTotp(row.twofa_secret, row.id, key), row.id]);
        encrypted++;
      }
    }
    await client.query("COMMIT");
    return { encrypted, unchanged };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
