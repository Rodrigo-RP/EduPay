/**
 * TESTS — Un solo saldo por cargo en todos los canales de cobro (paquete P1 de docs/qa/plan-correcciones-2026-11.md)
 *
 * El saldo de un cargo es: monto base menos la beca, más el recargo, menos lo ya aplicado (shared/charge-balance.ts).
 * Antes, el pago manual, el cobro en efectivo, `pagar-manual` y los convenios usaban el monto bruto (sin beca), y el
 * efectivo tampoco sumaba el recargo: un alumno con beca no podía liquidar su cargo pagando lo que le corresponde.
 *
 * CBC-01: opciones de pago manual y de reestructuración muestran el saldo neto de beca.
 * CBC-02: pago manual del neto liquida el cargo; un segundo pago o un monto mayor al saldo se rechaza.
 * CBC-03: cobro en efectivo del neto liquida el cargo y no deja excedente.
 * CBC-04: el cobro en efectivo incluye el recargo (testigo: el pago manual también).
 * CBC-05: `pagar-manual` registra el neto, no el bruto.
 * CBC-06: un convenio reestructura el saldo neto de beca.
 *
 * Requiere el servidor en localhost:5000, como el resto de pruebas de este directorio.
 */
import { SCHOOL_TODAY_SQL } from "../../shared/school-date";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "../test-support/session-jwt";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";
const ts = Date.now();
let tenantId: number, campusId: number, studentId: number, conceptId: number, userId: number;
let token: string;
let n = 0;

async function api(method: "GET" | "POST", path: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Cargo de 1000 pesos con la beca y el recargo indicados. */
async function charge(o: { beca?: number; recargo?: number } = {}): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, ciclo_escolar, fecha_emision, fecha_vencimiento,
                          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1, $2, $3, '2026-2027', ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL} + 30, 100000, $4, $5, 'pendiente') RETURNING id`,
    [tenantId, studentId, conceptId, (o.beca ?? 0).toFixed(2), o.recargo ?? 0],
  );
  return r.rows[0].id;
}
const key = () => `cbc-llave-${ts}-${++n}-0000000000`;
const row = async (id: number) => (await pool.query(`SELECT estado FROM charges WHERE id = $1`, [id])).rows[0].estado as string;
const cobrado = async (id: number) => Number((await pool.query(`SELECT COALESCE(sum(monto_centavos),0) AS t FROM payments WHERE charge_id = $1`, [id])).rows[0].t);
const manual = (cid: number, monto: number, llave = key()) =>
  api("POST", "/api/payments/manual", { student_id: studentId, charge_id: cid, amount_centavos: monto, idempotency_key: llave, recibido_por: "CBC" });

beforeAll(async () => {
  tenantId = (await pool.query(`INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`, [`CBC Tenant ${ts}`, `CBC${ts}`.slice(0, 13)])).rows[0].id;
  campusId = (await pool.query(`INSERT INTO campuses (nombre, tenant_id) VALUES ('Campus CBC', $1) RETURNING id`, [tenantId])).rows[0].id;
  userId = (await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role)
     VALUES ($1, $2, 'CBC Admin', $3, '$2b$10$fakehashfortestonly000000000000000', 'administrador_campus') RETURNING id`,
    [tenantId, campusId, `cbc-${ts}@test.com`])).rows[0].id;
  token = jwt.sign({ id: userId, email: `cbc-${ts}@test.com`, role: "administrador_campus", campus_id: campusId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });
  studentId = (await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, grado, grupo, id_referencia, status)
     VALUES ($1, $2, 'CBC', 'Alumno', $3, '1', 'A', $4, 'activo') RETURNING id`,
    [tenantId, campusId, `CBC Alumno ${ts}`, `CBC-${ts}`])).rows[0].id;
  conceptId = (await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'Colegiatura CBC', 'colegiatura', 'mensual', 100000) RETURNING id`, [tenantId, campusId])).rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM payment_applications WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id = $1)`, [tenantId]);
  await pool.query(`DELETE FROM family_credits WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payments WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payment_plans WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM concepts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("Saldo único en todos los canales de cobro", () => {
  it("CBC-01: las opciones de pago manual y de reestructuración muestran el saldo neto de beca y recargo", async () => {
    const c = await charge({ beca: 50, recargo: 10000 }); // 1000 - 50% + 100 = 600 pesos
    const manualOpts = await api("GET", "/api/payments/manual-options");
    const reestOpts = await api("GET", "/api/planes-pago/opciones-reestructuracion");
    expect(manualOpts.status).toBe(200);
    expect(reestOpts.status).toBe(200);
    expect(manualOpts.body.charges.find((x: any) => x.id === c).saldo_centavos).toBe(60000);
    expect(reestOpts.body.charges.find((x: any) => x.id === c).saldo_centavos).toBe(60000);
  });

  it("CBC-02: el pago manual del neto liquida el cargo; el excedente y un segundo pago se rechazan", async () => {
    const c = await charge({ beca: 50 }); // neto 50000
    expect((await manual(c, 60000)).status).toBe(409); // excede el saldo neto
    const ok = await manual(c, 50000);
    expect(ok.status).toBe(201);
    expect(await row(c)).toBe("pagado");
    expect((await manual(c, 1)).status).toBe(409);
    expect(await cobrado(c)).toBe(50000);
  });

  it("CBC-02b: un pago manual parcial deja el cargo en parcial y el resto lo liquida", async () => {
    const c = await charge({ beca: 50 });
    expect((await manual(c, 20000)).status).toBe(201);
    expect(await row(c)).toBe("parcial");
    expect((await manual(c, 30000)).status).toBe(201);
    expect(await row(c)).toBe("pagado");
  });

  it("CBC-03: el cobro en efectivo del neto liquida el cargo y no deja excedente", async () => {
    const c = await charge({ beca: 50 });
    const r = await api("POST", "/api/caja/pago-efectivo", { estudiante_id: studentId, charge_id: c, monto: 500, recibido_por: "CBC" });
    expect(r.status).toBe(200);
    expect(await row(c)).toBe("pagado");
    expect(Number(r.body.monto_aplicado_centavos)).toBe(50000);
    const excedente = (await pool.query(`SELECT COALESCE(sum(amount_centavos),0) AS t FROM family_credits WHERE tenant_id = $1 AND student_id = $2`, [tenantId, studentId])).rows[0].t;
    expect(Number(excedente)).toBe(0);
  });

  it("CBC-04: el recargo cuenta en el cobro en efectivo igual que en el pago manual", async () => {
    const ef = await charge({ recargo: 10000 }); // 1100 pesos
    await api("POST", "/api/caja/pago-efectivo", { estudiante_id: studentId, charge_id: ef, monto: 1000, recibido_por: "CBC" });
    expect(await row(ef)).toBe("parcial"); // 1000 de 1100
    const mn = await charge({ recargo: 10000 });
    await manual(mn, 100000);
    expect(await row(mn)).toBe("parcial");
  });

  it("CBC-05: `pagar-manual` registra el neto de la beca, no el monto bruto", async () => {
    const c = await charge({ beca: 50 });
    const r = await api("POST", `/api/admin/charges/${c}/pagar-manual`, { metodo: "efectivo" });
    expect(r.status).toBeLessThan(300);
    expect(await row(c)).toBe("pagado");
    expect(await cobrado(c)).toBe(50000);
  });

  it("CBC-06: un convenio reestructura el saldo neto de beca, no el bruto", async () => {
    const c1 = await charge({ beca: 50 });
    const c2 = await charge({ beca: 50 });
    const r = await api("POST", "/api/planes-pago", { charge_ids: [c1, c2], numero_pagos: 3, fecha_inicio: "2027-01-01", frecuencia: "mensual", monto_inicial_centavos: 0 });
    expect(r.status).toBeLessThan(300);
    expect(Number(r.body.total_adeudo_centavos)).toBe(100000); // 2 x 50000, no 200000
    const cuotas = (await pool.query(`SELECT COALESCE(sum(monto_base_centavos),0) AS t FROM charges WHERE plan_id = $1`, [r.body.id])).rows[0].t;
    expect(Number(cuotas)).toBe(100000);
  });
});
