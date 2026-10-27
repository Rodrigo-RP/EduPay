import express from "express";
import jwt from "jsonwebtoken";
import { once } from "node:events";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(),
  values: vi.fn(), set: vi.fn(), returning: vi.fn(), where: vi.fn(),
  getConceptsByCampus: vi.fn(), getStudentsByCampus: vi.fn(), createCharge: vi.fn(),
  getChargeByGuardian: vi.fn(), stripeCreate: vi.fn(), stripeCancel: vi.fn(),
  connectAccount: vi.fn(), settle: vi.fn(), audit: vi.fn(),
}));
vi.mock("../db", () => ({
  pool: { query: mocks.query, connect: mocks.connect },
  db: { select: mocks.select, insert: mocks.insert, update: mocks.update },
}));
vi.mock("../storage", () => ({ storage: mocks }));
vi.mock("../audit-retry", () => ({ enqueueAuditLog: mocks.audit }));
vi.mock("../seed-admissions-data", () => ({ seedAdmissionsData: vi.fn() }));
vi.mock("../notification-system", () => ({ NotificationSystem: {} }));
vi.mock("../websocket-manager", () => ({ wsManager: { notifyPaymentUpdate: vi.fn() } }));
vi.mock("../routes/campus-payment", () => ({ getActiveStripeAccountForCampus: mocks.connectAccount }));
vi.mock("../lib/stripe-spei-settlement", () => ({ settleConfirmedStripePaymentIntent: mocks.settle }));
vi.mock("stripe", () => ({ default: class Stripe {} }));
import { registerGuardianRoutes } from "../routes/guardian";
import { JWT_SECRET } from "../routes/shared";

let server: Server;
let base: string;
const staff = (role = "super_admin", scope = { tenant_id: 8, campus_id: 9 }) =>
  jwt.sign({ role, ...scope }, JWT_SECRET);
const guardian = (tenant_id = 8) => jwt.sign({ type: "guardian", id: 7, tenant_id, campus_id: 9 }, JWT_SECRET);
const attemptA = "11111111-1111-4111-8111-111111111111";
const attemptB = "22222222-2222-4222-8222-222222222222";
const request = (path: string, body: unknown, auth: string | null = staff(), method = "POST") =>
  fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  await registerGuardianRoutes(app, {
    paymentIntents: { create: mocks.stripeCreate, cancel: mocks.stripeCancel },
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("password_changed_at FROM guardians")) return { rows: [] };
    if (sql.includes("AS ya_pagado")) return { rows: [{
      monto_base_centavos: 10000, recargo_aplicado_centavos: 0, ya_pagado: 0,
    }] };
    throw new Error("Consulta financiera inesperada (base aislada)");
  });
  mocks.connect.mockRejectedValue(new Error("No usar conexiones reales"));
  mocks.getChargeByGuardian.mockResolvedValue({ id: 1, tenant_id: 8 });
  mocks.connectAccount.mockResolvedValue("acct_isolated_fixture");
  mocks.stripeCreate.mockResolvedValue({ id: "pi_isolated", status: "processing" });
});
const noFinancialAccess = () => {
  for (const key of ["query", "connect", "insert", "update", "select", "getConceptsByCampus",
    "getStudentsByCampus", "createCharge", "stripeCreate", "audit"] as const) {
    expect(mocks[key], key).not.toHaveBeenCalled();
  }
};

describe("Ningún alias evita la validación ni los permisos financieros", () => {
  it.each([-1, 0, 0.1, 1.5, "100abc", "NaN", null, true, 1e30])(
    "crear y editar conceptos rechazan importe %j", async monto_centavos => {
      const body = { nombre: "Cargo", tipo: "extra", periodicidad: "unica", monto_centavos };
      expect((await request("/api/concepts", body)).status).toBe(400);
      expect((await request("/api/concepts/1", body, staff(), "PUT")).status).toBe(400);
      noFinancialAccess();
    });
  it.each([-1, 0, 0.1, 1.5, "100abc", "NaN", null, true, 1e30])(
    "generación alternativa rechaza centavos %j sin redondear", async monto_manual => {
      expect((await request("/api/charges/generate", {
        descripcion: "Extra", monto_manual, fecha_vencimiento: "2026-11-01",
      })).status).toBe(400);
      noFinancialAccess();
    });
  it.each(["ayer", "2026-02-30", "1999-12-31", "2101-01-01"])(
    "generación alternativa rechaza fecha %s", async date => {
      for (const field of ["fecha_emision", "fecha_vencimiento"]) {
        expect((await request("/api/charges/generate", {
          monto_manual: 100, [field]: date,
        })).status).toBe(400);
      }
      noFinancialAccess();
    });
  it("rechaza fechas invertidas, booleanos de texto y monto inválido aunque venga catálogo", async () => {
    for (const body of [
      { fecha_emision: "2026-11-02", fecha_vencimiento: "2026-11-01" },
      { dry_run: "false" }, { product_id: 1, monto_manual: 0.1 },
    ]) expect((await request("/api/charges/generate", body)).status).toBe(400);
    noFinancialAccess();
  });
  it.each(["asistente", "admisiones", "auxiliar_contable"])("sin permiso, %s no genera ni previsualiza cargos", async role => {
    for (const dry_run of [false, true]) {
      expect((await request("/api/charges/generate", {
        descripcion: "Extra", monto_manual: 100, fecha_vencimiento: "2026-11-01", dry_run,
      }, staff(role))).status).toBe(403);
    }
    noFinancialAccess();
  });
  it("no acepta sesión sin institución ni falta de autenticación", async () => {
    const body = { monto_manual: 100, fecha_vencimiento: "2026-11-01" };
    expect((await request("/api/charges/generate", body, staff("super_admin", { tenant_id: null, campus_id: 9 } as any))).status).toBe(403);
    expect((await request("/api/charges/generate", body, null)).status).toBe(401);
    noFinancialAccess();
  });
  it("crear y editar conceptos conservan control de permisos", async () => {
    const body = { nombre: "Cargo", tipo: "extra", periodicidad: "unica", monto_centavos: 100 };
    expect((await request("/api/concepts", body, staff("asistente"))).status).toBe(403);
    expect((await request("/api/concepts/1", body, staff("asistente"), "PUT")).status).toBe(403);
    noFinancialAccess();
  });
  it("crea un concepto válido con el ámbito de sesión, no del cuerpo", async () => {
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 1 }]);
    expect((await request("/api/concepts", {
      nombre: "Cargo", tipo: "extra", periodicidad: "unica", monto_centavos: 129,
      campus_id: 99, tenant_id: 99,
    })).status).toBe(201);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      monto_centavos: 129, campus_id: 9, tenant_id: 8,
    }));
  });
  it("acepta edición parcial con importe entero", async () => {
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 1, monto_centavos: 130 }]);
    expect((await request("/api/concepts/1", { monto_centavos: 130 }, staff(), "PUT")).status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ monto_centavos: 130 }));
    const scope = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(scope.sql).toContain('"tenant_id"');
    expect(scope.params).toEqual([1, 9, 8]);
  });
  it("no convierte un identificador parcialmente numérico en otro concepto", async () => {
    expect((await request("/api/concepts/1abc", { monto_centavos: 100 }, staff(), "PUT")).status).toBe(400);
    noFinancialAccess();
  });
  it("preview autorizado conserva importes enteros sin escribir", async () => {
    mocks.getConceptsByCampus.mockResolvedValue([{ id: 1, nombre: "Extra", tipo: "extra", periodicidad: "unica", monto_centavos: 129 }]);
    mocks.getStudentsByCampus.mockResolvedValue([{ id: 1, status: "activo", grado: "1° Primaria", nombre_completo: "Fixture" }]);
    const response = await request("/api/charges/generate", {
      concepto: "Extra", monto_manual: 129, fecha_vencimiento: "2026-11-01", dry_run: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.createCharge).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("Reintentos Stripe aislados: sin red ni movimientos reales", () => {
  const pay = (payment_method_id = "pm_isolated_a", payment_attempt_id: string | undefined = attemptA, auth = guardian()) =>
    request("/api/guardian/pagar", {
      charge_ids: [1], metodo_pago: "tarjeta", payment_method_id, payment_attempt_id,
    }, auth);
  it("otra tarjeta después de un rechazo no reutiliza la clave fallida", async () => {
    mocks.stripeCreate.mockRejectedValueOnce(new Error("tarjeta rechazada"));
    expect((await pay("pm_isolated_declined")).status).toBe(402);
    expect((await pay("pm_isolated_other_card")).status).toBe(202);
    const first = mocks.stripeCreate.mock.calls[0];
    const second = mocks.stripeCreate.mock.calls[1];
    expect(first[1].idempotencyKey).not.toBe(second[1].idempotencyKey);
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("reintentos idénticos y concurrentes conservan exactamente la misma clave", async () => {
    expect((await Promise.all([pay(), pay()])).map(r => r.status)).toEqual([202, 202]);
    expect(mocks.stripeCreate.mock.calls[0]).toEqual(mocks.stripeCreate.mock.calls[1]);
    expect(mocks.stripeCreate.mock.calls[0][1].idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
  });
  it("un nuevo intento autorizado con el mismo método usa una nueva clave", async () => {
    expect((await pay("pm_isolated_a", attemptA)).status).toBe(202);
    expect((await pay("pm_isolated_a", attemptB)).status).toBe(202);
    expect(mocks.stripeCreate.mock.calls[0][1]).not.toEqual(mocks.stripeCreate.mock.calls[1][1]);
  });
  it("clientes anteriores sin UUID conservan idempotencia y pueden cambiar tarjeta", async () => {
    const oldPay = (payment_method_id: string) => request("/api/guardian/pagar", {
      charge_ids: [1], payment_method_id,
    }, guardian());
    await oldPay("pm_isolated_a"); await oldPay("pm_isolated_a"); await oldPay("pm_isolated_b");
    const keys = mocks.stripeCreate.mock.calls.map(call => call[1].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });
  it("cambio de importe nunca comparte clave con parámetros diferentes", async () => {
    await pay();
    const queryImpl = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args: any[]) => sql.includes("AS ya_pagado")
      ? { rows: [{ monto_base_centavos: 20000, recargo_aplicado_centavos: 0, ya_pagado: 0 }] }
      : queryImpl(sql, ...args));
    await pay();
    expect(mocks.stripeCreate.mock.calls[0][1]).not.toEqual(mocks.stripeCreate.mock.calls[1][1]);
  });
  it("rechaza un identificador de intento inválido antes de buscar cargos", async () => {
    expect((await pay("pm_isolated_a", "no-es-uuid")).status).toBe(400);
    expect(mocks.getChargeByGuardian).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });
  it("otro tenant no puede iniciar intento para el cargo", async () => {
    expect((await pay("pm_isolated_a", attemptA, guardian(99))).status).toBe(403);
    expect(mocks.connectAccount).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });
});
