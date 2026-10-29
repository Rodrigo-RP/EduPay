import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import jwt from "../test-support/session-jwt";
import { pool } from "../db";
import { storage } from "../storage";
import { JWT_SECRET } from "../routes/shared";
import { assertTestDatabase } from "../lib/database-safety";
import { manageFamily } from "../lib/family-service";
import { schoolDate } from "../../shared/school-date";

const actor = { tenantId: 29, campusId: 48, userId: 80 };
const stamp = Date.now().toString();
const students: number[] = [], families: number[] = [], guardians: number[] = [], charges: number[] = [];
let first: any, second: any, conceptId: number;
function tutor(index = 0) {
  return {
    tipo_guardian: index === 0 ? "madre" : "otro", nombres: `Tutor FR ${stamp}`, apellido_paterno: `Prueba${index}`,
    apellido_materno: "Fixture", curp: `TEAT030401HDFRRSA${index}`, rfc: `TEAT03040100${index}`,
    correo_institucional_familiar: `familia-real-${stamp}-${index}@example.test`,
    celular: "55 1234 5678", telefono_casa_oficina: "55 8765 4321",
    calle: "Calle de prueba", numero_exterior: "10", numero_interior: "2", colonia: "Pruebas",
    codigo_postal: "01000", municipio: "Prueba", estado: "Ciudad de México",
    contacto_emergencia_nombre: "Contacto de prueba", contacto_emergencia_telefono: "55 1122 3344",
    contacto_emergencia_relacion: "Otro", es_responsable_pago: index !== 1, porcentaje_responsabilidad: index === 1 ? 0 : 100,
  };
}
async function api(method: string, path: string, body?: any, context: any = {}) {
  const token = jwt.sign({ id: actor.userId, tenant_id: actor.tenantId, campus_id: actor.campusId, role: "administrador_campus", ...context }, JWT_SECRET);
  const response = await fetch(`http://localhost:5000${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}
async function create(index: number, tutores: any[]) {
  const result = await api("POST", "/api/admin/families", {
    nombre: `Familia real ${stamp}-${index}`, student_ids: [students[index]], tutores,
  });
  if (result.body.family_id) {
    families.push(result.body.family_id);
    guardians.push(...result.body.guardians_created.map((g: any) => g.id));
  }
  return result;
}
const archive = { status: "archivada", motivo: "Archivado de fixture", confirmacion: true, confirmacion_final: true };

beforeAll(async () => {
  await assertTestDatabase(pool);
  for (let i = 0; i < 3; i++) {
    const student = await storage.createStudent({
      nombres: `Alumno FR ${stamp}`, apellido_paterno: `Prueba${i}`,
      id_referencia: `FR${stamp}-${i}`, tenant_id: actor.tenantId, campus_id: actor.campusId,
      nivel_educativo: "Primaria", grado: "1", grupo: "FR",
    } as any);
    students.push(student.id);
  }
  const concept = await pool.query("SELECT id FROM concepts WHERE tenant_id=$1 AND campus_id=$2 LIMIT 1", [actor.tenantId, actor.campusId]);
  expect(concept.rows.length).toBe(1);
  conceptId = concept.rows[0].id;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await assertTestDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (charges.length) await client.query("DELETE FROM charges WHERE id=ANY($1::int[])", [charges]);
    await client.query("DELETE FROM student_guardian WHERE student_id=ANY($1::int[])", [students]);
    await client.query("DELETE FROM family_students WHERE student_id=ANY($1::int[])", [students]);
    await client.query("DELETE FROM families WHERE id=ANY($1::int[])", [families]);
    await client.query("DELETE FROM guardians WHERE id=ANY($1::int[])", [guardians]);
    await client.query("DELETE FROM students WHERE id=ANY($1::int[])", [students]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

describe("Gestión real de familias sobre heliumdb", () => {
  it("crea dos tutores completos, normaliza teléfonos y asigna número en servidor", async () => {
    const result = await create(0, [tutor(), tutor(1)]);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    first = result.body;
    expect(first.numero_familia).toMatch(/^FAM\d+$/);
    const saved = await pool.query("SELECT * FROM guardians WHERE id=ANY($1::int[]) ORDER BY id", [guardians]);
    expect(saved.rows).toHaveLength(2);
    for (let i = 0; i < saved.rows.length; i++) {
      const row = saved.rows[i];
      for (const [field, value] of Object.entries(tutor(i))) {
        if (["es_responsable_pago", "porcentaje_responsabilidad"].includes(field)) continue;
        expect(row[field], field).toBe(field.includes("telefono") || field === "celular" ? `+52${String(value).replace(/\D/g, "")}` : value);
      }
    }
  });
  it("acepta un solo tutor otro, sin padre", async () => {
    const result = await create(1, [{ ...tutor(2), tipo_guardian: "otro" }]);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    second = result.body;
  });
  it("edita realmente los datos del tutor y de la familia", async () => {
    const result = await api("PATCH", `/api/admin/families/${first.family_id}`, {
      nombre: "Familia modificada", tutores: [{ ...tutor(), guardian_id: first.guardians_created[0].id, calle: "Nueva calle", rfc: "TEAT030401999" }],
    });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const row = await pool.query("SELECT calle,rfc FROM guardians WHERE id=$1", [first.guardians_created[0].id]);
    expect(row.rows[0]).toEqual({ calle: "Nueva calle", rfc: "TEAT030401999" });
  });
  it.each(["curp", "correo"])("duplicado por %s ->409 que indica familia, sin crear otra", async field => {
    const t = tutor(3);
    if (field === "curp") t.curp = tutor().curp; else t.correo_institucional_familiar = tutor().correo_institucional_familiar;
    const result = await create(2, [t]);
    expect(result.status).toBe(409);
    expect(result.body.message).toContain(first.numero_familia);
  });
  it.each([
    ["curp", "INVÁLIDA"], ["rfc", "ABC123"], ["codigo_postal", "100"],
    ["celular", "123"], ["telefono_casa_oficina", "abc5512345678"],
    ["contacto_emergencia_telefono", "+15512345678"], ["correo_institucional_familiar", "sin-arroba"],
  ])("%s inválido ->400 y ningún INSERT", async (field, value) => {
    const before = await pool.query("SELECT count(*) AS n FROM families WHERE nombre=$1", [`Familia real ${stamp}-2`]);
    const result = await create(2, [{ ...tutor(3), [field]: value }]);
    expect(result.status).toBe(400);
    const after = await pool.query("SELECT count(*) AS n FROM families WHERE nombre=$1", [`Familia real ${stamp}-2`]);
    expect(after.rows).toEqual(before.rows);
  });
  it.each([{ tenant_id: 999999 }, { campus_id: 999999 }])("otro contexto no puede editar ni archivar ->404", async scope => {
    expect((await api("PATCH", `/api/admin/families/${first.family_id}`, { nombre: "Intruso", tutores: [tutor()] }, scope)).status).toBe(404);
    expect((await api("PATCH", `/api/admin/families/${first.family_id}/status`, archive, scope)).status).toBe(404);
  });
  it("sin permisos ->403", async () => {
    expect((await api("POST", "/api/admin/families", {}, { role: "contador_general" })).status).toBe(403);
    expect((await api("PATCH", `/api/admin/families/${first.family_id}/status`, archive, { role: "contador_general" })).status).toBe(403);
  });
  it("sin motivo o sin segunda confirmación ->400", async () => {
    expect((await api("PATCH", `/api/admin/families/${second.family_id}/status`, { ...archive, motivo: "" })).status).toBe(400);
    expect((await api("PATCH", `/api/admin/families/${second.family_id}/status`, { ...archive, confirmacion_final: false })).status).toBe(400);
  });
  it("saldo pendiente impide archivar", async () => {
    const charge = await pool.query(
      `INSERT INTO charges (student_id,concept_id,tenant_id,monto_base_centavos,fecha_emision,fecha_vencimiento,estado)
       VALUES ($1,$2,$3,10000,$4,$4,'pendiente') RETURNING id`,
      [students[0], conceptId, actor.tenantId, schoolDate()],
    );
    charges.push(charge.rows[0].id);
    expect((await api("PATCH", `/api/admin/families/${first.family_id}/status`, archive)).status).toBe(409);
    expect((await pool.query("SELECT status FROM families WHERE id=$1", [first.family_id])).rows[0].status).toBe("activo");
  });
  it("archiva sin borrar filas; reintento no duplica la auditoría; listado oculta archivadas", async () => {
    const request = { ...archive, motivo: `${archive.motivo} ${tutor(2).curp} ${tutor(2).rfc}` };
    const snapshots = async () => (await pool.query(
      `SELECT (SELECT count(*) FROM families WHERE id=$1) AS f,
       (SELECT count(*) FROM guardians WHERE id=$2) AS g,
       (SELECT count(*) FROM students WHERE id=$3) AS s`,
      [second.family_id, second.guardians_created[0].id, students[1]],
    )).rows;
    const before = await snapshots();
    expect((await api("PATCH", `/api/admin/families/${second.family_id}/status`, request)).status).toBe(200);
    expect((await api("PATCH", `/api/admin/families/${second.family_id}/status`, request)).status).toBe(200);
    expect(await snapshots()).toEqual(before);
    const archived = (await pool.query("SELECT archived_at,archived_by FROM families WHERE id=$1", [second.family_id])).rows[0];
    expect(archived.archived_at).toBeTruthy(); expect(archived.archived_by).toBe(actor.userId);
    const audit = await pool.query("SELECT metadata::text AS meta FROM audit_log WHERE entity_type='family' AND entity_id=$1 AND action='archive'", [second.family_id]);
    expect(audit.rows).toHaveLength(1); expect(audit.rows[0].meta).toContain("Archivado de fixture");
    expect(audit.rows[0].meta).not.toContain(tutor(2).curp);
    expect(audit.rows[0].meta).not.toContain(tutor(2).rfc);
    expect((await api("GET", `/api/families/${actor.campusId}`)).body.some((f: any) => f.id === second.family_id)).toBe(false);
    expect((await api("GET", `/api/families/${actor.campusId}?status=archivada`)).body.some((f: any) => f.id === second.family_id)).toBe(true);
  });
  it("auditoría identifica al actor/campos sin CURP ni RFC completos", async () => {
    const rows = await pool.query("SELECT user_id,metadata::text AS meta FROM audit_log WHERE entity_type='family' AND entity_id=$1", [first.family_id]);
    expect(rows.rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows.rows) {
      expect(row.user_id).toBe(actor.userId);
      expect(row.meta).toContain("cambios");
      expect(row.meta).not.toContain(tutor().curp);
      expect(row.meta).not.toContain(tutor().rfc);
      expect(row.meta).not.toContain("TEAT030401999");
    }
  });
  it("excepción a mitad de transacción revierte familia y tutor", async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    let guardianInserts = 0;
    vi.spyOn(pool, "connect").mockResolvedValueOnce({
      query: (sql: string, values: any[]) => /INSERT INTO guardians/.test(sql) && ++guardianInserts === 2
        ? Promise.reject(new Error("Fallo controlado antes del tutor")) : query(sql, values),
      release: () => client.release(),
    } as any);
    await expect(manageFamily("create", null, {
      nombre: `Rollback FR ${stamp}`, student_ids: [students[2]],
      tutores: [tutor(9), { ...tutor(8), es_responsable_pago: false, porcentaje_responsabilidad: 0 }],
    }, actor)).rejects.toThrow("Fallo controlado");
    expect(guardianInserts).toBe(2);
    vi.restoreAllMocks();
    expect((await pool.query("SELECT count(*) AS n FROM families WHERE nombre=$1", [`Rollback FR ${stamp}`])).rows[0].n).toBe("0");
    expect((await pool.query("SELECT count(*) AS n FROM guardians WHERE email=$1", [tutor(9).correo_institucional_familiar])).rows[0].n).toBe("0");
  });
});
