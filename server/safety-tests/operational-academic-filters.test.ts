import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { matchesAcademicContext, matchesPaymentDate, paymentPeriodRange } from "../../client/src/lib/operational-academic-filters";
import { registerOperationalChargesRoute } from "../routes/operational-charges";

describe("Contexto académico operativo", () => {
  it("combina ciclo y nivel, normaliza mayúsculas y excluye ciclos nulos", () => {
    const rows = [
      { ciclo_escolar: "2026-2027", nivel_escolar: " primaria " },
      { ciclo_escolar: "2026-2027", nivel_escolar: "SECUNDARIA" },
      { ciclo_escolar: "2025-2026", nivel_escolar: "PRIMARIA" },
      { ciclo_escolar: null, nivel_escolar: "PRIMARIA" },
      { ciclo_escolar: "2026-2027", nivel_escolar: null },
    ];
    expect(rows.filter(row => matchesAcademicContext(row, "2026-2027", "PRIMARIA"))).toEqual([rows[0]]);
    expect(rows.filter(row => matchesAcademicContext(row, "2026-2027", "all"))).toEqual([rows[0], rows[1], rows[4]]);
    expect(rows.filter(row => matchesAcademicContext(row, "2024-2025", "all"))).toEqual([]);
  });

  const now = new Date(2026, 9, 28, 12);
  it.each([
    ["hoy", "2026-10-28", "2026-10-28"],
    ["semana", "2026-10-26", "2026-11-01"],
    ["mes", "2026-10-01", "2026-10-31"],
    ["ciclo", "2025-08-01", "2026-07-31"],
  ])("%s usa el rango inclusivo correcto", (periodo, from, to) => {
    expect(paymentPeriodRange(periodo, "2025-2026", now)).toEqual({ from, to });
    expect(matchesPaymentDate(`${from}T00:00:00`, { from, to })).toBe(true);
    expect(matchesPaymentDate(`${to}T23:59:59`, { from, to })).toBe(true);
  });
  it("domingo sigue en la semana anterior y febrero respeta años bisiestos", () => {
    expect(paymentPeriodRange("semana", "2026-2027", new Date(2026, 10, 1))).toEqual({
      from: "2026-10-26", to: "2026-11-01",
    });
    expect(paymentPeriodRange("mes", "2023-2024", new Date(2024, 1, 15)).to).toBe("2024-02-29");
  });
  it("fechas locales se intersectan con el período global sin perder el último día", () => {
    const range = paymentPeriodRange("mes", "2026-2027", now);
    expect(matchesPaymentDate("2026-10-31T23:59:59", range, "2026-10-20", "2026-10-31")).toBe(true);
    expect(matchesPaymentDate("2026-10-19T23:59:59", range, "2026-10-20")).toBe(false);
    expect(matchesPaymentDate("2026-11-01T00:00:00", range)).toBe(false);
    expect(matchesPaymentDate("2026-10-28T10:00:00", range, "2026-10-30", "2026-10-20")).toBe(false);
    for (const fecha of [null, undefined, "", "inválida"]) {
      expect(matchesPaymentDate(fecha, range)).toBe(false);
    }
  });
});

describe("Lista de cargos, sin conexión a base de datos", () => {
  const query = vi.fn();
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    registerOperationalChargesRoute(app, {
      authenticate: (req: any, res, next) => {
        if (!req.get("x-test-role")) return res.sendStatus(401);
        req.user = {
          role: req.get("x-test-role"),
          campus_id: req.get("x-no-campus") ? null : 48,
          tenant_id: 29,
        };
        next();
      },
      canRead: user => user.role === "administrador_campus",
      query,
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  it("filtra antes del límite y conserva el alcance autenticado", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, ciclo_escolar: "2026-2027", nivel_escolar: "PRIMARIA" }] });
    const response = await fetch(`${base}/api/admin/charges?ciclo=2026-2027&nivel=PRIMARIA&campus_id=999&tenant_id=999`, {
      headers: { "x-test-role": "administrador_campus" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([48, 29, "2026-2027", "PRIMARIA"]);
    expect(sql).toContain("s.campus_id = $1");
    expect(sql).toContain("c.tenant_id = $2");
    expect(sql.indexOf("c.ciclo_escolar = $3")).toBeLessThan(sql.indexOf("LIMIT 500"));
    expect(sql.indexOf("UPPER(TRIM(s.nivel_escolar))")).toBeLessThan(sql.indexOf("LIMIT 500"));
  });
  it("todos los niveles y consumidores sin filtros siguen siendo compatibles", async () => {
    for (const suffix of ["?nivel=all", ""]) {
      const response = await fetch(`${base}/api/admin/charges${suffix}`, {
        headers: { "x-test-role": "administrador_campus" },
      });
      expect(response.status).toBe(200);
      expect(query.mock.lastCall?.[1]).toEqual([48, 29, null, null]);
    }
  });
  it.each([["", 401], ["asistente", 403]])("bloquea %s antes de consultar", async (role, status) => {
    const response = await fetch(`${base}/api/admin/charges`, { headers: role ? { "x-test-role": role } : {} });
    expect(response.status).toBe(status);
    expect(query).not.toHaveBeenCalled();
  });
  it("sin campus no consulta", async () => {
    const response = await fetch(`${base}/api/admin/charges`, {
      headers: { "x-test-role": "administrador_campus", "x-no-campus": "1" },
    });
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it("un error no se disfraza como lista vacía", async () => {
    query.mockRejectedValueOnce(new Error("DB unavailable"));
    const response = await fetch(`${base}/api/admin/charges`, { headers: { "x-test-role": "administrador_campus" } });
    expect(response.status).toBe(500);
    expect(await response.json()).toHaveProperty("message");
  });
});
