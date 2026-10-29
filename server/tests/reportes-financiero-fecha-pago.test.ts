import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";
import express from "express";
import ExcelJS from "exceljs";
import { assertTestDatabase } from "../lib/database-safety";
import { SCHOOL_TODAY_SQL } from "../../shared/school-date";
import { registerReportesFinancieroRoutes } from "../routes/reportes-financiero";

const query = vi.hoisted(() => vi.fn<
  (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
>());
vi.mock("../db", () => ({ pool: { query } }));
vi.mock("../routes/shared", () => ({
  authenticateToken: vi.fn(),
  hasPermissionForUser: vi.fn(() => true),
}));

// El manejador y la generación de Excel son reales. Sólo se sustituye la
// conexión por la misma transacción de los fixtures, que siempre se revierte.
neonConfig.webSocketConstructor = ws;
const reader = new Pool({ connectionString: process.env.DATABASE_URL });
let client: PoolClient | undefined;
let tenantId: number;
let campusId: number;
let savedDay: string;
const app = express();
const registrations = vi.spyOn(app, "post");
registerReportesFinancieroRoutes(app);

beforeAll(async () => {
  await assertTestDatabase(reader);
  client = await reader.connect();
  await client.query("BEGIN");
  const tenant = await client.query<{ id: number }>(
    "INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id",
    ["Fixture fecha pago", `FPG${Date.now().toString().slice(-10)}`],
  );
  tenantId = tenant.rows[0].id;
  const campus = await client.query<{ id: number }>(
    "INSERT INTO campuses (nombre, tenant_id) VALUES ($1, $2) RETURNING id",
    ["Fixture fecha pago", tenantId],
  );
  campusId = campus.rows[0].id;
  const student = await client.query<{ id: number }>(
    `INSERT INTO students (nombre_completo, tenant_id, campus_id, status)
     VALUES ($1, $2, $3, 'activo') RETURNING id`,
    ["Alumno fixture fecha pago", tenantId, campusId],
  );
  const concept = await client.query<{ id: number }>(
    `INSERT INTO concepts (nombre, tipo, periodicidad, monto_centavos, tenant_id, campus_id)
     VALUES ($1, 'colegiatura', 'mensual', 10000, $2, $3) RETURNING id`,
    ["Concepto fixture fecha pago", tenantId, campusId],
  );
  const charge = await client.query<{ id: number }>(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision,
                          fecha_vencimiento, monto_base_centavos, estado)
     VALUES ($1, $2, $3, ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL}, 10000, 'pagado')
     RETURNING id`,
    [tenantId, student.rows[0].id, concept.rows[0].id],
  );
  const payment = await client.query<{ saved_day: string }>(
    `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, estado, fecha_pago)
     VALUES ($1, $2, 'efectivo', 10000, 'exitoso', ${SCHOOL_TODAY_SQL})
     RETURNING fecha_pago::date::text AS saved_day`,
    [tenantId, charge.rows[0].id],
  );
  savedDay = payment.rows[0].saved_day;
  query.mockImplementation(async (sql, values) => {
    if (!client) throw new Error("Transacción de prueba no disponible");
    return client.query<Record<string, unknown>>(sql, values);
  });
});

afterAll(async () => {
  try {
    if (client) {
      try { await client.query("ROLLBACK"); }
      finally { client.release(); }
    }
  } finally {
    await reader.end();
    vi.restoreAllMocks();
  }
});

describe("Fecha escolar del pago en el reporte financiero exportado", () => {
  it("conserva el día insertado con SCHOOL_TODAY_SQL en la celda del Excel", async () => {
    const registration: readonly unknown[] = registrations.mock.calls.find(
      ([path]) => path === "/api/reportes/financiero/exportar",
    ) ?? [];
    const handler = registration.at(-1);
    if (typeof handler !== "function") throw new Error("No se registró el exportador");
    const result: { status: number; buffer?: Buffer; error?: unknown } = { status: 200 };
    const response = {
      status(code: number) { result.status = code; return this; },
      json(body: unknown) { result.error = body; return this; },
      setHeader: vi.fn(),
      send(buffer: Buffer) { result.buffer = buffer; return this; },
    };
    await handler({
      user: { tenant_id: tenantId, campus_id: campusId },
      body: { formato: "excel" },
    }, response);
    expect(result.status, JSON.stringify(result.error)).toBe(200);
    if (!result.buffer) throw new Error("El exportador no devolvió un archivo");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(result.buffer).buffer);
    const sheet = workbook.getWorksheet("Reporte");
    const [year, month, day] = savedDay.split("-");
    expect(sheet?.getCell("A5").value).toBe(`${day}/${month}/${year}`);
    expect(sheet?.getCell("B5").value).toBe("Alumno fixture fecha pago");
    expect(sheet?.rowCount).toBe(5);
  });
});
