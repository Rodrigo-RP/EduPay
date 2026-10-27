import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { registerUnavailablePaymentRoutes } from "../routes/unavailable-payments";
import { isConfirmedCardPaymentResponse } from "../../shared/payment-confirmation";

const { query, connect } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("../db", () => ({ pool: { query, connect }, db: {} }));

describe("Rutas retiradas: autenticación conservada, 501 y cero SQL", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    registerUnavailablePaymentRoutes(app, (req, res, next) => {
      if (!req.headers["x-fixture-role"]) return void res.sendStatus(401);
      if (req.headers["x-fixture-role"] !== "guardian") return void res.sendStatus(403);
      next();
    });
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  for (const path of ["/api/payments/process", "/api/payments/create-intent"]) {
    for (const [role, status] of [["", 401], ["staff", 403], ["guardian", 501]] as const) {
      it(`${path}, ${role || "sin sesión"} → ${status}, sin consultar ni escribir DB`, async () => {
        const result = await fetch(base + path, { method: "POST", headers: role ? { "x-fixture-role": role } : {} });
        expect(result.status).toBe(status);
        if (status === 501) expect((await result.json()).code).toBe("NO_DISPONIBLE");
        expect(query).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
      });
    }
  }
});

describe("La pantalla sólo acepta confirmación financiera completa", () => {
  it("succeeded con pago real registrado permite la pantalla de éxito", () => {
    expect(isConfirmedCardPaymentResponse({ success: true, payments: [{ status: "succeeded", payment_id: 123 }] })).toBe(true);
  });
  for (const status of ["requires_action", "processing", "requires_payment_method", "canceled", undefined]) {
    it(`${status}: ni siquiera success:true permite mostrar éxito`, () => {
      expect(isConfirmedCardPaymentResponse({ success: true, payments: [{ status, payment_id: null }] })).toBe(false);
    });
  }
  it("sin pagos, con identificador ficticio o lote mixto no hay éxito", () => {
    for (const result of [
      { success: true, payments: [] },
      { success: true, payments: [{ status: "succeeded", payment_id: null }] },
      { success: true, payments: [{ status: "succeeded", payment_id: 1 }, { status: "processing", payment_id: null }] },
      null,
    ]) expect(isConfirmedCardPaymentResponse(result)).toBe(false);
  });
});
