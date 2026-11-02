import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "../../client/src/lib/queryClient";
const assign = vi.fn();
const dispatchEvent = vi.fn();
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("window", { location: { assign, href: "/" }, dispatchEvent });
  assign.mockClear(); dispatchEvent.mockClear();
  localStorage.setItem("auth_type", "guardian");
  localStorage.setItem("auth_token", crypto.randomUUID());
  localStorage.setItem("auth_user", "{}");
});
afterEach(() => vi.unstubAllGlobals());
for (const status of [401, 403]) {
  it.each(["mutation", "query", "returnNull"])(`tutor: ${status} vía %s va al acceso de padres con mensaje`, async mode => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "No disponible" }), { status })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await expect(mode === "mutation" ? apiRequest("/api/guardian/pagar", { method: "POST" }) :
        client.fetchQuery({ queryKey: ["/api/guardian/dashboard"],
          queryFn: getQueryFn({ on401: mode === "returnNull" ? "returnNull" : "throw" }) })).rejects.toThrow();
      expect(assign).toHaveBeenCalledWith("/acceso-padres");
      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(sessionStorage.getItem("guardian-session-message")).toContain("Ingresa de nuevo al portal de padres");
      expect(window.location.href).not.toBe("/login");
    } finally { client.clear(); }
  });
}
it("una respuesta tardía de otra sesión no cierra la del nuevo tutor", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    localStorage.setItem("auth_token", crypto.randomUUID());
    return new Response("{}", { status: 401 });
  }));
  await expect(apiRequest("/api/guardian/dashboard")).rejects.toThrow();
  expect(assign).not.toHaveBeenCalled();
  expect(localStorage.getItem("auth_type")).toBe("guardian");
});
