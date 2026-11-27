/**
 * Verificación DINÁMICA de los hallazgos que salieron de lectura estática. Cada prueba afirma el comportamiento diseñado;
 * si falla, el hallazgo se reproduce. Base desechable edupay_ci. Mismas cuentas que fase1-acceso.spec.ts.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { staffApiLogin, ADMIN_PASSWORD } from "../e2e/helpers/auth";

const require = createRequire(import.meta.url);
const pg = require("pg");
const jwt = require("jsonwebtoken");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PW = ADMIN_PASSWORD;
const E: Record<string, string> = {
  ag: "directora@jfr.edu.mx", ac: "admin.campus@jfr.edu.mx", ax: "caja@jfr.edu.mx", cg: "contador@jfr.edu.mx",
  ad: "admisiones@jfr.edu.mx", as: "qa.asistente@qa.test", ac2: "qa.ac2@qa.test", acb: "qa.acb@qa.test",
};
const tk: Record<string, string> = {};
const h = (k: string) => ({ Authorization: `Bearer ${tk[k]}` });
const st = async (p: Promise<any>) => (await p).status();

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

test.describe("Lecturas sin permiso por módulo (H-D01, C-H4)", () => {
  for (const ruta of ["/api/dashboard/contador", "/api/receivables", "/api/caja", "/api/admin/charges", "/api/crm/prospects", "/api/admin/dashboard"]) {
    for (const rol of ["as", "ad"]) {
      test(`${ruta} para ${rol}`, async ({ request }) => {
        const s = await st(request.get(ruta, { headers: h(rol), failOnStatusCode: false }));
        test.info().annotations.push({ type: "http", description: String(s) });
        expect(s, `${rol} en ${ruta}`).toBe(403);
      });
    }
  }
});

test.describe("Cruce de campus de la misma escuela (H-D02, H-B07, C-H10)", () => {
  // admin.campus@jfr.edu.mx pertenece al campus 1 (Norte); el campus 2 (Sur) es de la misma escuela.
  for (const ruta of ["/api/admin/dashboard/2", "/api/admin/students/2", "/api/admin/guardians/2", "/api/admin/concepts/2", "/api/planes-pago/2", "/api/calendario/eventos/2", "/api/families/2"]) {
    test(`AC del campus 1 pide ${ruta}`, async ({ request }) => {
      const s = await st(request.get(ruta, { headers: h("ac"), failOnStatusCode: false }));
      test.info().annotations.push({ type: "http", description: String(s) });
      expect(s).toBeGreaterThanOrEqual(400);
    });
  }
  test("AC de otra escuela pide el campus 1", async ({ request }) => {
    for (const ruta of ["/api/admin/dashboard/1", "/api/admin/students/1", "/api/planes-pago/1"]) {
      expect(await st(request.get(ruta, { headers: h("acb"), failOnStatusCode: false })), ruta).toBeGreaterThanOrEqual(400);
    }
  });
});

test.describe("Escritura financiera y asistente sin permiso (C-H1, H-D05)", () => {
  test("POST /api/charges/generate (dry_run) por asistente y admisiones", async ({ request }) => {
    for (const rol of ["as", "ad", "ax"]) {
      const r = await request.post("/api/charges/generate", { headers: h(rol), failOnStatusCode: false,
        data: { concepto: "Materiales y Útiles", tipo_generacion: "extraordinario", nivel_academico: "todos", fecha_emision: "2026-12-01", fecha_vencimiento: "2026-12-15", dry_run: true, monto_manual: 100, descripcion: "QA dry-run" } });
      test.info().annotations.push({ type: "http", description: `${rol}: ${r.status()} ${(await r.text()).slice(0, 140)}` });
      expect.soft(r.status(), `rol ${rol} en dry_run`).toBe(403);
    }
  });
  test("POST /api/assistant/diagnose por asistente con autoFixConfirmed", async ({ request }) => {
    const mods = await request.get("/api/assistant/modules", { headers: h("as"), failOnStatusCode: false });
    test.info().annotations.push({ type: "modules", description: String(mods.status()) });
    expect.soft(mods.status(), "GET /api/assistant/modules como asistente").toBe(403);
    const r = await request.post("/api/assistant/diagnose", { headers: h("as"), data: { module: "estudiantes", autoFixConfirmed: true }, failOnStatusCode: false });
    test.info().annotations.push({ type: "diagnose", description: `${r.status()} ${(await r.text()).slice(0, 160)}` });
    expect.soft(r.status(), "diagnose con autoFix como asistente").toBe(403);
  });
});

test.describe("Permisos del administrador general (H-B01, H-B02)", () => {
  test("AG abre Configuración de Pagos (GET payment-config)", async ({ request }) => {
    for (const ruta of ["/api/payment-config/due-dates", "/api/payment-config/due-dates-complete", "/api/payment-config/surcharge-rules-complete"]) {
      const s = await st(request.get(ruta, { headers: h("ag"), failOnStatusCode: false }));
      test.info().annotations.push({ type: ruta, description: String(s) });
      expect.soft(s, `AG en ${ruta}`).toBe(200);
    }
  });
  test("AG y CG abren la lista de becas", async ({ request }) => {
    for (const rol of ["ag", "cg"]) {
      const s = await st(request.get("/api/scholarships", { headers: h(rol), failOnStatusCode: false }));
      test.info().annotations.push({ type: rol, description: String(s) });
      expect.soft(s, `${rol} en /api/scholarships`).toBe(200);
    }
  });
});

test.describe("Datos de alumnos (H-B04)", () => {
  test("editar apellido de un alumno actualiza nombre_completo", async ({ request }) => {
    const alumnos = await (await request.get("/api/admin/students", { headers: h("ac") })).json();
    const lista = Array.isArray(alumnos) ? alumnos : alumnos.items ?? alumnos.students ?? [];
    test.info().annotations.push({ type: "alumnos", description: String(lista.length) });
    expect(lista.length).toBeGreaterThan(0);
    const a = lista[0];
    const nuevo = `ApellidoQA${Date.now() % 100000}`;
    const r = await request.patch(`/api/admin/students/${a.id}`, { headers: h("ac"), data: { apellido_paterno: nuevo }, failOnStatusCode: false });
    expect(r.status()).toBe(200);
    const fila = (await db.query("SELECT apellido_paterno, nombre_completo FROM students WHERE id=$1", [a.id])).rows[0];
    expect(fila.apellido_paterno).toBe(nuevo);
    expect(fila.nombre_completo, "nombre_completo debe reflejar el apellido nuevo").toContain(nuevo);
  });
});

test.describe("Liga mágica (H-D03)", () => {
  test("el JWT de la liga mágica lleva campus_id y sirve para pagar", async ({ request }) => {
    const g = (await db.query("SELECT id FROM guardians WHERE email='lopez.carlos@demo.mx'")).rows[0].id;
    const ml = await request.post("/api/admin/magic-link", { headers: h("ac"), data: { guardian_id: g, guardianId: g }, failOnStatusCode: false });
    test.info().annotations.push({ type: "emisión", description: String(ml.status()) });
    expect(ml.status()).toBe(200);
    const url: string = (await ml.json()).url || (await ml.json()).link || "";
    const token = url.split("/").pop()!;
    const canje = await request.get(`/api/auth/magic/${token}`, { failOnStatusCode: false });
    expect(canje.status()).toBe(200);
    const claims = jwt.decode((await canje.json()).token);
    test.info().annotations.push({ type: "claims", description: JSON.stringify(Object.keys(claims)) });
    expect(claims.campus_id, "campus_id en el JWT de la liga mágica").toBeTruthy();
  });
});

test.describe("Aprobaciones (C-H13)", () => {
  test("una solicitud ya decidida no puede decidirse otra vez", async ({ request }) => {
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='pending_approvals' ORDER BY ordinal_position")).rows.map((r: any) => r.column_name);
    test.info().annotations.push({ type: "columnas", description: cols.join(",") });
    const usuarios = (await db.query("SELECT id FROM users WHERE email=$1", [E.ac])).rows[0];
    const ins = await db.query(
      `INSERT INTO pending_approvals (tenant_id, campus_id, action_type, action_description, requested_by, status, reason, requested_data, entity_type, entity_id)
       VALUES (1,1,'update_charge','QA solicitud de prueba',$1,'pending','QA','{}'::jsonb,'charge',1) RETURNING id`, [usuarios.id]).catch((e: Error) => ({ error: e.message, rows: [] as any[] }));
    if ((ins as any).error) { test.info().annotations.push({ type: "bloqueado", description: (ins as any).error }); test.skip(true, "No se pudo sembrar la solicitud: " + (ins as any).error); return; }
    const id = (ins as any).rows[0].id;
    const d1 = await request.post("/api/approvals/decision", { headers: h("ag"), data: { approval_id: id, decision: "rejected" }, failOnStatusCode: false });
    const d2 = await request.post("/api/approvals/decision", { headers: h("ag"), data: { approval_id: id, decision: "approved" }, failOnStatusCode: false });
    test.info().annotations.push({ type: "http", description: `rechazar=${d1.status()} luego aprobar=${d2.status()}` });
    expect(d2.status(), "aprobar tras rechazar").toBeGreaterThanOrEqual(400);
  });
});
