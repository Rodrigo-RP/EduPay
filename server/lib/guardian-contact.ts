/** Contacto real: ausente es NULL, nunca una dirección inventada. */
function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

export function normalizeGuardianEmail(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") invalid("El correo del tutor debe ser texto");
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalid("El correo del tutor no es válido");
  }
  return email;
}

export function normalizeGuardianMobile(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") invalid("El celular debe ser texto");
  const phone = value.replace(/[\s().-]/g, "");
  if (!phone) return null;
  const normalized = /^\d{10}$/.test(phone) ? `+52${phone}` : /^52\d{10}$/.test(phone) ? `+${phone}` : phone;
  if (!/^\+52\d{10}$/.test(normalized)) invalid("celular: escribe diez dígitos nacionales, con prefijo +52 opcional");
  return normalized;
}
