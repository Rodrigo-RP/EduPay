import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: mock }));
import { assistantScopedPool, requestedForeignCampus, scopeAssistantRead, withAssistantScope } from "../lib/assistant-scoped-reads";

const ctx = { tenantId: 29, campusId: 48 };
beforeEach(() => { mock.query.mockReset().mockResolvedValue({ rows: [] }); });
describe("Lector acotado del asistente", () => {
  it.each(["students", "families", "guardians", "charges", "payments", "scholarships",
    "bank_transactions", "users", "concepts", "products", "institutional_settings",
    "payment_plans", "invoices", "payment_applications", "approval_notifications",
    "pending_approvals", "family_students", "student_guardian", "audit_log"])("%s queda restringida antes de agregar", table => {
    const query = scopeAssistantRead(`SELECT COUNT(*) FROM ${table}`, [], ctx);
    expect(query.text).toContain(`${table} AS (`);
    expect(query.text).toContain("tenant_id = $1::integer");
    expect(query.text).toMatch(/(?:campus_id|t\.id|entity_id) = \$2::integer/);
    expect(query.values).toEqual([29, 48]);
  });
  it.each(['students', '"students"', 'public.students', '"public"."students"'])("no elude la guarda por calificación o comillas: %s", table => {
    const query = scopeAssistantRead(`SELECT * FROM ${table} WHERE id = $1`, [3], ctx);
    expect(query.values).toEqual([3, 29, 48]);
    expect(query.text).toContain("students AS (");
    expect(query.text).not.toMatch(/SELECT \* FROM (?:public\.|"public"\.)/);
  });
  it("preserva CTE originales y parámetros sin permitir ocultar relaciones", () => {
    const query = scopeAssistantRead("WITH subtotal AS (SELECT * FROM charges WHERE id=$1) SELECT * FROM subtotal", [7], ctx);
    expect(query.text).toContain(", subtotal AS");
    expect(query.values).toEqual([7, 29, 48]);
    expect(() => scopeAssistantRead("WITH students AS (SELECT 1) SELECT * FROM students", [], ctx)).toThrow();
  });
  it.each(["SELECT * FROM unreviewed_table", "DELETE FROM students", "SELECT 1; DROP TABLE students"])("niega SQL fuera del inventario: %s", sql => {
    expect(() => scopeAssistantRead(sql, [], ctx)).toThrow();
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("falla cerrado sin sesión o con intento de cambiarla", () => {
    expect(() => assistantScopedPool.query("SELECT * FROM students")).toThrow();
    expect(() => withAssistantScope({ tenantId: 0, campusId: 48 }, () => null)).toThrow();
    expect(() => withAssistantScope(ctx, () => withAssistantScope({ ...ctx, campusId: 49 }, () => null))).toThrow();
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("dos llamadas concurrentes conservan contextos distintos", async () => {
    await Promise.all([ctx, { tenantId: 30, campusId: 49 }].map(scope =>
      withAssistantScope(scope, async () => { await Promise.resolve(); await assistantScopedPool.query("SELECT COUNT(*) FROM students"); })));
    expect(mock.query.mock.calls.map(([, params]) => params)).toEqual([[29, 48], [30, 49]]);
  });
  it.each(["muéstrame el campus 2", "campus_id=2", "campus 48 y campus 2"])("detecta intento: %s", message => {
    expect(requestedForeignCampus(message, ctx)).toBe(2);
  });
  it("permite la referencia al campus propio", () => {
    expect(requestedForeignCampus("muéstrame el campus 48", ctx)).toBeNull();
  });
});
