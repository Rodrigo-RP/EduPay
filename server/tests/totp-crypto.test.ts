import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptTotp, decryptTotp, readTotpKey, totpEncryptionKeySchema } from "../lib/totp-crypto";
import { migratePlaintextTotp } from "../lib/migrate-totp";

afterEach(() => vi.unstubAllEnvs());
const secret = () => randomBytes(20).toString("hex").toUpperCase().replace(/[0189]/g, "A");

describe("cifrado TOTP AES-256-GCM", () => {
  it("cifra con IV distinto, descifra y no contiene el secreto", () => {
    const key = randomBytes(32), raw = secret();
    const first = encryptTotp(raw, 7, key), second = encryptTotp(raw, 7, key);
    expect(first).toMatch(/^v1:/);
    expect(first).not.toContain(raw);
    expect(first).not.toEqual(second);
    expect(decryptTotp(first, 7, key)).toEqual(raw);
    expect(() => decryptTotp(first, 8, key)).toThrow("No se pudo");
    expect(() => decryptTotp(first, 7, randomBytes(32))).toThrow("No se pudo");
    const parts = first.split(":");
    parts[2] = Buffer.alloc(16).toString("base64");
    expect(() => decryptTotp(parts.join(":"), 7, key)).toThrow("No se pudo");
    expect(() => decryptTotp(raw, 7, key)).toThrow("No se pudo");
  });
  it.each(["", "not-base64", randomBytes(16).toString("base64"), randomBytes(33).toString("base64")])("rechaza clave inválida sin revelar valor", value => {
    expect(totpEncryptionKeySchema.safeParse(value).success).toBe(false);
    expect(() => readTotpKey({ TOTP_ENCRYPTION_KEY: value })).toThrow("Configura TOTP_ENCRYPTION_KEY");
  });
});

describe("backfill explícito de secretos en heliumdb", () => {
  function fixture(marker = "edupay:test", name = "heliumdb") {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("TOTP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    let stored = "JBSWY3DPEHPK3PXP"; // Vector público de prueba, no una cuenta.
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("environment_marker")) return { rows: [{ environment_marker: marker }] };
      if (sql.includes("current_database()")) return { rows: [{ name }] };
      if (sql.startsWith("SELECT id")) return { rows: [{ id: 7, twofa_secret: stored }] };
      if (sql.startsWith("UPDATE")) stored = String(params?.[0]);
      return { rows: [] };
    });
    return { query, stored: () => stored };
  }
  it("cifra texto plano; la segunda corrida no vuelve a escribir", async () => {
    const client = fixture();
    expect(await migratePlaintextTotp(client)).toEqual({ encrypted: 1, unchanged: 0 });
    expect(decryptTotp(client.stored(), 7)).toBe("JBSWY3DPEHPK3PXP");
    expect(await migratePlaintextTotp(client)).toEqual({ encrypted: 0, unchanged: 1 });
    expect(client.query.mock.calls.filter(([sql]) => sql.startsWith("UPDATE"))).toHaveLength(1);
  });
  it("producción aborta antes de cualquier SQL", async () => {
    const client = fixture();
    vi.stubEnv("APP_ENV", "production");
    await expect(migratePlaintextTotp(client)).rejects.toThrow("APP_ENV");
    expect(client.query).not.toHaveBeenCalled();
  });
  it.each([[null, "heliumdb"], ["edupay:test", "otherdb"]])("sin marcador o fuera de heliumdb nunca escribe", async (marker, name) => {
    const client = fixture(marker ?? "", name);
    await expect(migratePlaintextTotp(client)).rejects.toThrow();
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
