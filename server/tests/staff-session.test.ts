import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { signStaffSession, staffSessionExpired, staffAccessDenial, STAFF_SESSION_SECONDS } from "../lib/staff-session";

describe("sesiones del personal: máximo absoluto de ocho horas", () => {
  const user = { id: 1, email: "staff@example.invalid", role: "asistente", campus_id: 1, tenant_id: 1 };
  it("el JWT vence a las 8h y a las 8h 1min es rechazado", () => {
    const key = randomBytes(32).toString("base64");
    const token = signStaffSession(user, key, true);
    const decoded = jwt.verify(token, key);
    if (typeof decoded === "string") throw new Error("JWT sin objeto");
    expect(decoded.exp! - decoded.iat!).toBe(28800);
    expect(STAFF_SESSION_SECONDS).toBe(28800);
    expect(() => jwt.verify(token, key, { clockTimestamp: decoded.iat! + 8 * 3600 + 60 })).toThrow("expired");
    expect(staffSessionExpired(decoded, decoded.iat! + 8 * 3600 + 60)).toBe(true);
  });
  it("un refresh no reinicia las ocho horas; una sesión parcial sigue parcial", () => {
    const key = randomBytes(32).toString("base64"), start = Math.floor(Date.now() / 1000) - 3600;
    const decoded = jwt.verify(signStaffSession(user, key, false, start), key);
    if (typeof decoded === "string") throw new Error("JWT sin objeto");
    expect(decoded.session_started_at).toBe(start);
    expect(decoded.exp).toBe(start + 28800);
    expect(staffAccessDenial(decoded, "GET", "/api/students")?.code).toBe("TWOFA_SETUP_REQUIRED");
    expect(staffAccessDenial(decoded, "POST", "/api/auth/2fa/setup")).toBeNull();
  });
});
