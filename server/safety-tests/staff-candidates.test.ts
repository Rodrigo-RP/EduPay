import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ pool: { query: vi.fn() } }));
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn(), auditLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { assignStaffCandidate, listStaffCandidates, revokeStaffCandidate } from "../lib/staff-candidates";
import { SsoError } from "../lib/sso/assertion";

interface World {
  candidate?: any; campusOk?: boolean; identity?: any; emailTaken?: boolean; insertUserError?: any; revokeIdentity?: any;
}

function fakeDb(w: World) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    calls.push({ sql, params });
    if (/^DELETE FROM external_identities/.test(sql)) return { rows: w.revokeIdentity ? [w.revokeIdentity] : [] };
    if (/FROM firebase_staff_candidates WHERE id/.test(sql)) return { rows: w.candidate ? [w.candidate] : [] };
    if (/FROM campuses WHERE id/.test(sql)) return { rows: w.campusOk === false ? [] : [{ id: params[0] }] };
    if (/FROM external_identities WHERE provider = 'firebase' AND subject/.test(sql)) return { rows: w.identity ? [w.identity] : [] };
    if (/FROM users WHERE lower\(email\)/.test(sql)) return { rows: w.emailTaken ? [{}] : [] };
    if (/^INSERT INTO users/.test(sql)) { if (w.insertUserError) throw w.insertUserError; return { rows: [{ id: 50 }] }; }
    if (/^INSERT INTO external_identities/.test(sql)) return { rows: [{ id: 60 }] };
    return { rows: [] };
  });
  const release = vi.fn();
  return { db: { connect: vi.fn(async () => ({ query, release })), query } as any, calls, release };
}

const cand = (over: Record<string, unknown> = {}) => ({ id: 1, tenant_id: 7, firebase_uid: "uidP1", nombre_completo: "Ana Gómez", email: "ana@escuela.mx", estado: "activo", ...over });
const input = (over: Record<string, unknown> = {}) => ({ candidateId: 1, role: "contador_general", campusId: 3, actorId: 9, ...over });

describe("Asignar un candidato de personal (solo superadmin; aquí se prueba el servicio)", () => {
  it("crea el usuario y el vínculo en una transacción, con contraseña aleatoria y el rol elegido en EduPay", async () => {
    const { db, calls, release } = fakeDb({ candidate: cand() });
    const res = await assignStaffCandidate(db, input({ customPermissions: ["reports.export"] }));
    expect(res).toMatchObject({ userId: 50, identityId: 60, tenantId: 7, role: "contador_general", campusId: 3 });
    const sqls = calls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.at(-1)).toBe("COMMIT");
    const insertUser = calls.find((c) => c.sql.startsWith("INSERT INTO users"))!;
    expect(insertUser.params.slice(0, 3)).toEqual([7, 3, "ana@escuela.mx"]);
    expect(insertUser.params[3]).toMatch(/^\$2[aby]\$/); // hash bcrypt, nunca la contraseña
    expect(insertUser.params[5]).toBe("contador_general");
    expect(insertUser.params[6]).toEqual(["reports.export"]);
    expect(insertUser.sql).toContain("is_super_admin") ;
    expect(insertUser.sql).toMatch(/true, false/); // activo y NO superadmin
    const link = calls.find((c) => c.sql.startsWith("INSERT INTO external_identities"))!;
    expect(link.params).toEqual(["uidP1", 7, 50, 9]);
    expect(release).toHaveBeenCalled();
  });

  it("no acepta super_admin ni roles inventados", async () => {
    for (const role of ["super_admin", "director", ""]) {
      const { db, calls } = fakeDb({ candidate: cand() });
      await expect(assignStaffCandidate(db, input({ role }))).rejects.toBeInstanceOf(SsoError);
      expect(calls).toHaveLength(0);
    }
  });

  it("rechaza permisos que no existen", async () => {
    const { db } = fakeDb({ candidate: cand() });
    await expect(assignStaffCandidate(db, input({ customPermissions: ["todo.todo"] }))).rejects.toThrow(/permisos/);
  });

  it("rechaza candidatos inexistentes, de baja o ya vinculados, con ROLLBACK", async () => {
    for (const [w, re] of [
      [{ candidate: undefined }, /no existe/],
      [{ candidate: cand({ estado: "baja" }) }, /de baja/],
      [{ candidate: cand(), identity: { id: 1 } }, /ya tiene acceso/],
    ] as Array<[World, RegExp]>) {
      const { db, calls } = fakeDb(w);
      await expect(assignStaffCandidate(db, input())).rejects.toThrow(re);
      expect(calls.at(-1)!.sql).toBe("ROLLBACK");
      expect(calls.some((c) => c.sql.startsWith("INSERT INTO users"))).toBe(false);
    }
  });

  it("el campus debe ser de la escuela del candidato", async () => {
    const { db, calls } = fakeDb({ candidate: cand(), campusOk: false });
    await expect(assignStaffCandidate(db, input())).rejects.toThrow(/campus/);
    expect(calls.find((c) => /FROM campuses/.test(c.sql))!.params).toEqual([3, 7]);
    expect(calls.some((c) => c.sql.startsWith("INSERT INTO users"))).toBe(false);
  });

  it("nunca reutiliza un usuario existente por coincidir el correo (no se vincula por correo)", async () => {
    const { db, calls } = fakeDb({ candidate: cand(), emailTaken: true });
    await expect(assignStaffCandidate(db, input())).rejects.toThrow(/Ya existe un usuario/);
    expect(calls.some((c) => c.sql.startsWith("INSERT INTO external_identities"))).toBe(false);
  });

  it("sin correo en el Dashboard exige uno válido", async () => {
    const { db } = fakeDb({ candidate: cand({ email: null }) });
    await expect(assignStaffCandidate(db, input())).rejects.toThrow(/correo/);
    const ok = fakeDb({ candidate: cand({ email: null }) });
    await expect(assignStaffCandidate(ok.db, input({ email: "Ana@Escuela.mx" }))).resolves.toMatchObject({ userId: 50 });
    expect(ok.calls.find((c) => c.sql.startsWith("INSERT INTO users"))!.params[2]).toBe("ana@escuela.mx");
  });

  it("una carrera (violación de unicidad) se traduce a 'ya tiene acceso' y revierte", async () => {
    const { db, calls } = fakeDb({ candidate: cand(), insertUserError: Object.assign(new Error("dup"), { code: "23505" }) });
    await expect(assignStaffCandidate(db, input())).rejects.toMatchObject({ code: "already_linked" });
    expect(calls.at(-1)!.sql).toBe("ROLLBACK");
  });
});

describe("Revocar acceso", () => {
  it("desvincula el uid y desactiva al usuario sin borrarlo", async () => {
    const { db, calls } = fakeDb({ candidate: { tenant_id: 7, firebase_uid: "uidP1" }, revokeIdentity: { user_id: 50 } });
    expect(await revokeStaffCandidate(db, 1)).toEqual({ tenantId: 7, userId: 50 });
    const update = calls.find((c) => c.sql.startsWith("UPDATE users"))!;
    expect(update.sql).toContain("is_active = false");
    expect(update.sql).toContain("password_changed_at = now()"); // invalida sesiones vigentes
    expect(calls.some((c) => /^DELETE FROM users/.test(c.sql))).toBe(false);
    expect(calls.at(-1)!.sql).toBe("COMMIT");
  });

  it("sin acceso vinculado no hace nada", async () => {
    const { db, calls } = fakeDb({ candidate: { tenant_id: 7, firebase_uid: "uidP1" } });
    expect(await revokeStaffCandidate(db, 1)).toBeNull();
    expect(calls.some((c) => c.sql.startsWith("UPDATE users"))).toBe(false);
    expect(calls.at(-1)!.sql).toBe("ROLLBACK");
  });
});

describe("Listado", () => {
  it("sugiere campus por nivel de registroSep y marca al que ya tiene usuario", async () => {
    const query = vi.fn(async (sql: string) => {
      if (/FROM firebase_staff_candidates/.test(sql)) return { rows: [
        { id: 1, tenant_id: 7, firebase_uid: "u1", nombre_completo: "Ana", email: null, rol_dashboard: "Director", estado: "activo", synced_at: "2026-11-18T00:00:00Z",
          registro_sep: [{ clave: "22PPR0186I", nivel: "Primaria" }], user_id: 50, user_role: "administrador_campus", user_campus_id: 3, user_is_active: true, user_custom_permissions: null },
        { id: 2, tenant_id: 7, firebase_uid: "u2", nombre_completo: "Beto", email: "b@e.mx", rol_dashboard: "Maestro", estado: "activo", synced_at: "2026-11-18T00:00:00Z",
          registro_sep: [], user_id: null },
      ] };
      return { rows: [{ tenant_id: 7, nivel: "primaria", campus_id: 3 }] };
    });
    const rows = await listStaffCandidates({ query } as any, 7);
    expect(rows[0].campus_sugeridos).toEqual([3]);
    expect(rows[0].usuario).toMatchObject({ id: 50, role: "administrador_campus", custom_permissions: [] });
    expect(rows[1].usuario).toBeNull();
    expect(rows[1].campus_sugeridos).toEqual([]);
  });
});
