import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), execute: vi.fn(), storage: vi.fn(),
}));
vi.mock("../db", () => ({
  pool: { query: mocks.query, connect: mocks.connect, on: vi.fn() },
  db: { execute: mocks.execute },
}));
vi.mock("../storage", () => ({
  storage: new Proxy({}, {
    get: (_, key) => key === "then" ? undefined : (...args: unknown[]) => mocks.storage(String(key), ...args),
  }),
}));
vi.mock("../routes/shared", async importOriginal => {
  const actual = await importOriginal<any>();
  const auth: express.RequestHandler = (req: any, res, next) => {
    const role = req.header("X-Test-Role");
    if (!role) return res.status(401).json({ message: "Token requerido" });
    req.user = { id: 1, role, campus_id: 48, tenant_id: 29, custom_permissions: [] };
    next();
  };
  return {
    ...actual, authenticateToken: auth, requireAuth: auth,
    requireSuperAdmin: [auth, (req: any, res: any, next: any) =>
      req.user.role === "super_admin" ? next() : res.status(403).json({ message: "Acceso denegado" })],
    checkCampusTenant: vi.fn().mockResolvedValue(true),
  };
});

let server: Server;
let base: string;
beforeAll(async () => {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());
  server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}, 30_000);
afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset().mockRejectedValue(new Error("DB_UNAVAILABLE_ISOLATED"));
});
async function hit(path: string, method = "GET", role: string | null = "super_admin", body = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { ...(role ? { "X-Test-Role": role } : {}), "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
const retired: [string, string][] = [
  ["POST", "/api/fiscal/generar-reporte-contable"], ["POST", "/api/fiscal/generar-reporte-sat"],
  ["GET", "/api/security/metrics"], ["GET", "/api/security/events"], ["GET", "/api/security/report"],
  ["POST", "/api/super-admin/security/scan"], ["POST", "/api/super-admin/security/block-ip"],
  ["GET", "/api/super-admin/live/revenue"], ["GET", "/api/super-admin/live/transactions"],
  ["GET", "/api/super-admin/analytics/regional"], ["GET", "/api/super-admin/alerts/executive"],
  ["GET", "/api/financial/analysis"], ["GET", "/api/financial/analysis/mes"],
  ["GET", "/api/migration/progress/fixture"], ["GET", "/api/migration/download/fixture"],
  ["GET", "/api/validation/report"], ["GET", "/api/migration/status"],
  ["POST", "/api/migration/status"], ["POST", "/api/migration/reset"],
];
it.each([true, false])("pago en efectivo: falla de consulta (cargo explícito=%s) → 500 sin iniciar pago", async explicit => {
  const response = await hit("/api/caja/pago-efectivo", "POST", "super_admin", {
    estudiante_id: 1, monto: 100, ...(explicit ? { charge_id: 2 } : {}),
  });
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("No hay cargos pendientes");
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.storage).not.toHaveBeenCalled();
});
describe.each(retired)("%s %s retirada", (method, path) => {
  it.each([
    ["super_admin", 501], ["asistente", 403], [null, 401],
  ] as const)("rol %s → %i, sin SQL, storage ni proveedores", async (role, status) => {
    const response = await hit(path, method, role);
    expect(response.status).toBe(status);
    if (status === 501) expect(await response.json()).toEqual({
      code: "NO_DISPONIBLE", message: "No disponible por ahora",
    });
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
});

const degraded = [
  "/api/admin/dashboard/48", "/api/scholarships", "/api/students/1/estado-cuenta",
  "/api/admin/magic-link/history/1", "/api/admin/cargos", "/api/dashboard/comandos/48",
  "/api/caja/movimientos-banco", "/api/caja/estadisticas-conciliacion",
  "/api/fiscal", "/api/fiscal/estadisticas-cfdi", "/api/planes-pago/48",
  "/api/planes-pago", "/api/dashboard/comandos", "/api/receivables",
  "/api/crm/prospects", "/api/caja", "/api/admin/charges",
  "/api/admin/dashboard", "/api/migration/projects", "/api/reportes/admisiones",
];
describe.each(degraded)("Lectura fallida: GET %s", path => {
  it("500, nunca un éxito vacío, con fallo de base simulado", async () => {
    expect((await hit(path)).status).toBe(500);
    expect(mocks.query.mock.calls.length + mocks.storage.mock.calls.length + mocks.execute.mock.calls.length).toBeGreaterThan(0);
  });
});
it.each([
  ["/api/crm/prospects", { nombre: "Prospecto aislado" }],
  ["/api/caja/ejecutar-conciliacion", {}],
] as const)("POST %s: fallo de base → 500, nunca éxito", async (path, body) => {
  expect((await hit(path, "POST", "super_admin", body)).status).toBe(500);
  expect(mocks.query).toHaveBeenCalled();
});

it.each(["/api/planes-pago", "/api/planes-pago/48"])("%s: también falla si no se pueden leer las cuotas", async path => {
  mocks.query.mockImplementation(async (text: string) => {
    if (text.includes("WHERE plan_id")) throw new Error("DB_UNAVAILABLE_ISOLATED");
    return { rows: [{ id: 1, total_adeudo_centavos: 300, numero_pagos: 3 }], rowCount: 1 };
  });
  expect((await hit(path)).status).toBe(500);
  expect(mocks.query.mock.calls.some(([text]) => String(text).includes("WHERE plan_id"))).toBe(true);
});

it.each([
  ["/api/admin/dashboard/48", "bank_transactions"],
  ["/api/dashboard/comandos/48", "bank_transactions"],
  ["/api/dashboard/comandos", "bank_transactions"],
  ["/api/students/1/estado-cuenta", "family_credits"],
  ["/api/caja", "bank_transactions"],
  ["/api/admin/dashboard", "SUM(p.monto_centavos)"],
  ["/api/fiscal/estadisticas-cfdi", "i.estado='cancelado'"],
  ["/api/reportes/admisiones", "LEFT JOIN scholarship_types"],
  ["/api/reportes/admisiones", "LOWER(co.nombre) LIKE '%inscripci%'"],
])("%s: una lectura parcial fallida (%s) invalida toda la respuesta", async (path, fragment) => {
  mocks.query.mockImplementation(async (text: string) => {
    if (text.includes(fragment)) throw new Error("DB_UNAVAILABLE_ISOLATED");
    return { rows: [{
      id: 1, campus_id: 48, tenant_id: 29, total: 0, cnt: 0,
      esperado: 0, cobrado: 0, total_invoices: 0,
    }], rowCount: 1 };
  });
  expect((await hit(path)).status).toBe(500);
  expect(mocks.query.mock.calls.some(([text]) => String(text).includes(fragment))).toBe(true);
});

it("school-details sólo devuelve campus y alumnos leídos; sin finanzas, usuarios ni actividad ficticios", async () => {
  mocks.storage.mockImplementation(async (method: string) => {
    if (method === "getCampusesByTenant") return [{ id: 48, tenant_id: 29, nombre: "Campus aislado" }];
    if (method === "getStudentsByCampus") return [{ id: 1, campus_id: 48, nombre_completo: "Alumno aislado" }];
    throw new Error(`Método inesperado ${method}`);
  });
  const response = await hit("/api/super-admin/school-details/29");
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.campusCount).toBe(1);
  expect(body.studentCount).toBe(1);
  expect(body.message).toBe("No disponible");
  for (const key of ["userCount", "monthlyRevenue", "paidAmount", "pendingAmount", "overdueAmount", "users", "recentActivity"])
    expect(body).not.toHaveProperty(key);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("validation/run no certifica IVA ni becas; no_evaluado y sin escrituras", async () => {
  mocks.storage.mockImplementation(async (method: string) => {
    if (method === "getStudentsByCampus") return [];
    if (method === "getConceptsByCampus") return [{ tipo: "colegiatura", monto_centavos: 100 }, { tipo: "inscripcion", monto_centavos: 100 }];
    throw new Error(`Método inesperado ${method}`);
  });
  const response = await hit("/api/validation/run");
  expect(response.status).toBe(200);
  const body = await response.json();
  const iva = body.results.flatMap((r: any) => r.checks).find((r: any) => r.name === "Configuración de IVA");
  expect(iva.status).toBe("no_evaluado");
  const becas = body.results.find((r: any) => r.category === "Becas y Descuentos");
  expect(becas.overallStatus).toBe("no_evaluado");
  expect(becas.checks.every((r: any) => r.status === "no_evaluado")).toBe(true);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("validation/run sin permiso → 403 sin consultar", async () => {
  expect((await hit("/api/validation/run", "GET", "asistente")).status).toBe(403);
  expect(mocks.storage).not.toHaveBeenCalled();
});
it("POST /api/test-create ya no está registrado", async () => {
  expect((await hit("/api/test-create", "POST")).status).toBe(404);
  for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
});
