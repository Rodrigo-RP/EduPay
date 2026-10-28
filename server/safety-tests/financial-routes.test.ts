import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { financialContracts, financialRequestValidation } from "../lib/financial-request-validation";
import * as bankParsers from "../lib/bank-parsers/index";

const { sql } = vi.hoisted(() => ({ sql: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }));
vi.mock("../db", () => ({ pool: { query: sql, connect: sql, on: vi.fn() }, db: {} }));

let server: Server;
let origin: string;
const PLAN_START = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
beforeAll(async () => {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());
  server = await registerRoutes(app);
  const registered = new Set<string>((app as any)._router.stack
    .filter((layer: any) => layer.route)
    .flatMap((layer: any) => Object.keys(layer.route.methods)
      .map(method => `${method.toUpperCase()} ${layer.route.path}`)));
  for (const contract of financialContracts) {
    expect(registered.has(`${contract.method} ${contract.path}`), `Ruta real: ${contract.method} ${contract.path}`).toBe(true);
  }
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
}, 30_000);
beforeEach(() => sql.mockClear());
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

function validBody(path: string): Record<string, unknown> {
  const common = {
    monto_centavos: 100, amount_centavos: 100, student_id: 1, estudiante_id: 1,
    concept_id: 1, producto_id: 1, charge_id: 1, charge_ids: [1], monto: "0.29",
    fecha: "2027-01-15", fecha_vencimiento: "2027-02-15",
  };
  if (path === "/api/planes-pago") return { concept_id: 1, student_id: 1, numero_pagos: 3, frecuencia: "mensual", fecha_inicio: PLAN_START };
  if (path === "/api/conciliacion/importar") return { transacciones: [{ fecha: "2027-01-15", monto: "0.29" }] };
  return common;
}
describe("Registro real de rutas: sintaxis rechazada antes de autenticar o consultar SQL", () => {
  for (const contract of financialContracts) {
    const url = contract.path.replace(/:[A-Za-z_]+/g, "1");
    it(`${contract.method} ${contract.path}: inválido devuelve 400 sin SQL`, async () => {
      let invalidUrl = url;
      const body = validBody(contract.path);
      if (contract.path.includes(":")) invalidUrl = contract.path.replace(/:[A-Za-z_]+/g, "0");
      else if (contract.method === "GET") {
        const query = contract.path.includes("caja/") ? "fecha=2026-02-30"
          : contract.path.includes("receivables/") ? "charge_id=0"
          : contract.path.includes("pendientes-cfdi") ? "mes=2026-13"
          : contract.path.includes("contable") ? "periodo=2026-13" : "fecha_desde=2026-02-30";
        invalidUrl += `?${query}`;
      }
      else if (contract.path === "/api/planes-pago") body.numero_pagos = 7;
      else if (contract.path === "/api/conciliacion/importar") body.transacciones = [{ fecha: "2026-02-30", monto: "0.29" }];
      else if (contract.path.includes("scholarship-types")) body.beneficio = { porcentaje_descuento: "12.50" };
      else if (contract.path.includes("due-dates")) body.dia_vencimiento = 0;
      else if (contract.path.includes("due-date-periods")) body.fecha_vencimiento = "2026-02-30";
      else if (contract.path.includes("surcharge-rules-complete")) body.porcentaje_recargo = 100.01;
      else if (contract.path.includes("surcharge-rules") || contract.path.includes("late-fee-rules") || contract.path.endsWith("/beca")) body.porcentaje = 100.01;
      else if (contract.path.includes("test-late-fee")) body.amount = -1;
      else if (contract.path.endsWith("cargos/generar-mensual")) body.periodo = "2026-13";
      else if (contract.path.endsWith("cargos/desde-catalogo")) body.producto_id = 0;
      else if (contract.path.endsWith("charges/bulk")) body.concept_id = 0;
      else if (contract.path.endsWith("charges/generate")) body.monto_manual = 1.234;
      else if (/pago-efectivo|transferencia-manual|extraordinario/.test(contract.path)) body.monto = "abc";
      else if (contract.path.includes("cerrar-dia")) body.efectivo_capturado_centavos = -1;
      else if (contract.path.includes("products")) body.precio_primaria = 1.234;
      else if (/reminders|collections|guardian\/pagar|payments\/(create-intent|process)/.test(contract.path)) body.charge_ids = [0];
      else if (/follow-ups|notes|escalations/.test(contract.path)) body.charge_id = 0;
      else if (/reportes\/(consejo|cobranza|financiero)/.test(contract.path)) body.fecha_desde = "2026-02-30";
      else if (contract.path.includes("/reportes/contable") || contract.path.includes("generar-reporte-")) body.periodo = "2026-13";
      else if (contract.path === "/api/payments/manual") body.amount_centavos = -1;
      else if (contract.path.includes("becas-auto")) body.descuento_porcentaje = 100.01;
      else body.monto_centavos = -1;
      const response = await fetch(`${origin}${invalidUrl}`, {
        method: contract.method, headers: { "Content-Type": "application/json" },
        ...contract.method !== "GET" ? { body: JSON.stringify(body) } : {},
      });
      expect(response.status).toBe(400);
      expect((await response.json()).message).toBeTruthy();
      expect(sql).not.toHaveBeenCalled();
    });
    it(`${contract.method} ${contract.path}: válido conserva cuerpo y continuación`, () => {
      const body = validBody(contract.path);
      const next = vi.fn();
      const status = vi.fn(() => ({ json: vi.fn() }));
      const snapshot = JSON.stringify(body);
      financialRequestValidation({ method: contract.method, path: url, body, query: {} } as any, { status } as any, next);
      expect(next).toHaveBeenCalledOnce();
      expect(status).not.toHaveBeenCalled();
      expect(JSON.stringify(body)).toBe(snapshot);
      expect(sql).not.toHaveBeenCalled();
    });
  }
  it("el beneficio de beca 12.50 devuelve 400 claro y 25 continúa", async () => {
    const bad = await fetch(`${origin}/api/admin/scholarship-types`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beneficio: { porcentaje_descuento: "12.50" } }),
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toMatch(/entero.*0 a 100/);
    const next = vi.fn();
    financialRequestValidation({
      method: "POST", path: "/api/admin/scholarship-types",
      body: { beneficio: { porcentaje_descuento: 25 } }, query: {},
    } as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(sql).not.toHaveBeenCalled();
  });
  it.each([0, 100.01])("beca automática %s: 400 antes de cualquier SQL", async value => {
    const response = await fetch(`${origin}/api/becas-auto/reglas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descuento_porcentaje: value }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/porcentaje/i);
    expect(sql).not.toHaveBeenCalled();
  });
  it.each([0.01, 100])("beca automática %s atraviesa el guard sin consultas", value => {
    const next = vi.fn();
    financialRequestValidation({
      method: "POST", path: "/api/becas-auto/reglas",
      body: { descuento_porcentaje: value }, query: {},
    } as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(sql).not.toHaveBeenCalled();
  });
  it.each([
    ["adeudos/migrados", "monto_centavos,fecha_vencimiento\n1.234,2027-01-15"],
    ["adeudos/migrados", "monto_centavos,fecha_vencimiento\n100,2026-02-30"],
    ["adeudos/migrados", "monto_centavos,fecha_emision,fecha_vencimiento\n100,2027-02-01,2027-01-01"],
    ["becas/asignaciones", "valor_descuento\n100.005"],
    ["familias/tutores", "porcentaje_responsabilidad\n100.01"],
  ])("archivo inválido %s: 400 sin SQL", async (template, contents) => {
    const form = new FormData();
    form.set("file", new Blob([contents], { type: "text/csv" }), "financiero.csv");
    const response = await fetch(`${origin}/api/import/data/${template}`, { method: "POST", body: form });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/Fila 2/);
    expect(sql).not.toHaveBeenCalled();
  });
  it("archivo válido continúa hasta autenticación, sin escribir ni alterar permisos", async () => {
    const form = new FormData();
    form.set("file", new Blob(["valor_descuento\n25"], { type: "text/csv" }), "financiero.csv");
    const response = await fetch(`${origin}/api/import/data/becas/asignaciones`, { method: "POST", body: form });
    expect(response.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
  it("importe fraccionario en resultado de parser bancario: 400 sin SQL", async () => {
    const parser = vi.spyOn(bankParsers, "getParser").mockReturnValue({
      banco: "BBVA",
      parse: vi.fn().mockResolvedValue({ transactions: [{ fecha: "2027-01-15", monto_centavos: 1.234 }] }),
    } as any);
    try {
      const form = new FormData();
      form.set("pdf", new Blob(["%PDF-simulado"], { type: "application/pdf" }), "estado.pdf");
      const response = await fetch(`${origin}/api/conciliacion/importar-pdf?dry_run=true`, { method: "POST", body: form });
      expect(response.status).toBe(400);
      expect(sql).not.toHaveBeenCalled();
    } finally { parser.mockRestore(); }
  });
});
