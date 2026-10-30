import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { PendingTotpEnrollments, pendingTotp, confirmTotp, validTotp, createBackupCodes, consumeBackupCode, backupHash } from "../lib/totp-service";
import { decryptTotp } from "../lib/totp-crypto";

const speakeasy: typeof import("speakeasy") = createRequire(import.meta.url)("speakeasy");
beforeEach(() => vi.stubEnv("TOTP_ENCRYPTION_KEY", randomBytes(32).toString("base64")));
afterEach(() => { vi.unstubAllEnvs(); pendingTotp.clear(7); });

describe("registro pendiente privado y cifrado", () => {
  it("conserva sólo cifrado, genera secreto nuevo y vence exactamente en 10 minutos", () => {
    const pending = new PendingTotpEnrollments();
    const first = pending.begin({ id: 7, email: "account@example.invalid" }, 1000);
    const encrypted = pending.encrypted(7, 1000);
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(first.manual_code);
    expect(decryptTotp(encrypted, 7)).toBe(first.manual_code);
    const second = pending.begin({ id: 7, email: "account@example.invalid" }, 2000);
    expect(second.manual_code).not.toBe(first.manual_code);
    expect(() => pending.encrypted(7, 602000)).toThrow("venció");
  });
  it("un pendiente vencido no llega a consultar la base ni se confirma", async () => {
    pendingTotp.begin({ id: 7, email: "account@example.invalid" }, Date.now() - 600_001);
    const pool = { connect: vi.fn() };
    await expect(confirmTotp(pool, { id: 7, tenantId: 1, campusId: 1 }, "123456")).rejects.toThrow("venció");
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("confirma con código válido, persiste cifrado y hashes; no vuelve a entregar códigos", async () => {
    const enrollment = pendingTotp.begin({ id: 7, email: "account@example.invalid" });
    const code = speakeasy.totp({ secret: enrollment.manual_code, encoding: "base32" });
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith("SELECT") ? [{ twofa_secret: null }] : [],
    }));
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) };
    const codes = await confirmTotp(pool, { id: 7, tenantId: 1, campusId: 1 }, code);
    expect(codes).toHaveLength(10);
    const persisted = JSON.stringify(query.mock.calls);
    expect(persisted).not.toContain(enrollment.manual_code);
    for (const backup of codes) expect(persisted).not.toContain(backup);
    expect(query.mock.calls.some(([sql]) => sql.includes("audit_retry_queue"))).toBe(true);
    expect(query).toHaveBeenLastCalledWith("COMMIT");
    await expect(confirmTotp(pool, { id: 7, tenantId: 1, campusId: 1 }, code)).rejects.toThrow("Inicia");
  });
  it("verifica sólo códigos TOTP de seis dígitos", () => {
    const enrollment = pendingTotp.begin({ id: 7, email: "account@example.invalid" });
    expect(validTotp(pendingTotp.encrypted(7), 7, speakeasy.totp({ secret: enrollment.manual_code, encoding: "base32" }))).toBe(true);
    expect(validTotp(pendingTotp.encrypted(7), 7, "not-a-code")).toBe(false);
  });
  it("una contraseña cambiada durante la confirmación impide escribir con la sesión anterior", async () => {
    const enrollment = pendingTotp.begin({ id: 7, email: "account@example.invalid" });
    const code = speakeasy.totp({ secret: enrollment.manual_code, encoding: "base32" });
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT")
      ? [{ twofa_secret: null, password_changed_at: new Date() }] : [] }));
    const pool = { connect: async () => ({ query, release() {} }) };
    await expect(confirmTotp(pool, { id: 7, tenantId: 1, campusId: 1, passwordVersion: 0 }, code)).rejects.toThrow("La sesión cambió");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
describe("10 códigos de respaldo de un solo uso", () => {
  it("sólo almacena hashes y dos consumos simultáneos no repiten el código", async () => {
    const backup = createBackupCodes(7);
    expect(new Set(backup.codes).size).toBe(10);
    expect(backup.hashes).toEqual(backup.codes.map(code => backupHash(code, 7)));
    let available = true;
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] !== backup.hashes[0] || !available) return { rows: [] };
      available = false; return { rows: [{ id: 7 }] };
    });
    const results = await Promise.all([
      consumeBackupCode({ query }, { id: 7, twofa_secret: "ciphertext" }, backup.codes[0]),
      consumeBackupCode({ query }, { id: 7, twofa_secret: "ciphertext" }, backup.codes[0]),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(query.mock.calls[0][0]).toContain("AND $1=ANY(twofa_backup_hashes)");
  });
});
