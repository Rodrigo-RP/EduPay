import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ pool: { query: vi.fn() } }));
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn(), auditLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { isStaffExcludedFromCandidates } from "../lib/staff-exclusions";
import { assignStaffCandidate, listStaffCandidates } from "../lib/staff-candidates";
import { planFirebaseSync } from "../lib/firebase-bridge-plan";
import { SsoError } from "../lib/sso/assertion";

describe("Departamentos de personal excluidos de 'Personal del Dashboard'", () => {
  it("solo aplica a rol Administrativo y a los seis departamentos acordados (sin importar acentos, mayúsculas ni espacios)", () => {
    for (const d of ["Recepción", "recepcion", "Limpieza", "  Responsable   Limpieza ", "VIGILANCIA", "Director de Área", "director de area", "Mantenimiento"]) {
      expect(isStaffExcludedFromCandidates("Administrativo", d), d).toBe(true);
    }
    expect(isStaffExcludedFromCandidates("administrativo", "Recepción")).toBe(true);
  });

  it("no excluye otros departamentos, otros roles ni datos vacíos", () => {
    expect(isStaffExcludedFromCandidates("Administrativo", "Contabilidad")).toBe(false);
    expect(isStaffExcludedFromCandidates("Administrativo", "Director General")).toBe(false);
    expect(isStaffExcludedFromCandidates("Director", "Recepción")).toBe(false);
    expect(isStaffExcludedFromCandidates("Administrativo", null)).toBe(false);
    expect(isStaffExcludedFromCandidates(null, "Limpieza")).toBe(false);
    expect(isStaffExcludedFromCandidates("Administrativo", "Limpiezas")).toBe(false);
  });
});

const SCHOOL = "ESC1";
const person = (uid: string, over: Record<string, unknown> = {}) => ({
  uid, estado: "activo", rol: "Administrativo", departamento: "Contabilidad", idEscuela: SCHOOL, nombre: `P${uid}`, primerApellido: "Gómez",
  segundoApellido: null, email: `${uid}@escuela.mx`, registroSep: [], ...over,
});
const payload = (personal: unknown[]) => ({ generadoEn: new Date().toISOString(), escuelas: [SCHOOL], alumnos: [], tutores: [], vinculos: [], personal } as any);
const local = (extra: Record<string, unknown> = {}) => ({
  tenantId: 8, firebaseIdEscuela: SCHOOL, campusByNivel: new Map([["primaria", 3]]), studentByUid: new Map(), guardianByUid: new Map(),
  existingLinks: new Set(), unlinkedStudentKeys: new Set(), unlinkedGuardianEmails: new Set(), staffByUid: new Map(), ...extra,
} as any);

describe("Sincronización: los departamentos excluidos no se vuelven candidatos", () => {
  it("omite a Recepción, Limpieza, etc. y conserva al resto", () => {
    const plan = planFirebaseSync(payload([
      person("a", { departamento: "Recepción" }), person("b", { departamento: "Mantenimiento" }), person("c", { departamento: "Director de Área" }),
      person("d"), person("e", { rol: "Director", departamento: "Recepción" }),
    ]), local());
    expect(plan.report.skipped.personal_departamento_excluido).toBe(3);
    expect(plan.staffUpserts.map((s) => s.uid).sort()).toEqual(["d", "e"]);
  });

  it("una baja de alguien con departamento excluido y usuario vinculado SÍ desactiva al usuario", () => {
    const linked = new Map([["a", { userId: 50, role: "asistente", isActive: true, isSuperAdmin: false }]]);
    const plan = planFirebaseSync(payload([person("a", { departamento: "Vigilancia", estado: "baja" })]), local({ linkedStaffUsers: linked }));
    expect(plan.userDeactivations.map((d) => d.userId)).toEqual([50]);
    expect(plan.staffUpserts).toEqual([]);
  });
});

describe("Listado y asignación respetan la exclusión", () => {
  const row = (id: number, departamento: string, user_id: number | null) => ({
    id, tenant_id: 7, firebase_uid: `u${id}`, nombre_completo: `P${id}`, email: `p${id}@e.mx`, rol_dashboard: "Administrativo", departamento,
    estado: "activo", synced_at: "2026-11-18T00:00:00Z", registro_sep: [], user_id, user_role: "asistente", user_campus_id: 3, user_is_active: true, user_custom_permissions: null,
  });

  it("no lista a los excluidos, salvo que ya tengan usuario vinculado (para poder quitarles el acceso)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (/FROM firebase_staff_candidates/.test(sql)) return { rows: [row(1, "Recepción", null), row(2, "Limpieza", 50), row(3, "Contabilidad", null)] };
      return { rows: [] };
    });
    const rows = await listStaffCandidates({ query } as any, 7);
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });

  it("rechaza asignar acceso a un departamento excluido y revierte", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (text: string) => {
      const sql = text.replace(/\s+/g, " ").trim();
      calls.push(sql);
      if (/FROM firebase_staff_candidates WHERE id/.test(sql)) {
        return { rows: [{ id: 1, tenant_id: 7, firebase_uid: "u1", nombre_completo: "Ana", email: "a@e.mx", estado: "activo", rol_dashboard: "Administrativo", departamento: "Limpieza" }] };
      }
      return { rows: [] };
    });
    const db = { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as any;
    await expect(assignStaffCandidate(db, { candidateId: 1, role: "contador_general", campusId: 3, actorId: 9 })).rejects.toBeInstanceOf(SsoError);
    expect(calls.some((s) => s.startsWith("INSERT INTO users"))).toBe(false);
    expect(calls).toContain("ROLLBACK");
  });
});
