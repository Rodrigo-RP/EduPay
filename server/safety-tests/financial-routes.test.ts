import express from "express";
import jwt from "jsonwebtoken";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Toda dependencia de persistencia está sustituida antes de importar rutas.
// Un acceso inesperado falla: ninguna prueba conecta con una base real.
const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), execute: vi.fn(),
  createConcept: vi.fn(), getCampusScoped: vi.fn(), getStudentScoped: vi.fn(),
  getConceptScoped: vi.fn(), getChargeByGuardian: vi.fn(),
  getStudentsByCampus: vi.fn(), getConceptsByCampus: vi.fn(),
  createCharge: vi.fn(), audit: vi.fn(), parse: vi.fn(),
}));
vi.mock("../db", () => ({
  pool: { query: mocks.query, connect: mocks.connect }, db: { execute: mocks.execute },
}));
vi.mock("../storage", () => ({ storage: mocks }));
vi.mock("../audit-retry", () => ({ enqueueAuditLog: mocks.audit }));
vi.mock("../websocket-manager", () => ({ wsManager: { notifyPaymentUpdate: vi.fn() } }));
vi.mock("../lib/bank-parsers/index", () => ({
  getParser: () => ({ banco: "BBVA", parse: mocks.parse }),
}));

import { registerChargesRoutes } from "../routes/charges";
import { registerPaymentRoutes } from "../routes/payments";
import { registerMiscRoutes } from "../routes/misc";
import { registerConciliacionRoutes } from "../routes/conciliacion";
import { JWT_SECRET } from "../routes/shared";

let server: Server;
let base: string;
// JWT sin id: la autenticación real no necesita consultar users para estas
// peticiones aisladas. Los handlers siguen usando sus permisos reales.
const token = (role = "super_admin") => jwt.sign({ role, tenant_id: 8, campus_id: 9 }, JWT_SECRET);
const guardianToken = () => jwt.sign({ type: "guardian", tenant_id: 8 }, JWT_SECRET);

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerChargesRoutes(app);
  registerPaymentRoutes(app);
  registerMiscRoutes(app);
  registerConciliacionRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
beforeEach(() => {
  vi.resetAllMocks();
  for (const mock of [mocks.query, mocks.connect, mocks.execute]) {
    mock.mockRejectedValue(new Error("Acceso inesperado a persistencia aislada"));
  }
});
const noPersistence = () => {
  for (const name of ["query", "connect", "execute", "createConcept", "getCampusScoped",
    "getStudentScoped", "getConceptScoped", "getChargeByGuardian", "getStudentsByCampus",
    "getConceptsByCampus", "createCharge", "audit"] as const) {
    expect(mocks[name], name).not.toHaveBeenCalled();
  }
};
const post = (path: string, body: unknown, auth: string | null = token(), method = "POST") =>
  fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });

const invalidCases: [string, any, string?][] = [
  ["/api/admin/concepts", { nombre: "Cargo", tipo: "extra", periodicidad: "unica", monto_centavos: -100 }],
  ["/api/admin/concepts", { nombre: "Cargo", tipo: "extra", periodicidad: "unica", monto_centavos: "100abc" }],
  ["/api/admin/charges/bulk", { campus_id: 9, concept_id: 1, ciclo_escolar: "2026", fecha_emision: "2026-02-30" }],
  ["/api/admin/charges/bulk", { campus_id: 9, concept_id: 1, ciclo_escolar: "2026", billing_period: { month: "2026-99" } }],
  ["/api/admin/cargos/generar-mensual", { periodo: "2026-99" }],
  ["/api/admin/cargos/generar-mensual", {}],
  ["/api/admin/cargos/extraordinario", { student_id: 1, monto: "10abc", fecha_vencimiento: "2099-01-01", motivo_override: "Solicitud" }],
  ["/api/admin/cargos/extraordinario", { student_id: 1, monto: 10, fecha_vencimiento: "2099-02-30", motivo_override: "Solicitud" }],
  ["/api/admin/cargos/desde-catalogo", { producto_id: 1, fecha_vencimiento: "ayer" }],
  ["/api/planes-pago", { charge_ids: [1], numero_pagos: 1.5, fecha_inicio: "2026-11-01" }],
  ["/api/planes-pago", { charge_ids: [1], numero_pagos: 121, fecha_inicio: "2026-11-01" }],
  ["/api/planes-pago", { charge_ids: [1], numero_pagos: 4, fecha_inicio: "2026-11-01", recargo_centavos: -1 }],
  ["/api/planes-pago", { charge_ids: [1], numero_pagos: 4, fecha_inicio: "2026-11-01", monto_inicial_centavos: "NaN" }],
  ["/api/products", { codigo: "A", nombre: "Cargo", categoria: "OTROS", precio_kinder: -100 }],
  ["/api/products/1", { precio_kinder: 1.5 }, "PUT"],
  ["/api/caja/pago-efectivo", { estudiante_id: 1, monto: "NaN" }],
  ["/api/caja/pago-efectivo", { estudiante_id: 1, monto: "10abc" }],
  ["/api/caja/pago-efectivo", { estudiante_id: 1, monto: 0.001 }],
  ["/api/caja/transferencia-manual", { monto: -1, fecha: "2026-11-01" }],
  ["/api/caja/transferencia-manual", { monto: "10abc", fecha: "2026-11-01" }],
  ["/api/caja/transferencia-manual", { monto: 10, fecha: "2026-02-30" }],
  ["/api/caja/cerrar-dia", { efectivo_capturado_centavos: 10.5 }],
  ["/api/caja/cerrar-dia", { efectivo_capturado_centavos: 0, fecha: "1900-01-01" }],
  ["/api/conciliacion/importar", { transacciones: [{ monto: "10abc", fecha: "2026-11-01" }] }],
  ["/api/conciliacion/importar", { transacciones: [
    { monto: 10, fecha: "2026-11-01" }, { monto: 20, fecha: "2026-02-30" },
  ] }],
  ["/api/payments/manual", { student_id: 1, charge_id: 1, amount_centavos: true, idempotency_key: "a".repeat(16), recibido_por: "Caja" }],
];

describe("Rutas financieras reales, autenticación real, sin base de datos", () => {
  it.each(invalidCases)("rechaza %s con %j antes de persistencia", async (path, body, method) => {
    const response = await post(path, body, token(), method);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBeTruthy();
    noPersistence();
  });
  it.each(["/api/payments/create-intent", "/api/payments/process"])("conserva deshabilitada la ruta insegura %s", async path => {
    const response = await post(path, { charge_id: "1abc" }, guardianToken());
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ code: "NO_DISPONIBLE" });
    noPersistence();
  });
  it("no omite autenticación para datos inválidos", async () => {
    expect((await post("/api/caja/transferencia-manual", { monto: "NaN" }, null)).status).toBe(401);
    noPersistence();
  });
  it("mantiene permisos para datos válidos", async () => {
    const response = await post("/api/admin/concepts", {
      nombre: "Cargo", tipo: "extra", periodicidad: "unica", monto_centavos: 100,
    }, token("asistente"));
    expect(response.status).toBe(403);
    noPersistence();
  });
  it("mantiene el aislamiento de campus de la generación masiva", async () => {
    expect((await post("/api/admin/charges/bulk", {
      campus_id: 10, concept_id: 1, ciclo_escolar: "2026-2027",
    })).status).toBe(403);
    noPersistence();
  });
  it("acepta concepto válido y toma tenant y campus de sesión", async () => {
    mocks.getCampusScoped.mockResolvedValue({ id: 9 });
    mocks.createConcept.mockImplementation(async data => ({ id: 100, ...data }));
    const response = await post("/api/admin/concepts", {
      nombre: "Cargo", tipo: "extra", periodicidad: "unica", monto_centavos: 129,
      tenant_id: 100, campus_id: 100,
    });
    expect(response.status).toBe(201);
    expect(mocks.createConcept).toHaveBeenCalledWith(expect.objectContaining({
      monto_centavos: 129, tenant_id: 8, campus_id: 9,
    }));
  });
  it("conserva ceros válidos del catálogo", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: 1 }] });
    expect((await post("/api/products", {
      codigo: "A", nombre: "Cargo", categoria: "OTROS", precio_kinder: 0, precio_primaria: 1,
    })).status).toBe(201);
    expect(mocks.query.mock.calls[0][1].slice(-4)).toEqual([0, 1, 0, 0]);
  });
  it("convierte pesos válidos a centavos sin truncar y conserva el ámbito", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: 1 }] });
    const response = await post("/api/caja/transferencia-manual", {
      monto: "0.29", fecha: "2026-11-01", descripcion: "Transferencia",
      tenant_id: 100, campus_id: 100,
    });
    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0][1].slice(0, 6)).toEqual([
      9, 8, "2026-11-01", "Transferencia", 29, "credito",
    ]);
  });
  it("un fallo al guardar un monto válido no devuelve éxito", async () => {
    expect((await post("/api/products", {
      codigo: "A", nombre: "Cargo", categoria: "OTROS", precio_kinder: 100,
    })).status).toBe(500);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("no abre transacción para cuotas de cero centavos", async () => {
    mocks.getConceptScoped.mockResolvedValue({ id: 1, monto_centavos: 2, campus_id: 9, tipo: "colegiatura" });
    mocks.getStudentScoped.mockResolvedValue({ id: 2, campus_id: 9 });
    const response = await post("/api/planes-pago", {
      concept_id: 1, student_id: 2, numero_pagos: 3, fecha_inicio: "2026-11-01",
    });
    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each(["100abc", "1.5", "-1"])("archivo de adeudos rechaza %s antes de conectar", async value => {
    const form = new FormData();
    form.append("file", new Blob([
      `id_estudiante,tipo_concepto,monto_centavos,fecha_vencimiento,ciclo_escolar\nA,colegiatura,${value},2026-11-01,2026-2027`,
    ], { type: "text/csv" }), "adeudos.csv");
    const response = await fetch(`${base}/api/import/data/adeudos/migrados`, {
      method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).errors[0]).toMatchObject({ fila: 2, campo: "monto_centavos" });
    noPersistence();
  });
  it("rechaza resultados corruptos del parser PDF antes de conectar", async () => {
    mocks.parse.mockResolvedValue({
      transactions: [{ fecha: "2026-02-30", monto_centavos: 100, tipo: "credito" }],
      errors: [], metadata: {},
    });
    const form = new FormData();
    form.append("pdf", new Blob(["pdf aislado"], { type: "application/pdf" }), "banco.pdf");
    const response = await fetch(`${base}/api/conciliacion/importar-pdf?dry_run=true`, {
      method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form,
    });
    expect(response.status).toBe(400);
    noPersistence();
  });
});
