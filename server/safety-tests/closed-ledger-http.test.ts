import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), release: vi.fn(),
  approval: vi.fn(), canApprove: vi.fn(), updateApproval: vi.fn(),
  log: vi.fn(), notify: vi.fn(), updatePayment: vi.fn(),
  dbUpdate: vi.fn(), dbDelete: vi.fn(), permission: vi.fn(),
  role: "administrador_campus",
}));
vi.mock("../db", () => ({
  pool: { query: mocks.query, connect: mocks.connect },
  db: {
    update: mocks.dbUpdate,
    delete: mocks.dbDelete,
  },
}));
vi.mock("../storage", () => ({ storage: {
  getPendingApprovalById: mocks.approval, checkUserCanApprove: mocks.canApprove,
  updateApprovalStatus: mocks.updateApproval, createApprovalWorkflowLog: mocks.log,
  createApprovalNotification: mocks.notify, updatePaymentStatus: mocks.updatePayment,
} }));
vi.mock("../routes/shared", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 7, tenant_id: 8, campus_id: 9, role: mocks.role };
    next();
  },
  hasPermissionForUser: mocks.permission,
}));
vi.mock("../lib/email/runtime", () => ({ registerEmailRuntime: vi.fn() }));
vi.mock("../notification-system", () => ({ NotificationSystem: {} }));
vi.mock("../websocket-manager", () => ({ wsManager: {} }));

import { registerNotificationRoutes } from "../routes/notifications";
import { ClosedLedgerRecordError } from "../lib/ledger-mutability";

afterEach(() => vi.resetAllMocks());

async function decide(action: string, estado: string, options: {
  missing?: boolean; permitted?: boolean; financialPermission?: boolean; campusId?: number; tenantId?: number;
  role?: string;
} = {}) {
  mocks.role = options.role ?? "administrador_campus";
  const record = { id: 11, estado, tenant_id: 8 };
  mocks.approval.mockResolvedValue({
    id: 1, tenant_id: options.tenantId ?? 8, campus_id: options.campusId ?? 9, requested_by: 3,
    action_type: action, entity_type: action.includes("payment") && !action.includes("due_date") ? "payment" : "charge",
    entity_id: 11, requested_data: JSON.stringify({ amount: 1200, due_date: "2026-11-01" }),
  });
  mocks.canApprove.mockResolvedValue(options.permitted ?? true);
  mocks.permission.mockReturnValue(options.financialPermission ?? true);
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("SELECT") ? (options.missing ? [] : [record]) : [],
    rowCount: 1,
  }));
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.dbUpdate.mockReturnValue({ set: () => ({ where: async () => {} }) });
  mocks.dbDelete.mockReturnValue({ where: async () => {} });
  const app = express();
  app.use(express.json());
  registerNotificationRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/api/approvals/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_id: 1, decision: "approved" }),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe("Integración HTTP del ledger cerrado (DB aislada, sin datos reales)", () => {
  it.each(["modify_charge_amount", "modify_payment_due_date", "delete_charge"])(
    "%s rechaza un cargo pagado sin escribir ni anunciar éxito", async action => {
      const response = await decide(action, "pagado");
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "LEDGER_RECORD_CLOSED" });
      expect(response.body.message).toContain("usa una reversa");
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
      expect(mocks.dbDelete).not.toHaveBeenCalled();
      expect(mocks.query.mock.calls.some(([sql]) => /^(UPDATE|DELETE)/.test(sql))).toBe(false);
      expect(mocks.updateApproval).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    },
  );

  it.each(["modify_charge_amount", "modify_payment_due_date", "delete_charge"])(
    "permite %s en cargos abiertos bajo lock", async action => {
      expect((await decide(action, "pendiente")).status).toBe(200);
      const lock = mocks.query.mock.calls.find(([sql]) => sql.includes("FOR UPDATE"));
      expect(lock?.[1]).toEqual([11, 8, 9]);
      expect(lock?.[0]).toContain("c.tenant_id = $2 AND s.campus_id = $3");
      expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith(action === "delete_charge" ? "DELETE FROM charges" : "UPDATE charges"))).toBe(true);
      expect(mocks.query).toHaveBeenCalledWith("COMMIT");
    },
  );

  it("no aplica cambios si la entidad salió del tenant/campus", async () => {
    expect((await decide("modify_charge_amount", "pendiente", { missing: true })).status).toBe(404);
    expect(mocks.updateApproval).not.toHaveBeenCalled();
  });

  it("no aplica cambios sin permiso de aprobación", async () => {
    expect((await decide("modify_charge_amount", "pagado", { permitted: false })).status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("también exige el permiso financiero específico", async () => {
    expect((await decide("modify_charge_amount", "pendiente", { financialPermission: false })).status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each([{ campusId: 10 }, { tenantId: 10 }])("rechaza solicitudes de otro contexto %j", async options => {
    expect((await decide("modify_charge_amount", "pendiente", options)).status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.updateApproval).not.toHaveBeenCalled();
  });

  it("conserva la aprobación global del superadmin con el contexto de la solicitud", async () => {
    expect((await decide("refund_payment", "exitoso", {
      campusId: 10, tenantId: 12, role: "super_admin",
    })).status).toBe(200);
    expect(mocks.updatePayment).toHaveBeenCalledWith(11, "reversado",
      expect.objectContaining({ tenantId: 12, campusId: 10 }));
  });

  it("el reembolso conserva el flujo explícito de reversa", async () => {
    expect((await decide("refund_payment", "exitoso")).status).toBe(200);
    expect(mocks.updatePayment).toHaveBeenCalledWith(11, "reversado", expect.objectContaining({ tenantId: 8 }));
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("una cancelación de pago cerrado devuelve 409, no una aprobación exitosa", async () => {
    mocks.updatePayment.mockRejectedValue(new ClosedLedgerRecordError());
    const response = await decide("cancel_payment", "exitoso");
    expect(response.status).toBe(409);
    expect(mocks.updateApproval).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it.each(["aplicado", "cancelado"])("también bloquea cargos %s", async estado => {
    expect((await decide("delete_charge", estado)).status).toBe(409);
    expect(mocks.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
