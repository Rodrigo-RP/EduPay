import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: mocks }));
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn() }));
import { familyCreditExceptions } from "../lib/family-credit-service";

afterEach(() => vi.useRealTimers());

it("el mismo crédito sigue activo y propuesto diez ciclos después, sin filtros de vencimiento", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const snapshot = async (instant: string) => {
    vi.setSystemTime(new Date(instant));
    mocks.query.mockReset().mockResolvedValueOnce({ rows: [{
      id: 1, family_id: 3, familia: "Familia", amount_centavos: "100000",
      status: "activo", origen: "stripe_no_aplicado", created_at: "2000-01-01",
    }] }).mockResolvedValueOnce({ rows: [{
      id: 5, concepto: "Cargo siguiente ciclo", monto_base_centavos: "100000",
      beca_aplicada: "50.00", estado: "pendiente", ciclo_escolar: "2036-2037",
    }] });
    const proposals = await familyCreditExceptions({ tenant_id: 1, campus_id: 2 });
    expect(mocks.query.mock.calls.map(c => c[0]).join("\n")).not.toMatch(
      /\b(?:ciclo_escolar\s*[=<>]|created_at\s*[<>]|expires_at|expired)/i);
    return proposals.map(({ fecha, ...proposal }) => proposal);
  };
  expect(await snapshot("2036-11-01T12:00:00Z")).toEqual(await snapshot("2026-11-01T12:00:00Z"));
});
