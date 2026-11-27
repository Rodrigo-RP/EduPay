/**
 * QA fase 5: portal de tutores y acceso por liga (área D, D-01 a D-16). Base desechable edupay_ci.
 * Cada prueba afirma el comportamiento DISEÑADO; un fallo es un defecto reproducido o una decisión de producto pendiente.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { staffApiLogin, ADMIN_PASSWORD } from "../e2e/helpers/auth";

const require = createRequire(import.meta.url);
const pg = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PW = ADMIN_PASSWORD;
const E: Record<string, string> = {
  ag: "directora@jfr.edu.mx", ac: "admin.campus@jfr.edu.mx", ax: "caja@jfr.edu.mx", cg: "contador@jfr.edu.mx",
  ad: "admisiones@jfr.edu.mx", as: "qa.asistente@qa.test", ac2: "qa.ac2@qa.test", acb: "qa.acb@qa.test", agb: "qa.ag.b@qa.test",
};
const tk: Record<string, string> = {};
const h = (k: string) => ({ Authorization: `Bearer ${tk[k]}` });
const S = Date.now() % 100000;
let n = 0;
const uniq = () => `${S}${++n}${Math.floor(Math.random() * 1000)}`;
const nota = (t: string) => test.info().annotations.push({ type: "obs", description: t });
const body = async (r: any) => { try { return await r.json(); } catch { return {}; } };
const hg = (t: string) => ({ Authorization: `Bearer ${t}` });

async function loginTutor(request: APIRequestContext, email: string, pw = PW) {
  const r = await request.post("/api/auth/guardian-login", { data: { email, password: pw }, failOnStatusCode: false });
  return { status: r.status(), body: await body(r) };
}
async function tokenTutor(request: APIRequestContext, email: string) {
  const l = await loginTutor(request, email);
  expect(l.status, `login tutor ${email}`).toBe(200);
  return l.body.token as string;
}
async function emitirLiga(request: APIRequestContext, rol: string, guardianId: number) {
  const r = await request.post("/api/admin/magic-link", { headers: h(rol), data: { guardian_id: guardianId, guardianId }, failOnStatusCode: false });
  const j = await body(r);
  const url: string = j.url || j.link || "";
  return { status: r.status(), j, token: url.split("/").pop() || "" };
}
const idTutor = async (email: string) => (await db.query("SELECT id FROM guardians WHERE email=$1", [email])).rows[0].id as number;

/** Crea una familia con un tutor nuevo y le pone contraseña, para pruebas que cambian su estado. */
async function tutorNuevo(request: APIRequestContext, tag: string) {
  const sid = (await (await request.post("/api/admin/students", { headers: h("ac"), data: { nombres: `QA ${tag} ${uniq()}`, apellido_paterno: "Prueba", nivel_escolar: "Primaria", grado: "3° Primaria", grupo: "A", status: "activo" } })).json()).id;
  const email = `tutor.${tag}.${uniq()}@example.test`;
  const f = await request.post("/api/admin/families", { headers: h("ac"), data: { nombre: `Familia ${tag} ${uniq()}`, student_ids: [sid], tutores: [{ nombres: "Tutor", apellido_paterno: "QA", tipo_guardian: "madre", correo_institucional_familiar: email, celular: "5512345678", es_responsable_pago: true, porcentaje_responsabilidad: 100 }] } });
  expect(f.status(), "crear familia").toBe(201);
  const fj = await f.json();
  const gid = (await db.query("SELECT id FROM guardians WHERE correo_institucional_familiar=$1 OR email=$1", [email])).rows[0].id as number;
  await db.query("UPDATE guardians SET password_hash=$1, email=$2 WHERE id=$3", [await bcrypt.hash(PW, 10), email, gid]);
  return { sid, email, gid, familyId: fj.family_id as number };
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await db.query("UPDATE campuses SET onboarding_completado = true");
  await db.query("UPDATE students s SET tenant_id = c.tenant_id FROM campuses c WHERE c.id = s.campus_id AND s.tenant_id IS NULL");
  for (const k of Object.keys(E)) {
    const r = await staffApiLogin(request, E[k], PW);
    expect(r.status(), `login ${k}`).toBe(200);
    tk[k] = (await r.json()).token;
  }
});
test.afterAll(async () => { await db.end(); });

// ───────────────────────── D-01 acceso del tutor ─────────────────────────
test.describe("D-01 acceso del tutor con contraseña", () => {
  test("credenciales válidas entran; la respuesta no trae hash ni datos sensibles", async ({ request }) => {
    const l = await loginTutor(request, "lopez.carlos@demo.mx");
    expect(l.status).toBe(200);
    expect(JSON.stringify(l.body)).not.toMatch(/password_hash|twofa/);
    expect(l.body.guardian.campus_id).toBeTruthy();
  });
  test("contraseña errónea y correo inexistente dan el mismo 401, sin pistas", async ({ request }) => {
    const a = await loginTutor(request, "lopez.carlos@demo.mx", "incorrecta");
    const b = await loginTutor(request, "no.existe@example.test", "incorrecta");
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });
  test("entradas inválidas no producen error de servidor", async ({ request }) => {
    for (const data of [{}, { email: "lopez.carlos@demo.mx" }, { password: PW }, { email: "' OR 1=1 --", password: "x" }, { email: ["a"], password: { x: 1 } }]) {
      const r = await request.post("/api/auth/guardian-login", { data, failOnStatusCode: false });
      expect(r.status(), JSON.stringify(data)).toBeLessThan(500);
      expect(r.status()).toBeGreaterThanOrEqual(400);
    }
  });
  test("las credenciales del personal no sirven en el acceso de tutores", async ({ request }) => {
    expect((await loginTutor(request, E.ac)).status).toBe(401);
  });
  test("una familia archivada pierde el acceso y reactivarla lo devuelve", async ({ request }) => {
    const t = await tutorNuevo(request, "arch");
    const viejo = await tokenTutor(request, t.email);
    expect((await request.get("/api/guardian/dashboard", { headers: hg(viejo) })).status()).toBe(200);
    const arch = await request.patch(`/api/admin/families/${t.familyId}/status`, { headers: h("ac"), data: { status: "archivada", motivo: "QA acceso", confirmacion: true, confirmacion_final: true }, failOnStatusCode: false });
    expect(arch.status()).toBe(200);
    const l = await loginTutor(request, t.email);
    nota(`login con familia archivada: ${l.status} ${l.body.code ?? ""}`);
    expect(l.status).toBe(403);
    const dash = await request.get("/api/guardian/dashboard", { headers: hg(viejo), failOnStatusCode: false });
    nota(`sesión anterior tras archivar: ${dash.status()}`);
    expect.soft(dash.status(), "la sesión abierta debe cortarse al archivar la familia").toBeGreaterThanOrEqual(400);
    expect((await request.patch(`/api/admin/families/${t.familyId}/status`, { headers: h("ac"), data: { status: "activo" } })).status()).toBe(200);
    expect((await loginTutor(request, t.email)).status).toBe(200);
  });
});

// ───────────────────────── D-02 / D-03 / D-04 ligas mágicas ─────────────────────────
test.describe("D-02 a D-04 ligas mágicas", () => {
  test("emisión: AC y AG emiten; contador y auxiliar no; otra escuela no ve al tutor", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    for (const rol of ["ac", "ag"]) expect((await emitirLiga(request, rol, g)).status, rol).toBe(200);
    for (const rol of ["cg", "ax"]) expect((await emitirLiga(request, rol, g)).status, rol).toBe(403);
    for (const rol of ["acb", "agb"]) expect((await emitirLiga(request, rol, g)).status, `${rol} (otra escuela)`).toBe(404);
  });
  test("emisión por asistente y admisiones (decisión de producto: restringen 'no procesan pagos')", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    const as = await emitirLiga(request, "as", g), ad = await emitirLiga(request, "ad", g);
    nota(`asistente emite liga de pago: ${as.status}; admisiones: ${ad.status}`);
    expect.soft(as.status, "asistente").toBe(403);
    expect.soft(ad.status, "admisiones").toBe(403);
  });
  test("la liga entra al portal, lleva 3 usos y el cuarto canje da 410", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    const l = await emitirLiga(request, "ac", g);
    expect(l.token.length).toBeGreaterThan(40);
    const claims: any[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = await request.get(`/api/auth/magic/${l.token}`, { failOnStatusCode: false });
      expect(r.status(), `canje ${i}`).toBe(200);
      claims.push(jwt.decode((await r.json()).token));
    }
    const cuarto = await request.get(`/api/auth/magic/${l.token}`, { failOnStatusCode: false });
    expect(cuarto.status(), "cuarto canje").toBe(410);
    expect(claims[0].type).toBe("guardian");
    nota(`claims del token de la liga: ${JSON.stringify(Object.keys(claims[0]))}`);
  });
  test("un previsualizador de enlaces que abre la liga (GET) gasta sus usos antes que el tutor", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    const l = await emitirLiga(request, "ac", g);
    for (let i = 0; i < 3; i++) await request.get(`/api/auth/magic/${l.token}`);
    const tutor = await request.get(`/api/auth/magic/${l.token}`, { failOnStatusCode: false });
    nota(`primer uso real del tutor tras 3 aperturas automáticas: ${tutor.status()}`);
    expect.soft(tutor.status(), "el tutor debería poder entrar tras una vista previa").toBe(200);
  });
  test("liga revocada, vencida, inventada y mal formada se rechazan sin error de servidor", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    const vencida = await emitirLiga(request, "ac", g);
    await db.query("UPDATE magic_link_tokens SET expires_at = NOW() - interval '1 hour' WHERE guardian_id=$1 AND created_at = (SELECT max(created_at) FROM magic_link_tokens WHERE guardian_id=$1)", [g]);
    const rv = await request.get(`/api/auth/magic/${vencida.token}`, { failOnStatusCode: false });
    expect(rv.status(), "vencida").toBe(410);
    const revocada = await emitirLiga(request, "ac", g);
    await db.query("UPDATE magic_link_tokens SET revoked_at = NOW() WHERE guardian_id=$1 AND created_at = (SELECT max(created_at) FROM magic_link_tokens WHERE guardian_id=$1)", [g]);
    expect((await request.get(`/api/auth/magic/${revocada.token}`, { failOnStatusCode: false })).status(), "revocada").toBe(410);
    for (const t of ["x".repeat(96), "corta", "%27%20OR%201%3D1", "a".repeat(5000)]) {
      const r = await request.get(`/api/auth/magic/${t}`, { failOnStatusCode: false });
      expect(r.status(), t.slice(0, 20)).toBeLessThan(500);
      expect(r.status()).toBeGreaterThanOrEqual(400);
    }
  });
  test("la sesión por liga abre el portal; el token no lleva campus_id (Q-13) y por eso no puede pagar", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    const l = await emitirLiga(request, "ac", g);
    const canje = await (await request.get(`/api/auth/magic/${l.token}`)).json();
    const t = hg(canje.token);
    expect((await request.get("/api/guardian/dashboard", { headers: t })).status()).toBe(200);
    expect.soft(jwt.decode(canje.token).campus_id, "campus_id en el token de la liga").toBeTruthy();
    const propio = (await db.query(`SELECT ch.id FROM charges ch JOIN student_guardian sg ON sg.student_id=ch.student_id WHERE sg.guardian_id=$1 AND ch.estado IN ('pendiente','parcial') LIMIT 1`, [g])).rows[0]?.id;
    const r = await request.post("/api/guardian/pagar", { headers: t, data: { charge_ids: [propio], payment_method_id: "pm_card_visa" }, failOnStatusCode: false });
    nota(`pago con el token de la liga: ${r.status()} ${(await r.text()).slice(0, 140)}`);
  });
  test("historial de ligas: AC lo ve; contador 403; otra escuela vacío; id inválido sin 500", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    const ok = await request.get(`/api/admin/magic-link/history/${g}`, { headers: h("ac") });
    expect(ok.status()).toBe(200);
    expect((await body(ok)).length ?? 1).toBeGreaterThan(0);
    expect((await request.get(`/api/admin/magic-link/history/${g}`, { headers: h("cg"), failOnStatusCode: false })).status()).toBe(403);
    const otra = await body(await request.get(`/api/admin/magic-link/history/${g}`, { headers: h("acb"), failOnStatusCode: false }));
    expect(JSON.stringify(otra)).not.toContain("token");
    expect((await request.get("/api/admin/magic-link/history/abc", { headers: h("ac"), failOnStatusCode: false })).status()).toBeLessThan(500);
  });
});

// ───────────────────────── D-06 / D-10 tipo de token y datos de la escuela ─────────────────────────
test.describe("D-06 y D-10 tipo de token", () => {
  const rutas: Array<[string, string]> = [["get", "/api/guardian/dashboard"], ["get", "/api/guardian/profile"], ["put", "/api/guardian/profile"], ["put", "/api/guardian/profile/password"], ["post", "/api/guardian/pagar"], ["post", "/api/guardian/spei-intent"], ["get", "/api/guardian/institutional-info"]];
  test("las 7 rutas del portal rechazan sin token y con token de personal", async ({ request }) => {
    for (const [m, p] of rutas) {
      const cuerpo = p.includes("pagar") ? { charge_ids: [1], payment_method_id: "pm" } : p.includes("spei") ? { charge_ids: [1] } : {};
      const sin = await (request as any)[m](p, { data: cuerpo, failOnStatusCode: false });
      expect([401, 403], `sin token ${m} ${p}`).toContain(sin.status());
      for (const rol of ["ac", "ag", "as"]) {
        const r = await (request as any)[m](p, { headers: h(rol), data: cuerpo, failOnStatusCode: false });
        expect(r.status(), `${rol} en ${m} ${p}`).toBe(403);
      }
    }
  });
  test("la información de la escuela es la del tutor aunque se pidan otros ids", async ({ request }) => {
    const t = await tokenTutor(request, "lopez.carlos@demo.mx");
    const a = await (await request.get("/api/guardian/institutional-info", { headers: hg(t) })).json();
    const b = await (await request.get("/api/guardian/institutional-info?tenant_id=999&campus_id=999", { headers: hg(t) })).json();
    expect(b).toEqual(a);
    expect(a.nombre_legal).toBeTruthy();
  });
});

// ───────────────────────── D-07 tablero del tutor ─────────────────────────
test.describe("D-07 tablero del tutor", () => {
  test("cada tutor ve solo a sus alumnos y la información es consistente con la base", async ({ request }) => {
    const out: Record<string, number[]> = {};
    for (const email of ["lopez.carlos@demo.mx", "hernandez.maria@demo.mx"]) {
      const t = await tokenTutor(request, email);
      const d = await (await request.get("/api/guardian/dashboard", { headers: hg(t) })).json();
      const ids = d.students.map((s: any) => s.id).sort();
      const esperados = (await db.query("SELECT sg.student_id FROM student_guardian sg JOIN guardians g ON g.id=sg.guardian_id WHERE g.email=$1 ORDER BY 1", [email])).rows.map((r: any) => r.student_id);
      expect(ids, `alumnos de ${email}`).toEqual(esperados);
      out[email] = ids;
      const ajenos = d.pendingCharges.filter((c: any) => !ids.includes(c.student_id));
      expect(ajenos.length, "cargos de alumnos ajenos").toBe(0);
      const sensibles: string[] = [];
      const walk = (o: any, p: string) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (/password_hash|twofa|username/i.test(k)) sensibles.push(`${p}.${k}`); walk(v, `${p}.${k}`); } };
      walk(d, "dashboard");
      nota(`columnas sensibles en el tablero de ${email}: ${sensibles.length} (p. ej. ${sensibles.slice(0, 2).join(", ")})`);
      expect.soft(sensibles, `el tablero de ${email} no debe enviar columnas de credenciales del alumno`).toEqual([]);
    }
    const comunes = out["lopez.carlos@demo.mx"].filter((x) => out["hernandez.maria@demo.mx"].includes(x));
    nota(`alumnos en común entre dos tutores: ${comunes.length}`);
  });
  test("el total pendiente usa las mismas unidades y la misma beca que el resto del sistema", async ({ request }) => {
    const g = await idTutor("lopez.carlos@demo.mx");
    const alumno = (await db.query("SELECT student_id FROM student_guardian WHERE guardian_id=$1 ORDER BY student_id LIMIT 1", [g])).rows[0].student_id;
    const t = await tokenTutor(request, "lopez.carlos@demo.mx");
    const antes = (await (await request.get("/api/guardian/dashboard", { headers: hg(t) })).json()).totalPendingBalance;
    const c = (await db.query(
      `INSERT INTO charges (student_id, concept_id, tenant_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,1,1,'2026-2027','2026-11-01','2026-12-30',100000,'50.00',0,'pendiente') RETURNING id`, [alumno])).rows[0].id;
    const despues = (await (await request.get("/api/guardian/dashboard", { headers: hg(t) })).json()).totalPendingBalance;
    const delta = Number(despues) - Number(antes);
    nota(`total pendiente: antes=${antes}, después=${despues}, incremento=${delta} por un cargo de 1000 pesos con beca del 50% (neto 500 pesos = 50000 centavos)`);
    const enPesos = delta === 500 || delta === 1000;
    nota(`el total parece expresado en ${enPesos ? "pesos" : "centavos"}`);
    expect.soft([50000, 500], "el incremento debe ser el neto de la beca (50000 centavos o 500 pesos)").toContain(delta);
    const campo = (await (await request.get("/api/guardian/dashboard", { headers: hg(t) })).json());
    nota(`saldo_a_favor_centavos=${campo.saldo_a_favor_centavos} (centavos) frente a totalPendingBalance=${campo.totalPendingBalance}`);
    await db.query("DELETE FROM charges WHERE id=$1", [c]);
  });
  test("un tutor sin hijos no produce error", async ({ request }) => {
    const gid = (await db.query("INSERT INTO guardians (tenant_id, campus_id, nombre_completo, email, password_hash) VALUES (1,1,'QA Sin Hijos',$1,$2) RETURNING id", [`sin.hijos.${uniq()}@example.test`, await bcrypt.hash(PW, 10)])).rows[0].id;
    const email = (await db.query("SELECT email FROM guardians WHERE id=$1", [gid])).rows[0].email;
    const l = await loginTutor(request, email);
    nota(`login de un tutor sin familia: ${l.status} ${l.body.code ?? ""}`);
    if (l.status === 200) {
      const d = await request.get("/api/guardian/dashboard", { headers: hg(l.body.token), failOnStatusCode: false });
      expect(d.status()).toBeLessThan(500);
    } else expect(l.status).toBeLessThan(500);
  });
});

// ───────────────────────── D-08 / D-09 pagos del tutor (validaciones) ─────────────────────────
test.describe("D-09 pago por SPEI: validaciones previas a Stripe", () => {
  test("rechaza ids inválidos, cargos ajenos y sin sesión; sin Stripe no crea pagos", async ({ request }) => {
    const t = await tokenTutor(request, "lopez.carlos@demo.mx");
    expect((await request.post("/api/guardian/spei-intent", { headers: hg(t), data: { charge_ids: [0, -1] }, failOnStatusCode: false })).status(), "ids [0,-1]").toBe(400);
    expect((await request.post("/api/guardian/spei-intent", { headers: hg(t), data: { charge_ids: [] }, failOnStatusCode: false })).status(), "vacío").toBe(400);
    const ajeno = (await db.query(`SELECT ch.id FROM charges ch JOIN students s ON s.id=ch.student_id WHERE s.campus_id=1 AND ch.student_id NOT IN (SELECT student_id FROM student_guardian WHERE guardian_id=(SELECT id FROM guardians WHERE email='lopez.carlos@demo.mx')) LIMIT 1`)).rows[0].id;
    const sa = await request.post("/api/guardian/spei-intent", { headers: hg(t), data: { charge_ids: [ajeno] }, failOnStatusCode: false });
    nota(`SPEI con cargo ajeno: ${sa.status()} (revisa Stripe antes que la propiedad del cargo; sin Stripe no se puede concluir)`);
    expect([403, 409], "cargo ajeno").toContain(sa.status());
    const propio = (await db.query(`SELECT ch.id FROM charges ch JOIN student_guardian sg ON sg.student_id=ch.student_id JOIN guardians g ON g.id=sg.guardian_id WHERE g.email='lopez.carlos@demo.mx' AND ch.estado IN ('pendiente','parcial') LIMIT 1`)).rows[0].id;
    const antes = (await db.query("SELECT count(*)::int AS n FROM payments")).rows[0].n;
    const r = await request.post("/api/guardian/spei-intent", { headers: hg(t), data: { charge_ids: [propio] }, failOnStatusCode: false });
    nota(`SPEI propio sin Stripe: ${r.status()} ${(await r.text()).slice(0, 140)}`);
    expect([409, 422]).toContain(r.status());
    expect((await db.query("SELECT count(*)::int AS n FROM payments")).rows[0].n).toBe(antes);
  });
});

// ───────────────────────── D-12 / D-13 perfil y contraseña ─────────────────────────
test.describe("D-12 y D-13 perfil y contraseña del tutor", () => {
  test("el perfil no expone hash; un teléfono nuevo se refleja al consultar", async ({ request }) => {
    const t = await tutorNuevo(request, "perfil");
    const tok = await tokenTutor(request, t.email);
    const a = await (await request.get("/api/guardian/profile", { headers: hg(tok) })).json();
    expect(JSON.stringify(a)).not.toMatch(/password_hash/);
    const nuevo = "5599998888";
    const put = await request.put("/api/guardian/profile", { headers: hg(tok), data: { telefono: nuevo }, failOnStatusCode: false });
    expect(put.status()).toBe(200);
    const b = await (await request.get("/api/guardian/profile", { headers: hg(tok) })).json();
    nota(`celular antes=${a.celular}, tras editar telefono=${b.celular}`);
    expect.soft(b.celular, "el teléfono editado debe verse en el perfil").toBe(nuevo);
  });
  test("el correo del perfil debe validarse y no puede quedar vacío ni con otro tenant", async ({ request }) => {
    const t = await tutorNuevo(request, "correo");
    const tok = await tokenTutor(request, t.email);
    const malo = await request.put("/api/guardian/profile", { headers: hg(tok), data: { email: "no-es-correo" }, failOnStatusCode: false });
    nota(`correo sin formato: ${malo.status()}`);
    expect.soft(malo.status(), "correo sin formato").toBeGreaterThanOrEqual(400);
    const vacio = await request.put("/api/guardian/profile", { headers: hg(tok), data: { email: "" }, failOnStatusCode: false });
    nota(`correo vacío: ${vacio.status()}`);
    expect.soft(vacio.status(), "correo vacío").toBeGreaterThanOrEqual(400);
    const lg = await loginTutor(request, t.email);
    nota(`login con el correo original tras guardar un correo vacío: ${lg.status}`);
    expect.soft(lg.status, "tras un correo vacío el tutor debe poder entrar").toBe(200);
    const antes = (await db.query("SELECT tenant_id FROM guardians WHERE id=$1", [t.gid])).rows[0].tenant_id;
    await request.put("/api/guardian/profile", { headers: hg(tok), data: { tenant_id: 999, campus_id: 999, nombre_completo: "QA Nombre" }, failOnStatusCode: false });
    expect((await db.query("SELECT tenant_id FROM guardians WHERE id=$1", [t.gid])).rows[0].tenant_id, "tenant_id del cuerpo se ignora").toBe(antes);
  });
  test("cambio de contraseña: actual incorrecta 401; nueva de 1 carácter debe rechazarse; las sesiones viejas caen", async ({ request }) => {
    const t = await tutorNuevo(request, "clave");
    const viejo = await tokenTutor(request, t.email);
    expect((await request.put("/api/guardian/profile/password", { headers: hg(viejo), data: { currentPassword: "incorrecta", newPassword: "NuevaClave#2026ok" }, failOnStatusCode: false })).status()).toBe(401);
    expect((await request.put("/api/guardian/profile/password", { headers: hg(viejo), data: { currentPassword: PW }, failOnStatusCode: false })).status(), "falta la nueva").toBe(400);
    const debil = await request.put("/api/guardian/profile/password", { headers: hg(viejo), data: { currentPassword: PW, newPassword: "1" }, failOnStatusCode: false });
    nota(`nueva de 1 carácter: ${debil.status()}`);
    expect.soft(debil.status(), "contraseña de 1 carácter").toBeGreaterThanOrEqual(400);
    if (debil.status() < 400) await request.put("/api/guardian/profile/password", { headers: hg(await tokenTutor(request, t.email).catch(() => viejo)), data: { currentPassword: "1", newPassword: PW }, failOnStatusCode: false });
    const t2 = await tutorNuevo(request, "clave2");
    const v2 = await tokenTutor(request, t2.email);
    expect((await request.put("/api/guardian/profile/password", { headers: hg(v2), data: { currentPassword: PW, newPassword: "NuevaClave#2026ok" } })).status()).toBe(200);
    const caida = await request.get("/api/guardian/dashboard", { headers: hg(v2), failOnStatusCode: false });
    expect(caida.status(), "la sesión anterior debe invalidarse").toBe(401);
    expect((await loginTutor(request, t2.email, "NuevaClave#2026ok")).status).toBe(200);
    expect((await loginTutor(request, t2.email, PW)).status).toBe(401);
  });
});

// ───────────────────────── D-11 / D-14 el portal en el navegador ─────────────────────────
test.describe("D-11 y D-14 el portal en el navegador", () => {
  test("el portal del tutor solo llama a /api/guardian y /api/auth; no muestra la interfaz de personal", async ({ browser, request }) => {
    const l = await loginTutor(request, "lopez.carlos@demo.mx");
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await ctx.addInitScript(([t, g]) => { localStorage.setItem("auth_token", t as string); localStorage.setItem("auth_type", "guardian"); localStorage.setItem("auth_user", g as string); }, [l.body.token, JSON.stringify(l.body.guardian)]);
    const page = await ctx.newPage();
    const llamadas = new Set<string>();
    page.on("request", (rq) => { const u = new URL(rq.url()); if (u.pathname.startsWith("/api/")) llamadas.add(`${rq.method()} ${u.pathname}`); });
    for (const ruta of ["/portal-3clics", "/", "/estudiantes", "/admin", "/usuarios", "/parent-portal"]) {
      await page.goto(ruta, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(800);
      const aside = await page.$$eval("aside a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
      expect.soft(aside, `menú de personal visible en ${ruta}`).toEqual([]);
    }
    const fuera = [...llamadas].filter((c) => !/ \/api\/(guardian\/|auth\/)/.test(c));
    nota(`llamadas a la API: ${[...llamadas].join("; ")}`);
    expect.soft(fuera, "llamadas fuera de /api/guardian y /api/auth").toEqual([]);
    await ctx.close();
  });
  test("el portal muestra al tutor sus alumnos y su saldo", async ({ browser, request }) => {
    const l = await loginTutor(request, "lopez.carlos@demo.mx");
    const ctx = await browser.newContext();
    await ctx.addInitScript(([t, g]) => { localStorage.setItem("auth_token", t as string); localStorage.setItem("auth_type", "guardian"); localStorage.setItem("auth_user", g as string); }, [l.body.token, JSON.stringify(l.body.guardian)]);
    const page = await ctx.newPage();
    await page.goto("/portal-3clics", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const texto = await page.evaluate(() => document.body.innerText);
    const dash = await (await request.get("/api/guardian/dashboard", { headers: hg(l.body.token) })).json();
    const nombre = dash.students[0].nombre_completo.split(" ")[0];
    nota(`el portal menciona al primer alumno (${nombre}): ${texto.includes(nombre)}; longitud del texto ${texto.length}`);
    expect(texto.includes(nombre), "el portal debe mostrar el nombre del alumno").toBe(true);
    expect(texto).not.toMatch(/no se pudieron cargar|error 40[13]|algo sali[oó] mal/i);
    await ctx.close();
  });
});
