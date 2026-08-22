import { describe, expect, it } from "vitest";
import { getApiAuthRateLimitKey } from "../security-middleware";

function requestWithAuthorization(authorization?: string) {
  return {
    ip: "203.0.113.10",
    get: (name: string) => name.toLowerCase() === "authorization" ? authorization : undefined,
  } as any;
}

describe("apiAuth rate-limit bucket", () => {
  it("mantiene un bucket estable para el mismo token", () => {
    const first = getApiAuthRateLimitKey(requestWithAuthorization("Bearer token-sesion-a"));
    const second = getApiAuthRateLimitKey(requestWithAuthorization("Bearer token-sesion-a"));

    expect(first).toBe(second);
    expect(first).not.toContain("token-sesion-a");
  });

  it("no mezcla sesiones distintas que comparten la misma IP de proxy", () => {
    const sessionA = getApiAuthRateLimitKey(requestWithAuthorization("Bearer token-sesion-a"));
    const sessionB = getApiAuthRateLimitKey(requestWithAuthorization("Bearer token-sesion-b"));

    expect(sessionA).not.toBe(sessionB);
  });

  it("mantiene el bucket del mismo usuario aunque renueve su token", () => {
    const first = {
      ...requestWithAuthorization("Bearer token-anterior"),
      user: { id: 81, tenant_id: 29 },
    };
    const renewed = {
      ...requestWithAuthorization("Bearer token-renovado"),
      user: { id: 81, tenant_id: 29 },
    };

    expect(getApiAuthRateLimitKey(first)).toBe(getApiAuthRateLimitKey(renewed));
  });
});