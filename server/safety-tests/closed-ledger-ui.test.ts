import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../client/src/lib/queryClient";

afterEach(() => vi.unstubAllGlobals());

describe("Mensaje de corrección del ledger en la interfaz", () => {
  it("convierte el 409 cerrado en una indicación de usar reversa", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "LEDGER_RECORD_CLOSED", message: "Este registro está cerrado; usa una reversa para corregirlo",
    }), { status: 409 })));
    await expect(apiRequest("/api/approvals/decision", { method: "POST" }))
      .rejects.toThrow("Para corregir este cargo o pago usa una reversa");
  });
  it("no cambia otros conflictos 409", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Conflicto de clave", { status: 409 })));
    await expect(apiRequest("/api/payments/manual", { method: "POST" })).rejects.toThrow("409: Conflicto de clave");
  });
});
