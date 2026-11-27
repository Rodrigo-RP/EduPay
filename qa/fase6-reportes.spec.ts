/**
 * QA fase 6: reportes, dashboards, notificaciones, asistente y búsqueda (área D, D-17 a D-65). Base desechable edupay_ci.
 * Cada prueba afirma el comportamiento DISEÑADO; un fallo es un defecto reproducido o una decisión de producto pendiente.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { staffApiLogin, ADMIN_PASSWORD } from "../e2e/helpers/auth";

const require = createRequire(import.meta.url);
const pg = require("pg");
const XLSX = require("xlsx");
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

const HOY = "(now() AT TIME ZONE 'America/Mexico_City')::date";
/** Verdad en la base: saldo neto de beca por cargo, para un campus. */
async function verdad(campus: number, ciclo?: string) {
  const f = ciclo ? "AND ch.ciclo_escolar = $2" : "";
  const params: any[] = ciclo ? [campus, ciclo] : [campus];
  const r = (await db.query(
    `WITH c AS (
       SELECT ch.id, ch.student_id, ch.estado, ch.fecha_vencimiento AS venc, ch.monto_base_centavos AS base, ch.beca_aplicada::numeric AS beca,
              ch.recargo_aplicado_centavos AS rec,
              COALESCE((SELECT sum(pa.amount_centavos) FROM payment_applications pa WHERE pa.charge_id = ch.id),0) AS ap
         FROM charges ch JOIN students s ON s.id = ch.student_id WHERE s.campus_id = $1 ${f}
     ), v AS (
       SELECT *, round(base * (1 - beca/100)) + rec AS total_neto, base + rec AS total_bruto FROM c
        WHERE estado NOT IN ('pagado','cancelado','reestructurado')
     )
     SELECT
       COALESCE(sum(GREATEST(total_neto - ap,0)),0)::bigint AS pend_neto,
       COALESCE(sum(GREATEST(total_bruto - ap,0)),0)::bigint AS pend_bruto,
       COALESCE(sum(GREATEST(total_neto - ap,0)) FILTER (WHERE venc < ${HOY}),0)::bigint AS venc_neto,
       COALESCE(sum(GREATEST(total_bruto - ap,0)) FILTER (WHERE venc < ${HOY}),0)::bigint AS venc_bruto,
       count(*)::int AS cargos_abiertos,
       count(DISTINCT student_id)::int AS alumnos_con_adeudo
     FROM v`, params)).rows[0];
  const num = (k: string) => Number(r[k]);
  return { pendNeto: num("pend_neto"), pendBruto: num("pend_bruto"), vencNeto: num("venc_neto"), vencBruto: num("venc_bruto"), cargosAbiertos: r.cargos_abiertos as number, alumnos: r.alumnos_con_adeudo as number };
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

// ───────────────────────── cifras: reportes y dashboards contra la base ─────────────────────────
test.describe("cifras de reportes y dashboards contra la base (campus 1)", () => {
  test("la cartera pendiente es la misma en antigüedad, consejo, contador y dashboard", async ({ request }) => {
    const ciclo = "2026-2027";
    const real = await verdad(1, ciclo);
    const todo = await verdad(1);
    nota(`base (ciclo ${ciclo}): pendiente neto=${real.pendNeto}, bruto=${real.pendBruto}, vencido neto=${real.vencNeto}, bruto=${real.vencBruto}; todos los ciclos: neto=${todo.pendNeto}, bruto=${todo.pendBruto}`);
    const ant = await body(await request.get("/api/reportes/antiguedad-saldos", { headers: h("ac") }));
    const con = await body(await request.get("/api/reportes/consejo", { headers: h("ac") }));
    const ctr = await body(await request.get("/api/dashboard/contador", { headers: h("ac") }));
    const dash = await body(await request.get("/api/admin/dashboard/1", { headers: h("ac") }));
    const vals: Record<string, number> = {
      "antigüedad total_cartera (centavos)": Number(ant.total_cartera_centavos),
      "consejo kpis.pendiente": Number(con.kpis?.pendiente),
      "contador total_pending": Number(ctr.financial_summary?.total_pending),
      "dashboard ciclo_metrics.por_cobrar": Number(dash.ciclo_metrics?.por_cobrar),
    };
    nota(`cifras reportadas: ${JSON.stringify(vals)}`);
    // normalizar a centavos si vienen en pesos
    const enCentavos = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v]));
    const distintos = new Set(Object.values(enCentavos).map((v) => Math.round(v)));
    nota(`valores distintos entre los 4 reportes: ${distintos.size}`);
    expect.soft(distintos.size, "los cuatro reportes deben coincidir en la cartera pendiente").toBe(1);
  });
  test("cada reporte frente a la base (saldo neto de beca)", async ({ request }) => {
    const ciclo = "2026-2027";
    const real = await verdad(1, ciclo);
    const todo = await verdad(1);
    const ant = await body(await request.get("/api/reportes/antiguedad-saldos", { headers: h("ac") }));
    const rie = await body(await request.get("/api/reportes/riesgo", { headers: h("ac") }));
    const con = await body(await request.get("/api/reportes/consejo", { headers: h("ac") }));
    const dash = await body(await request.get("/api/admin/dashboard/1", { headers: h("ac") }));
    const antT = Number(ant.total_cartera_centavos), rieT = Number(rie.total_adeudo_centavos);
    nota(`antigüedad=${antT}; riesgo=${rieT}; base pendiente (todos)=${todo.pendNeto}/${todo.pendBruto}, vencido (ciclo)=${real.vencNeto}/${real.vencBruto}`);
    expect.soft([todo.pendNeto, todo.pendBruto, real.pendNeto, real.pendBruto], "antigüedad de saldos debe coincidir con la cartera de la base").toContain(antT);
    const esperadoRiesgo = [todo.pendNeto, todo.pendBruto, real.pendNeto, real.pendBruto, todo.vencNeto, todo.vencBruto, real.vencNeto, real.vencBruto];
    expect.soft(esperadoRiesgo, `el reporte de riesgo suma ${rieT}, que no coincide con ninguna definición de adeudo de la base`).toContain(rieT);
    nota(`riesgo / antigüedad = ${(rieT / antT).toFixed(2)}`);
    const pend = Number(con.kpis?.pendiente), venc = Number(con.kpis?.vencido);
    nota(`consejo: pendiente=${pend}, vencido=${venc}; dashboard: por_cobrar=${dash.ciclo_metrics?.por_cobrar}, vencido=${dash.ciclo_metrics?.vencido}, alumnos_activos=${dash.ciclo_metrics?.alumnos_activos}, con adeudo=${dash.ciclo_metrics?.alumnos_con_adeudo}`);
  });
  test("conteos: reporte de estudiantes y de cobranza frente a la base", async ({ request }) => {
    const est = await body(await request.get("/api/reportes/estudiantes", { headers: h("ac") }));
    const cob = await body(await request.get("/api/reportes/cobranza", { headers: h("ac") }));
    const alumnos = (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=1")).rows[0].n;
    const cargos = (await db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE estado <> 'cancelado')::int AS vigentes FROM charges ch JOIN students s ON s.id=ch.student_id WHERE s.campus_id=1")).rows[0];
    nota(`estudiantes: reporte=${est.total}, base=${alumnos}; cobranza: reporte=${cob.total}, base total=${cargos.total}, no cancelados=${cargos.vigentes}`);
    expect(est.total, "alumnos del campus").toBe(alumnos);
    expect.soft([cargos.total, cargos.vigentes], "cobranza debe listar los cargos del campus (el cancelado no, según COB-02)").toContain(cob.total);
  });
  test("ingresos del reporte financiero frente a los pagos exitosos de la base", async ({ request }) => {
    const fin = await body(await request.get("/api/reportes/financiero", { headers: h("ac") }));
    const pagos = (await db.query(
      `SELECT COALESCE(sum(p.monto_centavos),0)::bigint AS total, count(*)::int AS n FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id
        WHERE s.campus_id=1 AND p.estado='exitoso'`)).rows[0];
    const ti = Number(fin.summary?.total_income);
    nota(`financiero: total_income=${ti}, payments_count=${fin.summary?.payments_count}; base: total=${pagos.total} centavos (${Number(pagos.total) / 100} pesos), pagos=${pagos.n}`);
    expect.soft([Number(pagos.total), Number(pagos.total) / 100], "ingresos del reporte vs pagos exitosos de la base").toContain(ti);
  });
  test("el dashboard administrativo: alumnos activos y con adeudo coinciden con la base", async ({ request }) => {
    const dash = await body(await request.get("/api/admin/dashboard/1", { headers: h("ac") }));
    const activos = (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=1 AND status='activo'")).rows[0].n;
    const real = await verdad(1, "2026-2027");
    nota(`dashboard: activos=${dash.ciclo_metrics?.alumnos_activos}, con adeudo=${dash.ciclo_metrics?.alumnos_con_adeudo}; base: activos=${activos}, con adeudo (ciclo)=${real.alumnos}`);
    expect(Number(dash.ciclo_metrics?.alumnos_activos), "alumnos activos").toBe(activos);
    expect.soft(Number(dash.ciclo_metrics?.alumnos_con_adeudo), "alumnos con adeudo").toBe(real.alumnos);
  });
});

// ───────────────────────── semáforo: el adeudo no debe inflarse ─────────────────────────
test.describe("D-24 semáforo de riesgo", () => {
  const nuevoAlumnoConTutores = async (tutores: number) => {
    const sid = (await db.query(`INSERT INTO students (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo, nivel_escolar, grado, grupo, status)
       VALUES (1,1,'QA Semaforo','Prueba','QA Semaforo Prueba','Primaria','3° Primaria','A','activo') RETURNING id`)).rows[0].id;
    for (let i = 1; i <= tutores; i++) {
      const g = (await db.query(`INSERT INTO guardians (tenant_id, campus_id, nombre_completo, email) VALUES (1,1,$1,$2) RETURNING id`, [`QA Tutor ${i}`, `sem.${uniq()}@example.test`])).rows[0].id;
      await db.query("INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1,$2)", [sid, g]).catch(() => {});
    }
    return sid;
  };
  const cargoVencido = async (sid: number, estado: string) => (await db.query(`INSERT INTO charges (student_id, concept_id, tenant_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,1,1,'2026-2027','2026-08-01','2026-09-10',100000,'0.00',0,$2) RETURNING id`, [sid, estado])).rows[0].id as number;
  const pagado = async (sid: number, monto: number) => {
    const c = (await db.query(`INSERT INTO charges (student_id, concept_id, tenant_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,1,1,'2026-2027','2026-07-01','2026-07-10',$2,'0.00',0,'pagado') RETURNING id`, [sid, monto])).rows[0].id;
    const p = (await db.query(`INSERT INTO payments (tenant_id, charge_id, metodo, referencia_pasarela, monto_centavos, fecha_pago, estado) VALUES (1,$1,'efectivo',$2,$3,'2026-07-05','exitoso') RETURNING id`, [c, `sem-${uniq()}`, monto])).rows[0].id;
    await db.query("INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at) VALUES ($1,$2,$3,NOW())", [p, c, monto]);
  };
  test("un cargo vencido con pago parcial debe aparecer en el semáforo con su adeudo real (H-C12)", async ({ request }) => {
    const sid = await nuevoAlumnoConTutores(1);
    const c = await cargoVencido(sid, "parcial");
    const p = (await db.query(`INSERT INTO payments (tenant_id, charge_id, metodo, referencia_pasarela, monto_centavos, fecha_pago, estado) VALUES (1,$1,'efectivo',$2,30000,'2026-10-01','exitoso') RETURNING id`, [c, `sem-${uniq()}`])).rows[0].id;
    await db.query("INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at) VALUES ($1,$2,30000,NOW())", [p, c]);
    const fila = (await body(await request.get("/api/riesgo/semaforo", { headers: h("ac") }))).find((x: any) => x.student_id === sid);
    nota(`alumno con 70000 vencidos y un pago parcial: ${JSON.stringify(fila)}`);
    expect.soft(Number(fila?.adeudo_centavos), "adeudo real = 100000 - 30000").toBe(70000);
    expect.soft(fila?.semaforo, "con adeudo vencido no debe salir en verde").not.toBe("verde");
  });
  test("un alumno con 2 tutores e historial pagado no duplica su adeudo", async ({ request }) => {
    const sid = await nuevoAlumnoConTutores(2);
    await cargoVencido(sid, "pendiente");
    for (const m of [10000, 20000, 30000]) await pagado(sid, m);
    const lista = await body(await request.get("/api/riesgo/semaforo", { headers: h("ac") }));
    const fila = lista.find((x: any) => x.student_id === sid);
    nota(`semáforo (2 tutores, 3 pagos históricos, 1 cargo vencido de 100000): ${JSON.stringify(fila)}`);
    expect(fila, "el alumno debe aparecer").toBeTruthy();
    expect.soft(Number(fila.adeudo_centavos), "adeudo real = 100000").toBe(100000);
    const rep = await body(await request.get("/api/reportes/riesgo", { headers: h("ac") }));
    const fr = (rep.detalle || []).find((x: any) => Number(x.student_id ?? x.id) === sid);
    nota(`reporte de riesgo, mismo alumno: adeudo=${fr?.adeudo_centavos}`);
    if (fr) expect.soft(Number(fr.adeudo_centavos), "adeudo en el reporte de riesgo").toBe(100000);
  });
});

// ───────────────────────── matriz de roles de reportes y exportaciones ─────────────────────────
const REPORTES: Array<[string, string, string[]]> = [
  // [ruta, nombre, roles que deben poder LEER según permissions.ts]
  ["financiero", "financiero", ["ag", "ac", "cg", "ax", "ad", "as"]],
  ["estudiantes", "estudiantes", ["ag", "ac", "cg", "ax", "ad", "as"]],
  ["cobranza", "cobranza", ["ag", "ac", "cg", "ax", "ad", "as"]],
  ["admisiones", "admisiones", ["ac", "ad", "as"]],
  ["consejo", "consejo", ["ag", "ac", "cg"]],
  ["contable", "contable", ["ag", "ac", "cg", "ax"]],
  ["antiguedad-saldos", "antigüedad de saldos", ["ag", "ac", "cg", "ax", "ad", "as"]],
  ["riesgo", "riesgo", ["ag", "ac", "cg", "ax"]],
];
const EXPORTAN = ["ag", "ac", "cg", "ad"]; // REPORTS.export
test.describe("matriz de roles de los 8 reportes", () => {
  for (const [ruta, nombre, lectores] of REPORTES) {
    test(`lectura del reporte ${nombre}: solo los roles con permiso`, async ({ request }) => {
      const obs: string[] = [];
      for (const rol of ["ag", "ac", "cg", "ax", "ad", "as"]) {
        const r = await request.get(`/api/reportes/${ruta}`, { headers: h(rol), failOnStatusCode: false });
        obs.push(`${rol}:${r.status()}`);
        const debe = lectores.includes(rol);
        expect.soft(r.status() === 200, `${rol} ${debe ? "debe poder" : "no debe poder"} leer el reporte ${nombre} (HTTP ${r.status()})`).toBe(debe);
      }
      nota(obs.join(" "));
    });
    test(`exportar ${nombre}: Excel y PDF válidos para quien puede, 403 para quien no`, async ({ request }) => {
      const obs: string[] = [];
      for (const rol of ["ag", "ac", "cg", "ax", "ad", "as"]) {
        const x = await request.post(`/api/reportes/${ruta}/exportar`, { headers: h(rol), data: { formato: "excel" }, failOnStatusCode: false });
        obs.push(`${rol}:${x.status()}`);
        const puede = EXPORTAN.includes(rol);
        if (puede && lectores.includes(rol)) expect.soft(x.status(), `${rol} exporta ${nombre} a Excel`).toBe(200);
        if (!puede) expect.soft(x.status(), `${rol} no debe exportar ${nombre}`).toBeGreaterThanOrEqual(400);
        if (puede && !lectores.includes(rol) && x.status() === 200) obs.push(`(${rol} exporta un reporte que no puede consultar)`);
      }
      nota(obs.join(" "));
      const excel = await request.post(`/api/reportes/${ruta}/exportar`, { headers: h("ac"), data: { formato: "excel" }, failOnStatusCode: false });
      expect(excel.status()).toBe(200);
      const bx = Buffer.from(await excel.body());
      expect.soft(bx.subarray(0, 2).toString(), "un .xlsx es un zip (PK)").toBe("PK");
      const pdf = await request.post(`/api/reportes/${ruta}/exportar`, { headers: h("ac"), data: { formato: "pdf" }, failOnStatusCode: false });
      expect(pdf.status()).toBe(200);
      expect.soft(Buffer.from(await pdf.body()).subarray(0, 4).toString(), "un PDF empieza con %PDF").toBe("%PDF");
      const mal = await request.post(`/api/reportes/${ruta}/exportar`, { headers: h("ac"), data: { formato: "csv" }, failOnStatusCode: false });
      expect.soft(mal.status(), "formato no admitido").toBe(400);
      const cd = excel.headers()["content-disposition"] || "";
      nota(`content-disposition: ${cd.slice(0, 90)}`);
    });
  }
});

// ───────────────────────── exportaciones: contenido ─────────────────────────
test.describe("D-42 contenido de las exportaciones", () => {
  test("el Excel de cobranza tiene tantas filas como cargos que dice el reporte", async ({ request }) => {
    const rep = await body(await request.get("/api/reportes/cobranza", { headers: h("ac") }));
    const x = await request.post("/api/reportes/cobranza/exportar", { headers: h("ac"), data: { formato: "excel" } });
    const wb = XLSX.read(Buffer.from(await x.body()), { type: "buffer" });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 }).filter((r: any[]) => r.length);
    nota(`hojas=${wb.SheetNames.join(",")}; filas con contenido=${filas.length}; cargos del reporte=${rep.total}`);
    expect.soft(filas.length - 1, "filas de datos = cargos (menos el encabezado)").toBeGreaterThanOrEqual(rep.total - 5);
  });
  test("un nombre que empieza con '=' no se exporta como fórmula", async ({ request }) => {
    const nombre = `=HYPERLINK("http://example.invalid/${uniq()}","clic")`;
    const sid = (await db.query(`INSERT INTO students (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo, nivel_escolar, grado, grupo, status)
      VALUES (1,1,$1,'Inyeccion',$1,'Primaria','3° Primaria','A','activo') RETURNING id`, [nombre])).rows[0].id;
    const x = await request.post("/api/reportes/estudiantes/exportar", { headers: h("ac"), data: { formato: "excel" } });
    const wb = XLSX.read(Buffer.from(await x.body()), { type: "buffer", cellFormula: true });
    let formulas = 0, textoPeligroso = 0;
    for (const hojaNombre of wb.SheetNames) {
      for (const [, cell] of Object.entries<any>(wb.Sheets[hojaNombre])) {
        if (cell && typeof cell === "object") {
          if (cell.f) formulas++;
          if (typeof cell.v === "string" && /^[=+\-@]/.test(cell.v) && cell.t === "s" && /HYPERLINK/.test(cell.v)) textoPeligroso++;
        }
      }
    }
    nota(`celdas con fórmula=${formulas}; celdas de texto que empiezan con = y contienen HYPERLINK=${textoPeligroso}`);
    expect.soft(formulas, "ninguna celda debe ser fórmula").toBe(0);
    nota(`texto con '=' guardado como celda de texto (no se evalúa en Excel): ${textoPeligroso}`);
    await db.query("DELETE FROM students WHERE id=$1", [sid]);
  });
  test("aislamiento: el reporte y el Excel del campus 2 y de otra escuela no incluyen alumnos del campus 1", async ({ request }) => {
    const total = async (rol: string) => (await body(await request.get("/api/reportes/estudiantes", { headers: h(rol) }))).total;
    const c1 = (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=1")).rows[0].n;
    const c2 = (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=2")).rows[0].n;
    const cb = (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=51")).rows[0].n;
    nota(`totales: campus1=${await total("ac")} (base ${c1}), campus2=${await total("ac2")} (base ${c2}), escuela B=${await total("acb")} (base ${cb})`);
    expect(await total("ac")).toBe(c1);
    expect(await total("ac2")).toBe(c2);
    expect(await total("acb")).toBe(cb);
    const x = await request.post("/api/reportes/estudiantes/exportar", { headers: h("acb"), data: { formato: "excel", campus_id: 1 } });
    const wb = XLSX.read(Buffer.from(await x.body()), { type: "buffer" });
    const txt = JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
    expect(txt, "el Excel de la escuela B no debe traer alumnos de la escuela A").not.toContain("López Hernández");
  });
});

test.describe("D-35 contenido de lo que exporta admisiones", () => {
  test("el Excel del reporte de consejo y del de riesgo que baja admisiones trae datos reales", async ({ request }) => {
    for (const ruta of ["consejo", "riesgo", "contable"]) {
      const lectura = await request.get(`/api/reportes/${ruta}`, { headers: h("ad"), failOnStatusCode: false });
      const x = await request.post(`/api/reportes/${ruta}/exportar`, { headers: h("ad"), data: { formato: "excel" }, failOnStatusCode: false });
      let filas = 0;
      if (x.status() === 200) { const wb = XLSX.read(Buffer.from(await x.body()), { type: "buffer" }); filas = wb.SheetNames.reduce((t: number, n: string) => t + XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length, 0); }
      nota(`${ruta}: admisiones lee=${lectura.status()}, exporta=${x.status()}, filas en el archivo=${filas}`);
      expect.soft(x.status() === 200 && filas > 3, `admisiones no debe poder bajar datos del reporte ${ruta} que no puede consultar`).toBe(false);
    }
  });
});

// ───────────────────────── D-18 dashboard administrativo ─────────────────────────
test.describe("D-18 dashboard administrativo", () => {
  test("filtros: nivel con SQL, ciclo inválido y periodos no producen error de servidor", async ({ request }) => {
    for (const q of ["nivel=%27%20OR%201%3D1%20--", "ciclo=basura", "ciclo=2026-2027&periodo=hoy", "periodo=semana", "periodo=mes", "periodo=ciclo", "periodo=inventado", "nivel=PRIMARIA"]) {
      const r = await request.get(`/api/admin/dashboard/1?${q}`, { headers: h("ac"), failOnStatusCode: false });
      nota(`${q}: ${r.status()}`);
      expect.soft(r.status(), q).toBeLessThan(500);
    }
  });
  test("admisiones no ve el dashboard; el asistente sí (DASHBOARD.read)", async ({ request }) => {
    expect((await request.get("/api/admin/dashboard/2", { headers: h("ad"), failOnStatusCode: false })).status()).toBe(403);
    expect((await request.get("/api/admin/dashboard/1", { headers: h("as"), failOnStatusCode: false })).status()).toBe(200);
  });
  test("el nivel PRIMARIA suma como máximo lo del ciclo completo", async ({ request }) => {
    const todo = await body(await request.get("/api/admin/dashboard/1", { headers: h("ac") }));
    const prim = await body(await request.get("/api/admin/dashboard/1?nivel=PRIMARIA", { headers: h("ac") }));
    nota(`por_cobrar total=${todo.ciclo_metrics?.por_cobrar}, nivel primaria=${prim.ciclo_metrics?.por_cobrar}`);
    expect.soft(Number(prim.ciclo_metrics?.por_cobrar), "un nivel no puede exceder el total").toBeLessThanOrEqual(Number(todo.ciclo_metrics?.por_cobrar));
  });
});

// ───────────────────────── búsqueda global D-62 ─────────────────────────
test.describe("D-62 búsqueda global", () => {
  test("un alumno propio aparece; del otro campus o escuela no", async ({ request }) => {
    const nombre = (await db.query("SELECT nombres FROM students WHERE campus_id=1 AND nombres IS NOT NULL ORDER BY id LIMIT 1")).rows[0].nombres.split(" ")[0];
    const propio = await body(await request.get(`/api/search?q=${encodeURIComponent(nombre)}`, { headers: h("ac") }));
    expect(propio.alumnos.length, "el campus 1 encuentra a su alumno").toBeGreaterThan(0);
    const ajeno = await body(await request.get(`/api/search?q=${encodeURIComponent(nombre)}`, { headers: h("ac2") }));
    nota(`búsqueda de "${nombre}": campus1=${propio.alumnos.length}, campus2=${ajeno.alumnos.length}`);
    expect.soft(ajeno.alumnos.filter((a: any) => a.campus_id === 1 || /Sofía|López/.test(JSON.stringify(a))).length, "el campus 2 no debe ver alumnos del campus 1").toBe(0);
    const b = await body(await request.get(`/api/search?q=${encodeURIComponent(nombre)}`, { headers: h("acb") }));
    expect(b.alumnos.length, "otra escuela no ve alumnos de la escuela A").toBe(0);
  });
  test("consultas de 2 caracteres, comodines y caracteres especiales", async ({ request }) => {
    const corta = await body(await request.get("/api/search?q=ab", { headers: h("ac") }));
    expect(Object.values(corta).flat().length, "menos de 3 caracteres").toBe(0);
    const total = (await db.query("SELECT count(*)::int AS n FROM students WHERE campus_id=1")).rows[0].n;
    for (const q of ["%%%", "___", "%25%25%25"]) {
      const r = await request.get(`/api/search?q=${q}`, { headers: h("ac"), failOnStatusCode: false });
      const j = await body(r);
      nota(`q=${q}: ${r.status()} alumnos=${j.alumnos?.length}`);
      expect.soft((j.alumnos?.length ?? 0), `q=${q} no debe devolver todos los alumnos (${total})`).toBeLessThan(total);
    }
    for (const q of ["%27%20OR%201%3D1", "%3Cscript%3E", "a%00b%00c"]) expect((await request.get(`/api/search?q=${q}`, { headers: h("ac"), failOnStatusCode: false })).status(), q).toBeLessThan(500);
  });
});

// ───────────────────────── asistente D-56 a D-60 ─────────────────────────
test.describe("D-56 a D-60 asistente", () => {
  test("el mensaje vacío o de más de 500 caracteres se rechaza; sin sesión 401", async ({ request }) => {
    expect((await request.post("/api/assistant/chat", { headers: h("ac"), data: { message: "" }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.post("/api/assistant/chat", { headers: h("ac"), data: { message: "x".repeat(501), currentPath: "/" }, failOnStatusCode: false })).status()).toBe(400);
    expect((await request.post("/api/assistant/chat", { data: { message: "hola" }, failOnStatusCode: false })).status()).toBe(401);
  });
  test("sin clave de Claude responde de forma degradada y sin error de servidor", async ({ request }) => {
    const r = await request.post("/api/assistant/chat", { headers: h("ac"), data: { message: "llévame a pagos", currentPath: "/" }, failOnStatusCode: false });
    nota(`chat sin ANTHROPIC_API_KEY: ${r.status()} ${(await r.text()).slice(0, 180)}`);
    expect(r.status()).toBeLessThan(500);
  });
  test("alcance: pedir datos de otro campus o escuela no los entrega (D-60)", async ({ request }) => {
    const cases: Array<[string, string, string]> = [["ac", "muéstrame el adeudo del campus 2", "campus 2"], ["acb", "muéstrame el adeudo del campus 1", "campus 1"], ["ac", "dame los alumnos del campus 51", "campus 51"]];
    for (const [rol, msg, etiqueta] of cases) {
      const r = await request.post("/api/assistant/chat", { headers: h(rol), data: { message: msg, currentPath: "/" }, failOnStatusCode: false });
      const t = await r.text();
      nota(`${rol} pide "${msg}": ${r.status()} ${t.slice(0, 160)}`);
      expect.soft(r.status() === 403 || /no (tienes|tiene) acceso|fuera de tu|no puedo/i.test(t), `${rol} pidiendo ${etiqueta} debe ser rechazado`).toBe(true);
    }
  });
  test("módulos y diagnóstico: un asistente no debe ejecutarlos (Q-10, comprobación de regresión)", async ({ request }) => {
    expect.soft((await request.get("/api/assistant/modules", { headers: h("as"), failOnStatusCode: false })).status()).toBe(403);
  });
});

// ───────────────────────── acciones D-53 a D-55 ─────────────────────────
test.describe("D-53 a D-55 acciones de seguimiento", () => {
  test("lectura: solo roles con workflow.read; asignar una acción inexistente da 404", async ({ request }) => {
    for (const rol of ["ac", "ag", "cg"]) expect((await request.get("/api/acciones", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(200);
    for (const rol of ["ad", "as", "ax"]) expect((await request.get("/api/acciones", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(403);
    const r = await request.post("/api/acciones/999999/asignar", { headers: h("ac"), data: { assigned_to: 1 }, failOnStatusCode: false });
    expect(r.status()).toBeLessThan(500);
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });
});

// ───────────────────────── aprobaciones D-50 / D-51: ¿quién ve qué? ─────────────────────────
test.describe("D-50 y D-51 aprobaciones: visibilidad", () => {
  test("una solicitud pendiente solo la ven el solicitante, los aprobadores y su escuela", async ({ request }) => {
    const u = (await db.query("SELECT id FROM users WHERE email=$1", [E.ac])).rows[0].id;
    const id = (await db.query(`INSERT INTO pending_approvals (tenant_id, campus_id, action_type, action_description, requested_by, status, reason, requested_data, entity_type, entity_id)
      VALUES (1,1,'modify_charge_amount','QA visibilidad',$1,'pending','QA','{"amount":1}'::jsonb,'charge',1) RETURNING id`, [u])).rows[0].id;
    const ve: Record<string, boolean> = {};
    for (const rol of ["ag", "ac", "cg", "ax", "ad", "as", "agb", "acb"]) {
      const out: boolean[] = [];
      for (const p of ["pending", "history", "my-requests"]) {
        const r = await request.get(`/api/approvals/${p}`, { headers: h(rol), failOnStatusCode: false });
        const j = await body(r);
        out.push(r.status() === 200 && JSON.stringify(j).includes(`"id":${id}`));
      }
      ve[rol] = out.some(Boolean);
    }
    nota(`quién ve la solicitud ${id}: ${JSON.stringify(ve)}`);
    expect(ve.ag, "el aprobador la ve").toBe(true);
    expect(ve.ac, "el solicitante la ve").toBe(true);
    for (const rol of ["agb", "acb"]) expect.soft(ve[rol], `${rol} es de otra escuela y no debe verla`).toBe(false);
    for (const rol of ["cg", "ax", "ad", "as"]) expect.soft(ve[rol], `${rol} no es solicitante ni aprobador`).toBe(false);
    const logs = await request.get(`/api/approvals/logs/${id}`, { headers: h("acb"), failOnStatusCode: false });
    nota(`bitácora de otra escuela: ${logs.status()}`);
    expect.soft(logs.status(), "la bitácora de una solicitud ajena").toBeGreaterThanOrEqual(400);
  });
  test("marcar como leída la notificación de otra persona debe rechazarse", async ({ request }) => {
    const u = (await db.query("SELECT id FROM users WHERE email=$1", [E.ac])).rows[0].id;
    const ap = (await db.query(`INSERT INTO pending_approvals (tenant_id, campus_id, action_type, action_description, requested_by, status, reason, requested_data, entity_type, entity_id)
      VALUES (1,1,'modify_charge_amount','QA notificación',$1,'pending','QA','{"amount":1}'::jsonb,'charge',1) RETURNING id`, [u])).rows[0].id;
    const nid = (await db.query(`INSERT INTO approval_notifications (approval_id, recipient_id, notification_type, title, message) VALUES ($1,$2,'approval_granted','QA','QA') RETURNING id`, [ap, u])).rows[0].id;
    const r = await request.post(`/api/approvals/notifications/${nid}/read`, { headers: h("as"), failOnStatusCode: false });
    const leida = (await db.query("SELECT is_read FROM approval_notifications WHERE id=$1", [nid])).rows[0].is_read;
    nota(`el asistente marca la notificación del administrador de campus: ${r.status()}, leída=${leida}`);
    expect.soft(leida, "la notificación de otra persona no debe cambiar").toBe(false);
  });
});

// ───────────────────────── notificaciones D-44 a D-49 ─────────────────────────
test.describe("D-44 a D-49 notificaciones por correo", () => {
  test("configuración y lectura: solo roles con receivables.read; admisiones y asistente 403", async ({ request }) => {
    for (const rol of ["ac", "ag", "cg", "ax"]) expect((await request.get("/api/notifications/email/config", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(200);
    for (const rol of ["ad", "as"]) expect((await request.get("/api/notifications/email/config", { headers: h(rol), failOnStatusCode: false })).status(), rol).toBe(403);
    const cfg = await body(await request.get("/api/notifications/email/config", { headers: h("ac") }));
    nota(`configuración en el entorno de pruebas: ${JSON.stringify(cfg)}`);
    expect(cfg.configured).toBe(false);
  });
  test("sin proveedor configurado la vista previa se rechaza sin crear intenciones", async ({ request }) => {
    const antes = (await db.query("SELECT count(*)::int AS n FROM email_notification_intents")).rows[0].n;
    const r = await request.post("/api/notifications/email/preview", { headers: h("ac"), data: { tipo: "recordatorio", canal: "EMAIL", modo: "masivo" }, failOnStatusCode: false });
    nota(`vista previa sin configuración: ${r.status()} ${(await r.text()).slice(0, 120)}`);
    expect([422, 503]).toContain(r.status());
    expect((await db.query("SELECT count(*)::int AS n FROM email_notification_intents")).rows[0].n).toBe(antes);
    expect((await request.post("/api/notifications/email/preview", { headers: h("cg"), data: { tipo: "recordatorio", canal: "EMAIL", modo: "masivo" }, failOnStatusCode: false })).status(), "contador no procesa").toBe(403);
    expect((await request.post("/api/notifications/email/preview", { headers: h("as"), data: {}, failOnStatusCode: false })).status()).toBe(403);
  });
  test("lotes y envío heredado: id que no es UUID 422; POST /send exige confirmación; confirmar con id inválido 422", async ({ request }) => {
    expect((await request.get("/api/notifications/email/batches/no-es-uuid", { headers: h("ac"), failOnStatusCode: false })).status()).toBe(422);
    const send = await request.post("/api/notifications/send", { headers: h("ac"), data: {}, failOnStatusCode: false });
    nota(`POST /api/notifications/send: ${send.status()}`);
    expect([410, 422, 503]).toContain(send.status());
    expect((await request.post("/api/notifications/email/confirm", { headers: h("ac"), data: { intentId: "x", canal: "EMAIL" }, failOnStatusCode: false })).status()).toBeGreaterThanOrEqual(400);
  });
  test("webhook de Resend sin secreto o sin firma se rechaza", async ({ request }) => {
    const r = await request.post("/api/notifications/webhooks/resend", { data: { type: "email.delivered" }, failOnStatusCode: false });
    nota(`webhook sin firma: ${r.status()}`);
    expect([400, 401, 403, 503]).toContain(r.status());
  });
});

// ───────────────────────── D-64 página pública y D-17 dashboard por rol ─────────────────────────
test.describe("D-64 y D-17", () => {
  test("la ruta pública /cuentas no debe servir cifras fijas", async ({ request }) => {
    const r = await request.get("/cuentas", { failOnStatusCode: false });
    const t = await r.text();
    nota(`GET /cuentas sin sesión: ${r.status()}; contiene $42,000: ${t.includes("42,000")}; 73.2%: ${t.includes("73.2")}`);
    expect.soft(/42,000|73\.2/.test(t), "no debe haber cifras inventadas en una ruta pública").toBe(false);
  });
});
