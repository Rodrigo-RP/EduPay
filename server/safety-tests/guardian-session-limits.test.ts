import { expect, it } from "vitest";
import {
  GUARDIAN_SESSION_SECONDS, GUARDIAN_TOKEN_SECONDS,
  guardianSessionStart, guardianSessionExpired, guardianTokenSeconds,
} from "../lib/guardian-session-limits";

const now = 2_000_000_000;
it("sesión de ocho días vencida y límite literal de siete días", () => {
  expect(guardianSessionExpired({ session_started_at: now - 8 * 86400 }, now)).toBe(true);
  expect(guardianSessionExpired({ session_started_at: now - GUARDIAN_SESSION_SECONDS }, now)).toBe(false);
  expect(guardianSessionExpired({ session_started_at: now - GUARDIAN_SESSION_SECONDS - 1 }, now)).toBe(true);
});
it("sesión de seis días obtiene cuatro horas y cerca del tope sólo el remanente", () => {
  expect(guardianTokenSeconds({ session_started_at: now - 6 * 86400 }, now)).toBe(GUARDIAN_TOKEN_SECONDS);
  expect(guardianTokenSeconds({ session_started_at: now - GUARDIAN_SESSION_SECONDS + 30 }, now)).toBe(30);
});
it("token anterior usa iat sin reiniciar la sesión y un token sin inicio usa cero", () => {
  expect(guardianSessionStart({ iat: now - 86400 })).toBe(now - 86400);
  expect(guardianSessionStart({ session_started_at: now - 86400, iat: now })).toBe(now - 86400);
  expect(guardianSessionStart({})).toBe(0);
  expect(guardianSessionExpired({ iat: now - 8 * 86400 }, now)).toBe(true);
  expect(guardianTokenSeconds({}, now)).toBe(1);
});
