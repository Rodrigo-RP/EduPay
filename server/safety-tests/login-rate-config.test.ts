import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loginRateConfig, STRICT_LOGIN_RATE } from "../lib/login-rate-config";

describe("Límites de login sin bypass HTTP", () => {
  it.each(["production", undefined, "staging"])("%s ignora overrides", APP_ENV => {
    expect(loginRateConfig({ APP_ENV, AUTH_RATE_LIMIT_MAX: "10000", AUTH_RATE_LIMIT_WINDOW_MS: "incorrecto" })).toEqual(STRICT_LOGIN_RATE);
  });
  it.each(["development", "test"])("%s permite overrides validados", APP_ENV => {
    expect(loginRateConfig({ APP_ENV, AUTH_RATE_LIMIT_MAX: "10000", AUTH_RATE_LIMIT_WINDOW_MS: "60000" })).toEqual({ max: 10000, windowMs: 60000 });
    expect(() => loginRateConfig({ APP_ENV, AUTH_RATE_LIMIT_MAX: "NaN" })).toThrow();
  });
  it("NODE_ENV production no permite configuración amplia", () => {
    expect(loginRateConfig({ APP_ENV: "development", NODE_ENV: "production", AUTH_RATE_LIMIT_MAX: "10000" })).toEqual(STRICT_LOGIN_RATE);
  });
  it("los defaults siguen siendo estrictos y no se registra la ruta retirada", () => {
    expect(loginRateConfig({ APP_ENV: "development" })).toEqual(STRICT_LOGIN_RATE);
    expect(readFileSync("routes/auth.ts", "utf8")).not.toContain('app.post("/api/test/reset-auth-rate-limit"');
  });
});
