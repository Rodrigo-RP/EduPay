/**
 * TESTS — Idempotencia del cobro en efectivo y bloqueo de cobros tras el corte (paquete P2 de docs/qa/plan-correcciones-2026-11.md)
 *
 * CCI-01: dos cobros en efectivo simultáneos con la misma llave registran un solo pago; el segundo responde idempotente.
 * CCI-02: la misma llave con otro monto responde 409; sin llave, cada petición sigue siendo un cobro nuevo (compatibilidad).
 * CCI-03: una llave mal formada responde 400.
 * CCI-04: no se puede cerrar la caja de una fecha futura.
 * CCI-05: tras el corte de hoy, un cobro nuevo en efectivo, un pago manual y `pagar-manual` responden 409 CAJA_CERRADA,
 *         y repetir un cobro ya registrado (misma llave) sigue respondiendo 200 idempotente.
 * CCI-06: el corte de un campus no bloquea los cobros de otro campus.
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
let n = 0;
let tenantId: number, conceptId: number;
const A = {} as { campusId: number; userId: number; studentId: number; token: string };
const B = {} as { campusId: number; userId: number; studentId: number; token: string };

async function api(token: string, method: "GET" | "POST", path: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const key = () => `cci-llave-${ts}-${++n}-0000000000`;

async function setup(tag: string, target: typeof A) {
  target.campusId = (await pool.query(`INSERT INTO campuses (nombre, tenant_id) VALUES ($1, $2) RETURNING id`, [`Campus CCI ${tag}`, tenantId])).rows[0].id;
  target.userId = (await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, '$2b$10$fakehashfortestonly000000000000000', 'administrador_campus') RETURNING id`,
    [tenantId, target.campusId, `CCI ${tag}`, `cci-${tag}-${ts}@test.com`])).rows[0].id;
  target.token = jwt.sign({ id: target.userId, email: `cci-${tag}-${ts}@test.com`, role: "administrador_campus", campus_id: target.campusId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });
  target.studentId = (await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, grado, grupo, id_referencia, status)
     VALUES ($1, $2, 'CCI', $3, $4, '1', 'A', $5, 'activo') RETURNING id`,
    [tenantId, target.campusId, `Alumno${tag}`, `CCI ${tag} ${ts}`, `CCI-${tag}-${ts}`])).rows[0].id;
}
async function charge(who: typeof A, monto = 100000): Promise<number> {
  return (await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1, $2, $3, '2026-2027', ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL} + 30, $4, '0.00', 0, 'pendiente') RETURNING id`,
    [tenantId, who.studentId, conceptId, monto])).rows[0].id;
}
const pagos = async (chargeId: number) => Number((await pool.query(`SELECT count(*) AS n FROM payments WHERE charge_id = $1`, [chargeId])).rows[0].n);
const efectivo = (who: typeof A, chargeId: number, monto: number, llave?: string) =>
  api(who.token, "POST", "/api/caja/pago-efectivo", { estudiante_id: who.studentId, charge_id: chargeId, monto, recibido_por: "CCI", ...(llave ? { idempotency_key: llave } : {}) });

beforeAll(async () => {
  tenantId = (await pool.query(`INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`, [`CCI Tenant ${ts}`, `CCI${ts}`.slice(0, 13)])).rows[0].id;
  await setup("a", A);
  await setup("b", B);
  conceptId = (await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'Colegiatura CCI', 'colegiatura', 'mensual', 100000) RETURNING id`, [tenantId, A.campusId])).rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM cash_closures WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payment_applications WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id = $1)`, [tenantId]);
  await pool.query(`DELETE FROM family_credits WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payments WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM concepts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("Cobro en efectivo: idempotencia", () => {
  it("CCI-01: dos cobros simultáneos con la misma llave registran un solo pago", async () => {
    const c = await charge(A);
    const llave = key();
    const [x, y] = await Promise.all([efectivo(A, c, 100, llave), efectivo(A, c, 100, llave)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect([x.body.idempotent, y.body.idempotent].filter(Boolean)).toHaveLength(1);
    expect(x.body.payment_id).toBe(y.body.payment_id);
    expect(await pagos(c)).toBe(1);
  });

  it("CCI-02: la misma llave con otro monto responde 409; sin llave cada petición es un cobro nuevo", async () => {
    const c = await charge(A);
    const llave = key();
    expect((await efectivo(A, c, 100, llave)).status).toBe(200);
    const otro = await efectivo(A, c, 200, llave);
    expect(otro.status).toBe(409);
    expect(await pagos(c)).toBe(1);
    const c2 = await charge(A);
    await efectivo(A, c2, 100);
    await efectivo(A, c2, 100);
    expect(await pagos(c2)).toBe(2);
  });

  it("CCI-03: una llave mal formada responde 400 y no registra nada", async () => {
    const c = await charge(A);
    for (const mala of ["corta", "con espacios no permitidos 0000", "x".repeat(101), "caracter-raro-ñ-0000000000"]) {
      expect((await efectivo(A, c, 100, mala)).status, mala).toBe(400);
    }
    expect(await pagos(c)).toBe(0);
  });
});

describe("Corte de caja", () => {
  it("CCI-04: no se puede cerrar la caja de una fecha futura", async () => {
    const r = await api(B.token, "POST", "/api/caja/cerrar-dia", { fecha: "2099-01-01", efectivo_capturado_centavos: 0 });
    expect(r.status).toBe(400);
    expect((await pool.query(`SELECT count(*)::int AS n FROM cash_closures WHERE tenant_id = $1 AND campus_id = $2`, [tenantId, B.campusId])).rows[0].n).toBe(0);
  });

  it("CCI-05: tras el corte de hoy, los cobros nuevos se rechazan y la repetición de uno ya hecho no", async () => {
    const antes = await charge(A);
    const llave = key();
    expect((await efectivo(A, antes, 100, llave)).status).toBe(200);

    const cierre = await api(A.token, "POST", "/api/caja/cerrar-dia", { efectivo_capturado_centavos: 100, observaciones: "CCI" });
    expect(cierre.status).toBe(201);

    const nuevo = await charge(A);
    const ef = await efectivo(A, nuevo, 100, key());
    expect(ef.status).toBe(409);
    expect(ef.body.code).toBe("CAJA_CERRADA");
    const mn = await api(A.token, "POST", "/api/payments/manual", { student_id: A.studentId, charge_id: nuevo, amount_centavos: 1000, idempotency_key: key(), recibido_por: "CCI" });
    expect(mn.status).toBe(409);
    expect(mn.body.code).toBe("CAJA_CERRADA");
    const pm = await api(A.token, "POST", `/api/admin/charges/${nuevo}/pagar-manual`, { metodo: "efectivo" });
    expect(pm.status).toBe(409);
    expect(pm.body.code).toBe("CAJA_CERRADA");
    expect(await pagos(nuevo)).toBe(0);

    // repetir el cobro que ya estaba registrado antes del corte no es un cobro nuevo
    const repeticion = await efectivo(A, antes, 100, llave);
    expect(repeticion.status).toBe(200);
    expect(repeticion.body.idempotent).toBe(true);
    expect(await pagos(antes)).toBe(1);
  });

  it("CCI-06: el corte de un campus no bloquea los cobros de otro campus", async () => {
    const c = await charge(B);
    const r = await efectivo(B, c, 100, key());
    expect(r.status).toBe(200);
    expect(await pagos(c)).toBe(1);
  });
});
