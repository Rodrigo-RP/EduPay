import { describe, expect, it, vi } from "vitest";
import { guardianResponsibilityHandler } from "../lib/guardian-responsibility";

const relation = (id: number, active: boolean, percentage = "100.00") => ({
  guardian_id: id, es_responsable_pago: active, porcentaje_responsabilidad: percentage,
});

async function run(body: unknown, options: {
  rows?: any[]; student?: boolean; auditFails?: boolean; params?: any; user?: any;
} = {}) {
  const rows = options.rows ?? [relation(2, false), relation(3, true)];
  const query = vi.fn(async (sql: string, args?: any[]) => {
    if (sql.startsWith("SELECT id FROM students")) {
      return { rows: options.student === false ? [] : [{ id: 1 }] };
    }
    if (sql.includes("FROM student_guardian")) return { rows };
    if (sql.startsWith("UPDATE")) return { rows: [{
      student_id: 1, guardian_id: 2, es_responsable_pago: args?.[0],
      porcentaje_responsabilidad: args?.[1] ?? rows[0]?.porcentaje_responsabilidad,
    }] };
    if (sql.includes("INSERT INTO audit_log") && options.auditFails) throw new Error("audit unavailable");
    return { rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await guardianResponsibilityHandler({ connect } as any)({
    params: options.params ?? { studentId: "1", guardianId: "2" }, body,
    user: options.user ?? { id: 7, tenant_id: 8, campus_id: 9 },
  } as any, res as any);
  return { query, connect, release, res };
}

describe("Responsabilidad financiera (sin conexión a bases reales)", () => {
  it("activa, advierte sobre otro 100 %, y audita antes del commit", async () => {
    const { query, release, res } = await run({ es_responsable_pago: true });
    expect(query.mock.calls[1][1]).toEqual([1, 8, 9]);
    expect(query.mock.calls[1][0]).toContain("FOR UPDATE");
    expect(query.mock.calls[2][0]).toContain("FOR UPDATE");
    const audit = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO audit_log"))!;
    expect(audit[1]?.slice(0, 5)).toEqual([8, 7, "update_guardian_responsibility", "student_guardian", 1]);
    expect(JSON.parse(audit[1]![5])).toMatchObject({
      guardian_id: 2, before: { es_responsable_pago: false }, after: { es_responsable_pago: true },
    });
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(res.json.mock.calls[0][0].warning).toContain("100 %");
    expect(release).toHaveBeenCalledOnce();
  });

  it("desactiva sin modificar la proporción ni otros tutores", async () => {
    const { query, res } = await run({ es_responsable_pago: false }, {
      rows: [relation(2, true, "60.00"), relation(3, true, "40.00")],
    });
    expect(res.json.mock.calls[0][0]).toMatchObject({ es_responsable_pago: false, porcentaje_responsabilidad: "60.00", warning: null });
    expect(query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"))?.[1]).toEqual([false, null, 1, 2]);
  });

  it("no advierte si el otro responsable tiene una proporción menor", async () => {
    const { res } = await run({ es_responsable_pago: true }, { rows: [relation(2, false), relation(3, true, "50.00")] });
    expect(res.json.mock.calls[0][0].warning).toBeNull();
  });

  it("rechaza dejar al alumno sin responsable", async () => {
    const { query, res } = await run({ es_responsable_pago: false }, { rows: [relation(2, true)] });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it.each([{}, { es_responsable_pago: "false" }, { es_responsable_pago: null },
    { es_responsable_pago: 1 }, { es_responsable_pago: true, tenant_id: 4 },
    { porcentaje_responsabilidad: 101 }])("rechaza payload inválido %j antes de conectar", async (body) => {
    const { connect, res } = await run(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rechaza IDs parciales", async () => {
    const { connect, res } = await run({ es_responsable_pago: true }, { params: { studentId: "1xyz", guardianId: "2" } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rechaza sesión sin ámbito completo", async () => {
    const { connect, res } = await run({ es_responsable_pago: true }, { user: { id: 7, tenant_id: 8 } });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(connect).not.toHaveBeenCalled();
  });

  it("oculta alumnos de otro tenant o campus", async () => {
    const { query, res } = await run({ es_responsable_pago: true }, { student: false });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it("rechaza tutor no vinculado", async () => {
    const { query, res } = await run({ es_responsable_pago: true }, { rows: [relation(3, true)] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it("revierte si falla la auditoría; nunca anuncia éxito", async () => {
    const { query, res } = await run({ es_responsable_pago: true }, { auditFails: true });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("es_responsable_pago");
  });
});
