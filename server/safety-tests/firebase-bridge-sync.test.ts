import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";

// El sincronizador importa la cola de auditoría, que a su vez abre la base; aquí se sustituye.
vi.mock("../audit-retry", () => ({ enqueueAuditLog: vi.fn() }));
vi.mock("../db", () => ({ pool: { query: vi.fn() } }));

import { planFirebaseSync, studentKey, normalizeCct, evaluateGuards, type BridgePayload, type LocalState, type LocalLinkedUser } from "../lib/firebase-bridge-plan";
import { runFirebaseSync, SyncGuardError, SyncBusyError } from "../lib/firebase-bridge-sync";
import { enqueueAuditLog } from "../audit-retry";
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
  studentByUid: new Map(), guardianByUid: new Map(), existingLinks: new Set(), unlinkedStudentKeys: new Set(), unlinkedGuardianEmails: new Set(), staffByUid: new Map(), ...over,
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

  it("un teléfono de más de 20 caracteres no tumba la importación: se omite el dato y se cuenta", () => {
    const largo = "442 123 4567 / 442 765 4321 ext. 12"; // 35 caracteres: no cabe en varchar(20)
    const plan = planFirebaseSync(
      payload({ tutores: [tutor("t1", { telefono: largo, telefonoCasa: "4421112222" })] }),
      local(),
    );
    expect(plan.guardianCreates).toHaveLength(1);
    expect(plan.guardianCreates[0].celular).toBeNull();
    expect(plan.guardianCreates[0].telefono_casa_oficina).toBe("4421112222");
    expect(plan.report.warnings.telefonoOmitidoPorLargo).toBe(1);
    const maximo = plan.guardianCreates.flatMap((g) => [g.celular, g.telefono_casa_oficina]).filter(Boolean) as string[];
    expect(maximo.every((v) => v.length <= 20)).toBe(true);
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
    // Candado por escuela, sin esperar: si hay otra corrida en curso, ésta se omite (ver la prueba de SyncBusyError).
    expect(calls[1]).toContain("pg_try_advisory_xact_lock");
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

const personal = (uid: string, over: Record<string, unknown> = {}) => ({
  uid, estado: "activo", rol: "Administrativo", idEscuela: SCHOOL, nombre: `Per${uid}`, primerApellido: "Gómez", segundoApellido: null,
  email: `${uid}@escuela.mx`, registroSep: [{ clave: "CCT 22PPR0186I", nivel: "Primaria" }], ...over,
});

describe("Personal del Dashboard como candidato (sin dar acceso)", () => {
  it("un payload sin `personal` sigue siendo válido y no genera candidatos", () => {
    const plan = planFirebaseSync(payload(), local());
    expect(plan.staffUpserts).toEqual([]);
    expect(plan.report.staffToCreate).toBe(0);
  });

  it("propone candidatos con la clave de centro normalizada y el rol del Dashboard solo como referencia", () => {
    const plan = planFirebaseSync(payload({ personal: [personal("p1"), personal("p2", { rol: "Director" })] }), local());
    expect(plan.staffUpserts.map((s) => s.uid)).toEqual(["p1", "p2"]);
    expect(plan.staffUpserts[0]).toMatchObject({ rol_dashboard: "Administrativo", email: "p1@escuela.mx", isNew: true, registro_sep: [{ clave: "22PPR0186I", nivel: "primaria" }] });
    expect(plan.report.staffToCreate).toBe(2);
    // Nunca crea usuarios, vínculos ni toca a los tutores por culpa del personal.
    expect(plan.guardianCreates).toHaveLength(1);
  });

  it("no repite candidatos sin cambios y detecta los que cambiaron", () => {
    const same = { nombreCompleto: "Perp1 Gómez", email: "p1@escuela.mx", rolDashboard: "Administrativo", departamento: null, registroSep: [{ clave: "22PPR0186I", nivel: "primaria" }], estado: "activo" };
    const plan = planFirebaseSync(payload({ personal: [personal("p1"), personal("p2")] }), local({ staffByUid: new Map([["p1", same], ["p2", { ...same, rolDashboard: "Maestro" }]]) }));
    expect(plan.staffUpserts.map((s) => [s.uid, s.isNew])).toEqual([["p2", false]]);
    expect(plan.report.staffToUpdate).toBe(1);
  });

  it("omite al personal de otra escuela, sin nombre, o que ya es tutor (un uid = una persona)", () => {
    const plan = planFirebaseSync(
      payload({ personal: [personal("p1", { idEscuela: "OTRA" }), personal("p2", { nombre: null, primerApellido: null, email: null }), personal("t1")] }),
      local(),
    );
    expect(plan.staffUpserts).toEqual([]);
    expect(plan.report.skipped.personal_sin_nombre).toBe(1);
    expect(plan.report.skipped.personal_es_tutor).toBe(1);
    expect(plan.report.skipped.escuela_no_habilitada).toBeGreaterThanOrEqual(1);
  });

  it("avisa de candidatos locales que ya no vienen en el puente, sin borrarlos", () => {
    const plan = planFirebaseSync(payload({ personal: [] }), local({ staffByUid: new Map([["gone", { nombreCompleto: "X", email: null, rolDashboard: null, departamento: null, registroSep: [], estado: "activo" }]]) }));
    expect(plan.report.warnings.personalLocalAusenteEnPuente).toBe(1);
  });

  it("guarda el departamento (Director General) y detecta cuando cambia", () => {
    const dg = personal("p1", { rol: "Director", departamento: "Director General" });
    const first = planFirebaseSync(payload({ personal: [dg] }), local());
    expect(first.staffUpserts[0]).toMatchObject({ rol_dashboard: "Director", departamento: "Director General", isNew: true });
    const stored = { nombreCompleto: "Perp1 Gómez", email: "p1@escuela.mx", rolDashboard: "Director", departamento: "Contabilidad", registroSep: [{ clave: "22PPR0186I", nivel: "primaria" }], estado: "activo" };
    const changed = planFirebaseSync(payload({ personal: [dg] }), local({ staffByUid: new Map([["p1", stored]]) }));
    expect(changed.staffUpserts.map((s) => [s.uid, s.isNew, s.departamento])).toEqual([["p1", false, "Director General"]]);
    const unchanged = planFirebaseSync(payload({ personal: [dg] }), local({ staffByUid: new Map([["p1", { ...stored, departamento: "Director General" }]]) }));
    expect(unchanged.staffUpserts).toEqual([]);
  });

  it("un Dashboard anterior sin `departamento` sigue siendo válido (queda en null)", () => {
    const plan = planFirebaseSync(payload({ personal: [personal("p1")] }), local());
    expect(plan.staffUpserts[0].departamento).toBeNull();
  });

  it("apply: guarda candidatos con upsert y no inserta en users ni en external_identities para ellos", async () => {
    const { db, calls } = fakeDb();
    await runFirebaseSync({ db, tenantId: 8, payload: payload({ personal: [personal("p1")] }), apply: true });
    const staff = calls.filter((c) => c.startsWith("INSERT INTO firebase_staff_candidates"));
    expect(staff).toHaveLength(1);
    expect(staff[0]).toContain("ON CONFLICT (tenant_id, firebase_uid) DO UPDATE");
    expect(calls.some((c) => c.startsWith("INSERT INTO users"))).toBe(false);
    // Solo la identidad del tutor; ninguna para el personal.
    expect(calls.filter((c) => c.startsWith("INSERT INTO external_identities"))).toHaveLength(1);
  });

  it("dry-run no escribe candidatos", async () => {
    const { db, calls } = fakeDb();
    const res = await runFirebaseSync({ db, tenantId: 8, payload: payload({ personal: [personal("p1")] }), apply: false });
    expect(res.report.staffToCreate).toBe(1);
    expect(calls.some((c) => /^(INSERT|UPDATE|DELETE)/.test(c))).toBe(false);
  });
});

// ── Bajas declaradas por el Dashboard, límites por corrida y corridas automáticas ─────────────────────────────
const linkedUser = (userId: number, over: Partial<LocalLinkedUser> = {}): LocalLinkedUser =>
  ({ userId, role: "asistente", isActive: true, isSuperAdmin: false, ...over });
const linked = (entries: Array<[string, LocalLinkedUser]>) => ({ linkedStaffUsers: new Map(entries) });
const userRow = (uid: string, id: number, over: Record<string, unknown> = {}) =>
  ({ subject: uid, id, role: "asistente", is_active: true, is_super_admin: false, ...over });
const usersRows = (rows: any[]) => (sql: string) => (/JOIN users u ON u\.id = ei\.user_id/.test(sql) ? rows : []);

describe("Baja explícita en el Dashboard desactiva al usuario de EduPay", () => {
  it("desactiva al usuario vinculado cuando el Dashboard declara estado baja", () => {
    const plan = planFirebaseSync(payload({ personal: [personal("p1", { estado: "baja" })] }), local(linked([["p1", linkedUser(50)]])));
    expect(plan.userDeactivations).toEqual([{ uid: "p1", userId: 50, role: "asistente", motivo: "baja_en_dashboard" }]);
    expect(plan.report.usersToDeactivate).toBe(1);
  });

  it("que alguien falte en la lista NO desactiva a nadie (el Dashboard omite personal activo con datos incompletos)", () => {
    const plan = planFirebaseSync(payload({ personal: [] }), local(linked([["p1", linkedUser(50)]])));
    expect(plan.userDeactivations).toEqual([]);
    expect(plan.report.usersToDeactivate).toBe(0);
  });

  it("el personal activo, el que ya está inactivo y el de otra escuela no se tocan", () => {
    const plan = planFirebaseSync(
      payload({ personal: [personal("p1"), personal("p2", { estado: "baja" }), personal("p3", { estado: "baja", idEscuela: "OTRA" })] }),
      local(linked([["p1", linkedUser(50)], ["p2", linkedUser(51, { isActive: false })], ["p3", linkedUser(52)]])),
    );
    expect(plan.userDeactivations).toEqual([]);
  });

  it("una baja sin registro local no crea candidato nuevo: solo se cuenta como omitida", () => {
    const plan = planFirebaseSync(payload({ personal: [personal("p1", { estado: "baja" })] }), local());
    expect(plan.userDeactivations).toEqual([]);
    expect(plan.staffUpserts).toEqual([]);
    expect(plan.report.skipped.personal_baja_sin_registro_local).toBe(1);
    expect(plan.report.staffToCreate).toBe(0);
  });

  it("una baja con candidato local existente sí lo actualiza a baja", () => {
    const base = local();
    base.staffByUid.set("p1", { nombreCompleto: "Persona p1 Prueba", email: null, rolDashboard: "Administrativo", departamento: null, estado: "activo", registroSep: [] } as any);
    const plan = planFirebaseSync(payload({ personal: [personal("p1", { estado: "baja" })] }), base);
    expect(plan.staffUpserts.map((s) => [s.uid, s.estado, s.isNew])).toEqual([["p1", "baja", false]]);
  });

  it("nunca desactiva a un superadministrador de la plataforma: lo avisa para que lo decida una persona", () => {
    const plan = planFirebaseSync(
      payload({ personal: [personal("p1", { estado: "baja" }), personal("p2", { estado: "baja" })] }),
      local(linked([["p1", linkedUser(50, { isSuperAdmin: true })], ["p2", linkedUser(51, { role: "super_admin" })]])),
    );
    expect(plan.userDeactivations).toEqual([]);
    expect(plan.report.warnings.superadminEnBajaEnDashboard).toBe(2);
  });

  it("la baja se detecta aunque a la persona le falten datos que la harían omitir como candidata", () => {
    const plan = planFirebaseSync(
      payload({ personal: [personal("p1", { estado: "baja", nombre: null, primerApellido: null, email: null })] }),
      local(linked([["p1", linkedUser(50)]])),
    );
    expect(plan.report.skipped.personal_sin_nombre).toBe(1);
    expect(plan.userDeactivations.map((d) => d.userId)).toEqual([50]);
  });
});

describe("Límites por corrida", () => {
  it("alumnos a baja: tolera hasta max(5, 10 %) y aborta por encima", () => {
    expect(evaluateGuards({ studentsToBaja: 5, activeStudents: 40, usersToDeactivate: 0, activeLinkedUsers: 0 })).toMatchObject({ ok: true, studentsBajaLimit: 5 });
    expect(evaluateGuards({ studentsToBaja: 6, activeStudents: 40, usersToDeactivate: 0, activeLinkedUsers: 0 })).toMatchObject({ ok: false, studentsBajaLimit: 5 });
    expect(evaluateGuards({ studentsToBaja: 10, activeStudents: 100, usersToDeactivate: 0, activeLinkedUsers: 0 }).ok).toBe(true);
    expect(evaluateGuards({ studentsToBaja: 11, activeStudents: 100, usersToDeactivate: 0, activeLinkedUsers: 0 }).ok).toBe(false);
    expect(evaluateGuards({ studentsToBaja: 70, activeStudents: 669, usersToDeactivate: 0, activeLinkedUsers: 0 })).toMatchObject({ ok: false, studentsBajaLimit: 67 });
  });

  it("usuarios desactivados: tolera hasta max(2, 20 %) y aborta por encima", () => {
    expect(evaluateGuards({ studentsToBaja: 0, activeStudents: 0, usersToDeactivate: 2, activeLinkedUsers: 5 })).toMatchObject({ ok: true, usersDeactivationLimit: 2 });
    expect(evaluateGuards({ studentsToBaja: 0, activeStudents: 0, usersToDeactivate: 3, activeLinkedUsers: 5 })).toMatchObject({ ok: false, usersDeactivationLimit: 2 });
    expect(evaluateGuards({ studentsToBaja: 0, activeStudents: 0, usersToDeactivate: 4, activeLinkedUsers: 20 }).ok).toBe(true);
    expect(evaluateGuards({ studentsToBaja: 0, activeStudents: 0, usersToDeactivate: 5, activeLinkedUsers: 20 }).ok).toBe(false);
  });

  it("el plan trae el resultado de los límites; sin vínculos de personal no hay nada que proteger", () => {
    expect(planFirebaseSync(payload(), local()).report.guards).toMatchObject({ ok: true, usersToDeactivate: 0 });
    const three = planFirebaseSync(
      payload({ personal: [personal("p1", { estado: "baja" }), personal("p2", { estado: "baja" }), personal("p3", { estado: "baja" })] }),
      local(linked([["p1", linkedUser(50)], ["p2", linkedUser(51)], ["p3", linkedUser(52)]])),
    );
    expect(three.report.guards.ok).toBe(false);
    expect(three.report.guards.violations).toHaveLength(1);
  });

  it("solo cuentan las transiciones de alumnos existentes a baja, no las altas ya en baja", () => {
    const plan = planFirebaseSync(payload({ alumnos: [alumno("a1", { estado: "baja" }), alumno("a2", { estado: "baja" })] }), local());
    expect(plan.report.studentsBaja).toBe(2);
    expect(plan.report.guards.studentsToBaja).toBe(0);
  });
});

describe("Corridas con escritura: desactivación, límites y concurrencia", () => {
  const bajas = (n: number) => Array.from({ length: n }, (_, i) => personal(`p${i + 1}`, { estado: "baja" }));
  const rows = (n: number) => Array.from({ length: n }, (_, i) => userRow(`p${i + 1}`, 50 + i));

  it("apply: desactiva dentro de la transacción, sin tocar superadmins, y audita cada baja después del COMMIT", async () => {
    const { db, calls } = fakeDb(usersRows(rows(5)));
    const res = await runFirebaseSync({ db, tenantId: 8, payload: payload({ personal: bajas(1) }), apply: true });
    expect(res.applied).toBe(true);
    expect(res.report.usersToDeactivate).toBe(1);
    const update = calls.find((c) => c.startsWith("UPDATE users SET is_active = false"));
    expect(update).toBeDefined();
    expect(update).toContain("COALESCE(is_super_admin, false) = false");
    expect(update).toContain("role <> 'super_admin'");
    const commit = calls.indexOf("COMMIT");
    expect(calls.indexOf(update!)).toBeLessThan(commit);
    const audits = calls.filter((c) => c.startsWith("INSERT INTO audit_log"));
    expect(audits).toHaveLength(2); // la corrida y la baja
    expect(calls.findIndex((c) => c.startsWith("INSERT INTO audit_log"))).toBeGreaterThan(commit);
  });

  it("apply: si supera el límite aborta con SyncGuardError, hace ROLLBACK y no escribe ni audita nada", async () => {
    const { db, calls } = fakeDb(usersRows(rows(5)));
    await expect(runFirebaseSync({ db, tenantId: 8, payload: payload({ personal: bajas(3) }), apply: true })).rejects.toBeInstanceOf(SyncGuardError);
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(calls.some((c) => /^(INSERT|UPDATE|DELETE)/.test(c))).toBe(false);
  });

  it("apply con allowMassChanges (corrida manual y revisada) sí aplica", async () => {
    const { db, calls } = fakeDb(usersRows(rows(5)));
    const res = await runFirebaseSync({ db, tenantId: 8, payload: payload({ personal: bajas(3) }), apply: true, allowMassChanges: true });
    expect(res.applied).toBe(true);
    expect(calls.filter((c) => c.startsWith("UPDATE users SET is_active = false"))).toHaveLength(3);
    expect(calls).toContain("COMMIT");
  });

  it("dry-run no desactiva a nadie y no aborta: solo reporta los límites", async () => {
    const { db, calls } = fakeDb(usersRows(rows(5)));
    const res = await runFirebaseSync({ db, tenantId: 8, payload: payload({ personal: bajas(3) }), apply: false });
    expect(res.applied).toBe(false);
    expect(res.report.usersToDeactivate).toBe(3);
    expect(res.report.guards.ok).toBe(false);
    expect(calls.some((c) => /^(INSERT|UPDATE|DELETE)/.test(c))).toBe(false);
  });

  it("si otra corrida tiene el candado, ésta se omite sin escribir (no se acumulan corridas)", async () => {
    const { db, calls, query } = fakeDb();
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => (/pg_try_advisory_xact_lock/.test(sql) ? ({ rows: [{ locked: false }], rowCount: 1 } as any) : base(sql)));
    await expect(runFirebaseSync({ db, tenantId: 8, payload: payload(), apply: true })).rejects.toBeInstanceOf(SyncBusyError);
    expect(calls).toContain("ROLLBACK");
    expect(calls.some((c) => /^(INSERT|UPDATE|DELETE)/.test(c))).toBe(false);
  });

  it("si falla la auditoría de una baja, va a la cola de reintentos y la desactivación ya quedó aplicada", async () => {
    const { db, query } = fakeDb(usersRows(rows(5)));
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO audit_log/.test(sql)) throw new Error("audit down");
      return base(sql);
    });
    (enqueueAuditLog as any).mockClear();
    const res = await runFirebaseSync({ db, tenantId: 8, payload: payload({ personal: bajas(1) }), apply: true });
    expect(res.applied).toBe(true);
    expect((enqueueAuditLog as any).mock.calls.map((c: any[]) => c[0].action)).toContain("user.deactivated_by_dashboard");
  });
});

describe("normalizeCct", () => {
  it("quita el prefijo, espacios y corrige la O por 0 donde va un dígito", () => {
    expect(normalizeCct("CCT 22PPR0186I")).toBe("22PPR0186I");
    expect(normalizeCct("22ppr0l86i")).toBeNull();
    expect(normalizeCct("2OPPR01B6I")).toBeNull();
    expect(normalizeCct("22 PPR 018 6I")).toBe("22PPR0186I");
    expect(normalizeCct("2O-PPR-O186-I")).toBe("20PPR0186I");
    expect(normalizeCct(null)).toBeNull();
    expect(normalizeCct("abc")).toBeNull();
  });
});
