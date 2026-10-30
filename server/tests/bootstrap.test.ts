import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { bootstrapInstitution, BootstrapError, changeInitialPassword, type BootstrapClient } from "../lib/bootstrap";

const body = {
  institutionName: "Institución de prueba", rfc: "XAXX010101000",
  campusName: "Campus de prueba", adminName: "Administrador de prueba",
  adminEmail: "initial@example.invalid",
};
function fixture(occupied = false, failAudit = false) {
  const state = { occupied, writes: 0, committed: false, hash: "", audit: "" };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("AS occupied")) return { rows: [{ occupied: state.occupied }] };
    if (sql.startsWith("INSERT")) {
      state.writes++;
      if (sql.includes("INSERT INTO audit_retry_queue")) {
        if (failAudit) throw new Error("Falla simulada de outbox");
        state.audit = String(values?.[0]);
      }
      if (sql.includes("INSERT INTO users")) state.hash = String(values?.[4]);
      return { rows: [{ id: state.writes }] };
    }
    if (sql === "COMMIT") { state.occupied = true; state.committed = true; }
    if (sql === "ROLLBACK") state.writes = 0;
    return { rows: [] };
  });
  const client: BootstrapClient = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  const token = randomBytes(32).toString("hex");
  const env = { APP_ENV: "production", BOOTSTRAP_TOKEN: token };
  return { state, query, pool, token, env };
}

describe("primer administrador de una sola vez", () => {
  it("token incorrecto: no conecta ni ejecuta SQL", async () => {
    const f = fixture();
    await expect(bootstrapInstitution(f.pool, body, randomBytes(32).toString("hex"), f.env)).rejects.toMatchObject({ status: 403 });
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("base no vacía: rechaza sin INSERT ni COMMIT", async () => {
    const f = fixture(true);
    await expect(bootstrapInstitution(f.pool, body, f.token, f.env)).rejects.toMatchObject({ status: 409 });
    expect(f.state.writes).toBe(0);
    expect(f.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    expect(f.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
  });
  it("crea institución, campus, admin general, marcador y outbox; segundo uso rechazado", async () => {
    const f = fixture();
    const result = await bootstrapInstitution(f.pool, body, f.token, f.env);
    expect(result.requiresPasswordChange).toBe(true);
    expect(await bcrypt.compare(result.temporaryPassword, f.state.hash)).toBe(true);
    expect(f.state.committed).toBe(true);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("'administrador_general', true, false"))).toBe(true);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("jsonb_build_object('_bootstrap'"))).toBe(true);
    expect(f.state.audit).toContain("bootstrap_completed");
    expect(f.state.audit.includes(f.token) || f.state.audit.includes(result.temporaryPassword) || f.state.audit.includes(f.state.hash)).toBe(false);
    const writes = f.state.writes;
    await expect(bootstrapInstitution(f.pool, body, f.token, f.env)).rejects.toBeInstanceOf(BootstrapError);
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT"))).toHaveLength(writes);
  });
  it("si falla el outbox se revierte todo y no entrega contraseña ni éxito", async () => {
    const f = fixture(false, true);
    await expect(bootstrapInstitution(f.pool, body, f.token, f.env)).rejects.toThrow("Falla simulada");
    expect(f.state.committed).toBe(false);
    expect(f.state.writes).toBe(0);
  });
  it("sin secreto, fuera de producción o cuerpo inválido: no conecta", async () => {
    const f = fixture();
    for (const env of [{}, { ...f.env, APP_ENV: "development" }]) {
      await expect(bootstrapInstitution(f.pool, body, f.token, env)).rejects.toMatchObject({ status: 503 });
    }
    await expect(bootstrapInstitution(f.pool, { ...body, adminEmail: "" }, f.token, f.env)).rejects.toMatchObject({ status: 400 });
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("un reintento de cambio inicial no escribe auditoría ni confirma", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const pool = { connect: async () => ({ query, release() {} }) };
    await expect(changeInitialPassword(pool, { id: 1, tenantId: 1, campusId: 1 }, randomBytes(32).toString("hex"), randomBytes(32).toString("hex"))).rejects.toMatchObject({ status: 409 });
    expect(query.mock.calls).toHaveLength(3); // BEGIN, UPDATE sin filas, ROLLBACK.
  });
});
