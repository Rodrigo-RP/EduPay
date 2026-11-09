import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";

// El sincronizador importa la cola de auditoría, que a su vez abre la base; aquí se sustituye.
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: vi.fn() } }));

import { planFirebaseSync, studentKey, type BridgePayload, type LocalState } from "../lib/firebase-bridge-plan";
import { runFirebaseSync } from "../lib/firebase-bridge-sync";
import { fetchBridgePayload, idTokenFromServiceAccount, parseServiceAccountKey, BridgeError } from "../lib/firebase-bridge-client";

const SCHOOL = "ESC1";
const alumno = (uid: string, over: Record<string, unknown> = {}) => ({
  uid, estado: "activo", idEscuela: SCHOOL, nivel: "primaria", grado: "4to.", grupo: "A", turno: "Matutino",
  nombre: `Alu${uid}`, primerApellido: "Pérez", segundoApellido: "Soto", ...over,
});
const tutor = (uid: string, over: Record<string, unknown> = {}) => ({
  uid, estado: "activo", rol: "Padre de familia", idEscuela: SCHOOL, nombre: `Tut${uid}`, primerApellido: "Pérez",
  segundoApellido: null, email: `${uid}@correo.mx`, telefono: "4421234567", telefonoCasa: null, ...over,
});
const vinculo = (t: string, a: string, over: Record<string, unknown> = {}) => ({ tutorUid: t, alumnoUid: a, declaradoPorTutor: true, declaradoPorAlumno: false, ...over });
const payload = (over: Partial<Record<keyof BridgePayload, unknown>> = {}): BridgePayload => ({
  generadoEn: "2026-10-29T00:00:00Z", escuelas: [SCHOOL],
  alumnos: [alumno("a1"), alumno("a2")], tutores: [tutor("t1")], vinculos: [vinculo("t1", "a1"), vinculo("t1", "a2")], ...over,
} as BridgePayload);
const local = (over: Partial<LocalState> = {}): LocalState => ({
  tenantId: 8, firebaseIdEscuela: SCHOOL, campusByNivel: new Map([["primaria", 3], ["secundaria", 4]]),
  studentByUid: new Map(), guardianByUid: new Map(), existingLinks: new Set(), unlinkedStudentKeys: new Set(), unlinkedGuardianEmails: new Set(), ...over,
});

describe("Plan de sincronización Firebase → EduPay (sin base ni red)", () => {
  it("da de alta alumnos, tutor, una sola familia y los vínculos, sin tocar al responsable de pago", () => {
    const plan = planFirebaseSync(payload(), local());
    expect(plan.studentCreates.map((s) => s.uid)).toEqual(["a1", "a2"]);
    expect(plan.guardianCreates).toHaveLength(1);
    expect(plan.guardianCreates[0]).toMatchObject({ uid: "t1", email: "t1@correo.mx", campus_id: 3 });
    expect(plan.families).toHaveLength(1);
    expect(plan.studentCreates.every((s) => "newKey" in s.family && s.family.newKey === plan.families[0].key)).toBe(true);
    expect(plan.links).toHaveLength(2);
    expect(JSON.stringify(plan)).not.toContain("es_responsable_pago");
  });

  it("solo acepta el rol 'Padre de familia'; Padre/Madre y otros quedan fuera", () => {
    const plan = planFirebaseSync(payload({ tutores: [tutor("t1", { rol: "Padre/Madre" })] }), local());
    expect(plan.guardianCreates).toHaveLength(0);
    expect(plan.studentCreates).toHaveLength(0);
    expect(plan.report.skipped.tutor_rol_no_permitido).toBe(1);
  });

  it("omite alumnos cuyo nivel no tiene campus y también sus vínculos", () => {
    const plan = planFirebaseSync(payload({ alumnos: [alumno("a1", { nivel: "preescolar" })], vinculos: [vinculo("t1", "a1")] }), local());
    expect(plan.studentCreates).toHaveLength(0);
    expect(plan.links).toHaveLength(0);
    expect(plan.report.skipped.nivel_sin_campus).toBe(1);
    expect(plan.report.skipped.tutor_sin_alumnos_validos).toBe(1);
  });

  it("no hereda escuela: sin escuela o de otra escuela no entra", () => {
    const plan = planFirebaseSync(payload({ alumnos: [alumno("a1", { idEscuela: null }), alumno("a2", { idEscuela: "OTRA" })] }), local());
    expect(plan.studentCreates).toHaveLength(0);
    expect(plan.report.skipped.alumno_sin_escuela).toBe(1);
    expect(plan.report.skipped.escuela_no_habilitada).toBeGreaterThanOrEqual(1);
  });

  it("si el tenant no tiene firebase_id_escuela, no sincroniza nada", () => {
    const plan = planFirebaseSync(payload(), local({ firebaseIdEscuela: null }));
    expect(plan.studentCreates).toHaveLength(0);
    expect(plan.guardianCreates).toHaveLength(0);
  });

  it("no duplica altas manuales: tutor con el mismo correo o alumno con el mismo nombre y campus quedan en revisión", () => {
    const plan = planFirebaseSync(
      payload({ alumnos: [alumno("a1")], vinculos: [vinculo("t1", "a1")] }),
      local({ unlinkedGuardianEmails: new Set(["t1@correo.mx"]) }),
    );
    expect(plan.guardianCreates).toHaveLength(0);
    expect(plan.report.skipped.tutor_posible_duplicado).toBe(1);

    const p2 = planFirebaseSync(
      payload({ alumnos: [alumno("a1")], vinculos: [vinculo("t1", "a1")] }),
      local({ unlinkedStudentKeys: new Set([studentKey("Alua1 Pérez Soto", 3)]) }),
    );
    expect(p2.studentCreates).toHaveLength(0);
    expect(p2.report.skipped.alumno_posible_duplicado).toBe(1);
  });

  it("un vínculo no declarado por el tutor no cuenta (idPadre solo corrobora)", () => {
    const plan = planFirebaseSync(payload({ vinculos: [vinculo("t1", "a1", { declaradoPorTutor: false, declaradoPorAlumno: true })] }), local());
    expect(plan.links).toHaveLength(0);
    expect(plan.report.skipped.vinculo_no_declarado_por_tutor).toBe(1);
  });

  it("es idempotente: con todo ya enlazado no hay nada que crear", () => {
    const state = local({
      studentByUid: new Map([
        ["a1", { studentId: 11, campusId: 3, nivel: "primaria", grado: "4to.", grupo: "A", turno: "Matutino", status: "activo", familyId: 5 }],
        ["a2", { studentId: 12, campusId: 3, nivel: "primaria", grado: "4to.", grupo: "A", turno: "Matutino", status: "activo", familyId: 5 }],
      ]),
      guardianByUid: new Map([["t1", { guardianId: 21, email: "t1@correo.mx" }]]),
      existingLinks: new Set(["11:21", "12:21"]),
    });
    const plan = planFirebaseSync(payload(), state);
    expect(plan.report).toMatchObject({ studentsToCreate: 0, studentsToUpdate: 0, guardiansToCreate: 0, linksToCreate: 0, familiesToCreate: 0 });
  });

  it("cambios de grado/baja se actualizan; un estado manual (suspendido) no se pisa; vínculos que faltan solo se avisan", () => {
    const state = local({
      studentByUid: new Map([
        ["a1", { studentId: 11, campusId: 3, nivel: "primaria", grado: "3ro.", grupo: "A", turno: "Matutino", status: "activo", familyId: 5 }],
        ["a2", { studentId: 12, campusId: 3, nivel: "primaria", grado: "4to.", grupo: "A", turno: "Matutino", status: "suspendido", familyId: 5 }],
      ]),
      guardianByUid: new Map([["t1", { guardianId: 21, email: "otro@correo.mx" }]]),
      existingLinks: new Set(["11:21", "12:21", "12:99"]),
    });
    const plan = planFirebaseSync(
      payload({ alumnos: [alumno("a1", { estado: "baja" }), alumno("a2", { estado: "baja" })] }),
      state,
    );
    expect(plan.studentUpdates.find((u) => u.uid === "a1")?.fields).toMatchObject({ grado: "4to.", status: "baja" });
    expect(plan.studentUpdates.find((u) => u.uid === "a2")).toBeUndefined();
    expect(plan.report.warnings.correoDeTutorCambio).toBe(1);
    expect(plan.guardianCreates).toHaveLength(0);
  });

  it("un alumno nuevo con hermano ya enlazado se une a su familia existente", () => {
    const state = local({
      studentByUid: new Map([["a1", { studentId: 11, campusId: 3, nivel: "primaria", grado: "4to.", grupo: "A", turno: "Matutino", status: "activo", familyId: 5 }]]),
      guardianByUid: new Map([["t1", { guardianId: 21, email: "t1@correo.mx" }]]),
      existingLinks: new Set(["11:21"]),
    });
    const plan = planFirebaseSync(payload(), state);
    expect(plan.studentCreates).toHaveLength(1);
    expect(plan.studentCreates[0].family).toEqual({ existingId: 5 });
    expect(plan.families).toHaveLength(0);
  });

  it("cuenta alumnos con varios tutores para que la escuela marque al responsable", () => {
    const plan = planFirebaseSync(payload({ tutores: [tutor("t1"), tutor("t2")], vinculos: [vinculo("t1", "a1"), vinculo("t2", "a1")], alumnos: [alumno("a1")] }), local());
    expect(plan.report.alumnosConVariosTutores).toBe(1);
    expect(plan.links).toHaveLength(2);
  });
});

function fakeDb(rowsFor: (sql: string) => any[] = () => []) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql.replace(/\s+/g, " ").trim());
    if (/FROM tenants WHERE id/.test(sql)) return { rows: [{ id: 8, firebase_id_escuela: SCHOOL }], rowCount: 1 };
    if (/INSERT INTO (guardians|students|families)/.test(sql)) return { rows: [{ id: calls.length }], rowCount: 1 };
    if (/INSERT INTO external_identities/.test(sql)) return { rows: [], rowCount: 1 };
    return { rows: /FROM firebase_campus_map/.test(sql) ? [{ nivel: "primaria", campus_id: 3 }] : rowsFor(sql), rowCount: 0 };
  });
  const release = vi.fn();
  return { db: { connect: vi.fn(async () => ({ query, release })) } as any, calls, query, release };
}

describe("Aplicación del plan (conexión simulada)", () => {
  it("dry-run: transacción de solo lectura, ningún INSERT/UPDATE/DELETE", async () => {
    const { db, calls } = fakeDb();
    const res = await runFirebaseSync({ db, tenantId: 8, payload: payload(), apply: false });
    expect(res.applied).toBe(false);
    expect(res.report.studentsToCreate).toBe(2);
    expect(calls[0]).toBe("BEGIN READ ONLY");
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(calls.some((c) => /^(INSERT|UPDATE|DELETE)/.test(c))).toBe(false);
  });

  it("apply: toma el candado, escribe en una transacción, vínculos sin pisar y audita después del COMMIT", async () => {
    const { db, calls } = fakeDb();
    const res = await runFirebaseSync({ db, tenantId: 8, payload: payload(), apply: true });
    expect(res.applied).toBe(true);
    expect(calls[0]).toBe("BEGIN");
    expect(calls[1]).toContain("pg_advisory_xact_lock");
    const commit = calls.indexOf("COMMIT");
    expect(commit).toBeGreaterThan(0);
    expect(calls.filter((c) => c.startsWith("INSERT INTO student_guardian"))).toHaveLength(2);
    expect(calls.find((c) => c.startsWith("INSERT INTO student_guardian"))).toContain("ON CONFLICT DO NOTHING");
    expect(calls.find((c) => c.startsWith("INSERT INTO student_guardian"))).not.toContain("es_responsable_pago");
    expect(calls.some((c) => /\b(charges|payments|payment_applications|scholarships)\b/.test(c) && /^(INSERT|UPDATE|DELETE)/.test(c))).toBe(false);
    expect(calls.findIndex((c) => c.startsWith("INSERT INTO audit_log"))).toBeGreaterThan(commit);
  });

  it("si algo falla a la mitad, hace ROLLBACK y no audita", async () => {
    const { db, calls, query } = fakeDb();
    query.mockImplementation(async (sql: string) => {
      calls.push(sql.replace(/\s+/g, " ").trim());
      if (/FROM tenants WHERE id/.test(sql)) return { rows: [{ id: 8, firebase_id_escuela: SCHOOL }], rowCount: 1 } as any;
      if (/INSERT INTO students/.test(sql)) throw new Error("boom");
      if (/INSERT INTO (guardians|families)/.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 } as any;
      if (/INSERT INTO external_identities/.test(sql)) return { rows: [], rowCount: 1 } as any;
      return { rows: /FROM firebase_campus_map/.test(sql) ? [{ nivel: "primaria", campus_id: 3 }] : [], rowCount: 0 } as any;
    });
    await expect(runFirebaseSync({ db, tenantId: 8, payload: payload(), apply: true })).rejects.toThrow("boom");
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(calls.some((c) => c.startsWith("INSERT INTO audit_log"))).toBe(false);
  });

  it("un uid de Firebase ya vinculado a otra persona cancela toda la corrida", async () => {
    const { db, calls, query } = fakeDb();
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => (/INSERT INTO external_identities/.test(sql) ? ({ rows: [], rowCount: 0 } as any) : base(sql)));
    await expect(runFirebaseSync({ db, tenantId: 8, payload: payload(), apply: true })).rejects.toThrow(/ya está vinculado/);
    expect(calls).toContain("ROLLBACK");
  });
});

describe("Cliente del puente", () => {
  const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

  it("firma el JWT de la cuenta de servicio con RS256 y target_audience = URL de la función", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = parseServiceAccountKey(JSON.stringify({ client_email: "edupay@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }));
    let body = "";
    const fetchImpl = vi.fn(async (_u: string, init?: any) => { body = init.body; return okJson({ id_token: "ID.TOKEN.X" }) as any; });
    const token = await idTokenFromServiceAccount(key, "https://f.example/fn", fetchImpl as any, () => 1_800_000_000_000);
    expect(token).toBe("ID.TOKEN.X");
    const assertion = new URLSearchParams(body).get("assertion")!;
    const [h, c, s] = assertion.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({ iss: key.client_email, target_audience: "https://f.example/fn", exp: 1_800_000_300 });
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("llama con Bearer, audiencia sin query, y valida la forma de la respuesta", async () => {
    const fetchImpl = vi.fn(async (_u: string, _i?: any) => okJson({ generadoEn: "x", escuelas: [SCHOOL], alumnos: [alumno("a1")], tutores: [tutor("t1")], vinculos: [vinculo("t1", "a1")], reporte: {} }) as any);
    const audiences: string[] = [];
    const out = await fetchBridgePayload({ url: "https://f.example/fn", fetchImpl: fetchImpl as any, getIdToken: async (a) => { audiences.push(a); return "TOK"; } }, SCHOOL);
    expect(out.alumnos).toHaveLength(1);
    expect(audiences).toEqual(["https://f.example/fn"]);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://f.example/fn?idEscuela=${SCHOOL}`);
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe("Bearer TOK");
  });

  it("rechaza http sin TLS, HTTP de error y respuestas fuera de contrato", async () => {
    await expect(fetchBridgePayload({ url: "http://f.example/fn", getIdToken: async () => "T" })).rejects.toMatchObject({ code: "config" });
    const bad = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => "" }));
    await expect(fetchBridgePayload({ url: "https://f.example/fn", fetchImpl: bad as any, getIdToken: async () => "T" })).rejects.toMatchObject({ code: "http" });
    const weird = vi.fn(async () => okJson({ alumnos: "nope" }) as any);
    await expect(fetchBridgePayload({ url: "https://f.example/fn", fetchImpl: weird as any, getIdToken: async () => "T" })).rejects.toBeInstanceOf(BridgeError);
  });
});
