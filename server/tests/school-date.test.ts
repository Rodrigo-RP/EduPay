import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import express from "express";
import { SCHOOL_TODAY_SQL, schoolDate, schoolDateSQL, schoolTodaySQL } from "../../shared/school-date";
import { pool } from "../db";
import { storage } from "../storage";
import { registerConciliacionRoutes } from "../routes/conciliacion";
import { registerMiscRoutes } from "../routes/misc";
import { registerChargesRoutes } from "../routes/charges";

// Exercise production handlers, but never persist calendar fixtures. PostgreSQL
// evaluates their real SELECTs against CTE rows; writes remain local mocks.
vi.mock("../routes/shared", () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    authenticateToken: pass, requireAuth: pass,
    checkCampusTenant: vi.fn(async () => true),
    hasPermissionForUser: vi.fn(() => true),
    JWT_SECRET: process.env.JWT_SECRET || process.env.SESSION_SECRET,
    upload: { single: () => pass }, uploadBinary: { single: () => pass },
  };
});
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn(async () => undefined) }));

// A separate reader is essential: pool.query internally calls pool.connect,
// which the closure handler mocks. Binding query would recurse into that mock.
const reader = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const execute = reader.query.bind(reader);
afterAll(async () => { await reader.end(); });
const app = express();
registerConciliacionRoutes(app);
registerMiscRoutes(app);
registerChargesRoutes(app);

async function invoke(method: string, path: string, body = {}, query = {}) {
  const route = app._router.stack.find((layer: any) =>
    layer.route?.path === path && layer.route.methods[method]);
  expect(route, `${method} ${path}`).toBeTruthy();
  const response: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  await route.route.stack.at(-1).handle({
    user: { id: 995, tenant_id: 991, campus_id: 992, role: "super_admin" },
    params: {}, body, query,
  }, response);
  return response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const cases = [
  ["19:30 CDMX, ya es mañana UTC", "2026-10-29T01:30:00Z", "2026-10-28"],
  ["08:00 CDMX", "2026-10-28T14:00:00Z", "2026-10-28"],
  ["23:59 CDMX", "2026-10-29T05:59:00Z", "2026-10-28"],
  ["00:01 CDMX", "2026-10-29T06:01:00Z", "2026-10-29"],
] as const;

describe("Día financiero de la escuela con reloj fijo", () => {
  it.each(cases)("%s: efectivo, cierre y tablero usan el mismo día", async (_label, instant, day) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));
    expect(schoolDate()).toBe(day);
    // Explicit timestamp-with-zone clock and legacy UTC timestamp are separate
    // types; this also catches accidental reliance on the DB session timezone.
    const ctes = `WITH
      payments AS (
        SELECT 1 AS id, 991 AS tenant_id, 2 AS charge_id,
               'efectivo'::text AS metodo, 'exitoso'::text AS estado,
               '${instant.slice(0, 19).replace("T", " ")}'::timestamp AS created_at,
               12345::bigint AS monto_centavos),
      charges AS (SELECT 2 AS id, 3 AS student_id, 4 AS concept_id),
      students AS (SELECT 3 AS id, 992 AS campus_id,
        'Prueba calendario'::text AS nombre_completo, '1'::text AS grado,
        'CALENDARIO'::text AS id_referencia),
      concepts AS (SELECT 4 AS id, 'Prueba'::text AS nombre)`;
    const sqlRead = async (sql: string, params: any[] = []) =>
      execute(`${ctes} ${sql.replaceAll("NOW()", `'${instant}'::timestamptz`)}`, params);
    const seen: string[] = [];
    const query = vi.fn(async (sql: string, params: any[] = []) => {
      seen.push(sql);
      if (sql.includes("FROM payments p")) return sqlRead(sql, params);
      if (sql.startsWith("INSERT INTO cash_closures")) {
        const [, , userId, fecha, efectivo, registrado, banco, total, diferencia, pagos] = params;
        return { rows: [{ id: 1, fecha, closed_by_user_id: userId,
          efectivo_capturado_centavos: efectivo, efectivo_registrado_centavos: registrado,
          ingresos_bancarios_centavos: banco, total_cobrado_centavos: total,
          diferencia_efectivo_centavos: diferencia, pagos_procesados: pagos,
          created_at: new Date(instant), observaciones: null }] };
      }
      return { rows: [] };
    });
    vi.spyOn(pool, "query").mockImplementation(query as any);
    vi.spyOn(pool, "connect").mockResolvedValue({ query, release: vi.fn() } as any);

    const cash = await invoke("get", "/api/caja/pagos-efectivo");
    expect(cash.statusCode).toBe(200);
    expect(cash.body).toHaveLength(1);
    expect(Number(cash.body[0].monto_centavos)).toBe(12345);

    const closure = await invoke("post", "/api/caja/cerrar-dia", {
      efectivo_capturado_centavos: 12345,
    });
    expect(closure.statusCode).toBe(201);
    expect(closure.body.cierre).toMatchObject({
      fecha: day, efectivo_registrado_centavos: 12345,
      total_cobrado_centavos: 12345, pagos_procesados: 1,
    });

    const dashboard = await invoke("get", "/api/caja");
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toMatchObject({ pagos_hoy: 1, total_hoy: 12345 });
    expect(seen.filter(sql => sql.includes("FROM payments p"))).toHaveLength(3);
    expect(seen.filter(sql => sql.includes("FROM payments p")).every(sql =>
      sql.includes(schoolDateSQL("p.created_at")))).toBe(true);
    expect(seen.some(sql => sql.includes(SCHOOL_TODAY_SQL))).toBe(true);

    // The very same payment must not leak into the following local day's list.
    const next = new Date(day + "T12:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    const otherDay = await invoke("get", "/api/caja/pagos-efectivo", {}, {
      fecha: schoolDate(next),
    });
    expect(otherDay.body).toEqual([]);
  });

  it("acepta extraordinario que vence hoy local a las 19:30", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T01:30:00Z"));
    vi.spyOn(storage, "getStudentScoped").mockResolvedValue({ id: 3 } as any);
    vi.spyOn(storage, "getConceptScoped").mockResolvedValue({ id: 4, tipo: "extraordinario" } as any);
    vi.spyOn(pool, "query").mockResolvedValue({ rows: [] } as any);
    const create = vi.spyOn(storage, "createCharge").mockImplementation(async (charge: any) =>
      ({ ...charge, id: 5 }));
    const response = await invoke("post", "/api/admin/cargos/extraordinario", {
      student_id: 3, concept_id: 4, monto: 100,
      fecha_vencimiento: "2026-10-28", motivo_override: "Prueba con reloj fijo",
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      fecha_emision: "2026-10-28", fecha_vencimiento: "2026-10-28",
    }));
  });

  it.each(cases)("%s: SQL y JS coinciden independientemente de la hora real", async (_label, instant, day) => {
    const result = await execute(
      `SELECT ${schoolTodaySQL("$1::timestamptz")}::text AS hoy,
              ${schoolDateSQL("$2::timestamp")}::text AS pago,
              (${schoolTodaySQL("$1::timestamptz")} - $3::date)::int AS dias_vencido`,
      [instant, instant.slice(0, 19).replace("T", " "), day],
    );
    expect(result.rows[0]).toEqual({ hoy: day, pago: day, dias_vencido: 0 });
    expect(schoolDate(new Date(instant))).toBe(day);
  });

  it("no desplaza las fechas de calendario ya elegidas", () => {
    expect(schoolDate("2026-10-28")).toBe("2026-10-28");
  });
});
