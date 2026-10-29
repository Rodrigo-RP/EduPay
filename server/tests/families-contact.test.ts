import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "../test-support/session-jwt";
import { pool } from "../db";
import { storage } from "../storage";
import { assertTestDatabase } from "../lib/database-safety";
import { manageFamily, createFamily } from "../lib/family-service";
import { registerAuthRoutes } from "../routes/auth";
import { registerMiscRoutes } from "../routes/misc";
import { registerPaymentRoutes } from "../routes/payments";
import { JWT_SECRET } from "../routes/shared";

const actor = { tenantId: 29, campusId: 48, userId: 80 };
const stamp = Date.now().toString();
const students: number[] = [], families: number[] = [], guardians: number[] = [];
let server: Server | undefined, base = "", noEmail: any;
const tutor = (index: number, extra: any = {}) => ({
  nombres: `Contacto${stamp}${index}`, apellido_paterno: "Prueba", tipo_guardian: "otro",
  correo_institucional_familiar: null, celular: "55 1234 5678",
  es_responsable_pago: true, porcentaje_responsabilidad: 100, ...extra,
});
async function create(index: number, tutores: any[], imported = false) {
  const input = { nombre: `Contacto familia ${stamp}-${index}`, student_ids: [students[index]], tutores };
  const result = imported ? await createFamily(input, actor.tenantId, actor.campusId)
    : await manageFamily("create", null, input, actor);
  families.push(result.family_id);
  guardians.push(...result.guardians_created.map((g: any) => g.id));
  return result;
}
async function request(path: string, body?: any) {
  const token = jwt.sign({ id: actor.userId, tenant_id: actor.tenantId, campus_id: actor.campusId, role: "administrador_campus" }, JWT_SECRET);
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as any };
}
beforeAll(async () => {
  await assertTestDatabase(pool);
  for (let i = 0; i < 8; i++) {
    const student = await storage.createStudent({
      nombres: `Alumno contacto ${stamp}`, apellido_paterno: `Prueba${i}`,
      id_referencia: `FC${stamp}-${i}`, tenant_id: actor.tenantId, campus_id: actor.campusId,
      nivel_educativo: "Primaria", grado: "1", grupo: "FC",
    } as any);
    students.push(student.id);
  }
  // Servidor local de pruebas: rutas reales, sin el logger de respuestas de index.
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app);
  registerMiscRoutes(app);
  registerPaymentRoutes(app);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server!.address() as any).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(e => e ? reject(e) : resolve()));
  await assertTestDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM magic_link_tokens WHERE guardian_id=ANY($1::int[])", [guardians]);
    await client.query("DELETE FROM student_guardian WHERE student_id=ANY($1::int[])", [students]);
    await client.query("DELETE FROM family_students WHERE student_id=ANY($1::int[])", [students]);
    await client.query("DELETE FROM families WHERE id=ANY($1::int[])", [families]);
    await client.query("DELETE FROM guardians WHERE id=ANY($1::int[])", [guardians]);
    await client.query("DELETE FROM students WHERE id=ANY($1::int[])", [students]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
});

describe("Contacto real sin correo", () => {
  it("acepta tutor sin correo y guarda NULL en ambas columnas, no el alias antiguo", async () => {
    noEmail = await create(0, [tutor(0, { correo_institucional_familiar: "  ", email: "alias-antiguo@example.test" })]);
    const row = (await pool.query("SELECT email,correo_institucional_familiar,celular FROM guardians WHERE id=$1", [noEmail.guardians_created[0].id])).rows[0];
    expect(row).toEqual({ email: null, correo_institucional_familiar: null, celular: "+525512345678" });
  });
  it("correo capturado inválido devuelve 400", async () => {
    await expect(create(4, [tutor(4, { correo_institucional_familiar: "invalido" })])).rejects.toMatchObject({ status: 400, message: expect.stringContaining("correo") });
  });
  it("principal sin celular devuelve 400 sin crear familia", async () => {
    await expect(create(4, [tutor(4, { celular: "" })])).rejects.toMatchObject({ status: 400, message: expect.stringContaining("principal") });
    const found = await pool.query("SELECT id FROM families WHERE nombre=$1", [`Contacto familia ${stamp}-4`]);
    expect(found.rows).toHaveLength(0);
  });
  it("acepta tutor secundario sin celular ni correo", async () => {
    const result = await create(1, [tutor(1), tutor(2, { celular: "", es_responsable_pago: false, porcentaje_responsabilidad: 0 })]);
    const row = (await pool.query("SELECT email,celular FROM guardians WHERE id=$1", [result.guardians_created[1].id])).rows[0];
    expect(row).toEqual({ email: null, celular: null });
  });
  it("dos tutores sin correo ni CURP en familias distintas no chocan como duplicados", async () => {
    const a = await create(2, [tutor(3)]), b = await create(3, [tutor(4)]);
    expect(a.family_id).not.toBe(b.family_id);
    expect(a.guardians_created[0].id).not.toBe(b.guardians_created[0].id);
  });
  it("la importación central acepta correo ausente y lo guarda NULL", async () => {
    const result = await create(5, [tutor(5, { correo_institucional_familiar: undefined })], true);
    const row = (await pool.query("SELECT email,correo_institucional_familiar FROM guardians WHERE id=$1", [result.guardians_created[0].id])).rows[0];
    expect(row).toEqual({ email: null, correo_institucional_familiar: null });
  });
  it("editar permite borrar un correo existente aunque el alias aún lo contenga", async () => {
    const original = tutor(6, { correo_institucional_familiar: `contacto-${stamp}@example.test` });
    const result = await create(6, [original]);
    await manageFamily("update", result.family_id, { nombre: `Contacto familia ${stamp}-6`, tutores: [{ ...original, guardian_id: result.guardians_created[0].id, correo_institucional_familiar: "", email: original.correo_institucional_familiar }] }, actor);
    const row = (await pool.query("SELECT email,correo_institucional_familiar FROM guardians WHERE id=$1", [result.guardians_created[0].id])).rows[0];
    expect(row).toEqual({ email: null, correo_institucional_familiar: null });
  });
  it("liga real sin correo ofrece celular y se canjea sin dirección inventada", async () => {
    const issued = await request("/api/admin/magic-link", { guardian_id: noEmail.guardians_created[0].id });
    expect(issued.status).toBe(200);
    expect(issued.body.guardian).toMatchObject({ email: null, celular: "+525512345678" });
    expect(issued.body.contact_message).toContain("celular");
    const redeemed = await request(`/api/auth/magic/${new URL(issued.body.url).pathname.split("/").pop()}`);
    expect(redeemed.status).toBe(200);
    expect(redeemed.body.guardian.email).toBeNull();
    expect((jwt.decode(redeemed.body.token) as any).email).toBeNull();
  });
  it("buscador encuentra por nombre al tutor con correo NULL", async () => {
    const found = await request(`/api/search?q=${encodeURIComponent(`Contacto${stamp}0`)}`);
    expect(found.status).toBe(200);
    expect(JSON.stringify(found.body)).toContain(String(noEmail.guardians_created[0].id));
    expect(JSON.stringify(found.body)).toContain(`Contacto${stamp}0`);
  });
  it("el principal real puede ser el segundo; editar al secundario no le exige celular", async () => {
    const secondary = tutor(7, { celular: null, es_responsable_pago: false, porcentaje_responsabilidad: 0 });
    const primary = tutor(8);
    const result = await create(4, [secondary, primary]);
    const ids = result.guardians_created.map((g: any) => g.id);
    const saved = await pool.query("SELECT guardian_id_principal FROM families WHERE id=$1", [result.family_id]);
    expect(saved.rows[0].guardian_id_principal).toBe(ids[1]);
    await expect(manageFamily("update", result.family_id, {
      nombre: `Contacto familia ${stamp}-4`, tutores: [{ ...secondary, guardian_id: ids[0] }],
    }, actor)).resolves.toMatchObject({ numero_familia: expect.any(String) });
    await expect(manageFamily("update", result.family_id, {
      nombre: `Contacto familia ${stamp}-4`, tutores: [{ ...primary, guardian_id: ids[1], celular: "" }],
    }, actor)).rejects.toMatchObject({ status: 400 });
  });
  it("el endpoint CSV importa sin columna de correo y persiste NULL", async () => {
    const token = jwt.sign({ id: actor.userId, tenant_id: actor.tenantId, campus_id: actor.campusId, role: "administrador_campus" }, JWT_SECRET);
    const csv = `nombre_familia,id_referencia_alumno,nombres_tutor,apellido_paterno_tutor,tipo_guardian,celular_tutor,es_responsable_pago\nContacto CSV ${stamp},FC${stamp}-7,ContactoCSV${stamp},Prueba,otro,5512345678,true`;
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "contacto.csv");
    const response = await fetch(`${base}/api/import/data/familias/tutores`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const data = await response.json() as any;
    const links = await pool.query("SELECT family_id FROM family_students WHERE student_id=$1", [students[7]]);
    families.push(...links.rows.map(r => r.family_id));
    const contacts = await pool.query("SELECT g.id,g.email,g.correo_institucional_familiar FROM guardians g JOIN student_guardian sg ON sg.guardian_id=g.id WHERE sg.student_id=$1", [students[7]]);
    guardians.push(...contacts.rows.map(r => r.id));
    expect(response.status).toBe(200);
    expect(data.successful).toBe(1);
    expect(data.failed).toBe(0);
    expect(contacts.rows).toEqual([expect.objectContaining({ email: null, correo_institucional_familiar: null })]);
  });
  it("storage no recupera alias vaciado y el perfil sincroniza correos nulos", async () => {
    const guardian = await storage.createGuardian({
      nombres: `Perfil contacto ${stamp}`, apellido_paterno: "Prueba", tipo_guardian: "otro",
      correo_institucional_familiar: "", email: "alias-anterior@example.test",
      tenant_id: actor.tenantId, campus_id: actor.campusId,
    } as any);
    guardians.push(guardian.id);
    expect(guardian.email).toBeNull();
    await storage.updateGuardianProfile(guardian.id, { email: " PERFIL@EXAMPLE.TEST " });
    let row = (await pool.query("SELECT email,correo_institucional_familiar FROM guardians WHERE id=$1", [guardian.id])).rows[0];
    expect(row).toEqual({ email: "perfil@example.test", correo_institucional_familiar: "perfil@example.test" });
    await storage.updateGuardianProfile(guardian.id, { email: " " });
    row = (await pool.query("SELECT email,correo_institucional_familiar FROM guardians WHERE id=$1", [guardian.id])).rows[0];
    expect(row).toEqual({ email: null, correo_institucional_familiar: null });
  });
});
