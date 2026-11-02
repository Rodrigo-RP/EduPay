export const GUARDIAN_SESSION_SECONDS = 7 * 24 * 60 * 60; // tope sin nueva liga mágica
export const GUARDIAN_TOKEN_SECONDS = 4 * 60 * 60;

type GuardianClaims = { session_started_at?: number; iat?: number };

export function guardianSessionStart(decoded: GuardianClaims): number {
  return decoded.session_started_at ?? decoded.iat ?? 0;
}

export function guardianSessionExpired(decoded: GuardianClaims, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return nowSec - guardianSessionStart(decoded) > GUARDIAN_SESSION_SECONDS;
}

export function guardianTokenSeconds(decoded: GuardianClaims, nowSec = Math.floor(Date.now() / 1000)): number {
  return Math.max(1, Math.min(GUARDIAN_TOKEN_SECONDS,
    guardianSessionStart(decoded) + GUARDIAN_SESSION_SECONDS - nowSec));
}
