import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

// Base64 canónico: exactamente 32 bytes, nunca una contraseña ni un valor por defecto.
export const totpEncryptionKeySchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/).refine(
  value => Buffer.from(value, "base64").length === 32 &&
    Buffer.from(value, "base64").toString("base64") === value,
  "TOTP_ENCRYPTION_KEY debe contener 32 bytes en base64",
);

export function readTotpKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const result = totpEncryptionKeySchema.safeParse(env.TOTP_ENCRYPTION_KEY);
  if (!result.success) throw new Error("Configura TOTP_ENCRYPTION_KEY con 32 bytes en base64.");
  return Buffer.from(result.data, "base64");
}

export function encryptTotp(secret: string, userId: number, key = readTotpKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  // Impide intercambiar secretos cifrados entre cuentas.
  cipher.setAAD(Buffer.from(`edupay:totp:v1:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptTotp(value: string, userId: number, key = readTotpKey()): string {
  try {
    const parts = value.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error();
    const [, iv64, tag64, data64] = parts;
    const iv = Buffer.from(iv64, "base64"), tag = Buffer.from(tag64, "base64");
    if (iv.length !== 12 || tag.length !== 16 || !data64) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(`edupay:totp:v1:${userId}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(data64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // Nunca propagar errores de crypto ni el material recibido.
    throw new Error("No se pudo descifrar la configuración de dos factores.");
  }
}
