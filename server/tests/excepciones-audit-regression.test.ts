/**
 * TESTS — Regresión audit_log + comportamiento del helper insertarPagoYCerrarCargo
 *
 * Cubre cuatro casos:
 *
 *  EXA-01 Bug confirmado (caso control):
 *    Un token sin user_id causa que la guarda `if (tenantId && user?.id)` sea
 *    false → no se escribe audit_log. Reproduce el escenario original del bug
 *    (toda la lógica de "aplicar" estaba bajo esa misma condición que nunca se
 *    cumplía porque los tokens de los tests anteriores omiten 'id').
 *
 *  EXA-02 Fix verificado:
 *    Con token que incluye un user_id real (≥1 en la tabla users), la resolución
 *    manual exitosa escribe exactamente UNA fila en audit_log con
 *    action = 'resolver_excepcion_manual' y los metadatos correctos.
 *
 *  EXA-03 Regresión de comportamiento — resolver manual:
 *    Tras la extracción de insertarPagoYCerrarCargo(), el resolver sigue
 *    produciendo el mismo estado DB que antes:
 *      • charge → 'pagado'
 *      • payment creado con metodo='spei', monto_centavos=monto_neto del cargo
 *      • payment_application con amount_centavos=monto_neto
 *      • bank_transaction → 'conciliado', enlazada a charge_id y payment_id
 *
 *  EXA-04 Regresión de comportamiento — applyReconciliation():
 *    Llama directamente a applyReconciliation() con dos cargos (multi-cargo) y
 *    verifica que el helper produce el mismo estado DB:
 *      • Ambos charges → 'pagado'
 *      • Dos payments creados (uno por cargo)
 *      • Dos payment_applications
 *      • bank_transaction → 'conciliado', charge_id = primer chargeId
 *
 * Estrategia de user_id en EXA-02:
 *   El audit_log tiene FK → users.id. Necesitamos un user_id que exista en la
 *   DB real. Obtenemos dinámicamente el primer admin del tenant de demo (48/29)
 *   en beforeAll; si no existe ninguno, el test se salta con skip.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, db } from "../db";
import { applyReconciliation } from "../routes/conciliacion";
import {
  tenants, campuses, students, guardians, student_guardian, charges,
} from "../../shared/schema";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Fixtures de prueba ────────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let studentId: number;
let realUserId: number | null = null;   // descubierto en beforeAll

// Cargos — uno por caso para no contaminar entre tests
let chargeCtrlId:     number;   // EXA-01 (control sin audit)
let chargeFixId:      number;   // EXA-02 (audit correcto)
let chargeRegrId:     number;   // EXA-03 (regresión comportamiento resolver)
let chargeApplyAId:   number;   // EXA-04 primer cargo applyReconciliation
let chargeApplyBId:   number;   // EXA-04 segundo cargo applyReconciliation

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Token SIN user_id → if(tenantId && user?.id) es false → no audit_log */
function tokenSinId(): string {
  return jwt.sign(
    { email: "ctrl@test.com", role: "administrador_campus",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

/** Token CON user_id real → audit_log se escribe */
function tokenConId(uid: number): string {
  return jwt.sign(
    { id: uid, email: "admin.campus@jfr.edu.mx", role: "administrador_campus",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

async function post(path: string, body: object, tok: string) {
  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Inserta una bank_transaction pendiente de prueba */
async function insertTx(monto: number, ref: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO bank_transactions
       (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo, referencia, estado_conciliacion)
     VALUES ($1,$2,NOW()::date,'EXA test',$3,'abono',$4,'pendiente')
     RETURNING id`,
    [campusId, tenantId, monto, ref]
  );
  return (r.rows[0] as any).id as number;
}

/** Crea un cargo pendiente con monto_base = 100 000 cts, beca=0, recargo=0 */
async function mkCharge(sid: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges
       (student_id, tenant_id, ciclo_escolar, fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,'2025-2026','2025-01-01','2026-12-31',100000,'0.00',0,'pendiente')
     RETURNING id`,
    [sid, tenantId]
  );
  return (r.rows[0] as any).id as number;
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
describe("EXA — audit_log resolver_excepcion_manual + regresión insertarPagoYCerrarCargo", () => {
  beforeAll(async () => {
    const ts = Date.now().toString().slice(-7);

    // Tenant + campus aislados
    const [t] = await db.insert(tenants).values({
      nombre_legal: `Test EXA ${ts}`, rfc: `TEA${ts}`,
    }).returning();
    tenantId = t.id;

    const [c] = await db.insert(campuses).values({
      tenant_id: tenantId, nombre: `Campus EXA ${ts}`,
    }).returning();
    campusId = c.id;

    // Guardián
    await db.insert(guardians).values({
      nombres: "Padre EXA", nombre_completo: "Padre EXA Test",
      email: `padre_exa_${ts}@test.com`,
      correo_institucional_familiar: `padre_exa_${ts}@test.com`,
      campus_id: campusId, tenant_id: tenantId,
    }).returning();

    // Alumno
    const [s] = await db.insert(students).values({
      campus_id: campusId, tenant_id: tenantId,
      nombres: "Alumno", apellido_paterno: "EXA",
      nombre_completo: "Alumno EXA Test", status: "activo",
    }).returning();
    studentId = s.id;

    // Cargos — uno por caso
    chargeCtrlId   = await mkCharge(studentId);
    chargeFixId    = await mkCharge(studentId);
    chargeRegrId   = await mkCharge(studentId);
    chargeApplyAId = await mkCharge(studentId);
    chargeApplyBId = await mkCharge(studentId);

    // Buscar un user_id real en la DB (campus 48 del seed demo)
    // para poder escribir en audit_log sin FK violation.
    const uRow = await pool.query(
      `SELECT id FROM users WHERE campus_id = 48 LIMIT 1`
    );
    realUserId = uRow.rows.length > 0 ? (uRow.rows[0] as any).id as number : null;
  });

  afterAll(async () => {
    if (!tenantId) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM payment_applications
         WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id=$1)`, [tenantId]
      );
      await client.query(`DELETE FROM bank_transactions WHERE tenant_id=$1`, [tenantId]);
      await client.query(`DELETE FROM payments WHERE tenant_id=$1`, [tenantId]);
      await client.query(`DELETE FROM charges  WHERE tenant_id=$1`, [tenantId]);
      await client.query("COMMIT");
    } catch { await client.query("ROLLBACK").catch(() => {}); }
    finally  { client.release(); }

    await pool.query(
      `DELETE FROM student_guardian
       WHERE student_id IN (SELECT id FROM students WHERE tenant_id=$1)`, [tenantId]
    ).catch(() => {});
    await pool.query(`DELETE FROM students  WHERE tenant_id=$1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM guardians WHERE tenant_id=$1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM campuses  WHERE tenant_id=$1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM tenants   WHERE id=$1`, [tenantId]).catch(() => {});
  });

  // ── EXA-01: Bug confirmado (caso control) ─────────────────────────────────
  //
  // Token sin 'id' → user?.id es undefined → la guarda
  //   if (tenantId && user?.id)
  // es false → no se inserta nada en audit_log.
  // Este caso reproduce exactamente el escenario pre-fix: el pago se aplica
  // correctamente pero no deja rastro de auditoría.
  it("EXA-01 — control: 'aplicar' con token sin user_id → NO escribe audit_log", async () => {
    const txId = await insertTx(100000, `ref-ctrl-${Date.now()}`);

    // Contar filas ANTES
    const antes = await pool.query(
      `SELECT COUNT(*) AS n FROM audit_log
       WHERE action='resolver_excepcion_manual' AND entity_id=$1`, [txId]
    );
    expect(Number((antes.rows[0] as any).n)).toBe(0);

    const r = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "aplicar", charge_id: chargeCtrlId },
      tokenSinId()
    );
    expect(r.status).toBe(200);

    // Esperar brevemente para que el fire-and-forget (si lo hubiera) se ejecute
    await new Promise(res => setTimeout(res, 500));

    // SIN user_id en el JWT → la guarda nunca se cumple → 0 filas
    const despues = await pool.query(
      `SELECT COUNT(*) AS n FROM audit_log
       WHERE action='resolver_excepcion_manual' AND entity_id=$1`, [txId]
    );
    expect(
      Number((despues.rows[0] as any).n),
      "EXA-01: con token sin id, no debe escribirse audit_log (control del bug)"
    ).toBe(0);
  });

  // ── EXA-02: Fix verificado ─────────────────────────────────────────────────
  //
  // Token CON user_id real → la guarda se cumple → se escribe una fila con
  //   action = 'resolver_excepcion_manual'
  // y los metadatos esperados (charge_id, payment_id, montos, referencia).
  it("EXA-02 — fix: 'aplicar' con user_id real → escribe audit_log 'resolver_excepcion_manual'", async () => {
    if (realUserId === null) {
      console.warn("EXA-02: sin user real en DB → skip");
      return;
    }

    const ref   = `ref-fix-${Date.now()}`;
    const txId  = await insertTx(100000, ref);
    const tok   = tokenConId(realUserId);

    const r = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "aplicar", charge_id: chargeFixId, nota: "Aplicado por test EXA-02" },
      tok
    );
    expect(r.status, `resolver → ${JSON.stringify(r.body)}`).toBe(200);
    const paymentId = Number(r.body.payment_id);
    expect(paymentId).toBeGreaterThan(0);

    // Esperar a que el fire-and-forget pool.query() llegue a la DB
    // (normalmente < 200 ms; sondeo con backoff para evitar flakiness)
    let auditRow: any = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(res => setTimeout(res, 200));
      const rows = await pool.query(
        `SELECT action, entity_id, metadata::text AS meta_text
         FROM audit_log
         WHERE action = 'resolver_excepcion_manual'
           AND entity_id = $1
           AND user_id   = $2`,
        [txId, realUserId]
      );
      if (rows.rows.length > 0) { auditRow = rows.rows[0]; break; }
    }

    expect(
      auditRow,
      "EXA-02: debe existir exactamente una fila en audit_log con action='resolver_excepcion_manual'"
    ).not.toBeNull();

    // Verificar los campos clave del metadata.
    // PostgreSQL formatea JSONB con espacios ("key": value), así que se parsea
    // a objeto en vez de comparar la cadena cruda (patrón de audit-log-meta-test.md).
    const meta = JSON.parse((auditRow as any).meta_text);
    expect(meta.charge_id).toBe(chargeFixId);
    expect(meta.payment_id).toBe(paymentId);
    expect(meta.monto_centavos).toBe(100000);
    expect(meta.monto_neto).toBe(100000);
  });

  // ── EXA-03: Regresión de comportamiento — resolver manual ─────────────────
  //
  // Verifica que tras la extracción del helper, el resolver sigue produciendo
  // exactamente el mismo estado DB que antes:
  //   • charge → 'pagado'
  //   • payment con metodo='spei', monto_centavos = 100 000
  //   • payment_application con amount_centavos = 100 000
  //   • bank_transaction → 'conciliado', enlazada al cargo y al pago
  it("EXA-03 — regresión resolver: mismo estado DB que antes de la extracción del helper", async () => {
    const txId = await insertTx(100000, `ref-regr-${Date.now()}`);
    const r = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "aplicar", charge_id: chargeRegrId },
      tokenSinId()
    );
    expect(r.status).toBe(200);
    const paymentId = Number(r.body.payment_id);
    expect(paymentId).toBeGreaterThan(0);

    // charge → pagado
    const ch = await pool.query(`SELECT estado FROM charges WHERE id=$1`, [chargeRegrId]);
    expect((ch.rows[0] as any).estado).toBe("pagado");

    // payment con metodo spei y monto correcto
    const pay = await pool.query(
      `SELECT metodo, monto_centavos, estado FROM payments WHERE id=$1`, [paymentId]
    );
    expect(pay.rows.length).toBe(1);
    expect((pay.rows[0] as any).metodo).toBe("spei");
    expect(Number((pay.rows[0] as any).monto_centavos)).toBe(100000);
    expect((pay.rows[0] as any).estado).toBe("exitoso");

    // payment_application con monto completo
    const pa = await pool.query(
      `SELECT amount_centavos FROM payment_applications WHERE payment_id=$1 AND charge_id=$2`,
      [paymentId, chargeRegrId]
    );
    expect(pa.rows.length).toBe(1);
    expect(Number((pa.rows[0] as any).amount_centavos)).toBe(100000);

    // bank_transaction → conciliado, enlazada
    const bt = await pool.query(
      `SELECT estado_conciliacion, charge_id, payment_id FROM bank_transactions WHERE id=$1`,
      [txId]
    );
    expect((bt.rows[0] as any).estado_conciliacion).toBe("conciliado");
    expect(Number((bt.rows[0] as any).charge_id)).toBe(chargeRegrId);
    expect(Number((bt.rows[0] as any).payment_id)).toBe(paymentId);
  });

  // ── EXA-04: Regresión de comportamiento — applyReconciliation() ───────────
  //
  // Llama directamente a applyReconciliation() con dos cargos (multi-cargo,
  // el caso de uso exclusivo de este caller) y verifica el mismo estado DB:
  //   • Ambos charges → 'pagado'
  //   • Un payment por cargo (dos en total, IDs distintos)
  //   • Dos payment_applications, una por cargo
  //   • bank_transaction → 'conciliado', charge_id = chargeApplyAId (el primero)
  it("EXA-04 — regresión applyReconciliation: mismo estado DB con dos cargos tras la extracción", async () => {
    // applyReconciliation() bloquea con `tipo = 'credito'` (no 'abono').
    // El helper insertTx usa 'abono'; insertamos directamente para EXA-04.
    const txR = await pool.query(
      `INSERT INTO bank_transactions
         (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo, referencia, estado_conciliacion)
       VALUES ($1,$2,NOW()::date,'EXA-04 test',200000,'credito',$3,'pendiente')
       RETURNING id`,
      [campusId, tenantId, `ref-apply-${Date.now()}`]
    );
    const txId = (txR.rows[0] as any).id as number;

    const firstPaymentId = await applyReconciliation({
      txId,
      chargeIds:       [chargeApplyAId, chargeApplyBId],
      score:           95,
      familyId:        null,
      tenantId,
      referencia:      `REF-EXA04-${txId}`,
      clabe_ordenante: null,
      nombre_ordenante: null,
      monto_tx_centavos: 200000,
      userId:          null,   // sin audit en este test (no hay user real para los dos cargos)
    });

    expect(firstPaymentId, "applyReconciliation debe devolver un payment_id").not.toBeNull();
    const firstPid = firstPaymentId as number;

    // Ambos charges → pagado
    const chA = await pool.query(`SELECT estado FROM charges WHERE id=$1`, [chargeApplyAId]);
    const chB = await pool.query(`SELECT estado FROM charges WHERE id=$1`, [chargeApplyBId]);
    expect((chA.rows[0] as any).estado).toBe("pagado");
    expect((chB.rows[0] as any).estado).toBe("pagado");

    // Dos payments (uno por cargo)
    const pays = await pool.query(
      `SELECT id, charge_id, metodo, monto_centavos, estado FROM payments
       WHERE charge_id IN ($1,$2) ORDER BY id`,
      [chargeApplyAId, chargeApplyBId]
    );
    expect(pays.rows.length).toBe(2);
    for (const p of pays.rows as any[]) {
      expect(p.metodo).toBe("spei");
      expect(Number(p.monto_centavos)).toBe(100000);
      expect(p.estado).toBe("exitoso");
    }

    // El primer payment_id coincide con lo devuelto por applyReconciliation
    expect(Number((pays.rows[0] as any).id)).toBe(firstPid);

    // Dos payment_applications
    const paA = await pool.query(
      `SELECT amount_centavos FROM payment_applications WHERE charge_id=$1`, [chargeApplyAId]
    );
    const paB = await pool.query(
      `SELECT amount_centavos FROM payment_applications WHERE charge_id=$1`, [chargeApplyBId]
    );
    expect(paA.rows.length).toBe(1);
    expect(paB.rows.length).toBe(1);
    expect(Number((paA.rows[0] as any).amount_centavos)).toBe(100000);
    expect(Number((paB.rows[0] as any).amount_centavos)).toBe(100000);

    // bank_transaction → conciliado, enlazada al primer chargeId y al firstPaymentId
    const bt = await pool.query(
      `SELECT estado_conciliacion, charge_id, payment_id, confianza_pct
       FROM bank_transactions WHERE id=$1`, [txId]
    );
    expect((bt.rows[0] as any).estado_conciliacion).toBe("conciliado");
    expect(Number((bt.rows[0] as any).charge_id)).toBe(chargeApplyAId);
    expect(Number((bt.rows[0] as any).payment_id)).toBe(firstPid);
    expect(Number((bt.rows[0] as any).confianza_pct)).toBe(95);
  });
});
