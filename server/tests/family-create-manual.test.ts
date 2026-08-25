/**
 * POST /api/admin/families — creación manual de familias
 *
 * Verifica la función createFamily() vía HTTP, con DB real.
 *
 * FCM-01  Familia nueva, 2 tutores responsables con porcentajes, 1 alumno
 *          → family creada, guardian_id_principal = primer responsable,
 *            ambos student_guardian insertados.
 *
 * FCM-02  Segundo alumno enviado a una familia ya existente (mismo tutor)
 *          → se vincula a la familia existente, nombre de la familia conservado,
 *            no se crea familia nueva.
 *
 * FCM-03  Los alumnos del body pertenecen a familias distintas entre sí
 *          → 422, nada escrito en DB.
 *
 * FCM-04  Tutor identificado por CURP con email distinto en el input
 *          → se usa el guardian del CURP, email del input ignorado, warning presente.
 *
 * FCM-05  Suma de porcentajes de responsables ≠ 100 (70 + 20 = 90)
 *          → 422, nada escrito.
 *
 * FCM-06  Un solo tutor responsable sin porcentaje especificado
 *          → 201, porcentaje_responsabilidad = '100.00' en student_guardian.
 *
 * FCM-07  Rol sin FAMILIES.CREATE (asistente) → 403, nada escrito.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const TENANT_ID  = 29;
const CAMPUS_ID  = 48;
const ADMIN_ID   = 80;

// ── Tokens ────────────────────────────────────────────────────────────────────
function makeToken(role: string): string {
  return jwt.sign(
    { id: ADMIN_ID, email: `${role}@fcm-test.mx`, role,
      tenant_id: TENANT_ID, campus_id: CAMPUS_ID },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}
const tokenAdmin    = makeToken("administrador_campus"); // FAMILIES.CREATE ✓
const tokenAsistente = makeToken("asistente");           // FAMILIES.CREATE ✗

// ── Fixtures (creados en beforeAll) ───────────────────────────────────────────
let studentNewFamId:    number;  // FCM-01, FCM-05, FCM-06
let studentExistAId:    number;  // FCM-02: ancla de la familia pre-existente
let studentExistBId:    number;  // FCM-02: segundo hijo que se agrega
let studentConflictAId: number;  // FCM-03: en familia X
let studentConflictBId: number;  // FCM-03: en familia Y
let preFamilyId:        number;  // FCM-02: familia pre-existente
let preGuardianId:      number;  // FCM-02: tutor pre-existente
let familyXId:          number;  // FCM-03
let familyYId:          number;  // FCM-03
let curpGuardianId:     number;  // FCM-04: guardian con CURP conocido

const CURP_FCM = "FCMT800101MDFXXXX4"; // CURP exclusivo de este test

// IDs creados DURANTE los tests (para limpiar en afterAll)
const created = {
  familyIds:   [] as number[],
  guardianIds: [] as number[],
};

// ── Helper HTTP ───────────────────────────────────────────────────────────────
async function postFamily(body: object, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/admin/families`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Limpiar residuos de corridas anteriores fallidas
  await pool.query(
    `DELETE FROM guardians WHERE tenant_id = $1 AND curp = $2`,
    [TENANT_ID, CURP_FCM],
  );

  const ts = Date.now();

  // Alumnos de test (5 alumnos para distintos escenarios)
  const sn = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno FCM NewFam','FCM-NEW-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentNewFamId = (sn.rows[0] as any).id;

  const sea = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno FCM ExistA','FCM-EXIA-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentExistAId = (sea.rows[0] as any).id;

  const seb = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno FCM ExistB','FCM-EXIB-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentExistBId = (seb.rows[0] as any).id;

  const sca = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno FCM ConflA','FCM-CNFA-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentConflictAId = (sca.rows[0] as any).id;

  const scb = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES ($1,$2,'Alumno FCM ConflB','FCM-CNFB-${ts}','activo') RETURNING id`,
    [CAMPUS_ID, TENANT_ID],
  );
  studentConflictBId = (scb.rows[0] as any).id;

  // Guardian pre-existente para FCM-02
  // Nota: en la DB real 'email' tiene NOT NULL (drift vs Drizzle schema → incluirlo siempre).
  const gpre = await pool.query(
    `INSERT INTO guardians (nombres, correo_institucional_familiar, email, nombre_completo, tenant_id, campus_id)
     VALUES ('Tutor PreExist','preexist-${ts}@fcm.mx','preexist-${ts}@fcm.mx','Tutor PreExist',$1,$2) RETURNING id`,
    [TENANT_ID, CAMPUS_ID],
  );
  preGuardianId = (gpre.rows[0] as any).id;

  // Familia pre-existente con studentExistA + preGuardian (FCM-02)
  const fpre = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
     VALUES ($1,$2,'Familia Pre-Existente FCM',$3) RETURNING id`,
    [TENANT_ID, CAMPUS_ID, preGuardianId],
  );
  preFamilyId = (fpre.rows[0] as any).id;
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2)`,
    [preFamilyId, studentExistAId],
  );
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id, es_responsable_pago)
     VALUES ($1,$2,true)`,
    [studentExistAId, preGuardianId],
  );

  // Familia X con studentConflictA (FCM-03)
  const fx = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre)
     VALUES ($1,$2,'Familia X FCM') RETURNING id`,
    [TENANT_ID, CAMPUS_ID],
  );
  familyXId = (fx.rows[0] as any).id;
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2)`,
    [familyXId, studentConflictAId],
  );

  // Familia Y con studentConflictB (FCM-03)
  const fy = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre)
     VALUES ($1,$2,'Familia Y FCM') RETURNING id`,
    [TENANT_ID, CAMPUS_ID],
  );
  familyYId = (fy.rows[0] as any).id;
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2)`,
    [familyYId, studentConflictBId],
  );

  // Guardian con CURP para FCM-04
  const gcurp = await pool.query(
    `INSERT INTO guardians (nombres, correo_institucional_familiar, email, curp,
                            nombre_completo, celular, tenant_id, campus_id)
     VALUES ('Tutor CURP FCM','curp-original@fcm.mx','curp-original@fcm.mx',$1,'Tutor CURP FCM','5550000001',$2,$3)
     RETURNING id`,
    [CURP_FCM, TENANT_ID, CAMPUS_ID],
  );
  curpGuardianId = (gcurp.rows[0] as any).id;
});

afterAll(async () => {
  // Eliminar en orden FK: student_guardian → family_students → families → guardians → students
  const allStudents = [
    studentNewFamId, studentExistAId, studentExistBId,
    studentConflictAId, studentConflictBId,
  ].filter(Boolean);

  if (allStudents.length) {
    await pool.query(
      `DELETE FROM student_guardian WHERE student_id = ANY($1::int[])`,
      [allStudents],
    );
    await pool.query(
      `DELETE FROM family_students WHERE student_id = ANY($1::int[])`,
      [allStudents],
    );
  }

  const allFamilies = [
    preFamilyId, familyXId, familyYId, ...created.familyIds,
  ].filter(Boolean);
  if (allFamilies.length) {
    // family_students ya limpiado por student_id; limpiar cualquier residuo por family_id
    await pool.query(
      `DELETE FROM family_students WHERE family_id = ANY($1::int[])`,
      [allFamilies],
    );
    await pool.query(
      `DELETE FROM families WHERE id = ANY($1::int[])`,
      [allFamilies],
    );
  }

  const allGuardians = [preGuardianId, curpGuardianId, ...created.guardianIds].filter(Boolean);
  if (allGuardians.length) {
    await pool.query(`DELETE FROM guardians WHERE id = ANY($1::int[])`, [allGuardians]);
  }

  if (allStudents.length) {
    await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [allStudents]);
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("POST /api/admin/families", () => {
  it("FCM-01: familia nueva, 2 tutores responsables con porcentajes, 1 alumno → " +
     "family creada, guardian_id_principal = primer responsable, student_guardian insertados", async () => {
    const ts = Date.now();
    const { status, body } = await postFamily({
      nombre: `Familia FCM-01-${ts}`,
      student_ids: [studentNewFamId],
      tutores: [
        {
          tipo_guardian: "padre",
          nombres: "Juan FCM01",
          apellido_paterno: "García",
          correo_institucional_familiar: `fcm01-padre-${ts}@test.mx`,
          celular: "+525551111111",
          es_responsable_pago: true,
          porcentaje_responsabilidad: "60.00",
        },
        {
          tipo_guardian: "madre",
          nombres: "María FCM01",
          apellido_paterno: "López",
          correo_institucional_familiar: `fcm01-madre-${ts}@test.mx`,
          celular: "+525552222222",
          es_responsable_pago: true,
          porcentaje_responsabilidad: "40.00",
        },
      ],
    }, tokenAdmin);

    expect(status).toBe(201);
    expect(body.family_id).toBeDefined();
    expect(body.guardians_created).toHaveLength(2);
    expect(body.students_linked).toContain(studentNewFamId);

    // Trackear para afterAll
    created.familyIds.push(body.family_id);
    body.guardians_created.forEach((g: any) => created.guardianIds.push(g.id));

    // Verificar en DB: families
    const famRow = await pool.query(
      `SELECT nombre, guardian_id_principal FROM families WHERE id = $1`,
      [body.family_id],
    );
    expect((famRow.rows[0] as any).nombre).toMatch(/FCM-01/);
    // guardian_id_principal = primer tutor responsable (el padre)
    expect((famRow.rows[0] as any).guardian_id_principal).toBe(body.guardians_created[0].id);

    // Verificar en DB: student_guardian (2 filas, ambas responsables)
    const sgRows = await pool.query(
      `SELECT guardian_id, es_responsable_pago, porcentaje_responsabilidad::text AS pct
       FROM student_guardian
       WHERE student_id = $1 AND guardian_id = ANY($2::int[])
       ORDER BY guardian_id`,
      [studentNewFamId, body.guardians_created.map((g: any) => g.id)],
    );
    expect((sgRows.rows as any[]).length).toBe(2);
    const pcts = (sgRows.rows as any[]).map(r => Number(r.pct));
    expect(pcts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);

    // Verificar en DB: family_students
    const fsRow = await pool.query(
      `SELECT 1 FROM family_students WHERE family_id = $1 AND student_id = $2`,
      [body.family_id, studentNewFamId],
    );
    expect((fsRow.rows as any[]).length).toBe(1);
  });

  it("FCM-02: segundo alumno a familia existente (mismo tutor por guardian_id) " +
     "→ vincula a familia existente, nombre de la familia conservado, no crea familia nueva", async () => {
    // studentExistA ya está en preFamilyId. Enviamos studentExistB al mismo nombre.
    const familyCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    const nBefore = Number((familyCountBefore.rows[0] as any).n);

    const { status, body } = await postFamily({
      nombre: "Nombre Distinto Que No Debe Usarse",
      student_ids: [studentExistAId, studentExistBId],
      tutores: [
        {
          guardian_id: preGuardianId,
          es_responsable_pago: true,
        },
      ],
    }, tokenAdmin);

    expect(status).toBe(201);
    // Debe usar la familia existente, no crear una nueva
    expect(body.family_id).toBe(preFamilyId);

    // No se debe haber creado ninguna familia nueva
    const familyCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    expect(Number((familyCountAfter.rows[0] as any).n)).toBe(nBefore);

    // El nombre de la familia existente se conserva (no sobreescrito por el body)
    const famRow = await pool.query(
      `SELECT nombre FROM families WHERE id = $1`,
      [preFamilyId],
    );
    expect((famRow.rows[0] as any).nombre).toBe("Familia Pre-Existente FCM");
    expect(body.family_nombre).toBe("Familia Pre-Existente FCM");

    // studentExistB ahora está vinculado a la familia
    const fsRow = await pool.query(
      `SELECT 1 FROM family_students WHERE family_id = $1 AND student_id = $2`,
      [preFamilyId, studentExistBId],
    );
    expect((fsRow.rows as any[]).length).toBe(1);

    // student_guardian para studentExistB + preGuardian existe
    const sgRow = await pool.query(
      `SELECT 1 FROM student_guardian WHERE student_id = $1 AND guardian_id = $2`,
      [studentExistBId, preGuardianId],
    );
    expect((sgRow.rows as any[]).length).toBe(1);
  });

  it("FCM-03: alumnos pertenecen a familias distintas → 422, nada escrito en DB", async () => {
    const familyCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );

    const { status, body } = await postFamily({
      nombre: "Familia Imposible",
      student_ids: [studentConflictAId, studentConflictBId],
      tutores: [
        {
          nombres: "Tutor Conflict",
          correo_institucional_familiar: "conflict@test.mx",
          es_responsable_pago: true,
        },
      ],
    }, tokenAdmin);

    expect(status).toBe(422);
    expect(body.message).toMatch(/familias distintas/i);

    // Sin familia nueva
    const familyCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    expect(Number((familyCountAfter.rows[0] as any).n)).toBe(
      Number((familyCountBefore.rows[0] as any).n),
    );

    // Sin guardian nuevo con ese email
    const gRow = await pool.query(
      `SELECT 1 FROM guardians WHERE correo_institucional_familiar = 'conflict@test.mx'`,
    );
    expect((gRow.rows as any[]).length).toBe(0);
  });

  it("FCM-04: tutor por CURP existente con email distinto → usa guardian del CURP, " +
     "email ignorado, warning presente, celular existente conservado", async () => {
    const ts = Date.now();
    const { status, body } = await postFamily({
      nombre: `Familia FCM-04-${ts}`,
      student_ids: [studentNewFamId],
      tutores: [
        {
          curp: CURP_FCM,
          correo_institucional_familiar: "curp-DISTINTO@fcm.mx", // difiere del original
          nombres: "Este Nombre No Se Debe Usar",
          celular: "+525599900000", // difiere de '5550000001'
          es_responsable_pago: true,
        },
      ],
    }, tokenAdmin);

    // Si studentNewFamId ya tiene familia de FCM-01, el endpoint lo detecta y la reutiliza.
    // El punto central es que curpGuardianId sea el guardian vinculado.
    expect([200, 201]).toContain(status);

    // Registrar para limpieza si se creó familia nueva
    if (body.family_id && !created.familyIds.includes(body.family_id)) {
      created.familyIds.push(body.family_id);
    }

    // El guardian usado debe ser el del CURP, no uno nuevo
    const linked = body.guardians_linked as any[];
    expect(linked.some((g: any) => g.id === curpGuardianId)).toBe(true);
    expect(body.guardians_created.length).toBe(0);

    // Warning sobre CURP/email presente
    expect(body.warnings.length).toBeGreaterThan(0);
    expect(body.warnings.some((w: string) => w.includes("CURP") || w.includes("curp"))).toBe(true);

    // Email del guardian NO fue sobrescrito
    const gRow = await pool.query(
      `SELECT correo_institucional_familiar, celular FROM guardians WHERE id = $1`,
      [curpGuardianId],
    );
    expect((gRow.rows[0] as any).correo_institucional_familiar).toBe("curp-original@fcm.mx");
    // Celular tampoco sobrescrito (ya tenía '5550000001')
    expect((gRow.rows[0] as any).celular).toBe("5550000001");
  });

  it("FCM-05: suma de porcentajes de responsables ≠ 100 (70 + 20 = 90) → 422, nada escrito", async () => {
    const ts = Date.now();
    const familyCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );

    const { status, body } = await postFamily({
      nombre: `Familia FCM-05-${ts}`,
      student_ids: [studentNewFamId],
      tutores: [
        {
          nombres: "Tutor A FCM05",
          correo_institucional_familiar: `fcm05a-${ts}@test.mx`,
          es_responsable_pago: true,
          porcentaje_responsabilidad: "70.00",
        },
        {
          nombres: "Tutor B FCM05",
          correo_institucional_familiar: `fcm05b-${ts}@test.mx`,
          es_responsable_pago: true,
          porcentaje_responsabilidad: "20.00",
        },
      ],
    }, tokenAdmin);

    expect(status).toBe(422);
    expect(body.message).toMatch(/100/);

    // Sin familia nueva ni guardians nuevos
    const familyCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    expect(Number((familyCountAfter.rows[0] as any).n)).toBe(
      Number((familyCountBefore.rows[0] as any).n),
    );
    const gRow = await pool.query(
      `SELECT 1 FROM guardians WHERE correo_institucional_familiar LIKE $1`,
      [`fcm05%-${ts}@test.mx`],
    );
    expect((gRow.rows as any[]).length).toBe(0);
  });

  it("FCM-06: un solo tutor responsable sin porcentaje especificado → 201, " +
     "porcentaje_responsabilidad = '100.00' en student_guardian", async () => {
    // Necesitamos un alumno que no esté ya en otra familia para este test.
    // Creamos uno ad-hoc.
    const ts = Date.now();
    const sNew = await pool.query(
      `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
       VALUES ($1,$2,'Alumno FCM06','FCM-06-${ts}','activo') RETURNING id`,
      [CAMPUS_ID, TENANT_ID],
    );
    const s06Id = (sNew.rows[0] as any).id;

    const { status, body } = await postFamily({
      nombre: `Familia FCM-06-${ts}`,
      student_ids: [s06Id],
      tutores: [
        {
          nombres: "Tutor Unico FCM06",
          correo_institucional_familiar: `fcm06-${ts}@test.mx`,
          es_responsable_pago: true,
          // sin porcentaje_responsabilidad — debe defaultear a 100.00
        },
      ],
    }, tokenAdmin);

    expect(status).toBe(201);
    expect(body.family_id).toBeDefined();
    expect(body.guardians_created).toHaveLength(1);

    created.familyIds.push(body.family_id);
    created.guardianIds.push(body.guardians_created[0].id);

    // Verificar porcentaje en student_guardian
    const sgRow = await pool.query(
      `SELECT porcentaje_responsabilidad::numeric AS pct
       FROM student_guardian
       WHERE student_id = $1 AND guardian_id = $2`,
      [s06Id, body.guardians_created[0].id],
    );
    expect(Number((sgRow.rows[0] as any).pct)).toBeCloseTo(100, 1);

    // Cleanup ad-hoc student
    await pool.query(`DELETE FROM student_guardian WHERE student_id = $1`, [s06Id]);
    await pool.query(`DELETE FROM family_students WHERE student_id = $1`, [s06Id]);
    await pool.query(`DELETE FROM students WHERE id = $1`, [s06Id]);
  });

  it("FCM-07: rol sin FAMILIES.CREATE (asistente) → 403, nada escrito", async () => {
    const ts = Date.now();
    const familyCountBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );

    const { status, body } = await postFamily({
      nombre: `Familia FCM-07-${ts}`,
      student_ids: [studentNewFamId],
      tutores: [
        {
          nombres: "Tutor FCM07",
          correo_institucional_familiar: `fcm07-${ts}@test.mx`,
          es_responsable_pago: true,
        },
      ],
    }, tokenAsistente);

    expect(status).toBe(403);

    const familyCountAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM families WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    expect(Number((familyCountAfter.rows[0] as any).n)).toBe(
      Number((familyCountBefore.rows[0] as any).n),
    );
  });
});
