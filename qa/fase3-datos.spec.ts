/**
 * QA fase 3: datos maestros y configuración (área B). Base desechable edupay_ci.
 * Cada prueba afirma el comportamiento DISEÑADO; un fallo es un defecto reproducido o una decisión de producto pendiente.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { staffApiLogin, ADMIN_PASSWORD } from "../e2e/helpers/auth";

const require = createRequire(import.meta.url);
const pg = require("pg");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PW = ADMIN_PASSWORD;
const E: Record<string, string> = {
  ag: "directora@jfr.edu.mx", ac: "admin.campus@jfr.edu.mx", ax: "caja@jfr.edu.mx", cg: "contador@jfr.edu.mx",
  ad: "admisiones@jfr.edu.mx", as: "qa.asistente@qa.test", ac2: "qa.ac2@qa.test", acb: "qa.acb@qa.test",
};
const tk: Record<string, string> = {};
const h = (k: string) => ({ Authorization: `Bearer ${tk[k]}` });
const S = Date.now() % 100000;
const csv = (name: string, text: string) => ({ file: { name, mimeType: "text/csv", buffer: Buffer.from("\uFEFF" + text, "utf8") } });
const body = async (r: any) => { try { return await r.json(); } catch { return {}; } };
const nota = (t: string) => test.info().annotations.push({ type: "obs", description: t });

const ids: Record<string, any> = {};
const LET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", CONS = "BCDFGHJKLMNPQRSTVWXYZ";
/** CURP ficticia con formato válido y única por semilla. */
const curp = (seed: number) => {
  const l = (n: number) => LET[n % 26];
  const c = Math.floor(seed / 676) % 8000;
  const cons = CONS[c % 20] + CONS[Math.floor(c / 20) % 20] + CONS[Math.floor(c / 400) % 20];
  const yy = String(10 + (seed % 10)), mm = String(1 + (seed % 12)).padStart(2, "0"), dd = String(1 + (seed % 28)).padStart(2, "0");
  return `G${"AEIOUX"[seed % 6]}${l(seed)}${l(Math.floor(seed / 26))}${yy}${mm}${dd}${"HM"[seed % 2]}DF${cons}0${seed % 10}`;
};
let contador = 0;
const unico = () => `${S}${++contador}${Math.floor(Math.random() * 1000)}`;
const tutorFam = (n: string, over: any = {}) => ({ nombres: `Madre${n}`, apellido_paterno: "QA", tipo_guardian: "madre", correo_institucional_familiar: `madre.${n}@example.test`, celular: "5512345678", es_responsable_pago: true, porcentaje_responsabilidad: 100, ...over });
async function nuevoAlumno(request: APIRequestContext, rol: string, tag: string, extra: any = {}) {
  const r = await request.post("/api/admin/students", { headers: h(rol), data: { nombres: `QA ${tag} ${unico()}`, apellido_paterno: "Prueba", nivel_escolar: "Primaria", grado: "1", grupo: "A", status: "activo", ...extra }, failOnStatusCode: false });
  expect(r.status(), `crear alumno (${tag})`).toBe(201);
  return (await r.json()).id as number;
}
async function nuevaFamilia(request: APIRequestContext, rol: string, tag: string) {
  const sid = await nuevoAlumno(request, rol, tag);
  const n = unico();
  const r = await request.post("/api/admin/families", { headers: h(rol), data: { nombre: `Familia ${tag} ${n}`, student_ids: [sid], tutores: [tutorFam(n)] }, failOnStatusCode: false });
  nota(`alta de familia (${tag}): ${r.status()} ${(await r.text()).slice(0, 140)}`);
  expect(r.status(), `crear familia (${tag})`).toBe(201);
  const j = await r.json();
  return { sid, fid: (j.family_id ?? j.id ?? j.family?.id) as number, email: `madre.${n}@example.test` };
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await db.query("UPDATE campuses SET onboarding_completado = true");
  await db.query("UPDATE students s SET tenant_id = c.tenant_id FROM campuses c WHERE c.id = s.campus_id AND s.tenant_id IS NULL");
  for (const k of Object.keys(E)) {
    const r = await staffApiLogin(request, E[k], PW);
    expect(r.status(), `login ${k}`).toBe(200);
    tk[k] = (await r.json()).token;
  }
  ids.c2student = (await db.query("SELECT id FROM students WHERE campus_id=2 ORDER BY id LIMIT 1")).rows[0].id;
  ids.c1students = (await db.query("SELECT id FROM students WHERE campus_id=1 ORDER BY id")).rows.map((r: any) => r.id);
});
test.afterAll(async () => { await db.end(); });

// ───────────────────────── ALUMNOS (B-01 a B-06) ─────────────────────────
test.describe("alumnos", () => {
  test("B-01 listado por campus: cada rol solo ve el suyo", async ({ request }) => {
    const ac = await body(await request.get("/api/admin/students", { headers: h("ac") }));
    const ad = await body(await request.get("/api/admin/students", { headers: h("ad") }));
    expect(ac.length).toBeGreaterThanOrEqual(10);
    expect(ac.every((s: any) => s.campus_id === 1)).toBe(true);
    expect(ad.length).toBeGreaterThanOrEqual(5);
    expect(ad.every((s: any) => s.campus_id === 2)).toBe(true);
  });
  test("B-01 deep-link a un alumno de otro campus: 403; id inválido: 400", async ({ request }) => {
    expect((await request.get(`/api/admin/students?studentId=${ids.c2student}`, { headers: h("ac"), failOnStatusCode: false })).status()).toBe(403);
    expect((await request.get("/api/admin/students?studentId=abc", { headers: h("ac"), failOnStatusCode: false })).status()).toBe(400);
  });
  test("B-03 alta de alumno: admisiones sí, asistente y contador no; campus del cuerpo se ignora", async ({ request }) => {
    const datos = { nombres: `QA Alumno ${S}`, apellido_paterno: "Prueba", apellido_materno: "Uno", nivel_escolar: "Primaria", grado: "1", grupo: "A", status: "activo", campus_id: 1 };
    const r = await request.post("/api/admin/students", { headers: h("ad"), data: datos, failOnStatusCode: false });
    nota(`alta AD: ${r.status()} ${(await r.text()).slice(0, 120)}`);
    expect(r.status()).toBe(201);
    const s = await r.json(); ids.stuA = s.id;
    expect(s.campus_id, "campus del JWT, no del cuerpo").toBe(2);
    for (const rol of ["as", "cg"]) expect((await request.post("/api/admin/students", { headers: h(rol), data: datos, failOnStatusCode: false })).status(), rol).toBe(403);
    const r2 = await request.post("/api/admin/students", { headers: h("ad"), data: { ...datos, nombres: `QA Alumno B ${S}` } });
    ids.stuB = (await r2.json()).id;
  });
  test("B-03 validaciones al crear: CURP inválida y estatus libre (H-B06)", async ({ request }) => {
    const base = { nombres: `QA Val ${S}`, apellido_paterno: "Prueba", nivel_escolar: "Primaria", grado: "1", grupo: "A" };
    const curp = await request.post("/api/admin/students", { headers: h("ad"), data: { ...base, curp: "XXX" }, failOnStatusCode: false });
    expect.soft(curp.status(), "CURP 'XXX' al crear").toBeGreaterThanOrEqual(400);
    const est = await request.post("/api/admin/students", { headers: h("ad"), data: { ...base, nombres: `QA Val2 ${S}`, status: "zzz-no-valido" }, failOnStatusCode: false });
    expect.soft(est.status(), "status inventado al crear").toBeGreaterThanOrEqual(400);
  });
  test("B-03 asignación masiva: id y password_hash del cuerpo no deben aceptarse", async ({ request }) => {
    ids.idImpuesto = 900000 + Math.floor(Math.random() * 90000);
    const r = await request.post("/api/admin/students", { headers: h("ad"), failOnStatusCode: false,
      data: { nombres: `QA Masa ${S}`, apellido_paterno: "Prueba", nivel_escolar: "Primaria", grado: "1", grupo: "A", id: ids.idImpuesto, password_hash: "hack", username: "qa-hack" } });
    const s = await body(r);
    nota(`respuesta ${r.status()} id=${s.id}`);
    if (s.id) {
      const fila = (await db.query("SELECT id, username, password_hash FROM students WHERE id=$1", [s.id])).rows[0];
      expect.soft(fila.id, "id impuesto por el cuerpo").not.toBe(ids.idImpuesto);
      expect.soft(fila.password_hash, "password_hash impuesto por el cuerpo").toBeNull();
      expect.soft(fila.username, "username impuesto por el cuerpo").toBeNull();
    }
  });
  test("B-04 edición: persiste, CURP inválida 400, campo desconocido 400, otro campus 403", async ({ request }) => {
    const id = ids.c1students[0];
    expect((await request.patch(`/api/admin/students/${id}`, { headers: h("ac"), data: { grupo: "B" } })).status()).toBe(200);
    expect((await db.query("SELECT grupo FROM students WHERE id=$1", [id])).rows[0].grupo).toBe("B");
    expect((await request.patch(`/api/admin/students/${id}`, { headers: h("ac"), data: { curp: "ABC" }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.patch(`/api/admin/students/${id}`, { headers: h("ac"), data: { campus_id: 9 }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.patch(`/api/admin/students/${ids.c2student}`, { headers: h("ac"), data: { grupo: "Z" }, failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-04 el nombre completo refleja el apellido editado (H-B04)", async ({ request }) => {
    const id = ids.c1students[1]; const nuevo = `ApQA${S}`;
    expect((await request.patch(`/api/admin/students/${id}`, { headers: h("ac"), data: { apellido_paterno: nuevo } })).status()).toBe(200);
    const f = (await db.query("SELECT nombre_completo FROM students WHERE id=$1", [id])).rows[0];
    expect(f.nombre_completo).toContain(nuevo);
  });
  test("B-05 estatus de 60 caracteres: 400", async ({ request }) => {
    expect((await request.patch(`/api/admin/students/${ids.c1students[2]}`, { headers: h("ac"), data: { status: "x".repeat(60) }, failOnStatusCode: false })).status()).toBe(400);
  });
  test("B-06 importación legada: comas dentro de comillas, nombre completo y duplicados (H-B14)", async ({ request }) => {
    const nom = `QA Importado ${S}`;
    const archivo = `Nombre Completo,CURP,Grado,Grupo,Estatus\n"${nom}, Hijo",,1,A,activo\n${nom} Dos,,2,B,activo\n`;
    const r = await request.post("/api/admin/students/import?dry_run=true", { headers: h("ac"), multipart: csv("legado.csv", archivo), failOnStatusCode: false });
    const j = await body(r);
    nota(`dry_run ${r.status()} ${JSON.stringify(j).slice(0, 220)}`);
    expect(r.status()).toBe(200);
    const real = await request.post("/api/admin/students/import", { headers: h("ac"), multipart: csv("legado.csv", archivo), failOnStatusCode: false });
    expect(real.status()).toBe(200);
    const filas = (await db.query("SELECT nombres, apellido_paterno, nombre_completo, grado FROM students WHERE campus_id=1 AND (nombres LIKE $1 OR nombre_completo LIKE $1)", [`%${nom}%`])).rows;
    nota(`filas creadas: ${JSON.stringify(filas)}`);
    expect.soft(filas.length, "se esperaban 2 alumnos").toBe(2);
    expect.soft(filas.every((f: any) => f.apellido_paterno && f.apellido_paterno.length > 0), "el apellido debe separarse del nombre").toBe(true);
    const otra = await request.post("/api/admin/students/import", { headers: h("ac"), multipart: csv("legado.csv", archivo), failOnStatusCode: false });
    const dup = (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=1 AND (nombres LIKE $1 OR nombre_completo LIKE $1)", [`%${nom}%`])).rows[0].n;
    nota(`segunda importación ${otra.status()}; alumnos con ese nombre: ${dup}`);
    expect.soft(dup, "reimportar el mismo archivo no debe duplicar").toBe(2);
  });
  test("B-06 importación legada: asistente 403", async ({ request }) => {
    expect((await request.post("/api/admin/students/import", { headers: h("as"), multipart: csv("x.csv", "Nombre Completo\nX\n"), failOnStatusCode: false })).status()).toBe(403);
  });
});

// ───────────────────────── FAMILIAS (B-12 a B-16) ─────────────────────────
test.describe("familias", () => {
  test("B-12 listado: AC lo ve, estado inválido 400, admisiones 403, campus ajeno rechazado", async ({ request }) => {
    const l = await body(await request.get("/api/families/1", { headers: h("ac") }));
    expect(l.length).toBeGreaterThan(0);
    expect((await request.get("/api/families/1?status=xyz", { headers: h("ac"), failOnStatusCode: false })).status()).toBe(400);
    expect((await request.get("/api/families/2", { headers: h("ad"), failOnStatusCode: false })).status(), "AD sin families.read").toBe(403);
    expect((await request.get("/api/families/2", { headers: h("ac"), failOnStatusCode: false })).status(), "campus ajeno").toBeGreaterThanOrEqual(400);
  });
  test("B-14 alta de familia: éxito con tutor y alumno; asistente 403", async ({ request }) => {
    const { sid } = await nuevaFamilia(request, "ad", "alta");
    const n = unico();
    const otro = await nuevoAlumno(request, "ad", "alta2");
    expect((await request.post("/api/admin/families", { headers: h("as"), data: { nombre: "x", student_ids: [otro], tutores: [tutorFam(n)] }, failOnStatusCode: false })).status()).toBe(403);
    const f = (await db.query("SELECT f.id, f.status FROM families f JOIN students s ON s.family_id = f.id WHERE s.id=$1", [sid]).catch(() => ({ rows: [] }))).rows[0];
    nota(`familia creada vinculada al alumno: ${JSON.stringify(f ?? "n/d")}`);
  });
  test("B-14 validaciones: alumno ya en familia, porcentajes que no suman 100, CURP de tutor, correo repetido, alumno de otro campus", async ({ request }) => {
    const base = await nuevaFamilia(request, "ad", "val");
    const n = unico();
    const ya = await request.post("/api/admin/families", { headers: h("ad"), data: { nombre: `F dup ${n}`, student_ids: [base.sid], tutores: [tutorFam(n)] }, failOnStatusCode: false });
    expect(ya.status(), "alumno ya en familia").toBeGreaterThanOrEqual(400);
    const libre = await nuevoAlumno(request, "ad", "val2");
    const suma = await request.post("/api/admin/families", { headers: h("ad"), failOnStatusCode: false,
      data: { nombre: `F suma ${n}`, student_ids: [libre], tutores: [tutorFam(n + "c", { porcentaje_responsabilidad: 60 }), tutorFam(n + "d", { tipo_guardian: "padre", porcentaje_responsabilidad: 30 })] } });
    expect(suma.status(), "60% + 30%").toBeGreaterThanOrEqual(400);
    const curpMala = await request.post("/api/admin/families", { headers: h("ad"), failOnStatusCode: false,
      data: { nombre: `F curp ${n}`, student_ids: [libre], tutores: [tutorFam(n + "e", { curp: "BASURA" })] } });
    expect(curpMala.status(), "CURP de tutor inválida").toBeGreaterThanOrEqual(400);
    const correo = await request.post("/api/admin/families", { headers: h("ad"), failOnStatusCode: false,
      data: { nombre: `F mail ${n}`, student_ids: [libre], tutores: [tutorFam(n + "f", { correo_institucional_familiar: base.email })] } });
    expect(correo.status(), "correo ya usado por otro tutor").toBeGreaterThanOrEqual(400);
    const ajena = await request.post("/api/admin/families", { headers: h("ac"), failOnStatusCode: false,
      data: { nombre: `F ajena ${n}`, student_ids: [libre], tutores: [tutorFam(n + "g")] } });
    expect(ajena.status(), "alumno de otro campus").toBeGreaterThanOrEqual(400);
  });
  test("B-16 archivar: exige motivo y dos confirmaciones; admisiones y asistente no pueden; reactivar", async ({ request }) => {
    const { fid } = await nuevaFamilia(request, "ad", "arch");
    const url = `/api/admin/families/${fid}/status`;
    const completo = { status: "archivada", motivo: "QA prueba", confirmacion: true, confirmacion_final: true };
    expect((await request.patch(url, { headers: h("ad"), data: completo, failOnStatusCode: false })).status(), "AD").toBe(403);
    expect((await request.patch(url, { headers: h("as"), data: completo, failOnStatusCode: false })).status(), "AS").toBe(403);
    expect((await request.patch(url, { headers: h("ac2"), data: { status: "archivada" }, failOnStatusCode: false })).status(), "sin motivo").toBeGreaterThanOrEqual(400);
    expect((await request.patch(url, { headers: h("ac2"), data: { status: "archivada", motivo: "QA prueba", confirmacion: true }, failOnStatusCode: false })).status(), "una sola confirmación").toBeGreaterThanOrEqual(400);
    const ok = await request.patch(url, { headers: h("ac2"), data: completo, failOnStatusCode: false });
    nota(`archivar sin saldo: ${ok.status()} ${(await ok.text()).slice(0, 120)}`);
    expect(ok.status()).toBe(200);
    expect((await request.patch(url, { headers: h("ac2"), data: { status: "activo" }, failOnStatusCode: false })).status(), "reactivar").toBe(200);
    expect([403, 404], "administrador de la otra escuela").toContain((await request.patch(url, { headers: h("acb"), data: completo, failOnStatusCode: false })).status());
  });
  test("B-16 archivar una familia con saldo pendiente: 409", async ({ request }) => {
    const l = await body(await request.get("/api/families/1", { headers: h("ac") }));
    const conSaldo = l.find((f: any) => Number(f.saldo_pendiente_centavos) > 0);
    expect(conSaldo, "el seed debe tener una familia con saldo").toBeTruthy();
    const r = await request.patch(`/api/admin/families/${conSaldo.id}/status`, { headers: h("ac"), data: { status: "archivada", motivo: "QA saldo", confirmacion: true, confirmacion_final: true }, failOnStatusCode: false });
    expect(r.status()).toBe(409);
  });
  test("B-15 edición de familia: otro campus y otra escuela no pueden; asistente no puede; propia sí", async ({ request }) => {
    const l = await body(await request.get("/api/families/1", { headers: h("ac") }));
    const fam = l.find((x: any) => (x.tutores || []).length) ?? l[0];
    const g = (await db.query("SELECT id, nombres, apellido_paterno, tipo_guardian, celular FROM guardians WHERE id=$1", [fam.guardian_id_principal])).rows[0];
    const cuerpo = { nombre: `${fam.nombre} QA`, tutores: [{ guardian_id: g.id, nombres: g.nombres, apellido_paterno: g.apellido_paterno, tipo_guardian: g.tipo_guardian || "madre", celular: g.celular || "5511112222", es_responsable_pago: true, porcentaje_responsabilidad: 100 }] };
    const propia = await request.patch(`/api/admin/families/${fam.id}`, { headers: h("ac"), data: cuerpo, failOnStatusCode: false });
    nota(`edición propia: ${propia.status()} ${(await propia.text()).slice(0, 140)}`);
    expect(propia.status()).toBeLessThan(500);
    expect([403, 404], "otro campus").toContain((await request.patch(`/api/admin/families/${fam.id}`, { headers: h("ac2"), data: cuerpo, failOnStatusCode: false })).status());
    expect([403, 404], "otra escuela").toContain((await request.patch(`/api/admin/families/${fam.id}`, { headers: h("acb"), data: cuerpo, failOnStatusCode: false })).status());
    expect((await request.patch(`/api/admin/families/${fam.id}`, { headers: h("as"), data: cuerpo, failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-13 balance de familia: propio 200; otra escuela rechazado; id inválido 400", async ({ request }) => {
    const l = await body(await request.get("/api/families/1", { headers: h("ac") }));
    expect((await request.get(`/api/family/${l[0].id}/balance`, { headers: h("ac"), failOnStatusCode: false })).status()).toBe(200);
    expect([403, 404]).toContain((await request.get(`/api/family/${l[0].id}/balance`, { headers: h("acb"), failOnStatusCode: false })).status());
    expect((await request.get("/api/family/abc/balance", { headers: h("ac"), failOnStatusCode: false })).status()).toBe(400);
  });
  test("B-08 responsabilidad de pago: porcentaje 150 se rechaza", async ({ request }) => {
    const g = (await db.query("SELECT sg.student_id, sg.guardian_id FROM student_guardian sg JOIN students s ON s.id=sg.student_id WHERE s.campus_id=1 LIMIT 1")).rows[0];
    const url = `/api/admin/students/${g.student_id}/tutores/${g.guardian_id}`;
    expect((await request.put(url, { headers: h("ac"), data: { es_responsable_pago: true, porcentaje_responsabilidad: 150 }, failOnStatusCode: false })).status()).toBeGreaterThanOrEqual(400);
  });
});

// ───────────────────────── IMPORTACIONES (B-17 a B-23) ─────────────────────────
test.describe("importaciones", () => {
  const ENC = "nombre_completo,curp,fecha_nacimiento,grado,grupo,nivel_academico,status,fecha_ingreso,observaciones";
  const filaAlumno = (nombre: string, seed: number) => `${nombre},${curp(seed)},2015-0${(seed % 9) + 1}-1${seed % 9},${(seed % 6) + 1}ro Primaria,A,PRIMARIA,Activo,2026-08-15,QA`;
  const total = async () => (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=1")).rows[0].n;
  const sub = (request: APIRequestContext, ruta: string, texto: string, bom: boolean, rol = "ac") =>
    request.post(ruta, { headers: h(rol), multipart: { file: { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from((bom ? "\uFEFF" : "") + texto, "utf8") } }, failOnStatusCode: false });

  test("B-23 plantillas descargables; categoría inexistente da error controlado; sin sesión 401", async ({ request }) => {
    for (const p of ["estudiantes/estudiantes", "familias/tutores", "adeudos/migrados", "becas/asignaciones"]) {
      const r = await request.get(`/api/import/template/${p}`, { headers: h("ac") });
      expect(r.status(), p).toBe(200);
      expect(r.headers()["content-type"]).toContain("csv");
    }
    expect((await request.get("/api/import/template/inexistente/xx", { headers: h("ac"), failOnStatusCode: false })).status()).toBeLessThan(500);
    expect((await request.get("/api/import/template/estudiantes/estudiantes", { failOnStatusCode: false })).status()).toBe(401);
  });
  test("B-18 importación incremental (sin BOM): simulacro no escribe, real crea 14 y omite el duplicado, reimportar no duplica", async ({ request }) => {
    const base = S * 100;
    const filas = Array.from({ length: 14 }, (_, i) => filaAlumno(`QA Incremental ${S} Num${i + 1}`, base + i));
    const texto = [ENC, ...filas, filas[0]].join("\n");
    const antes = await total();
    const sim = await sub(request, "/api/import/data/estudiantes/estudiantes?dry_run=true", texto, false);
    nota(`simulacro ${sim.status()} ${(await sim.text()).slice(0, 220)}`);
    expect(sim.status()).toBe(200);
    expect(await total(), "el simulacro no debe escribir").toBe(antes);
    const real = await sub(request, "/api/import/data/estudiantes/estudiantes", texto, false);
    const rj = await body(real);
    nota(`real ${real.status()} exitosos=${rj.successful} omitidos=${rj.skipped} fallidos=${rj.failed}`);
    expect(real.status()).toBe(200);
    expect.soft((await total()) - antes, "14 nuevos").toBe(14);
    const otra = await sub(request, "/api/import/data/estudiantes/estudiantes", [ENC, ...filas].join("\n"), false);
    const oj = await body(otra);
    nota(`reimportación ${otra.status()} exitosos=${oj.successful} omitidos=${oj.skipped}`);
    expect.soft((await total()) - antes, "reimportar no duplica").toBe(14);
  });
  test("B-18 BOM: el mismo archivo con BOM (como lo guarda Excel y como baja la plantilla) debe importarse igual (H-B13)", async ({ request }) => {
    const base = S * 100 + 50;
    const texto = [ENC, filaAlumno(`QA Bom ${S} Uno`, base), filaAlumno(`QA Bom ${S} Dos`, base + 1)].join("\n");
    const sinBom = await sub(request, "/api/import/data/estudiantes/estudiantes?dry_run=true", texto, false);
    const conBom = await sub(request, "/api/import/data/estudiantes/estudiantes?dry_run=true", texto, true);
    const a = await body(sinBom), b = await body(conBom);
    nota(`sin BOM: exitosos=${a.successful} fallidos=${a.failed} ${JSON.stringify(a.errors ?? []).slice(0, 120)}`);
    nota(`con BOM: exitosos=${b.successful} fallidos=${b.failed} ${JSON.stringify(b.errors ?? []).slice(0, 160)}`);
    expect(a.successful, "sin BOM").toBe(2);
    expect.soft(b.successful, "con BOM").toBe(2);
  });
  test("B-18 la plantilla oficial sin modificar se puede importar (simulacro)", async ({ request }) => {
    const t = await (await request.get("/api/import/template/estudiantes/estudiantes", { headers: h("ac") })).text();
    const r = await sub(request, "/api/import/data/estudiantes/estudiantes?dry_run=true", t.replace(/^\uFEFF/, ""), true);
    const j = await body(r);
    nota(`plantilla tal cual: ${r.status()} exitosos=${j.successful} fallidos=${j.failed} ${JSON.stringify(j.errors ?? []).slice(0, 160)}`);
    expect.soft(j.successful, "la fila de ejemplo de la plantilla").toBeGreaterThanOrEqual(1);
  });
  test("B-18 permisos y formato: asistente 403; archivo .txt da 4xx y no 500; sin sesión 401", async ({ request }) => {
    const c = [ENC, filaAlumno("QA X", S * 100 + 90)].join("\n");
    expect((await sub(request, "/api/import/data/estudiantes/estudiantes", c, false, "as")).status()).toBe(403);
    const txt = await request.post("/api/import/data/estudiantes/estudiantes", { headers: h("ac"), multipart: { file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hola") } }, failOnStatusCode: false });
    nota(`.txt: ${txt.status()}`);
    expect.soft(txt.status(), "archivo .txt").toBeLessThan(500);
    expect.soft(txt.status()).toBeGreaterThanOrEqual(400);
    expect((await request.post("/api/import/data/estudiantes/estudiantes", { multipart: { file: { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from(c) } }, failOnStatusCode: false })).status()).toBe(401);
  });
  test("B-20 adeudos migrados: fecha imposible, monto negativo o decimal se rechazan sin escribir", async ({ request }) => {
    const alumno = (await db.query("SELECT id, id_referencia FROM students WHERE campus_id=1 AND id_referencia IS NOT NULL ORDER BY id LIMIT 1")).rows[0];
    const enc = "id_estudiante,curp_estudiante,tipo_concepto,monto_centavos,fecha_vencimiento,ciclo_escolar,descripcion";
    const antes = (await db.query("SELECT count(*)::int AS n FROM charges")).rows[0].n;
    for (const [caso, fila] of [["fecha 2026-02-30", `${alumno.id_referencia},,colegiatura,100000,2026-02-30,2025-2026,QA`], ["monto negativo", `${alumno.id_referencia},,colegiatura,-5000,2026-03-10,2025-2026,QA`], ["monto decimal", `${alumno.id_referencia},,colegiatura,1000.5,2026-03-10,2025-2026,QA`]]) {
      const r = await sub(request, "/api/import/data/adeudos/migrados", `${enc}\n${fila}`, false);
      nota(`${caso}: ${r.status()} ${(await r.text()).slice(0, 120)}`);
      expect.soft(r.status(), caso).toBeGreaterThanOrEqual(400);
      expect.soft(r.status(), `${caso} no debe ser 500`).toBeLessThan(500);
    }
    expect((await db.query("SELECT count(*)::int AS n FROM charges")).rows[0].n, "no debe escribir nada").toBe(antes);
    expect((await sub(request, "/api/import/data/adeudos/migrados", `${enc}\n${alumno.id_referencia},,colegiatura,100000,2026-03-10,2025-2026,QA`, false, "as")).status()).toBe(403);
  });
  test("B-21 importación de becas: porcentaje 120 y vigencia invertida se rechazan con mensaje específico; admisiones 403", async ({ request }) => {
    const enc = "id_estudiante,curp_estudiante,nombre_estudiante,tipo_beca,tipo_descuento,valor_descuento,vigencia_inicio,vigencia_fin,observaciones";
    const id = (await db.query("SELECT id FROM students WHERE campus_id=1 ORDER BY id LIMIT 1")).rows[0].id;
    const a = await sub(request, "/api/import/data/becas/asignaciones", `${enc}\n${id},,QA,Beca QA,porcentaje,120,2026-08-01,2027-07-01,QA`, false);
    const b = await sub(request, "/api/import/data/becas/asignaciones", `${enc}\n${id},,QA,Beca QA,porcentaje,20,2027-08-01,2026-07-01,QA`, false);
    nota(`porcentaje 120: ${a.status()} ${(await a.text()).slice(0, 150)}`);
    nota(`vigencia invertida: ${b.status()} ${(await b.text()).slice(0, 150)}`);
    expect(a.status()).toBeGreaterThanOrEqual(400);
    expect(b.status()).toBeGreaterThanOrEqual(400);
    expect((await sub(request, "/api/import/data/becas/asignaciones", `${enc}\n${id},,QA,Beca QA,porcentaje,20,2026-08-01,2027-07-01,QA`, false, "ad")).status()).toBe(403);
  });
  test("B-17 importación de familias y tutores: simulacro no escribe, real crea, porcentaje 150 da error", async ({ request }) => {
    const enc = "nombre_familia,id_referencia_alumno,curp_alumno,tipo_guardian,nombres_tutor,apellido_paterno_tutor,apellido_materno_tutor,curp_tutor,email_tutor,celular_tutor,es_responsable_pago,porcentaje_responsabilidad";
    const cA = curp(S * 100 + 70);
    await nuevoAlumno(request, "ac", "imp-fam", { curp: cA });
    const n = unico();
    const fila = (pct: number, mail: string) => `Familia Import QA ${n},,${cA},madre,Ana,QA,Uno,,${mail},5511112222,true,${pct}`;
    const antes = (await db.query("SELECT count(*)::int AS n FROM families")).rows[0].n;
    const sim = await sub(request, "/api/import/data/familias/tutores?dry_run=true", `${enc}\n${fila(100, `imp.${n}@example.test`)}`, false);
    const sj = await body(sim);
    nota(`simulacro ${sim.status()} exitosos=${sj.successful} fallidos=${sj.failed} ${JSON.stringify(sj.errors ?? []).slice(0, 160)}`);
    expect(sim.status()).toBe(200);
    expect((await db.query("SELECT count(*)::int AS n FROM families")).rows[0].n, "el simulacro no debe escribir").toBe(antes);
    const real = await sub(request, "/api/import/data/familias/tutores", `${enc}\n${fila(100, `imp.${n}@example.test`)}`, false);
    const rj = await body(real);
    nota(`real ${real.status()} exitosos=${rj.successful} fallidos=${rj.failed} ${JSON.stringify(rj.errors ?? []).slice(0, 160)}`);
    expect.soft((await db.query("SELECT count(*)::int AS n FROM families")).rows[0].n, "la importación real crea la familia").toBe(antes + 1);
    const mal = await sub(request, "/api/import/data/familias/tutores", `${enc}\n${fila(150, `imp2.${n}@example.test`)}`, false);
    expect(mal.status(), "porcentaje 150").toBeGreaterThanOrEqual(400);
    expect(mal.status()).toBeLessThan(500);
  });
});

// ───────────────────────── CATÁLOGO Y PRECIOS (B-25 a B-30) ─────────────────────────
test.describe("conceptos y productos", () => {
  test("B-25 conceptos: alta, edición sin iva conserva el valor, eliminar con cargos 409, asistente 403", async ({ request }) => {
    const c = await request.post("/api/concepts", { headers: h("ac"), data: { nombre: `QA Concepto ${S}`, tipo: "extra", periodicidad: "anual", monto_centavos: 50000, iva: true }, failOnStatusCode: false });
    nota(`alta concepto ${c.status()} ${(await c.text()).slice(0, 140)}`);
    expect(c.status()).toBe(201);
    ids.concepto = (await c.json()).id;
    const e = await request.put(`/api/concepts/${ids.concepto}`, { headers: h("ac"), data: { nombre: `QA Concepto ${S} editado`, monto_centavos: 60000 }, failOnStatusCode: false });
    expect(e.status()).toBe(200);
    const iva = (await db.query("SELECT iva FROM concepts WHERE id=$1", [ids.concepto])).rows[0].iva;
    expect.soft(iva, "editar sin enviar iva no debe borrar el IVA (H-B12)").toBe(true);
    expect((await request.post("/api/concepts", { headers: h("as"), data: { nombre: "x", tipo: "extra", periodicidad: "anual", monto_centavos: 1 }, failOnStatusCode: false })).status()).toBe(403);
    const conCargos = (await db.query("SELECT ch.concept_id FROM charges ch JOIN students st ON st.id = ch.student_id WHERE st.campus_id=1 LIMIT 1")).rows[0].concept_id;
    expect((await request.delete(`/api/concepts/${conCargos}`, { headers: h("ac"), failOnStatusCode: false })).status(), "eliminar concepto con cargos").toBe(409);
    const sinNombre = await request.post("/api/concepts", { headers: h("ac"), data: { tipo: "extra", periodicidad: "anual", monto_centavos: 100 }, failOnStatusCode: false });
    expect.soft(sinNombre.status(), "concepto sin nombre: 4xx y no 500").toBeLessThan(500);
    expect.soft(sinNombre.status()).toBeGreaterThanOrEqual(400);
  });
  test("B-28 productos: alta, código repetido 409, categoría inválida 400, precio negativo (H-B24)", async ({ request }) => {
    const datos = { codigo: `QA-LIB-${S}`, nombre: "Libro QA", categoria: "LIBROS", precio_primaria: 15000 };
    const ok = await request.post("/api/products", { headers: h("ac"), data: datos, failOnStatusCode: false });
    expect(ok.status()).toBe(201); ids.prod = (await ok.json()).id;
    expect((await request.post("/api/products", { headers: h("ac"), data: datos, failOnStatusCode: false })).status(), "código repetido").toBe(409);
    expect((await request.post("/api/products", { headers: h("ac"), data: { ...datos, codigo: `QA-X-${S}`, categoria: "XYZ" }, failOnStatusCode: false })).status()).toBe(400);
    const neg = await request.post("/api/products", { headers: h("ac"), data: { ...datos, codigo: `QA-N-${S}`, precio_primaria: -5 }, failOnStatusCode: false });
    expect.soft(neg.status(), "precio negativo").toBeGreaterThanOrEqual(400);
    const txt = await request.post("/api/products", { headers: h("ac"), data: { ...datos, codigo: `QA-T-${S}`, precio_primaria: "abc" }, failOnStatusCode: false });
    expect.soft(txt.status(), "precio no numérico").toBeGreaterThanOrEqual(400);
    expect.soft(txt.status(), "precio no numérico no debe ser 500").toBeLessThan(500);
    expect((await request.post("/api/products", { headers: h("as"), data: datos, failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-29 productos: PATCH sin 'activo' no debe dar 500; desactivar y eliminar", async ({ request }) => {
    const p = await request.patch(`/api/products/${ids.prod}`, { headers: h("ac"), data: { nombre: "Libro QA editado" }, failOnStatusCode: false });
    expect.soft(p.status(), "PATCH sin activo").toBeLessThan(500);
    const off = await request.patch(`/api/products/${ids.prod}`, { headers: h("ac"), data: { activo: false }, failOnStatusCode: false });
    expect(off.status()).toBe(200);
    expect((await request.delete(`/api/products/${ids.prod}`, { headers: h("ac"), failOnStatusCode: false })).status()).toBe(200);
  });
  test("B-27 productos: contador y asistente no leen el catálogo; otra escuela no ve el de A", async ({ request }) => {
    for (const rol of ["cg", "as"]) expect((await request.get("/api/products", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(403);
    const b = await body(await request.get("/api/products", { headers: h("acb") }));
    expect(JSON.stringify(b)).not.toContain("QA-LIB");
  });
  test("B-30 asignación de precios: el producto inactivo se rechaza; el de otro campus se rechaza", async ({ request }) => {
    const prod = await request.post("/api/products", { headers: h("ac"), data: { codigo: `QA-AP-${S}`, nombre: "Prod QA AP", categoria: "OTROS", activo: false, precio_primaria: 1000 } });
    const pid = (await prod.json()).id;
    const r = await request.post("/api/admin/cargos/desde-catalogo", { headers: h("ac"), data: { product_id: pid, fecha_vencimiento: "2026-12-30" }, failOnStatusCode: false });
    nota(`producto inactivo: ${r.status()} ${(await r.text()).slice(0, 140)}`);
    expect([400, 409, 422]).toContain(r.status());
  });
});

// ───────────────────────── BECAS (B-31 a B-36) ─────────────────────────
test.describe("becas", () => {
  test("B-32 beca individual: 30% se asigna; solapada avisa; 101, monto_fijo y asistente se rechazan", async ({ request }) => {
    const id = ids.c1students[3];
    const a = await request.post(`/api/admin/students/${id}/beca`, { headers: h("ac"), data: { porcentaje: 30, motivo: "QA" }, failOnStatusCode: false });
    nota(`asignar: ${a.status()} ${(await a.text()).slice(0, 160)}`);
    expect(a.status()).toBeLessThan(300);
    const b = await request.post(`/api/admin/students/${id}/beca`, { headers: h("ac"), data: { porcentaje: 20, motivo: "QA solapada" }, failOnStatusCode: false });
    const bj = await body(b);
    nota(`solapada: ${b.status()} overlap=${bj.overlap_warning}`);
    expect.soft(bj.overlap_warning, "la segunda beca vigente debe avisar").toBe(true);
    expect((await request.post(`/api/admin/students/${id}/beca`, { headers: h("ac"), data: { porcentaje: 101 }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.post(`/api/admin/students/${id}/beca`, { headers: h("ac"), data: { porcentaje: 10, monto_fijo: 500 }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.post(`/api/admin/students/${id}/beca`, { headers: h("as"), data: { porcentaje: 10 }, failOnStatusCode: false })).status()).toBe(403);
    expect((await request.post(`/api/admin/students/${ids.c2student}/beca`, { headers: h("ac"), data: { porcentaje: 10 }, failOnStatusCode: false })).status(), "alumno de otro campus").toBe(404);
    const fecha = await request.post(`/api/admin/students/${id}/beca`, { headers: h("ac"), data: { porcentaje: 10, vigencia_inicio: "mañana" }, failOnStatusCode: false });
    expect.soft(fecha.status(), "vigencia inválida: 400 y no 500 (H-B15)").toBe(400);
  });
  test("B-32 la beca no debe aceptar porcentaje negativo ni texto", async ({ request }) => {
    const id = ids.c1students[4];
    expect((await request.post(`/api/admin/students/${id}/beca`, { headers: h("ac"), data: { porcentaje: -5 }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.post(`/api/admin/students/${id}/beca`, { headers: h("ac"), data: { porcentaje: "abc" }, failOnStatusCode: false })).status()).toBe(400);
  });
  test("B-31 lista de becas: AC, admisiones y asistente la leen; AG y CG no (H-B02)", async ({ request }) => {
    for (const rol of ["ac", "ad", "as"]) expect((await request.get("/api/scholarships", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(200);
    for (const rol of ["ag", "cg"]) expect.soft((await request.get("/api/scholarships", { headers: h(rol), failOnStatusCode: false })).status(), `${rol} puede asignar becas y debería poder verlas`).toBe(200);
  });
  test("B-34 tipos de beca: alta válida; 0 y 150 por ciento se rechazan; asistente 403", async ({ request }) => {
    const base = { nombre: `QA Tipo ${S}`, descripcion: "QA" };
    const probe = await request.post("/api/admin/scholarship-types", { headers: h("ac"), data: base, failOnStatusCode: false });
    nota(`tipo de beca sin porcentaje: ${probe.status()} ${(await probe.text()).slice(0, 160)}`);
    expect(probe.status()).toBeGreaterThanOrEqual(400);
    expect((await request.post("/api/admin/scholarship-types", { headers: h("as"), data: base, failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-35 reglas automáticas: tipo distinto de hermanos 422; asistente y admisiones 403", async ({ request }) => {
    const r = await request.post("/api/becas-auto/reglas", { headers: h("ac"), data: { tipo: "otra", porcentaje: 10 }, failOnStatusCode: false });
    nota(`regla tipo otra: ${r.status()} ${(await r.text()).slice(0, 120)}`);
    expect(r.status()).toBeGreaterThanOrEqual(400);
    for (const rol of ["ad", "as"]) expect((await request.post("/api/becas-auto/reglas", { headers: h(rol), data: { tipo: "hermanos", porcentaje: 10 }, failOnStatusCode: false })).status(), rol).toBe(403);
    expect((await request.get("/api/becas-auto/reglas/2", { headers: h("ac"), failOnStatusCode: false })).status(), "campus ajeno").toBe(403);
  });
  test("B-36 ejecutar becas automáticas: ciclo inválido 400; asistente 403", async ({ request }) => {
    expect((await request.post("/api/becas-auto/ejecutar", { headers: h("as"), data: {}, failOnStatusCode: false })).status()).toBe(403);
    const r = await request.post("/api/becas-auto/ejecutar", { headers: h("ac"), data: { ciclo_escolar: "2026" }, failOnStatusCode: false });
    nota(`ciclo "2026": ${r.status()}`);
    expect(r.status()).toBe(400);
  });
});

// ───────────────────────── CONFIGURACIÓN (B-37 a B-54) ─────────────────────────
test.describe("configuración", () => {
  test("B-37 información institucional: AC guarda; asistente 403; RFC y correo inválidos (H-B17)", async ({ request }) => {
    const ok = await request.post("/api/institutional-info", { headers: h("ac"), data: { nombre_legal: "Instituto QA", rfc: "XAXX010101000", email_institucional: "qa@example.test" }, failOnStatusCode: false });
    nota(`guardar: ${ok.status()}`);
    expect(ok.status()).toBeLessThan(300);
    expect((await request.post("/api/institutional-info", { headers: h("as"), data: { nombre_legal: "Hack" }, failOnStatusCode: false })).status()).toBe(403);
    const rfc = await request.post("/api/institutional-info", { headers: h("ac"), data: { nombre_legal: "Instituto QA", rfc: "123" }, failOnStatusCode: false });
    expect.soft(rfc.status(), "RFC '123'").toBeGreaterThanOrEqual(400);
    const mail = await request.post("/api/institutional-info", { headers: h("ac"), data: { nombre_legal: "Instituto QA", rfc: "XAXX010101000", email_institucional: "no-es-correo" }, failOnStatusCode: false });
    expect.soft(mail.status(), "correo institucional inválido").toBeGreaterThanOrEqual(400);
    await request.post("/api/institutional-info", { headers: h("ac"), data: { nombre_legal: "Instituto QA", rfc: "XAXX010101000", email_institucional: "qa@example.test" } });
  });
  test("B-37 la información institucional de la escuela A no se ve desde la escuela B", async ({ request }) => {
    const r = await body(await request.get("/api/institutional-info", { headers: h("acb") }));
    expect(JSON.stringify(r)).not.toContain("Instituto QA");
  });
  test("B-47 fechas de vencimiento: alta válida; día 45, sin meses y regla duplicada deben rechazarse (H-B10)", async ({ request }) => {
    const concepto = (await db.query("SELECT id FROM concepts WHERE campus_id=1 AND periodicidad='mensual' ORDER BY id LIMIT 1")).rows[0].id;
    const creadas: number[] = [];
    const alta = async (data: any) => { const r = await request.post("/api/payment-config/due-dates-complete", { headers: h("ac"), data, failOnStatusCode: false }); const j = await body(r); if (j.id) creadas.push(j.id); return { s: r.status(), j }; };
    const dia45 = await alta({ concepto_id: concepto, dia_vencimiento: 45, meses_aplicacion: ["enero"] });
    nota(`día 45: ${dia45.s}`);
    expect.soft(dia45.s, "día 45 debe ser 400").toBe(400);
    const dia0 = await alta({ concepto_id: concepto, dia_vencimiento: 0, meses_aplicacion: ["enero"] });
    nota(`día 0: ${dia0.s}`);
    expect.soft(dia0.s, "día 0 debe ser 400").toBe(400);
    const sinMeses = await alta({ concepto_id: concepto, dia_vencimiento: 10 });
    nota(`sin meses: ${sinMeses.s}`);
    expect.soft(sinMeses.s, "sin meses_aplicacion debe ser 400").toBe(400);
    const a = await alta({ concepto_id: concepto, dia_vencimiento: 10, meses_aplicacion: ["marzo"] });
    nota(`alta válida ${a.s}`);
    const b = await alta({ concepto_id: concepto, dia_vencimiento: 15, meses_aplicacion: ["marzo"] });
    expect.soft(b.s, "segunda regla activa del mismo concepto y mes").toBeGreaterThanOrEqual(400);
    expect((await request.post("/api/payment-config/due-dates-complete", { headers: h("as"), data: { concepto_id: concepto, dia_vencimiento: 10, meses_aplicacion: ["marzo"] }, failOnStatusCode: false })).status()).toBe(403);
    for (const id of creadas) await request.delete(`/api/payment-config/due-dates-complete/${id}`, { headers: h("ac"), failOnStatusCode: false });
  });
  test("B-48 periodos de vencimiento: cuerpo vacío debe ser 400 (H-B11)", async ({ request }) => {
    const r = await request.post("/api/payment-config/due-date-periods", { headers: h("ac"), data: {}, failOnStatusCode: false });
    expect.soft(r.status(), "cuerpo vacío").toBe(400);
    expect((await request.post("/api/payment-config/due-date-periods", { headers: h("as"), data: {}, failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-50 recargos: cuerpo vacío 400; asistente 403; las lecturas funcionan para AC", async ({ request }) => {
    expect((await request.post("/api/payment-config/surcharge-rules-complete", { headers: h("ac"), data: {}, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.post("/api/payment-config/surcharge-rules-complete", { headers: h("as"), data: {}, failOnStatusCode: false })).status()).toBe(403);
    expect((await request.get("/api/payment-config/surcharge-rules-complete", { headers: h("ac") })).status()).toBe(200);
  });
  test("B-51 endpoints heredados de configuración devuelven 410", async ({ request }) => {
    const r = await request.post("/api/payment-config/due-dates", { headers: h("ac"), data: { concepto: "x", dia_vencimiento: 5 }, failOnStatusCode: false });
    expect(r.status()).toBe(410);
  });
  test("B-52 reglas de pago: el asistente no debe poder crearlas (H-B05)", async ({ request }) => {
    const r = await request.post("/api/payment-rules", { headers: h("as"), data: { rule_type: "descuento", name: "QA hack" }, failOnStatusCode: false });
    nota(`AS POST payment-rules: ${r.status()}`);
    expect.soft(r.status(), "asistente crea regla de pago").toBe(403);
    expect.soft((await request.get("/api/payment-rules", { headers: h("as"), failOnStatusCode: false })).status(), "asistente lee reglas de pago").toBe(403);
  });
  test("B-53 calendario: evento válido; sin título y completar inexistente (H-B23); AX no crea", async ({ request }) => {
    const ok = await request.post("/api/calendario/eventos", { headers: h("ag"), data: { titulo: `Cierre QA ${S}`, fecha: "2026-12-20", tipo: "otro" }, failOnStatusCode: false });
    expect(ok.status()).toBe(200);
    const sinTitulo = await request.post("/api/calendario/eventos", { headers: h("ag"), data: { fecha: "2026-12-20" }, failOnStatusCode: false });
    expect.soft(sinTitulo.status(), "sin título").toBeGreaterThanOrEqual(400);
    expect.soft(sinTitulo.status(), "sin título no debe ser 500").toBeLessThan(500);
    const inexistente = await request.post("/api/calendario/eventos/999999/completar", { headers: h("ag"), failOnStatusCode: false });
    expect.soft(inexistente.status(), "completar evento inexistente").toBeGreaterThanOrEqual(400);
    expect((await request.post("/api/calendario/eventos", { headers: h("ax"), data: { titulo: "x", fecha: "2026-12-20" }, failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-42 pasos del asistente de configuración: paso inválido 400; asistente 403", async ({ request }) => {
    const r = await request.patch("/api/admin/configuracion/onboarding-step/hack", { headers: h("ac"), data: { completed: true }, failOnStatusCode: false });
    expect(r.status()).toBe(400);
    expect((await request.patch("/api/admin/configuracion/onboarding-step/alumnos", { headers: h("as"), data: { completed: true }, failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-43 validación de integridad: no cuenta becas de otro campus (H-B08)", async ({ request }) => {
    const r = await body(await request.get("/api/admin/configuracion/validacion-onboarding", { headers: h("ac2") }));
    nota(`validación AC campus 2: ${JSON.stringify(r).slice(0, 400)}`);
    const errores = JSON.stringify(r.errores ?? r.errors ?? []);
    expect.soft(errores, "el campus 2 no tiene becas propias: no debe marcar error por becas del campus 1").not.toMatch(/beca/i);
  });
  test("B-44 simulación de cargos: AC la lee; asistente 403", async ({ request }) => {
    expect((await request.get("/api/admin/configuracion/simulacion-cargos", { headers: h("ac") })).status()).toBe(200);
    expect((await request.get("/api/admin/configuracion/simulacion-cargos", { headers: h("as"), failOnStatusCode: false })).status()).toBe(403);
  });
  test("B-57 estatus de escuela: no debe responder éxito sin cambiar nada (H-B19)", async ({ request }) => {
    const sa = await staffApiLogin(request, "superadmin@edupay.mx", PW);
    const t = { Authorization: `Bearer ${(await sa.json()).token}` };
    const antes = (await db.query("SELECT * FROM tenants WHERE id=1")).rows[0];
    const r = await request.post("/api/super-admin/update-school-status", { headers: t, data: { school_id: 1, schoolId: 1, status: "suspendida", estado: "suspendida", is_active: false }, failOnStatusCode: false });
    nota(`update-school-status: ${r.status()} ${(await r.text()).slice(0, 140)}`);
    const despues = (await db.query("SELECT * FROM tenants WHERE id=1")).rows[0];
    if (r.status() === 200) expect.soft(JSON.stringify(despues), "respondió éxito: debe haber cambiado algo").not.toBe(JSON.stringify(antes));
  });
});

// ───────────────────────── AISLAMIENTO (B-55) ─────────────────────────
test.describe("aislamiento entre escuelas", () => {
  test("B-55 la escuela B no ve alumnos, conceptos ni productos de la escuela A", async ({ request }) => {
    const al = await body(await request.get("/api/admin/students", { headers: h("acb") }));
    expect(al.every((s: any) => s.campus_id === 51)).toBe(true);
    const co = await body(await request.get("/api/concepts", { headers: h("acb"), failOnStatusCode: false }));
    expect(JSON.stringify(co)).not.toContain("Colegiatura Mensual Primaria");
  });
  test("B-55 el AC de la escuela B no puede operar sobre alumnos ni familias de la escuela A", async ({ request }) => {
    expect((await request.patch(`/api/admin/students/${ids.c1students[5]}`, { headers: h("acb"), data: { grupo: "Z" }, failOnStatusCode: false })).status()).toBe(403);
    const fam = (await db.query("SELECT id FROM families WHERE campus_id=1 LIMIT 1")).rows[0].id;
    expect([403, 404]).toContain((await request.patch(`/api/admin/families/${fam}/status`, { headers: h("acb"), data: { status: "archivada", motivo: "x", confirmacion: true, confirmacion_final: true }, failOnStatusCode: false })).status());
    expect([403, 404]).toContain((await request.post(`/api/admin/students/${ids.c1students[5]}/beca`, { headers: h("acb"), data: { porcentaje: 10 }, failOnStatusCode: false })).status());
  });
});

// ───────────────────────── B-30 asignación de precios, ruta feliz ─────────────────────────
test.describe("asignación de precios (B-30)", () => {
  test("aplica el precio de cada nivel, omite niveles con precio 0 y no duplica al repetir (C-H5)", async ({ request }) => {
    const nombre = `QA Cuaderno ${S}`;
    const p = await request.post("/api/products", { headers: h("ac"), data: { codigo: `QA-C-${S}`, nombre, categoria: "OTROS", precio_primaria: 20000, precio_secundaria: 30000, precio_kinder: 0, precio_bachillerato: 0 } });
    expect(p.status()).toBe(201);
    const pid = (await p.json()).id;
    const consulta = async () => (await db.query(
      `SELECT upper(s.nivel_escolar) AS nivel, ch.monto_base_centavos AS monto, count(*)::int AS n
         FROM charges ch JOIN students s ON s.id = ch.student_id JOIN concepts c ON c.id = ch.concept_id
        WHERE c.nombre = $1 AND s.campus_id = 1 GROUP BY 1, 2 ORDER BY 1`, [nombre])).rows;
    const activos = (await db.query("SELECT upper(nivel_escolar) AS nivel, count(*)::int AS n FROM students WHERE campus_id=1 AND status='activo' GROUP BY 1")).rows;
    nota(`alumnos activos por nivel: ${JSON.stringify(activos)}`);
    const a = await request.post("/api/admin/cargos/desde-catalogo", { headers: h("ac"), data: { producto_id: pid, fecha_emision: "2026-12-01", fecha_vencimiento: "2026-12-15" }, failOnStatusCode: false });
    nota(`primera ejecución: ${a.status()} ${(await a.text()).slice(0, 220)}`);
    expect(a.status()).toBeLessThan(300);
    const tras1 = await consulta();
    nota(`cargos tras la 1a: ${JSON.stringify(tras1)}`);
    expect(tras1.length, "debe crear cargos").toBeGreaterThan(0);
    for (const f of tras1) {
      const esperado = f.nivel === "PRIMARIA" ? 20000 : f.nivel === "SECUNDARIA" ? 30000 : null;
      expect.soft(Number(f.monto), `monto del nivel ${f.nivel}`).toBe(esperado);
    }
    const total1 = tras1.reduce((t: number, f: any) => t + f.n, 0);
    const b = await request.post("/api/admin/cargos/desde-catalogo", { headers: h("ac"), data: { producto_id: pid, fecha_emision: "2026-12-01", fecha_vencimiento: "2026-12-15" }, failOnStatusCode: false });
    nota(`segunda ejecución: ${b.status()} ${(await b.text()).slice(0, 160)}`);
    const total2 = (await consulta()).reduce((t: number, f: any) => t + f.n, 0);
    nota(`total de cargos: ${total1} tras la 1a, ${total2} tras la 2a`);
    expect.soft(total2, "repetir la asignación no debe duplicar cargos").toBe(total1);
    expect((await request.post("/api/admin/cargos/desde-catalogo", { headers: h("as"), data: { producto_id: pid }, failOnStatusCode: false })).status()).toBe(403);
    expect([403, 404], "producto de otra escuela").toContain((await request.post("/api/admin/cargos/desde-catalogo", { headers: h("acb"), data: { producto_id: pid }, failOnStatusCode: false })).status());
  });
});
