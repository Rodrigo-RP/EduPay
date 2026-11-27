/**
 * QA fase 4: flujos de dinero (área C). Base desechable edupay_ci.
 * Cada prueba afirma el comportamiento DISEÑADO; un fallo es un defecto reproducido o una decisión de producto pendiente.
 * No se usa Stripe ni Facturapi: lo que depende de ellos se prueba solo hasta donde el servidor responde sin el tercero.
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
  ad: "admisiones@jfr.edu.mx", as: "qa.asistente@qa.test", ac2: "qa.ac2@qa.test", acb: "qa.acb@qa.test", agb: "qa.ag.b@qa.test",
};
const tk: Record<string, string> = {};
const h = (k: string) => ({ Authorization: `Bearer ${tk[k]}` });
const S = Date.now() % 100000;
let n = 0;
const uniq = () => `${S}${++n}${Math.floor(Math.random() * 1000)}`;
const llave = () => `qa-llave-${uniq()}-0000000000`;
const nota = (t: string) => test.info().annotations.push({ type: "obs", description: t });
const body = async (r: any) => { try { return await r.json(); } catch { return {}; } };
const ids: Record<string, any> = {};

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await db.query("UPDATE campuses SET onboarding_completado = true");
  await db.query("UPDATE students s SET tenant_id = c.tenant_id FROM campuses c WHERE c.id = s.campus_id AND s.tenant_id IS NULL");
  for (const k of Object.keys(E)) {
    const r = await staffApiLogin(request, E[k], PW);
    expect(r.status(), `login ${k}`).toBe(200);
    tk[k] = (await r.json()).token;
  }
  await db.query("DELETE FROM cash_closures WHERE campus_id=1 AND fecha = (now() AT TIME ZONE 'America/Mexico_City')::date");
  ids.concepto = (await db.query("SELECT id FROM concepts WHERE campus_id=1 AND periodicidad='mensual' ORDER BY id LIMIT 1")).rows[0].id;
});
test.afterAll(async () => { await db.end(); });

async function alumno(request: APIRequestContext, rol = "ac", extra: any = {}) {
  const r = await request.post("/api/admin/students", { headers: h(rol), data: { nombres: `QA Din ${uniq()}`, apellido_paterno: "Prueba", nivel_escolar: "Primaria", grado: "3° Primaria", grupo: "A", status: "activo", ...extra }, failOnStatusCode: false });
  expect(r.status(), "crear alumno").toBe(201);
  return (await r.json()).id as number;
}
async function cargo(studentId: number, o: { monto?: number; beca?: number; recargo?: number; venc?: string; estado?: string } = {}) {
  const r = await db.query(
    `INSERT INTO charges (student_id, concept_id, tenant_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,1,'2026-2027','2026-11-01',$3,$4,$5,$6,$7) RETURNING id`,
    [studentId, ids.concepto, o.venc ?? "2026-12-30", o.monto ?? 100000, (o.beca ?? 0).toFixed(2), o.recargo ?? 0, o.estado ?? "pendiente"]);
  return r.rows[0].id as number;
}
const estado = async (id: number) => (await db.query("SELECT estado, monto_base_centavos, recargo_aplicado_centavos FROM charges WHERE id=$1", [id])).rows[0];
const pagos = async (id: number) => (await db.query("SELECT count(*)::int AS n, COALESCE(sum(monto_centavos),0)::bigint AS total FROM payments WHERE charge_id=$1", [id])).rows[0];
const manual = (request: APIRequestContext, rol: string, studentId: number, chargeId: number, monto: number, key = llave()) =>
  request.post("/api/payments/manual", { headers: h(rol), data: { student_id: studentId, charge_id: chargeId, amount_centavos: monto, idempotency_key: key, recibido_por: "QA" }, failOnStatusCode: false });
const efectivo = (request: APIRequestContext, rol: string, studentId: number, chargeId: number | undefined, montoPesos: any) =>
  request.post("/api/caja/pago-efectivo", { headers: h(rol), data: { estudiante_id: studentId, charge_id: chargeId, monto: montoPesos, recibido_por: "QA" }, failOnStatusCode: false });

// ───────────────────────── C-10 beca y recargo en cada canal de cobro ─────────────────────────
test.describe("C-10 beca y recargo en el saldo de cada canal", () => {
  test("pago manual: pagar el neto de un cargo con beca del 50% lo deja pagado", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 100000, beca: 50 });
    const r = await manual(request, "ac", a, c, 50000);
    nota(`pago manual del neto: ${r.status()} ${(await r.text()).slice(0, 120)}`);
    expect(r.status()).toBe(201);
    const e = await estado(c);
    expect.soft(e.estado, "el neto (50%) cubre el cargo con beca").toBe("pagado");
  });
  test("pago manual: una vez cubierto el neto no debe aceptarse otro pago por la otra mitad", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 100000, beca: 50 });
    await manual(request, "ac", a, c, 50000);
    const r2 = await manual(request, "ac", a, c, 50000);
    const p = await pagos(c);
    nota(`segundo pago: ${r2.status()}; pagos=${p.n}, total=${p.total} sobre un neto de 50000`);
    expect.soft(r2.status(), "el cargo ya está cubierto").toBeGreaterThanOrEqual(400);
    expect.soft(Number(p.total), "no debe cobrarse más que el neto").toBeLessThanOrEqual(50000);
  });
  test("caja en efectivo: pagar el neto de un cargo con beca del 50% lo deja pagado", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 100000, beca: 50 });
    const r = await efectivo(request, "ac", a, c, 500);
    nota(`efectivo del neto: ${r.status()} ${(await r.text()).slice(0, 140)}`);
    expect(r.status()).toBe(200);
    expect.soft((await estado(c)).estado, "el neto (50%) cubre el cargo con beca").toBe("pagado");
  });
  test("caja en efectivo: el saldo incluye el recargo (testigo: el pago manual sí lo incluye)", async ({ request }) => {
    const a1 = await alumno(request); const c1 = await cargo(a1, { monto: 100000, recargo: 10000 });
    await manual(request, "ac", a1, c1, 100000);
    expect((await estado(c1)).estado, "manual: 1000 sobre 1100 queda parcial").toBe("parcial");
    const a2 = await alumno(request); const c2 = await cargo(a2, { monto: 100000, recargo: 10000 });
    await efectivo(request, "ac", a2, c2, 1000);
    expect.soft((await estado(c2)).estado, "efectivo: 1000 sobre 1100 debe quedar parcial").toBe("parcial");
  });
});

// ───────────────────────── C-19 pago manual ─────────────────────────
test.describe("C-19 pago manual", () => {
  test("idempotencia: la misma clave dos veces registra un solo pago", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a);
    const k = llave();
    const r1 = await manual(request, "ac", a, c, 30000, k);
    const r2 = await manual(request, "ac", a, c, 30000, k);
    expect(r1.status()).toBe(201);
    expect(r2.status()).toBe(200);
    expect((await body(r2)).idempotent).toBe(true);
    expect((await pagos(c)).n).toBe(1);
  });
  test("validaciones: monto excedente 409, cero y negativo 400, sin clave 400, clave corta 400", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 50000 });
    expect((await manual(request, "ac", a, c, 60000)).status(), "excede el saldo").toBe(409);
    expect((await manual(request, "ac", a, c, 0)).status(), "cero").toBe(400);
    expect((await manual(request, "ac", a, c, -100)).status(), "negativo").toBe(400);
    const sinClave = await request.post("/api/payments/manual", { headers: h("ac"), data: { student_id: a, charge_id: c, amount_centavos: 1000, recibido_por: "QA" }, failOnStatusCode: false });
    expect(sinClave.status(), "sin clave").toBe(400);
    expect((await manual(request, "ac", a, c, 1000, "corta")).status(), "clave corta").toBe(400);
    expect((await pagos(c)).n, "ninguna validación debe dejar pagos").toBe(0);
  });
  test("pago exacto liquida el cargo; un cargo pagado o cancelado se rechaza", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 40000 });
    expect((await manual(request, "ac", a, c, 40000)).status()).toBe(201);
    expect((await estado(c)).estado).toBe("pagado");
    expect((await manual(request, "ac", a, c, 100)).status(), "cargo ya pagado").toBe(409);
    const c2 = await cargo(a, { estado: "cancelado" });
    expect((await manual(request, "ac", a, c2, 100)).status(), "cargo cancelado").toBe(409);
  });
  test("permisos y alcance: asistente y admisiones 403; otro campus y otra escuela 404", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a);
    for (const rol of ["as", "ad"]) expect((await manual(request, rol, a, c, 1000)).status(), rol).toBe(403);
    for (const rol of ["ac2", "acb"]) expect((await manual(request, rol, a, c, 1000)).status(), `${rol} sobre un cargo ajeno`).toBe(404);
  });
});

// ───────────────────────── C-43 cobro en efectivo ─────────────────────────
test.describe("C-43 cobro en efectivo en caja", () => {
  test("pago parcial deja el cargo en parcial; el excedente se registra como saldo a favor", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 100000 });
    expect((await efectivo(request, "ac", a, c, 300)).status()).toBe(200);
    expect((await estado(c)).estado).toBe("parcial");
    expect((await efectivo(request, "ac", a, c, 900)).status()).toBe(200);
    const e = await estado(c);
    expect(e.estado, "700 + 300 cubren el cargo").toBe("pagado");
    const cred = (await db.query("SELECT COALESCE(sum(amount_centavos),0)::bigint AS total FROM family_credits WHERE student_id=$1", [a])).rows[0];
    nota(`excedente de 200 pesos registrado como saldo a favor: ${cred.total} centavos`);
    expect(Number(cred.total), "el cambio queda como saldo a favor").toBe(20000);
  });
  test("montos inválidos deben dar 400: texto, tres decimales, cero y negativo", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a);
    for (const [caso, monto] of [["texto", "abc"], ["tres decimales", "10.555"], ["cero", 0], ["negativo", -50]] as const) {
      const r = await efectivo(request, "ac", a, c, monto);
      nota(`monto ${caso}: ${r.status()}`);
      expect.soft(r.status(), `monto ${caso}`).toBe(400);
    }
    expect((await pagos(c)).n, "ningún monto inválido debe registrar un pago").toBe(0);
  });
  test("doble envío del mismo cobro: se registra dos veces (no hay llave de idempotencia)", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 100000 });
    await Promise.all([efectivo(request, "ac", a, c, 100), efectivo(request, "ac", a, c, 100)]);
    const p = await pagos(c);
    nota(`dos solicitudes idénticas y simultáneas dejaron ${p.n} pagos`);
    expect.soft(p.n, "un doble clic no debería cobrar dos veces").toBe(1);
  });
  test("permisos y alcance: asistente y admisiones 403; alumno de otro campus o escuela no se cobra", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a);
    for (const rol of ["as", "ad"]) expect((await efectivo(request, rol, a, c, 10)).status(), rol).toBe(403);
    for (const rol of ["ac2", "acb"]) {
      const r = await efectivo(request, rol, a, c, 10);
      nota(`${rol} cobra a un alumno ajeno: ${r.status()}`);
      expect.soft((await pagos(c)).n, `${rol} no debe registrar pagos ajenos`).toBe(0);
    }
  });
  test("sin cargos pendientes responde sin error de servidor", async ({ request }) => {
    const a = await alumno(request);
    const r = await efectivo(request, "ac", a, undefined, 10);
    expect(r.status()).toBeLessThan(500);
  });
});

// ───────────────────────── C-07 / C-02 emisión de cargos ─────────────────────────
test.describe("C-07 y C-02 emisión de cargos", () => {
  test("generar-mensual: asistente 403; repetir para el mismo periodo no debe duplicar cargos", async ({ request }) => {
    expect((await request.post("/api/admin/cargos/generar-mensual", { headers: h("as"), data: { periodo: "2026-12" }, failOnStatusCode: false })).status()).toBe(403);
    const total = async () => (await db.query("SELECT count(*)::int AS n FROM charges ch JOIN students s ON s.id=ch.student_id WHERE s.campus_id=1")).rows[0].n;
    const antes = await total();
    const a = await request.post("/api/admin/cargos/generar-mensual", { headers: h("ac"), data: { periodo: "2026-12", ciclo_escolar: "2026-2027" }, failOnStatusCode: false });
    nota(`primera: ${a.status()} ${(await a.text()).slice(0, 160)}`);
    const tras1 = await total();
    const b = await request.post("/api/admin/cargos/generar-mensual", { headers: h("ac"), data: { periodo: "2026-12", ciclo_escolar: "2026-2027" }, failOnStatusCode: false });
    const tras2 = await total();
    nota(`cargos: antes=${antes}, tras la 1a=${tras1}, tras la 2a=${tras2} (segunda ${b.status()})`);
    if (a.status() < 300) expect.soft(tras2 - tras1, "la segunda ejecución del mismo periodo no debe crear cargos").toBe(0);
    else expect(a.status(), "debe poder generarse con la configuración del seed").toBeLessThan(300);
  });
  test("generar-mensual: usa un solo concepto para todos los alumnos, sin distinguir nivel", async ({ request }) => {
    const antes = (await db.query("SELECT COALESCE(max(id),0) AS m FROM charges")).rows[0].m;
    const g = await request.post("/api/admin/cargos/generar-mensual", { headers: h("ag"), data: { periodo: "2027-01", ciclo_escolar: "2026-2027" }, failOnStatusCode: false });
    nota(`generar-mensual 2027-01 como AG: ${g.status()} ${(await g.text()).slice(0, 140)}`);
    const r = (await db.query(
      `SELECT c.nombre AS concepto, upper(COALESCE(s.nivel_escolar,'(sin nivel)')) AS nivel, ch.monto_base_centavos::text AS monto, count(*)::int AS n
         FROM charges ch JOIN students s ON s.id=ch.student_id JOIN concepts c ON c.id=ch.concept_id
        WHERE s.campus_id=1 AND ch.id > $1
        GROUP BY 1,2,3 ORDER BY 2`, [antes])).rows;
    nota(`distribución de la última emisión: ${JSON.stringify(r)}`);
    const conceptos = new Set(r.map((x: any) => x.concepto));
    expect.soft(conceptos.size, "cada nivel debería emitirse con su concepto de colegiatura").toBeGreaterThan(1);
  });
  test("charges/generate: la vista previa no escribe y el asistente no debe poder usarla (Q-09)", async ({ request }) => {
    const a = await alumno(request);
    const datos = { concepto: "Colegiatura Mensual Primaria", tipo_generacion: "colegiatura", nivel_academico: "todos", student_id: a, fecha_emision: "2026-12-01", fecha_vencimiento: "2026-12-10", dry_run: true, ciclo_escolar: "2026-2027", periodo_clave: "2026-12" };
    const antes = (await db.query("SELECT count(*)::int AS n FROM charges")).rows[0].n;
    const ac = await request.post("/api/charges/generate", { headers: h("ac"), data: datos, failOnStatusCode: false });
    nota(`AC dry_run: ${ac.status()} ${(await ac.text()).slice(0, 200)}`);
    expect((await db.query("SELECT count(*)::int AS n FROM charges")).rows[0].n, "la vista previa no debe escribir").toBe(antes);
    const as = await request.post("/api/charges/generate", { headers: h("as"), data: datos, failOnStatusCode: false });
    nota(`AS dry_run: ${as.status()} ${(await as.text()).slice(0, 200)}`);
    expect.soft(as.status(), "el asistente no tiene charges.create").toBe(403);
  });
  test("charges/generate real (sin dry_run): el asistente no debe poder crear cargos (Q-09)", async ({ request }) => {
    const a = await alumno(request);
    const antes = (await db.query("SELECT count(*)::int AS n FROM charges WHERE student_id=$1", [a])).rows[0].n;
    const datos = { concepto: "Colegiatura Mensual Primaria", tipo_generacion: "colegiatura", nivel_academico: "todos", student_id: a, fecha_emision: "2026-12-01", fecha_vencimiento: "2026-12-10", ciclo_escolar: "2026-2027", periodo_clave: "2026-12" };
    const r = await request.post("/api/charges/generate", { headers: h("as"), data: datos, failOnStatusCode: false });
    const despues = (await db.query("SELECT count(*)::int AS n FROM charges WHERE student_id=$1", [a])).rows[0].n;
    nota(`asistente emite en serio: ${r.status()} ${(await r.text()).slice(0, 160)}; cargos del alumno ${antes} a ${despues}`);
    expect.soft(r.status(), "emisión real por el asistente").toBe(403);
    expect.soft(despues - antes, "no debe haberse creado ningún cargo").toBe(0);
  });
});

// ───────────────────────── C-13 recargos ─────────────────────────
test.describe("C-13 recargos por mora", () => {
  test("una regla de recargo se aplica a cargos vencidos, no se repite el mismo mes y respeta pagos parciales", async ({ request }) => {
    const regla = await request.post("/api/payment-config/surcharge-rules-complete", { headers: h("ac"), data: { concepto_id: ids.concepto, tipo_calculo: "porcentaje_fijo", porcentaje_recargo: 10, dias_gracia: 0 }, failOnStatusCode: false });
    nota(`regla: ${regla.status()} ${(await regla.text()).slice(0, 160)}`);
    expect([201, 409], "la regla se crea o ya existía de una corrida anterior").toContain(regla.status());
    const a1 = await alumno(request); const vencido = await cargo(a1, { monto: 100000, venc: "2026-09-10" });
    const a2 = await alumno(request); const parcial = await cargo(a2, { monto: 100000, venc: "2026-09-10" });
    await manual(request, "ac", a2, parcial, 20000);
    expect((await estado(parcial)).estado).toBe("parcial");
    expect((await request.post("/api/admin/cargos/aplicar-recargos", { headers: h("as"), failOnStatusCode: false })).status(), "asistente").toBe(403);
    const r1 = await request.post("/api/admin/cargos/aplicar-recargos", { headers: h("ac"), failOnStatusCode: false });
    nota(`aplicar-recargos: ${r1.status()} ${(await r1.text()).slice(0, 180)}`);
    expect(r1.status()).toBe(200);
    const e1 = await estado(vencido);
    nota(`recargo del cargo vencido: ${e1.recargo_aplicado_centavos}`);
    expect(Number(e1.recargo_aplicado_centavos), "10% sobre 100000 vencido").toBeGreaterThan(0);
    const r2 = await request.post("/api/admin/cargos/aplicar-recargos", { headers: h("ac"), failOnStatusCode: false });
    expect(r2.status()).toBe(200);
    expect(Number((await estado(vencido)).recargo_aplicado_centavos), "repetir el mismo mes no acumula").toBe(Number(e1.recargo_aplicado_centavos));
    const ep = await estado(parcial);
    nota(`recargo del cargo con pago parcial: ${ep.recargo_aplicado_centavos}`);
    expect.soft(Number(ep.recargo_aplicado_centavos), "un cargo vencido con pago parcial también debe generar recargo (C-H12)").toBeGreaterThan(0);
  });
});

// ───────────────────────── C-32 / C-35 convenios de pago ─────────────────────────
test.describe("C-32 y C-35 convenios de pago", () => {
  test("crear convenio: validaciones de cuotas, modo mixto, permisos y alcance", async ({ request }) => {
    const a = await alumno(request); const c1 = await cargo(a, { monto: 60000 }); const c2 = await cargo(a, { monto: 60000 });
    const base = { charge_ids: [c1, c2], numero_pagos: 3, fecha_inicio: "2026-12-01", frecuencia: "mensual", monto_inicial_centavos: 0 };
    expect((await request.post("/api/planes-pago", { headers: h("ac"), data: { ...base, numero_pagos: 2 }, failOnStatusCode: false })).status(), "2 cuotas").toBe(400);
    expect((await request.post("/api/planes-pago", { headers: h("ac"), data: { ...base, numero_pagos: 13 }, failOnStatusCode: false })).status(), "13 cuotas").toBe(400);
    expect((await request.post("/api/planes-pago", { headers: h("ac"), data: { ...base, concept_id: ids.concepto }, failOnStatusCode: false })).status(), "modo mixto").toBe(400);
    expect((await request.post("/api/planes-pago", { headers: h("ac"), data: { ...base, fecha_inicio: "2026-02-30" }, failOnStatusCode: false })).status(), "fecha imposible").toBe(400);
    expect((await request.post("/api/planes-pago", { headers: h("as"), data: base, failOnStatusCode: false })).status(), "asistente").toBe(403);
    expect([403, 404], "otra escuela").toContain((await request.post("/api/planes-pago", { headers: h("acb"), data: base, failOnStatusCode: false })).status());
    ids.convenio = { a, c1, c2 };
  });
  test("crear convenio válido: reestructura los cargos y cancelar para reinstalar los restituye", async ({ request }) => {
    const a = await alumno(request); const c1 = await cargo(a, { monto: 60000 }); const c2 = await cargo(a, { monto: 60000 });
    const r = await request.post("/api/planes-pago", { headers: h("ac"), data: { charge_ids: [c1, c2], numero_pagos: 3, fecha_inicio: "2026-12-01", frecuencia: "mensual", monto_inicial_centavos: 0 }, failOnStatusCode: false });
    nota(`crear convenio: ${r.status()} ${(await r.text()).slice(0, 220)}`);
    expect(r.status()).toBeLessThan(300);
    const plan = await body(r); const planId = plan.id ?? plan.plan?.id ?? plan.plan_id;
    expect(planId, "id del plan").toBeTruthy();
    const origen = (await db.query("SELECT estado FROM charges WHERE id = ANY($1::int[]) ORDER BY id", [[c1, c2]])).rows.map((x: any) => x.estado);
    nota(`estado de los cargos origen tras crear el convenio: ${JSON.stringify(origen)}`);
    expect.soft(origen.every((e: string) => e === "reestructurado"), "los cargos origen deberían quedar 'reestructurado' y no confundirse con una cancelación").toBe(true);
    const cuotas = (await db.query("SELECT count(*)::int AS n, COALESCE(sum(monto_base_centavos),0)::bigint AS total, bool_and(ciclo_escolar IS NOT NULL AND ciclo_escolar <> '') AS con_ciclo FROM charges WHERE plan_id=$1", [planId])).rows[0];
    nota(`cuotas del convenio (son cargos con plan_id): ${JSON.stringify(cuotas)}`);
    expect(cuotas.n, "tres cuotas").toBe(3);
    expect(Number(cuotas.total), "las cuotas suman el saldo original").toBe(120000);
    expect.soft(cuotas.con_ciclo, "las cuotas deberían heredar el ciclo escolar").toBe(true);
    expect((await request.patch(`/api/planes-pago/${planId}/cancelar`, { headers: h("ac"), data: { motivo: "corto" }, failOnStatusCode: false })).status(), "motivo corto").toBe(400);
    expect((await request.patch(`/api/planes-pago/${planId}/cancelar`, { headers: h("ac"), data: { motivo: "Cancelación de prueba QA" }, failOnStatusCode: false })).status(), "sin destino").toBe(400);
    expect((await request.patch(`/api/planes-pago/${planId}/cancelar`, { headers: h("ac"), data: { motivo: "Cancelación de prueba QA", destino_saldo_pendiente: "condonar" }, failOnStatusCode: false })).status(), "condonar sin motivo").toBe(400);
    expect([403, 404], "otro campus").toContain((await request.patch(`/api/planes-pago/${planId}/cancelar`, { headers: h("ac2"), data: { motivo: "Cancelación de prueba QA", destino_saldo_pendiente: "reinstalar" }, failOnStatusCode: false })).status());
    const ok = await request.patch(`/api/planes-pago/${planId}/cancelar`, { headers: h("ac"), data: { motivo: "Cancelación de prueba QA", destino_saldo_pendiente: "reinstalar" }, failOnStatusCode: false });
    nota(`cancelar reinstalando: ${ok.status()} ${(await ok.text()).slice(0, 160)}`);
    expect(ok.status()).toBe(200);
    const okj = await body(ok);
    nota(`reinstalar: nuevo_charge_id=${okj.nuevo_charge_id}`);
    expect(okj.nuevo_charge_id, "reinstalar crea un cargo nuevo por el saldo pendiente").toBeTruthy();
    const nuevo = (await db.query("SELECT monto_base_centavos::text AS monto, estado FROM charges WHERE id=$1", [okj.nuevo_charge_id])).rows[0];
    nota(`cargo nuevo: ${JSON.stringify(nuevo)}`);
    expect(Number(nuevo.monto), "el cargo nuevo lleva todo el saldo pendiente").toBe(120000);
    expect(["pendiente", "vencido"]).toContain(nuevo.estado);
    expect((await request.patch(`/api/planes-pago/${planId}/cancelar`, { headers: h("ac"), data: { motivo: "Cancelación de prueba QA", destino_saldo_pendiente: "reinstalar" }, failOnStatusCode: false })).status(), "ya cancelado").toBe(409);
  });
  test("condonar el saldo: exige motivo y una segunda condonación del mismo alumno genera alerta", async ({ request }) => {
    const a = await alumno(request);
    const mk = async () => {
      const c1 = await cargo(a, { monto: 60000 }); const c2 = await cargo(a, { monto: 60000 });
      const r = await request.post("/api/planes-pago", { headers: h("ac"), data: { charge_ids: [c1, c2], numero_pagos: 3, fecha_inicio: "2026-12-01", frecuencia: "mensual", monto_inicial_centavos: 0 }, failOnStatusCode: false });
      const j = await body(r); return { planId: j.id ?? j.plan?.id ?? j.plan_id, c1, c2 };
    };
    const p1 = await mk();
    const cond = { motivo: "Condonación de prueba QA", destino_saldo_pendiente: "condonar", motivo_condonacion: "Situación económica documentada QA" };
    const r1 = await request.patch(`/api/planes-pago/${p1.planId}/cancelar`, { headers: h("ac"), data: cond, failOnStatusCode: false });
    nota(`primera condonación: ${r1.status()} ${(await r1.text()).slice(0, 160)}`);
    expect(r1.status()).toBe(200);
    const est = (await db.query("SELECT estado FROM charges WHERE id = ANY($1::int[])", [[p1.c1, p1.c2]])).rows.map((x: any) => x.estado);
    nota(`estado tras condonar: ${JSON.stringify(est)}`);
    const p2 = await mk();
    const r2 = await request.patch(`/api/planes-pago/${p2.planId}/cancelar`, { headers: h("ac"), data: cond, failOnStatusCode: false });
    nota(`segunda condonación dentro de 90 días: ${r2.status()} ${(await r2.text()).slice(0, 200)}`);
    expect.soft(r2.status(), "la repetición debe frenarse o pedir autorización").not.toBe(200);
  });
});

// ───────────────────────── C-38 / C-40 aprobaciones ─────────────────────────
test.describe("C-38 y C-40 aprobaciones", () => {
  const sembrar = async (accion: string, entidad: string, entityId: number, datos: any) => {
    const u = (await db.query("SELECT id FROM users WHERE email=$1", [E.ac])).rows[0].id;
    return (await db.query(
      `INSERT INTO pending_approvals (tenant_id, campus_id, action_type, action_description, requested_by, status, reason, requested_data, entity_type, entity_id)
       VALUES (1,1,$1,$2,$3,'pending','QA',$4::jsonb,$5,$6) RETURNING id`, [accion, `QA ${accion}`, u, JSON.stringify(datos), entidad, entityId])).rows[0].id as number;
  };
  test("solo administrador general y superadmin pueden decidir", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a);
    const id = await sembrar("modify_charge_amount", "charge", c, { amount: 12345 });
    for (const rol of ["ac", "cg", "ax"]) expect((await request.post("/api/approvals/decision", { headers: h(rol), data: { approval_id: id, decision: "approved" }, failOnStatusCode: false })).status(), rol).toBe(403);
    expect((await estado(c)).monto_base_centavos, "nada cambió").toBe("100000");
  });
  test("aprobar un cambio de monto lo ejecuta; otra escuela no puede decidir", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a);
    const id = await sembrar("modify_charge_amount", "charge", c, { amount: 12345 });
    expect((await request.post("/api/approvals/decision", { headers: h("agb"), data: { approval_id: id, decision: "approved" }, failOnStatusCode: false })).status()).toBe(403);
    const r = await request.post("/api/approvals/decision", { headers: h("ag"), data: { approval_id: id, decision: "approved" }, failOnStatusCode: false });
    expect(r.status()).toBe(200);
    expect(Number((await estado(c)).monto_base_centavos)).toBe(12345);
  });
  test("si el cambio aprobado no se puede ejecutar, no debe responderse éxito (C-H13)", async ({ request }) => {
    const a = await alumno(request); const c = await cargo(a, { monto: 100000 });
    expect((await manual(request, "ac", a, c, 10000)).status()).toBe(201);
    const id = await sembrar("delete_charge", "charge", c, {});
    const r = await request.post("/api/approvals/decision", { headers: h("ag"), data: { approval_id: id, decision: "approved" }, failOnStatusCode: false });
    const st = (await db.query("SELECT status FROM pending_approvals WHERE id=$1", [id])).rows[0].status;
    const existe = (await db.query("SELECT count(*)::int AS n FROM charges WHERE id=$1", [c])).rows[0].n;
    const log = (await db.query("SELECT action FROM approval_workflow_logs WHERE approval_id=$1 ORDER BY id", [id]).catch(() => ({ rows: [] }))).rows.map((x: any) => x.action);
    const pagosDespues = (await db.query("SELECT count(*)::int AS n FROM payments WHERE charge_id=$1", [c])).rows[0].n;
    const appsDespues = (await db.query("SELECT count(*)::int AS n FROM payment_applications WHERE charge_id=$1", [c])).rows[0].n;
    nota(`borrar un cargo con pagos: respuesta ${r.status()}, solicitud=${st}, cargo existe=${existe}, pagos que quedan=${pagosDespues}, aplicaciones que quedan=${appsDespues}, bitácora=${JSON.stringify(log)}`);
    expect.soft(pagosDespues, "un pago registrado no debe desaparecer al borrar su cargo").toBe(1);
    expect.soft(existe, "el cargo con pagos no se pudo borrar").toBe(1);
    expect.soft(r.status(), "la ejecución falló: no debe responder éxito").toBeGreaterThanOrEqual(400);
    expect.soft(st, "la solicitud no debe quedar aprobada si no se ejecutó").not.toBe("approved");
  });
});

// ───────────────────────── C-45 cierre de caja ─────────────────────────
test.describe("C-45 cierre de caja", () => {
  test("permisos: asistente y admisiones no cierran; fecha inválida, futura y efectivo negativo se rechazan", async ({ request }) => {
    for (const rol of ["as", "ad"]) expect((await request.post("/api/caja/cerrar-dia", { headers: h(rol), data: { efectivo_capturado_centavos: 0 }, failOnStatusCode: false })).status(), rol).toBe(403);
    expect((await request.post("/api/caja/cerrar-dia", { headers: h("ac"), data: { fecha: "2026-02-30", efectivo_capturado_centavos: 0 }, failOnStatusCode: false })).status(), "fecha imposible").toBe(400);
    expect((await request.post("/api/caja/cerrar-dia", { headers: h("ac"), data: { efectivo_capturado_centavos: -5 }, failOnStatusCode: false })).status(), "efectivo negativo").toBe(400);
    const futura = await request.post("/api/caja/cerrar-dia", { headers: h("ac"), data: { fecha: "2030-01-01", efectivo_capturado_centavos: 0 }, failOnStatusCode: false });
    nota(`cierre con fecha futura: ${futura.status()}`);
    expect.soft(futura.status(), "no debe poder cerrarse una fecha futura").toBe(400);
  });
  test("cerrar el día: un solo cierre; los cobros posteriores en efectivo deben bloquearse", async ({ request }) => {
    const hoy = (await request.get("/api/caja/cierre-dia", { headers: h("ac") }));
    expect(hoy.status()).toBe(200);
    const antes = (await hoy.json()).cierre;
    nota(`cierre previo de hoy: ${JSON.stringify(antes)}`);
    const a = await alumno(request); const c = await cargo(a, { monto: 100000 });
    await efectivo(request, "ac", a, c, 100);
    const cierre = await request.post("/api/caja/cerrar-dia", { headers: h("ac"), data: { efectivo_capturado_centavos: 10000, observaciones: "Cierre QA" }, failOnStatusCode: false });
    nota(`cerrar-dia: ${cierre.status()} ${(await cierre.text()).slice(0, 200)}`);
    if (antes) { expect(cierre.status()).toBeGreaterThanOrEqual(400); return; }
    expect(cierre.status()).toBeLessThan(300);
    const otra = await request.post("/api/caja/cerrar-dia", { headers: h("ac"), data: { efectivo_capturado_centavos: 10000 }, failOnStatusCode: false });
    expect(otra.status(), "segundo cierre del mismo día").toBe(409);
    const tarde = await efectivo(request, "ac", a, c, 50);
    const tardeManual = await manual(request, "ac", a, c, 1000);
    nota(`cobro en efectivo tras el cierre: ${tarde.status()}; pago manual tras el cierre: ${tardeManual.status()}`);
    expect.soft(tarde.status(), "efectivo posterior al cierre").toBeGreaterThanOrEqual(400);
    expect.soft(tardeManual.status(), "pago manual posterior al cierre").toBeGreaterThanOrEqual(400);
  });
});

// ───────────────────────── C-51 / C-52 conciliación y devoluciones: autorización y alcance ─────────────────────────
test.describe("conciliación y devoluciones: autorización y alcance", () => {
  test("auto-match de otro campus de la misma escuela debe rechazarse (C-H10)", async ({ request }) => {
    const r = await request.post("/api/conciliacion/auto-match/2", { headers: h("ac"), data: {}, failOnStatusCode: false });
    nota(`AC del campus 1 sobre el campus 2: ${r.status()} ${(await r.text()).slice(0, 120)}`);
    expect.soft(r.status(), "AC campus 1 sobre campus 2").toBeGreaterThanOrEqual(400);
    expect([403, 404]).toContain((await request.post("/api/conciliacion/auto-match/1", { headers: h("acb"), data: {}, failOnStatusCode: false })).status());
  });
  test("ejecutar conciliación: asistente y admisiones 403", async ({ request }) => {
    for (const rol of ["as", "ad"]) expect((await request.post("/api/caja/ejecutar-conciliacion", { headers: h(rol), data: {}, failOnStatusCode: false })).status(), rol).toBe(403);
  });
  test("excepciones bancarias: consultan AC, AG y CG; el auxiliar contable recibe 403 aunque tiene el enlace (Q-15)", async ({ request }) => {
    for (const rol of ["ac", "ag", "cg"]) expect((await request.get("/api/conciliacion/excepciones", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(200);
    expect.soft((await request.get("/api/conciliacion/excepciones", { headers: h("ax"), failOnStatusCode: false })).status(), "AX con enlace en el menú").toBe(200);
    expect.soft((await request.get("/api/conciliacion/excepciones", { headers: h("as"), failOnStatusCode: false })).status(), "el asistente no debería ver excepciones bancarias (Q-17)").toBe(403);
  });
  test("devoluciones: solo la administración general; el resto 403; otra escuela no ve los saldos", async ({ request }) => {
    for (const rol of ["ac", "cg", "as", "ad", "ax"]) expect((await request.get("/api/admin/credit-refunds", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(403);
    const ag = await request.get("/api/admin/credit-refunds", { headers: h("ag"), failOnStatusCode: false });
    expect(ag.status()).toBe(200);
    expect(JSON.stringify(await ag.json())).toContain("excedente_caja");
    const b = await body(await request.get("/api/admin/credit-refunds", { headers: h("agb"), failOnStatusCode: false }));
    expect(JSON.stringify(b)).not.toContain("excedente_caja");
  });
});

// ───────────────────────── C-60 / C-61 / C-74: lo que se puede probar sin Stripe ni Facturapi ─────────────────────────
test.describe("pagos de tutor y timbrado: validaciones previas al tercero", () => {
  test("guardian/pagar: valida cargos antes de llegar a Stripe y no cobra sin cuenta conectada", async ({ request }) => {
    const g = await request.post("/api/auth/guardian-login", { data: { email: "lopez.carlos@demo.mx", password: PW } });
    const gt = { Authorization: `Bearer ${(await g.json()).token}` };
    expect((await request.post("/api/guardian/pagar", { headers: gt, data: { charge_ids: [] }, failOnStatusCode: false })).status(), "sin cargos").toBe(400);
    expect((await request.post("/api/guardian/pagar", { headers: gt, data: { charge_ids: ["x"] }, failOnStatusCode: false })).status(), "id inválido").toBe(400);
    expect((await request.post("/api/guardian/pagar", { headers: gt, data: { charge_ids: [1], metodo_pago: "tarjeta" }, failOnStatusCode: false })).status(), "sin payment_method_id").toBe(422);
    const ajeno = (await db.query(`SELECT ch.id FROM charges ch JOIN students s ON s.id=ch.student_id WHERE s.campus_id=1 AND ch.student_id NOT IN (SELECT student_id FROM student_guardian WHERE guardian_id=(SELECT id FROM guardians WHERE email='lopez.carlos@demo.mx')) LIMIT 1`)).rows[0].id;
    expect((await request.post("/api/guardian/pagar", { headers: gt, data: { charge_ids: [ajeno], payment_method_id: "pm_card_visa" }, failOnStatusCode: false })).status(), "cargo de otro alumno").toBe(403);
    const propio = (await db.query(`SELECT ch.id FROM charges ch JOIN student_guardian sg ON sg.student_id=ch.student_id JOIN guardians g ON g.id=sg.guardian_id WHERE g.email='lopez.carlos@demo.mx' AND ch.estado IN ('pendiente','parcial') LIMIT 1`)).rows[0]?.id;
    if (propio) {
      const antes = (await db.query("SELECT count(*)::int AS n FROM payments")).rows[0].n;
      const r = await request.post("/api/guardian/pagar", { headers: gt, data: { charge_ids: [propio], payment_method_id: "pm_card_visa" }, failOnStatusCode: false });
      nota(`pago propio sin Stripe Connect: ${r.status()} ${(await r.text()).slice(0, 140)}`);
      expect([409, 422]).toContain(r.status());
      expect((await db.query("SELECT count(*)::int AS n FROM payments")).rows[0].n, "no debe registrar pagos").toBe(antes);
    }
  });
  test("timbrado: sin proveedor configurado responde sin error de servidor y sin timbrar; el asistente 403", async ({ request }) => {
    expect((await request.post("/api/fiscal/timbrar-lote", { headers: h("as"), data: {}, failOnStatusCode: false })).status()).toBe(403);
    const r = await request.post("/api/fiscal/timbrar-lote", { headers: h("ac"), data: { payment_ids: [] }, failOnStatusCode: false });
    nota(`AC timbra sin proveedor: ${r.status()} ${(await r.text()).slice(0, 160)}`);
    expect(r.status()).toBeLessThan(500);
  });
  test("webhook de Stripe sin secreto configurado se rechaza y sin firma no procesa nada", async ({ request }) => {
    const r = await request.post("/api/webhooks/stripe", { data: { type: "payment_intent.succeeded" }, failOnStatusCode: false });
    nota(`webhook sin firma: ${r.status()}`);
    expect([400, 401, 403, 503]).toContain(r.status());
  });
});
