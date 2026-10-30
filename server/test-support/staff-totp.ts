import { createRequire } from "node:module";
import { pool } from "../db";
import { assertTestDatabase } from "../lib/database-safety";
import { decryptTotp } from "../lib/totp-crypto";

const speakeasy: typeof import("speakeasy") = createRequire(import.meta.url)("speakeasy");
/** Sólo pruebas importan este lector. Nunca se expone por HTTP ni se importa desde la app. */
export async function staffTotpCodeForTest(email: string): Promise<string | undefined> {
  await assertTestDatabase(pool);
  const rows = await pool.query("SELECT id, twofa_secret FROM users WHERE email=$1", [email]);
  const user = rows.rows[0];
  if (!user?.twofa_secret) return undefined;
  return speakeasy.totp({ secret: decryptTotp(user.twofa_secret, user.id), encoding: "base32" });
}
export function enrollmentCodeForTest(manualCode: string): string {
  return speakeasy.totp({ secret: manualCode, encoding: "base32" });
}
