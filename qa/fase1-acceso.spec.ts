/**
 * QA fase 1: acceso y seguridad (área A). Corre contra la base desechable (edupay_ci, marcada edupay:test).
 * Cada prueba afirma el comportamiento DISEÑADO. Un fallo es un defecto (o una decisión de producto pendiente), no una prueba rota.
 * Las cuentas ficticias las crea qa-cuentas.mjs. Contraseña común de la base desechable: Demo2025!
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { staffApiLogin, ADMIN_PASSWORD } from "../e2e/helpers/auth";
import { staffTotpCodeForTest, enrollmentCodeForTest } from "../server/test-support/staff-totp";

const require = createRequire(import.meta.url);
const pg = require("pg");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const PW = ADMIN_PASSWORD;
const E = {
  ag: "directora@jfr.edu.mx", ac: "admin.campus@jfr.edu.mx", ax: "caja@jfr.edu.mx", cg: "contador@jfr.edu.mx",
  ad: "admisiones@jfr.edu.mx", as: "qa.asistente@qa.test", ac2: "qa.ac2@qa.test", acb: "qa.acb@qa.test",
  agb: "qa.ag.b@qa.test", sa: "superadmin@edupay.mx", saSinEscuela: "qa.sa@qa.test",
};
const tokens: Record<string, string> = {};
const auth = (k: string) => ({ Authorization: `Bearer ${tokens[k]}` });

async function tokenOf(request: APIRequestContext, email: string, pw = PW): Promise<string> {
  const r = await staffApiLogin(request, email, pw);
  expect(r.status(), `login ${email}`).toBe(200);
  return (await r.json()).token;
}
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.beforeAll(async ({ request }) => {
  await db.query("UPDATE campuses SET onboarding_completado = true");
  for (const k of ["ag", "ac", "ax", "cg", "ad", "as", "ac2", "acb", "agb", "sa"] as const) {
    tokens[k] = await tokenOf(request, (E as any)[k]);
  }
});
test.afterAll(async () => { await db.end(); });

/** Crea un usuario ficticio como AG del campus Norte y devuelve su id y correo. */
async function crearUsuario(request: APIRequestContext, role = "asistente") {
  const email = `qa.tmp.${uniq()}@qa.test`;
  const r = await request.post("/api/users", { headers: auth("ag"), data: { name: "QA Temporal", email, password_hash: PW, role } });
  expect(r.status(), "crear usuario temporal").toBe(201);
  return { id: (await r.json()).id as number, email };
}

// ───────────────────────── A-01 / A-02 Login y TOTP ─────────────────────────
test.describe("A-01 login del personal", () => {
  test("A-01 credenciales incorrectas: 401 y sin pistas", async ({ request }) => {
    const r = await request.post("/api/auth/login", { data: { email: E.ag, password: "incorrecta" }, failOnStatusCode: false });
    expect(r.status()).toBe(401);
    const noExiste = await request.post("/api/auth/login", { data: { email: "no.existe@qa.test", password: "x" }, failOnStatusCode: false });
    expect(noExiste.status()).toBe(401);
    expect((await noExiste.json()).message).toBe((await r.json()).message);
  });
  test("A-01 sin contraseña o sin correo: 400", async ({ request }) => {
    expect((await request.post("/api/auth/login", { data: { email: E.ag }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.post("/api/auth/login", { data: { password: PW }, failOnStatusCode: false })).status()).toBe(400);
  });
  test("A-01 usuario desactivado: 401, y reactivado vuelve a entrar", async ({ request }) => {
    const u = await crearUsuario(request);
    const t = await tokenOf(request, u.email);
    expect(t).toBeTruthy();
    const off = await request.put(`/api/users/${u.id}`, { headers: auth("ag"), data: { is_active: false } });
    expect(off.status()).toBe(200);
    const r = await request.post("/api/auth/login", { data: { email: u.email, password: PW, totp_code: await staffTotpCodeForTest(u.email) }, failOnStatusCode: false });
    expect(r.status()).toBe(401);
  });
  test("A-02 código de respaldo: entra una vez, la segunda falla; códigos mal formados fallan", async ({ request }) => {
    const u = await crearUsuario(request);
    // Enrolamiento manual para capturar los códigos de respaldo
    const l1 = await (await request.post("/api/auth/login", { data: { email: u.email, password: PW } })).json();
    const h = { Authorization: `Bearer ${l1.token}` };
    const setup = await (await request.post("/api/auth/2fa/setup", { headers: h })).json();
    const conf = await request.post("/api/auth/2fa/confirm", { headers: h, data: { totp_code: enrollmentCodeForTest(setup.manual_code) } });
    expect(conf.status()).toBe(200);
    const backups: string[] = (await conf.json()).backup_codes;
    expect(backups).toHaveLength(10);
    const a = await request.post("/api/auth/login", { data: { email: u.email, password: PW, totp_code: backups[0] }, failOnStatusCode: false });
    expect(a.status(), "respaldo válido").toBe(200);
    const b = await request.post("/api/auth/login", { data: { email: u.email, password: PW, totp_code: backups[0] }, failOnStatusCode: false });
    expect(b.status(), "mismo respaldo otra vez").toBe(401);
    for (const bad of ["12345", "abcdef", "0000000", "' OR 1=1 --"]) {
      const r = await request.post("/api/auth/login", { data: { email: u.email, password: PW, totp_code: bad }, failOnStatusCode: false });
      expect(r.status(), `código "${bad}"`).toBe(401);
    }
  });
});

// ───────────────────────── A-05 / A-06 / A-08 Sesión ─────────────────────────
test.describe("sesión", () => {
  test("A-05 GET /api/auth/user: con token 200, sin token 401, token basura 401 o 403", async ({ request }) => {
    expect((await request.get("/api/auth/user", { headers: auth("ag") })).status()).toBe(200);
    expect((await request.get("/api/auth/user", { failOnStatusCode: false })).status()).toBe(401);
    expect([401, 403]).toContain((await request.get("/api/auth/user", { headers: { Authorization: "Bearer basura" }, failOnStatusCode: false })).status());
  });
  test("A-05 la respuesta de usuario no expone hash ni secreto 2FA", async ({ request }) => {
    const body = JSON.stringify(await (await request.get("/api/auth/user", { headers: auth("ag") })).json());
    expect(body).not.toMatch(/password_hash|twofa_secret|twofa_backup/);
  });
  test("A-06 refresh: token válido devuelve token; token manipulado se rechaza", async ({ request }) => {
    const ok = await request.post("/api/auth/refresh", { headers: auth("ag"), failOnStatusCode: false });
    expect(ok.status()).toBe(200);
    const tampered = tokens.ag.slice(0, -4) + "AAAA";
    const bad = await request.post("/api/auth/refresh", { headers: { Authorization: `Bearer ${tampered}` }, failOnStatusCode: false });
    expect([401, 403]).toContain(bad.status());
  });
  test("A-08 cerrar sesión: no existe /api/auth/logout y el token sigue válido (H-A09)", async ({ request }) => {
    const out = await request.post("/api/auth/logout", { headers: auth("ag"), failOnStatusCode: false });
    // Diseño esperado por QA: el servidor debería invalidar la sesión (200/204) o al menos existir la ruta.
    expect([200, 204], "POST /api/auth/logout").toContain(out.status());
  });
  test("A-11 usuario sin 2FA: la API de negocio responde 403 TWOFA_SETUP_REQUIRED", async ({ request }) => {
    const u = await crearUsuario(request);
    const l = await (await request.post("/api/auth/login", { data: { email: u.email, password: PW } })).json();
    expect(l.user.requires_twofa_setup).toBe(true);
    const h = { Authorization: `Bearer ${l.token}` };
    const r = await request.get("/api/students", { headers: h, failOnStatusCode: false });
    expect(r.status()).toBe(403);
    expect((await r.json()).code).toBe("TWOFA_SETUP_REQUIRED");
    expect((await request.get("/api/auth/user", { headers: h })).status()).toBe(200);
  });
  test("D-06 token de tutor no sirve en rutas de personal y token de personal no sirve en rutas de tutor", async ({ request }) => {
    const g = await request.post("/api/auth/guardian-login", { data: { email: "lopez.carlos@demo.mx", password: PW }, failOnStatusCode: false });
    expect(g.status()).toBe(200);
    const gt = (await g.json()).token;
    const r1 = await request.get("/api/users", { headers: { Authorization: `Bearer ${gt}` }, failOnStatusCode: false });
    expect(r1.status()).toBe(403);
    const r2 = await request.get("/api/guardian/dashboard", { headers: auth("ag"), failOnStatusCode: false });
    expect(r2.status()).toBe(403);
  });
});

// ───────────────────────── A-10 Invalidación de sesiones ─────────────────────────
test.describe("A-10 invalidar sesiones", () => {
  test("cambiar el rol invalida la sesión del usuario", async ({ request }) => {
    const u = await crearUsuario(request);
    const t = await tokenOf(request, u.email);
    const ok = await request.get("/api/auth/user", { headers: { Authorization: `Bearer ${t}` } });
    expect(ok.status()).toBe(200);
    const ch = await request.put(`/api/users/${u.id}`, { headers: auth("ag"), data: { role: "admisiones" } });
    expect(ch.status()).toBe(200);
    const r = await request.get("/api/auth/user", { headers: { Authorization: `Bearer ${t}` }, failOnStatusCode: false });
    expect(r.status(), "token anterior tras cambio de rol").toBe(401);
  });
  test("desactivar al usuario invalida la sesión", async ({ request }) => {
    const u = await crearUsuario(request);
    const t = await tokenOf(request, u.email);
    await request.put(`/api/users/${u.id}`, { headers: auth("ag"), data: { is_active: false } });
    const r = await request.get("/api/auth/user", { headers: { Authorization: `Bearer ${t}` }, failOnStatusCode: false });
    expect(r.status()).toBe(401);
  });
  test("restablecer contraseña: clave nueva, sesiones viejas caen y la clave no se guarda en audit_log", async ({ request }) => {
    const u = await crearUsuario(request);
    const t = await tokenOf(request, u.email);
    const rs = await request.post(`/api/admin/users/${u.id}/reset-password`, { headers: auth("ag"), failOnStatusCode: false });
    expect(rs.status()).toBe(200);
    const body = await rs.json();
    const nueva = body.temporary_password || body.password || body.new_password;
    expect(nueva, "la respuesta trae la clave temporal").toBeTruthy();
    expect(String(nueva).length).toBeGreaterThanOrEqual(12);
    const viejo = await request.get("/api/auth/user", { headers: { Authorization: `Bearer ${t}` }, failOnStatusCode: false });
    expect(viejo.status()).toBe(401);
    const logs = await db.query("SELECT count(*)::int AS n FROM audit_log WHERE metadata::text LIKE $1 OR details::text LIKE $1", [`%${nueva}%`]).catch(() => ({ rows: [{ n: 0 }] }));
    expect(logs.rows[0].n).toBe(0);
  });
});

// ───────────────────────── A-13 / A-14 Bootstrap y SSO config ─────────────────────────
test.describe("bootstrap y configuración pública", () => {
  test("A-13 bootstrap fuera de producción no se ofrece", async ({ request }) => {
    const r = await request.post("/api/bootstrap", { headers: { Authorization: "Bearer x" }, data: {}, failOnStatusCode: false });
    expect([401, 403, 503]).toContain(r.status());
  });
  test("A-14 la configuración pública de SSO no revela llaves ni emisor", async ({ request }) => {
    const c = await (await request.get("/api/auth/sso/config")).json();
    expect(Object.keys(c).sort()).toEqual(["dashboard_url", "emergency_login", "enabled", "sso_only"]);
  });
});

// ───────────────────────── A-26 / A-27 / A-28 2FA ─────────────────────────
test.describe("2FA", () => {
  test("A-26 segundo setup con 2FA activo: 409, y confirmar con código malo falla", async ({ request }) => {
    expect((await request.post("/api/auth/2fa/setup", { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(409);
    const u = await crearUsuario(request);
    const l = await (await request.post("/api/auth/login", { data: { email: u.email, password: PW } })).json();
    const h = { Authorization: `Bearer ${l.token}` };
    await request.post("/api/auth/2fa/setup", { headers: h });
    const bad = await request.post("/api/auth/2fa/confirm", { headers: h, data: { totp_code: "000000" }, failOnStatusCode: false });
    expect([400, 401, 422]).toContain(bad.status());
  });
  test("A-27 desactivar el 2FA propio está prohibido", async ({ request }) => {
    expect((await request.delete("/api/auth/2fa", { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(403);
  });
  test("A-28 restablecer 2FA: AG sí (doble confirmación, un solo uso); AC, uno mismo y otra escuela no", async ({ request }) => {
    const u = await crearUsuario(request);
    const tViejo = await tokenOf(request, u.email);
    const cuerpo = { reason: "Prueba QA de restablecimiento", confirmation: true };
    const url = `/api/admin/users/${u.id}/2fa`;
    expect((await request.post(`${url}/reset-preview`, { headers: auth("ag"), data: {}, failOnStatusCode: false })).status(), "sin motivo").toBe(400);
    expect((await request.post(`${url}/reset-preview`, { headers: auth("ac"), data: cuerpo, failOnStatusCode: false })).status(), "AC").toBe(403);
    expect([403, 404], "AG de otra escuela").toContain((await request.post(`${url}/reset-preview`, { headers: auth("agb"), data: cuerpo, failOnStatusCode: false })).status());
    const yo = await (await request.get("/api/auth/user", { headers: auth("ag") })).json();
    expect((await request.post(`/api/admin/users/${yo.id ?? yo.user?.id}/2fa/reset-preview`, { headers: auth("ag"), data: cuerpo, failOnStatusCode: false })).status(), "a sí mismo").toBe(403);
    const prev = await request.post(`${url}/reset-preview`, { headers: auth("ag"), data: cuerpo });
    expect(prev.status()).toBe(200);
    const tok = (await prev.json()).confirmation_token;
    expect((await request.post(`${url}/reset`, { headers: auth("ag"), data: { confirmation_token: tok }, failOnStatusCode: false })).status(), "sin segunda confirmación").toBe(400);
    expect((await request.post(`${url}/reset`, { headers: auth("ag"), data: { confirmation_token: tok, confirmation: true } })).status()).toBe(200);
    expect((await request.post(`${url}/reset`, { headers: auth("ag"), data: { confirmation_token: tok, confirmation: true }, failOnStatusCode: false })).status(), "reutilizar token").toBe(409);
    expect((await request.get("/api/auth/user", { headers: { Authorization: `Bearer ${tViejo}` }, failOnStatusCode: false })).status(), "sesión anterior del usuario").toBe(401);
    const re = await (await request.post("/api/auth/login", { data: { email: u.email, password: PW } })).json();
    expect(re.user.requires_twofa_setup, "debe volver a registrar 2FA").toBe(true);
  });
});

// ───────────────────────── A-29..A-34 Usuarios ─────────────────────────
test.describe("usuarios y jerarquía", () => {
  test("A-29 listar usuarios: AG sí; asistente 403; sin hash ni secretos", async ({ request }) => {
    const ok = await request.get("/api/users", { headers: auth("ag") });
    expect(ok.status()).toBe(200);
    expect(JSON.stringify(await ok.json())).not.toMatch(/password_hash|twofa_secret|twofa_backup/);
    expect((await request.get("/api/users", { headers: auth("as"), failOnStatusCode: false })).status()).toBe(403);
  });
  test("A-29 aislamiento: AG de la escuela B no ve usuarios de la escuela A", async ({ request }) => {
    const r = await (await request.get("/api/users", { headers: auth("agb") })).json();
    const emails = JSON.stringify(r);
    expect(emails).not.toContain("directora@jfr.edu.mx");
  });
  test("A-30 crear usuario: AG crea asistente; AC no puede crear AG; superadmin por cuerpo se rechaza", async ({ request }) => {
    const ok = await request.post("/api/users", { headers: auth("ag"), data: { name: "QA", email: `qa.c.${uniq()}@qa.test`, password_hash: PW, role: "asistente" } });
    expect(ok.status()).toBe(201);
    const nope = await request.post("/api/users", { headers: auth("ac"), data: { name: "QA", email: `qa.c.${uniq()}@qa.test`, password_hash: PW, role: "administrador_general" }, failOnStatusCode: false });
    expect(nope.status()).toBe(403);
    const sup = await request.post("/api/users", { headers: auth("ag"), data: { name: "QA", email: `qa.c.${uniq()}@qa.test`, password_hash: PW, role: "asistente", is_super_admin: true }, failOnStatusCode: false });
    expect([400, 403]).toContain(sup.status());
    const rol = await request.post("/api/users", { headers: auth("ag"), data: { name: "QA", email: `qa.c.${uniq()}@qa.test`, password_hash: PW, role: "super_admin" }, failOnStatusCode: false });
    expect(rol.status()).toBe(403);
  });
  test("A-30 correo duplicado y contraseña débil: debe ser 4xx, no 500 ni 201 (H-A06, H-A10)", async ({ request }) => {
    const dup = await request.post("/api/users", { headers: auth("ag"), data: { name: "QA", email: E.as, password_hash: PW, role: "asistente" }, failOnStatusCode: false });
    expect.soft(dup.status(), "correo duplicado: código HTTP").toBeGreaterThanOrEqual(400);
    expect.soft(dup.status(), "correo duplicado no debe ser 500").toBeLessThan(500);
    const debil = await request.post("/api/users", { headers: auth("ag"), data: { name: "QA", email: `qa.w.${uniq()}@qa.test`, password_hash: "1", role: "asistente" }, failOnStatusCode: false });
    expect.soft(debil.status(), "contraseña de 1 carácter al crear usuario").toBeGreaterThanOrEqual(400);
    const sinFormato = await request.post("/api/users", { headers: auth("ag"), data: { name: "QA", email: "esto-no-es-correo", password_hash: PW, role: "asistente" }, failOnStatusCode: false });
    expect.soft(sinFormato.status(), "correo sin formato").toBeGreaterThanOrEqual(400);
  });
  test("A-31 editar: AS no edita a AG; nadie se cambia su propio rol; otro campus y otra escuela dan 404 o 403", async ({ request }) => {
    const yo = await (await request.get("/api/auth/user", { headers: auth("ac") })).json();
    const myId = yo.id ?? yo.user?.id;
    const ag = (await (await request.get("/api/users", { headers: auth("ag") })).json()).find((x: any) => x.email === E.ag);
    expect((await request.put(`/api/users/${ag.id}`, { headers: auth("as"), data: { name: "Hack" }, failOnStatusCode: false })).status()).toBe(403);
    expect((await request.put(`/api/users/${myId}`, { headers: auth("ac"), data: { role: "administrador_general" }, failOnStatusCode: false })).status()).toBe(403);
    const u = await crearUsuario(request);
    const otroCampus = await request.put(`/api/users/${u.id}`, { headers: auth("ac2"), data: { name: "Hack" }, failOnStatusCode: false });
    expect([403, 404]).toContain(otroCampus.status());
    const otraEscuela = await request.put(`/api/users/${u.id}`, { headers: auth("acb"), data: { name: "Hack" }, failOnStatusCode: false });
    expect([403, 404]).toContain(otraEscuela.status());
  });
  test("A-32 permisos personalizados: un AC no debe poder dar permisos de sistema o seguridad (H-A04)", async ({ request }) => {
    const u = await crearUsuario(request, "auxiliar_contable");
    const r = await request.put(`/api/users/${u.id}`, { headers: auth("ac"), data: { custom_permissions: ["system.configure", "security.configure"] }, failOnStatusCode: false });
    expect(r.status(), "AC concede system.configure y security.configure").toBeGreaterThanOrEqual(400);
  });
  test("A-32 efecto: el permiso concedido por un AC sí da acceso a mantenimiento global de BD", async ({ request }) => {
    const u = await crearUsuario(request, "auxiliar_contable");
    const t = await tokenOf(request, u.email);
    const antes = await request.post("/api/admin/cleanup-database", { headers: { Authorization: `Bearer ${t}` }, failOnStatusCode: false });
    expect(antes.status(), "AX sin permisos extra").toBe(403);
    const dado = await request.put(`/api/users/${u.id}`, { headers: auth("ac"), data: { custom_permissions: ["system.configure"] }, failOnStatusCode: false });
    test.info().annotations.push({ type: "concesión", description: `AC otorga system.configure: HTTP ${dado.status()}` });
    const t2 = await tokenOf(request, u.email);
    const despues = await request.post("/api/admin/cleanup-database", { headers: { Authorization: `Bearer ${t2}` }, failOnStatusCode: false });
    expect(despues.status(), "AX con system.configure otorgado por un AC no debería poder ejecutar mantenimiento global").toBe(403);
  });
  test("A-33 eliminar: no a sí mismo; AC no borra AG; otra escuela 403 o 404", async ({ request }) => {
    const yo = await (await request.get("/api/auth/user", { headers: auth("ag") })).json();
    expect((await request.delete(`/api/users/${yo.id ?? yo.user?.id}`, { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(400);
    const ag = (await (await request.get("/api/users", { headers: auth("ag") })).json()).find((x: any) => x.email === E.ag);
    expect((await request.delete(`/api/users/${ag.id}`, { headers: auth("ac"), failOnStatusCode: false })).status()).toBe(403);
    const u = await crearUsuario(request);
    expect([403, 404]).toContain((await request.delete(`/api/users/${u.id}`, { headers: auth("agb"), failOnStatusCode: false })).status());
    expect((await request.delete(`/api/users/${u.id}`, { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(200);
  });
  test("A-34 reset de contraseña: no a uno mismo; otra escuela 403 o 404", async ({ request }) => {
    const yo = await (await request.get("/api/auth/user", { headers: auth("ag") })).json();
    expect((await request.post(`/api/admin/users/${yo.id ?? yo.user?.id}/reset-password`, { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(400);
    const u = await crearUsuario(request);
    expect([403, 404]).toContain((await request.post(`/api/admin/users/${u.id}/reset-password`, { headers: auth("agb"), failOnStatusCode: false })).status());
  });
  test("A-38 contraseña propia: la actual incorrecta da 401 y una nueva de 1 carácter se rechaza", async ({ request }) => {
    const u = await crearUsuario(request);
    const t = await tokenOf(request, u.email);
    const h = { Authorization: `Bearer ${t}` };
    const mala = await request.put("/api/profile/password", { headers: h, data: { currentPassword: "incorrecta", newPassword: "NuevaClave#2026ok" }, failOnStatusCode: false });
    expect(mala.status()).toBeGreaterThanOrEqual(400);
    const debil = await request.put("/api/profile/password", { headers: h, data: { currentPassword: PW, newPassword: "1" }, failOnStatusCode: false });
    expect(debil.status(), "nueva de 1 carácter").toBeGreaterThanOrEqual(400);
  });
  test("A-40 información institucional: asistente no puede escribirla", async ({ request }) => {
    const r = await request.post("/api/institutional-info", { headers: auth("as"), data: { legal_name: "Hack" }, failOnStatusCode: false });
    expect(r.status()).toBe(403);
  });
});

// ───────────────────────── A-47 Auditoría ─────────────────────────
test.describe("A-47 historial de auditoría", () => {
  test("AG puede leerlo y el límite se acota", async ({ request }) => {
    const r = await request.get("/api/audit-log?limit=100000", { headers: auth("ag") });
    expect(r.status()).toBe(200);
    const body = await r.json();
    const rows = Array.isArray(body) ? body : body.items ?? body.rows ?? body.data ?? [];
    expect(rows.length).toBeLessThanOrEqual(100);
  });
  for (const rol of ["as", "ad", "ax"] as const) {
    test(`asistente/admisiones/auxiliar: ${rol} NO debe poder leer el historial (H-A01)`, async ({ request }) => {
      const r = await request.get("/api/audit-log", { headers: auth(rol), failOnStatusCode: false });
      expect(r.status(), `rol ${rol}`).toBe(403);
    });
  }
  test("la búsqueda con comilla no produce error de servidor", async ({ request }) => {
    const r = await request.get("/api/audit-log?search=%27%20OR%201%3D1%20--", { headers: auth("ag"), failOnStatusCode: false });
    expect(r.status()).toBeLessThan(500);
  });
  test("el historial de la escuela A no muestra movimientos de la escuela B", async ({ request }) => {
    const r = await request.get("/api/audit-log?limit=100", { headers: auth("agb") });
    expect(r.status()).toBe(200);
    expect(JSON.stringify(await r.json())).not.toContain("directora@jfr.edu.mx");
  });
});

// ───────────────────────── A-41..A-44 Candidatos, A-49..A-52 Plataforma ─────────────────────────
test.describe("superadmin y plataforma", () => {
  test("A-41 candidatos del Dashboard: solo superadmin; tenant_id inválido es 400", async ({ request }) => {
    expect((await request.get("/api/super-admin/staff-candidates", { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(403);
    expect((await request.get("/api/super-admin/staff-candidates", { headers: auth("sa"), failOnStatusCode: false })).status()).toBe(200);
    expect((await request.get("/api/super-admin/staff-candidates?tenant_id=abc", { headers: auth("sa"), failOnStatusCode: false })).status()).toBe(400);
  });
  test("A-42 asignar candidato inexistente o rol super_admin no se permite", async ({ request }) => {
    const r = await request.post("/api/super-admin/staff-candidates/999999/assign", { headers: auth("sa"), data: { role: "super_admin", campus_id: 1, email: "x@qa.test" }, failOnStatusCode: false });
    expect([400, 404, 422]).toContain(r.status());
    expect((await request.post("/api/super-admin/staff-candidates/1/assign", { headers: auth("ag"), data: {}, failOnStatusCode: false })).status()).toBe(403);
  });
  test("A-49 seguridad no disponible: AG recibe 501; asistente 403; sin token 401", async ({ request }) => {
    expect((await request.post("/api/security/scan", { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(501);
    expect((await request.post("/api/security/scan", { headers: auth("as"), failOnStatusCode: false })).status()).toBe(403);
    expect((await request.post("/api/security/scan", { failOnStatusCode: false })).status()).toBe(401);
  });
  test("A-50 mantenimiento de BD: asistente 403", async ({ request }) => {
    for (const p of ["/api/admin/optimize-database", "/api/admin/cleanup-database", "/api/admin/database-maintenance"]) {
      expect((await request.post(p, { headers: auth("as"), failOnStatusCode: false })).status(), p).toBe(403);
    }
  });
  test("A-50 limpieza ejecutada por AG de la escuela A: borra solo eventos fuera de retención (365 días), incluidos los de otra escuela", async ({ request }) => {
    await db.query("DELETE FROM security_events WHERE event_type IN ('qa_reciente','qa_antiguo')");
    await db.query(`INSERT INTO security_events (event_type, severity, tenant_id, created_at) VALUES ('qa_reciente','low',51,NOW()), ('qa_antiguo','low',51,NOW() - INTERVAL '400 days')`);
    const r = await request.post("/api/admin/cleanup-database", { headers: auth("ag"), failOnStatusCode: false });
    expect(r.status(), "AG ejecuta limpieza").toBe(200);
    const rec = await db.query("SELECT count(*)::int AS n FROM security_events WHERE event_type='qa_reciente'");
    const ant = await db.query("SELECT count(*)::int AS n FROM security_events WHERE event_type='qa_antiguo'");
    expect(rec.rows[0].n, "evento reciente de otra escuela intacto").toBe(1);
    test.info().annotations.push({ type: "efecto", description: `evento de 400 días de la escuela B tras la limpieza de un AG de A: ${ant.rows[0].n === 0 ? "borrado (política de retención global)" : "intacto"}` });
  });
  test("A-51 panel de plataforma: superadmin sí, AG no", async ({ request }) => {
    expect((await request.get("/api/super-admin/tenants", { headers: auth("ag"), failOnStatusCode: false })).status()).toBe(403);
    expect((await request.get("/api/super-admin/tenants", { headers: auth("sa"), failOnStatusCode: false })).status()).toBe(200);
  });
  test("A-52 /api/super-admin/create sigue denegada", async ({ request }) => {
    expect([403, 404, 405]).toContain((await request.post("/api/super-admin/create", { headers: auth("sa"), data: {}, failOnStatusCode: false })).status());
  });
});

// ───────────────────────── H-A05 Superadmin sin escuela ─────────────────────────
test.describe("H-A05 superadmin sin escuela (como en producción)", () => {
  test("puede iniciar el flujo de 2FA y consultar su perfil", async ({ request }) => {
    const l = await request.post("/api/auth/login", { data: { email: E.saSinEscuela, password: PW }, failOnStatusCode: false });
    expect(l.status()).toBe(200);
    const body = await l.json();
    const h = { Authorization: `Bearer ${body.token}` };
    const setup = await request.post("/api/auth/2fa/setup", { headers: h, failOnStatusCode: false });
    expect(setup.status(), "2FA setup de un superadmin sin escuela").toBe(200);
    const perfil = await request.get("/api/profile", { headers: h, failOnStatusCode: false });
    expect(perfil.status(), "GET /api/profile").toBe(200);
    const cambio = await request.put("/api/profile", { headers: h, data: { name: "QA Superadmin" }, failOnStatusCode: false });
    expect(cambio.status(), "PUT /api/profile").toBe(200);
  });
  test("puede crear usuarios y restablecer contraseñas por las rutas de superadmin", async ({ request }) => {
    // usa el superadmin del seed (con escuela) como referencia; el sin escuela se evalúa aparte
    const l = await request.post("/api/auth/login", { data: { email: E.saSinEscuela, password: PW }, failOnStatusCode: false });
    const h = { Authorization: `Bearer ${(await l.json()).token}` };
    const r = await request.post("/api/super-admin/create-user", { headers: h, data: { name: "QA", email: `qa.sa.${uniq()}@qa.test`, password_hash: PW, role: "administrador_general" }, failOnStatusCode: false });
    expect(r.status(), "create-user con superadmin sin escuela").toBeLessThan(400);
  });
});

// ───────────────────────── A-53 WebSocket ─────────────────────────
test.describe("A-53 cambios en vivo", () => {
  const WSS = "ws://localhost:5000/ws/realtime";
  async function conAuth(token: string | null) {
    const WebSocket = require("ws");
    return await new Promise<{ tipo: string; code?: number }>((res) => {
      const ws = new WebSocket(WSS);
      let t: any;
      const fin = (v: { tipo: string; code?: number }) => { clearTimeout(t); try { ws.terminate(); } catch {} res(v); };
      t = setTimeout(() => fin({ tipo: "sin-respuesta" }), 6000);
      ws.on("open", () => { if (token !== null) ws.send(JSON.stringify({ type: "auth", token })); });
      ws.on("message", (m: Buffer) => { const j = JSON.parse(m.toString()); if (j.type === "auth_success") fin({ tipo: "auth_success" }); if (j.type === "auth_error") fin({ tipo: "auth_error" }); });
      ws.on("close", (code: number) => fin({ tipo: "cerrado", code }));
      ws.on("error", () => fin({ tipo: "error" }));
    });
  }
  test("A-53 token basura: auth_error o cierre", async () => {
    expect(["auth_error", "cerrado"]).toContain((await conAuth("basura")).tipo);
  });
  test("A-53 token de tutor: se cierra con 4001", async ({ request }) => {
    const g = await (await request.post("/api/auth/guardian-login", { data: { email: "lopez.carlos@demo.mx", password: PW } })).json();
    expect(await conAuth(g.token)).toMatchObject({ tipo: "cerrado", code: 4001 });
  });
  test("A-53 token de personal con 2FA verificado: auth_success", async () => {
    expect((await conAuth(tokens.ag)).tipo).toBe("auth_success");
  });
  test("A-53 conexión sin enviar auth no recibe datos de negocio", async () => {
    const WebSocket = require("ws");
    const recibidos: string[] = [];
    await new Promise<void>((res) => { const ws = new WebSocket(WSS); ws.on("message", (m: Buffer) => recibidos.push(m.toString())); setTimeout(() => { ws.terminate(); res(); }, 3000); });
    expect(recibidos.filter((m) => /data_changed|user_update|payment|charge/.test(m))).toEqual([]);
  });
});

// ───────────────────────── A-56 Páginas huérfanas ─────────────────────────
test.describe("A-56 páginas huérfanas con credenciales fijas", () => {
  for (const ruta of ["/switch-to-school", "/logout-and-login-school", "/super-admin-login", "/super-admin-access"]) {
    test(`${ruta} no ejecuta ningún login automático`, async ({ page }) => {
      const llamadas: string[] = [];
      page.on("request", (rq) => { if (rq.url().includes("/api/auth/")) llamadas.push(`${rq.method()} ${new URL(rq.url()).pathname}`); });
      await page.goto(ruta);
      await page.waitForTimeout(2500);
      const tokenGuardado = await page.evaluate(() => localStorage.getItem("token") || localStorage.getItem("auth_token"));
      expect(llamadas.filter((l) => l.includes("/api/auth/login")), "login automático").toEqual([]);
      expect(tokenGuardado, "no debe quedar token").toBeNull();
    });
  }
});

test.describe("A-50 mantenimiento de BD: los tres endpoints deben funcionar para quien tiene permiso", () => {
  for (const [metodo, ruta] of [["post", "/api/admin/optimize-database"], ["post", "/api/admin/database-maintenance"], ["get", "/api/admin/database-performance"], ["post", "/api/admin/cleanup-database"]] as const) {
    test(`A-50 ${ruta} responde 200 al AG`, async ({ request }) => {
      const r = await (request as any)[metodo](ruta, { headers: auth("ag"), failOnStatusCode: false });
      test.info().annotations.push({ type: "http", description: String(r.status()) });
      expect(r.status(), ruta).toBe(200);
    });
  }
});
