import express from "express";
import jwt from "../test-support/session-jwt";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { pool } from "../db";
import { storage } from "../storage";
import { assertTestDatabase } from "../lib/database-safety";
import { schoolDate } from "@shared/school-date";
import { executeAction } from "../assistant-actions";
import { registerAssistantRoutes } from "../routes/assistant";
import { JWT_SECRET } from "../routes/shared";
import { scopeAssistantRead } from "../lib/assistant-scoped-reads";

const stamp = randomUUID().replace(/-/g, "").slice(0, 12);
const tenants: number[] = [], campuses: number[] = [], students: number[] = [], families: number[] = [], concepts: number[] = [], charges: number[] = [];
const names = ["Propio", "OtroCampus", "OtroTenant", "TenantInconsistente"].map(n => `${n}${stamp}`);
let userId: number, server: ReturnType<ReturnType<typeof express>["listen"]>, url: string;
const ctx = { tenantId: 0, campusId: 0, userId: 0 };

beforeAll(async () => {
  await assertTestDatabase(pool);
  for (let i = 0; i < 2; i++) tenants.push((await pool.query(
    "INSERT INTO tenants (nombre_legal,rfc) VALUES ($1,$2) RETURNING id", [`Scope${stamp}${i}`, `SC${stamp.slice(0, 9)}${i}`],
  )).rows[0].id);
  for (let i = 0; i < 3; i++) campuses.push((await pool.query(
    "INSERT INTO campuses (tenant_id,nombre) VALUES ($1,$2) RETURNING id", [tenants[i === 2 ? 1 : 0], `Scope${stamp}${i}`],
  )).rows[0].id);
  Object.assign(ctx, { tenantId: tenants[0], campusId: campuses[0] });
  for (let i = 0; i < 4; i++) {
    const tenant = tenants[i >= 2 ? 1 : 0], campus = campuses[i === 3 ? 0 : i];
    families.push((await pool.query(
      "INSERT INTO families (tenant_id,campus_id,nombre) VALUES ($1,$2,$3) RETURNING id", [tenant, campus, names[i]],
    )).rows[0].id);
    concepts.push((await pool.query(
      `INSERT INTO concepts (tenant_id,campus_id,nombre,tipo,periodicidad,monto_centavos)
       VALUES ($1,$2,$3,'colegiatura','mensual',10000) RETURNING id`, [tenant, campus, names[i]],
    )).rows[0].id);
    for (let j = 0; j < 2; j++) {
      const student = await storage.createStudent({
        nombres: names[i], apellido_paterno: `Aislamiento${j}`, id_referencia: `SC${stamp}${i}${j}`,
        tenant_id: tenant, campus_id: campus, nivel_educativo: "Primaria", grado: "1", grupo: "S",
      } as any);
      students.push(student.id);
      await pool.query("INSERT INTO family_students (family_id,student_id) VALUES ($1,$2)", [families[i], student.id]);
      charges.push((await pool.query(
        `INSERT INTO charges (tenant_id,student_id,concept_id,monto_base_centavos,fecha_emision,fecha_vencimiento,ciclo_escolar,estado)
         VALUES ($1,$2,$3,10000,$4,$4,'2099-2100','pendiente') RETURNING id`,
        [tenant, student.id, concepts[i], schoolDate()],
      )).rows[0].id);
    }
  }
  // Legado sin tenant explícito: el campus padre acredita la pertenencia,
  // mientras que el registro con tenant distinto del cuarto grupo se excluye.
  await pool.query("UPDATE students SET tenant_id=NULL WHERE id=$1", [students[0]]);
  await pool.query("UPDATE charges SET tenant_id=NULL WHERE id=$1", [charges[0]]);
  // Sin secreto de acceso: este usuario sólo autentica peticiones con JWT de prueba.
  userId = (await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active)
     VALUES ($1,$2,'Scope test',$3,$4,'administrador_general',true) RETURNING id`,
    [ctx.tenantId, ctx.campusId, `scope.${stamp}@example.test`, randomUUID()],
  )).rows[0].id;
  ctx.userId = userId;
  const app = express(); app.use(express.json()); registerAssistantRoutes(app);
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>(r => server.close(() => r()));
  await assertTestDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM audit_log WHERE tenant_id = ANY($1::int[])", [tenants]);
    await client.query("DELETE FROM charges WHERE id = ANY($1::int[])", [charges]);
    await client.query("DELETE FROM family_students WHERE family_id = ANY($1::int[])", [families]);
    await client.query("DELETE FROM families WHERE id = ANY($1::int[])", [families]);
    await client.query("DELETE FROM students WHERE id = ANY($1::int[])", [students]);
    await client.query("DELETE FROM concepts WHERE id = ANY($1::int[])", [concepts]);
    if (userId) await client.query("DELETE FROM users WHERE id=$1", [userId]);
    await client.query("DELETE FROM campuses WHERE id = ANY($1::int[])", [campuses]);
    await client.query("DELETE FROM tenants WHERE id = ANY($1::int[])", [tenants]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
});

it("el lector filtra también tenant inconsistente dentro del mismo campus", async () => {
  for (const table of ["students", "families", "charges"]) {
    const query = scopeAssistantRead(`SELECT id FROM ${table} ORDER BY id`, [], ctx);
    const rows = (await pool.query(query.text, query.values)).rows;
    expect(rows.map(r => r.id)).toEqual(table === "families" ? [families[0]] : table === "students" ? students.slice(0, 2) : charges.slice(0, 2));
  }
});
it("herramientas de alumnos, familias y adeudos sólo devuelven el campus propio", async () => {
  const count = await executeAction("query:contar", { entity: "alumnos" }, ctx);
  expect(count.success).toBe(true); expect(Number(count.rows?.[0].value)).toBe(2);
  const own = await executeAction("query:buscar_alumno", { nombre: `${names[0]} Aislamiento0` }, ctx);
  expect(own.success, own.summary).toBe(true); expect(own.studentTargets?.map(s => s.id)).toEqual([students[0]]);
  for (const name of names.slice(1)) {
    for (const action of ["query:buscar_alumno", "query:saldo_alumno", "query:cargos_alumno"]) {
      const result = await executeAction(action, { nombre: name }, ctx);
      expect(result.studentTargets ?? []).toEqual([]);
      expect(result.rows ?? []).toEqual([]);
    }
  }
  const result = await executeAction("query:familias_hijos", { minHijos: 0 }, ctx);
  expect(result.success).toBe(true);
  expect(result.rows?.map(row => row.label)).toEqual([names[0]]);
});
it("pedir otro campus se rechaza y se registra sin consultar al proveedor", async () => {
  const response = await fetch(url + "/api/assistant/chat", {
    method: "POST", headers: { "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ id: userId, role: "administrador_general", tenant_id: ctx.tenantId, campus_id: ctx.campusId }, JWT_SECRET)}` },
    body: JSON.stringify({ message: `muéstrame el campus ${campuses[1]}` }),
  });
  expect(response.status).toBe(403);
  const audit = await pool.query("SELECT metadata::text AS metadata FROM audit_log WHERE tenant_id=$1 AND user_id=$2 AND action='assistant_scope_denied'", [ctx.tenantId, userId]);
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].metadata).toContain('"requested_campus_id"');
  expect(audit.rows[0].metadata).not.toContain("muéstrame");
});
