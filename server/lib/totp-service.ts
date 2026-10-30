import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { BootstrapClient, BootstrapPool } from "./bootstrap";
import { encryptTotp, decryptTotp } from "./totp-crypto";

const require = createRequire(import.meta.url);
const speakeasy: typeof import("speakeasy") = require("speakeasy");
export class TotpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface StaffScope { id: number; tenantId: number | null; campusId: number | null; passwordVersion?: number }
type QueryPool = BootstrapPool;
const TTL = 10 * 60 * 1000;
const enrollmentLocks = new Map<number, Promise<void>>();
/** Serializa también la entrega del QR: un setup concurrente no responde después de confirmar. */
export async function withTotpEnrollmentLock<T>(userId: number, operation: () => Promise<T>): Promise<T> {
  const previous = enrollmentLocks.get(userId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>(resolve => { release = resolve; });
  enrollmentLocks.set(userId, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (enrollmentLocks.get(userId) === current) enrollmentLocks.delete(userId); }
}

/** Sólo ciphertext en memoria, incluso antes de confirmar; no sobrevive reinicios. */
export class PendingTotpEnrollments {
  private entries = new Map<number, { encrypted: string; expires: number }>();
  begin(user: { id: number; email: string }, now = Date.now()) {
    this.entries.forEach((pending, id) => { if (pending.expires <= now) this.entries.delete(id); });
    const generated = speakeasy.generateSecret({ length: 20, name: `EduPay (${user.email})`, issuer: "EduPay" });
    this.entries.set(user.id, { encrypted: encryptTotp(generated.base32, user.id), expires: now + TTL });
    // Excepción explícita: sólo respuesta privada de enrolamiento pendiente, no-store.
    return { manual_code: generated.base32, otpauth_url: generated.otpauth_url!, expires_in: TTL / 1000 };
  }
  encrypted(userId: number, now = Date.now()): string {
    const pending = this.entries.get(userId);
    if (!pending) throw new TotpError(400, "Inicia un registro de dos factores.");
    if (pending.expires <= now) {
      this.entries.delete(userId);
      throw new TotpError(410, "El registro venció. Genera un QR nuevo.");
    }
    return pending.encrypted;
  }
  clear(userId: number) { this.entries.delete(userId); }
}
export const pendingTotp = new PendingTotpEnrollments();

export function validTotp(encrypted: string, userId: number, code: unknown): boolean {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  return speakeasy.totp.verify({ secret: decryptTotp(encrypted, userId), encoding: "base32", token: code, window: 1 });
}
export function backupHash(code: string, userId: number): string {
  return createHash("sha256").update(`edupay:backup:${userId}:${code.replace(/-/g, "").toLowerCase()}`).digest("hex");
}
export function createBackupCodes(userId: number) {
  const codes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex").match(/.{1,8}/g)!.join("-"));
  return { codes, hashes: codes.map(code => backupHash(code, userId)) };
}
export async function consumeBackupCode(pool: Pick<BootstrapClient, "query">, user: { id: number; twofa_secret: string }, code: unknown): Promise<boolean> {
  if (typeof code !== "string" || !/^[a-fA-F0-9-]{32,35}$/.test(code)) return false;
  const hash = backupHash(code, user.id);
  // La condición y el consumo se ejecutan juntos: dos peticiones no consumen el mismo código.
  const result = await pool.query(
    `UPDATE users SET twofa_backup_hashes=array_remove(twofa_backup_hashes,$1)
      WHERE id=$2 AND twofa_secret=$3 AND $1=ANY(twofa_backup_hashes) RETURNING id`,
    [hash, user.id, user.twofa_secret],
  );
  return result.rows.length === 1;
}
async function outbox(client: BootstrapClient, scope: StaffScope, action: string, metadata: Record<string, unknown>) {
  if (!scope.tenantId) throw new TotpError(403, "No se pudo verificar la institución de la cuenta.");
  await client.query("INSERT INTO audit_retry_queue (payload) VALUES ($1::jsonb)", [
    JSON.stringify({ tenant_id: scope.tenantId, user_id: scope.id, action, entity_type: "user",
      entity_id: scope.id, metadata: { campus_id: scope.campusId, ...metadata } }),
  ]);
}
export async function confirmTotp(pool: QueryPool, scope: StaffScope, code: unknown): Promise<string[]> {
  const encrypted = pendingTotp.encrypted(scope.id);
  if (!validTotp(encrypted, scope.id, code)) throw new TotpError(401, "Código incorrecto. Revisa tu aplicación autenticadora.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query(
      `SELECT twofa_secret, password_changed_at FROM users WHERE id=$1 AND tenant_id IS NOT DISTINCT FROM $2
       AND campus_id IS NOT DISTINCT FROM $3 AND is_active=true FOR UPDATE`,
      [scope.id, scope.tenantId, scope.campusId],
    );
    if (!row.rows.length) throw new TotpError(404, "Usuario no encontrado.");
    const changed = row.rows[0].password_changed_at;
    const version = changed instanceof Date ? changed.getTime() : changed ? new Date(String(changed)).getTime() : 0;
    if (version !== (scope.passwordVersion ?? 0)) throw new TotpError(401, "La sesión cambió. Inicia sesión de nuevo.");
    if (row.rows[0].twofa_secret) throw new TotpError(409, "La cuenta ya tiene dos factores configurados.");
    if (pendingTotp.encrypted(scope.id) !== encrypted) throw new TotpError(409, "El QR fue reemplazado. Usa el más reciente.");
    const backups = createBackupCodes(scope.id);
    await client.query("UPDATE users SET twofa_secret=$1, twofa_backup_hashes=$2, updated_at=NOW() WHERE id=$3",
      [encrypted, backups.hashes, scope.id]);
    await outbox(client, scope, "twofa_enrolled", {});
    await client.query("COMMIT");
    pendingTotp.clear(scope.id);
    return backups.codes; // Única entrega. Nunca se guardan ni se vuelven a consultar.
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
