import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), update: vi.fn(), insert: vi.fn(), set: vi.fn(), where: vi.fn(), values: vi.fn(),
}));
vi.mock("../db", () => ({
  pool: {},
  db: { transaction: async (run: any) => run(mocks) },
}));
import { storage } from "../storage";
import { assertMutable, ClosedLedgerRecordError } from "../lib/ledger-mutability";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("Guarda común y almacenamiento real con conexión aislada", () => {
  it.each(["pagado", "aplicado", "exitoso", "completado", "cancelado", "reversado", "fallido"])(
    "rechaza %s tanto en estado como en status", state => {
      for (const record of [{ estado: state }, { status: state }]) {
        expect(() => assertMutable(record)).toThrow(ClosedLedgerRecordError);
        try { assertMutable(record); } catch (error: any) {
          expect(error.status).toBe(409);
          expect(error.message).toBe("Este registro está cerrado; usa una reversa para corregirlo");
        }
      }
    },
  );
  it.each(["pendiente", "parcial", "vencido"])("permite %s", estado => {
    expect(() => assertMutable({ estado })).not.toThrow();
  });

  it.each(["pagado", "aplicado"])("cargo %s rechaza cualquier cambio de estado, incluso identidad", async estado => {
    mocks.execute.mockResolvedValue({ rows: [{ id: 11, estado, tenant_id: 8 }] });
    for (const target of ["pendiente", "cancelado", estado]) {
      await expect(storage.updateChargeStatus(11, target, { tenantId: 8 })).rejects.toMatchObject({ status: 409 });
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["exitoso", "completado"])("pago %s rechaza cancelación e identidad, permite reversa auditada", async estado => {
    mocks.execute.mockResolvedValue({ rows: [{ id: 11, estado, tenant_id: 8 }] });
    for (const target of ["pendiente", "fallido", estado]) {
      await expect(storage.updatePaymentStatus(11, target, { tenantId: 8 })).rejects.toMatchObject({ status: 409 });
    }
    expect(mocks.update).not.toHaveBeenCalled();
    await storage.updatePaymentStatus(11, "reversado", { tenantId: 8, userId: 7 });
    expect(mocks.set).toHaveBeenCalledWith({ estado: "reversado" });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      action: "payment.status_changed",
      previous_value: JSON.stringify({ estado }),
      new_value: JSON.stringify({ estado: "reversado" }),
    }));
  });

  it("un pago ya reversado no puede editarse ni reversarse otra vez", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ id: 11, estado: "reversado", tenant_id: 8 }] });
    await expect(storage.updatePaymentStatus(11, "reversado")).rejects.toMatchObject({ status: 409 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
