// NULL significa que la contraseña nunca cambió. No se infiere la versión del iat.
export function passwordVersion(changedAt: Date | string | null | undefined): number {
  if (changedAt == null) return 0;
  const version = new Date(changedAt).getTime();
  if (!Number.isSafeInteger(version)) throw new Error("Versión de contraseña inválida");
  return version;
}

export function isSessionInvalidated(version: unknown, changedAt: Date | string | null): boolean {
  return typeof version !== "number" || !Number.isSafeInteger(version) ||
    version !== passwordVersion(changedAt);
}
