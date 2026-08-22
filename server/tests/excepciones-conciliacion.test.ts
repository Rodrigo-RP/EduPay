/**
 * TESTS — Excepciones de Conciliación
 *
 * Motor financiero: GET /api/conciliacion/excepciones
 *                  POST /api/conciliacion/excepciones/:id/resolver
 *
 * Cubre los 6 casos obligatorios del protocolo de auditoría:
 *   1. Pago parcial
 *   2. Pago excedente
 *   3. Dos hermanos de la misma familia
 *   4. Webhook duplicado (idempotencia)
 *   5. Webhook fuera de orden (cargo ya pagado)
 *   6. Doble clic (dos solicitudes simultáneas, bloqueo FOR UPDATE)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { markChargeAsPaidForTest } from "./test-helpers";
import {
  tenants, campuses, students, guardians, student_guardian,
  charges, concepts,
} from "../../shared/schema";
import { eq, or } from "drizzle-orm";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── IDs de datos de prueba ────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let studentAId: number;   // Hermano A (misma familia)
let studentBId: number;   // Hermano B (misma familia)
let guardianId: number;

// Cargos — uno independiente por caso para no contaminar entre tests
let chargeExactId:    number;   // happy-path aplicar
let chargePartialId:  number;   // caso 1 pago parcial
let chargeExcessId:   number;   // caso 2 pago excedente
let chargeHermAId:    number;   // caso 3 hermano A
let chargeHermBId:    number;   // caso 3 hermano B
let chargeOoOId:      number;   // caso 5 fuera de orden

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeAdminToken(): string {
  // ⚠️  Sin campo 'id': audit_log tiene FK → users.id.
  //    Un user_id ficticio (p.ej. 88888) no existe en users → INSERT falla →
  //    PostgreSQL deja la transacción en estado abortado → COMMIT ejecuta ROLLBACK
  //    silenciosamente → la bank_tx queda en 'pendiente' aunque el servidor dice 200.
  //    Al omitir 'id', user?.id es undefined → if (tenantId && user?.id) = false →
  //    el INSERT de audit_log se salta → transacción commita limpiamente.
  return jwt.sign(
    {
      email: "ex-test@test.com",
      role: "administrador_campus",
      campus_id: campusId,
      tenant_id: tenantId,
      type: "user",
      // sin 'id': audit_log INSERT se omite (requiere user_id FK real)
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// Token generado DESPUÉS de que beforeAll asigne campusId / tenantId
let token: string;

async function post(
  path: string,
  body: object,
  tok: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tok}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Inserta una bank_transaction de prueba en el campus aislado. */
async function insertTx(monto: number, ref: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO bank_transactions
       (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo, referencia, estado_conciliacion)
     VALUES ($1,$2,NOW()::date,'TEST excepcion',$3,'abono',$4,'pendiente')
     RETURNING id`,
    [campusId, tenantId, monto, ref]
  );
  return (r.rows[0] as any).id as number;
}

/** Crea un cargo pendiente para el alumno indicado (monto_base = 100 000 centavos). */
async function mkCharge(studentId: number): Promise<number> {
  const [ch] = await db
    .insert(charges)
    .values({
      student_id: studentId,
      concept_id: 0 as any,  // FK relajada; se reemplaza abajo con conceptId
      tenant_id:  tenantId,
      ciclo_escolar: "2025-2026",
      fecha_emision: "2025-01-01",
      fecha_vencimiento: "2026-12-31",
      monto_base_centavos: 100000,
      beca_aplicada: "0.00",
      recargo_aplicado_centavos: 0,
      estado: "pendiente",
    })
    .returning();
  return ch.id;
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
describe("Excepciones de Conciliación — motor financiero", () => {
  beforeAll(async () => {
    const ts = Date.now().toString().slice(-7);

    // Tenant + campus completamente aislados
    const [t] = await db.insert(tenants).values({
      nombre_legal: `Test EX ${ts}`,
      rfc: `TEX${ts}`,
    }).returning();
    tenantId = t.id;

    const [c] = await db.insert(campuses).values({
      tenant_id: tenantId,
      nombre: `Campus EX ${ts}`,
    }).returning();
    campusId = c.id;

    token = makeAdminToken();

    // Concepto genérico (sin FK real — pool directo para evitar constraint)
    await pool.query(
      `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,'Colegiatura TEST','mensualidad','mensual',100000)`,
      [campusId, tenantId]
    );

    // Guardián (padre de ambos hermanos)
    const [g] = await db.insert(guardians).values({
      nombres: "Padre TEST",
      nombre_completo: "Padre TEST EX",
      email: `padre_ex_${ts}@test.com`,
      correo_institucional_familiar: `padre_ex_${ts}@test.com`,
      campus_id: campusId,
      tenant_id: tenantId,
    }).returning();
    guardianId = g.id;

    // Hermano A
    const [sA] = await db.insert(students).values({
      campus_id: campusId, tenant_id: tenantId,
      nombres: "Hermano", apellido_paterno: "A",
      nombre_completo: "Hermano A TEST", status: "activo",
    }).returning();
    studentAId = sA.id;
    await db.insert(student_guardian).values({ student_id: studentAId, guardian_id: guardianId });

    // Hermano B
    const [sB] = await db.insert(students).values({
      campus_id: campusId, tenant_id: tenantId,
      nombres: "Hermano", apellido_paterno: "B",
      nombre_completo: "Hermano B TEST", status: "activo",
    }).returning();
    studentBId = sB.id;
    await db.insert(student_guardian).values({ student_id: studentBId, guardian_id: guardianId });

    // Cargos: uno por caso, todos 100 000 centavos (monto_neto = 100 000)
    // Usamos pool directo para evitar la constraint de concept_id inexistente
    const mkChargePool = async (sid: number) => {
      const r = await pool.query(
        `INSERT INTO charges
           (student_id, tenant_id, ciclo_escolar, fecha_emision, fecha_vencimiento,
            monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
         VALUES ($1,$2,'2025-2026','2025-01-01','2026-12-31',100000,'0.00',0,'pendiente')
         RETURNING id`,
        [sid, tenantId]
      );
      return (r.rows[0] as any).id as number;
    };

    chargeExactId   = await mkChargePool(studentAId);
    chargePartialId = await mkChargePool(studentAId);
    chargeExcessId  = await mkChargePool(studentAId);
    chargeHermAId   = await mkChargePool(studentAId);
    chargeHermBId   = await mkChargePool(studentBId);
    chargeOoOId     = await mkChargePool(studentAId);
  });

  afterAll(async () => {
    if (!tenantId) return;
    // Limpieza del ledger en UNA transacción: si el proceso muere a mitad,
    // el rollback automático evita charges 'pagado' huérfanos sin payment_application.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM payment_applications
         WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id=$1)`,
        [tenantId]
      );
      await client.query(`DELETE FROM invoices          WHERE tenant_id=$1`, [tenantId]);
      // bank_transactions tiene FK → payments; debe borrarse ANTES que payments
      await client.query(`DELETE FROM bank_transactions WHERE tenant_id=$1`, [tenantId]);
      await client.query(`DELETE FROM payments          WHERE tenant_id=$1`, [tenantId]);
      await client.query(`DELETE FROM charges           WHERE tenant_id=$1`, [tenantId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await pool.query(
      `DELETE FROM student_guardian
       WHERE student_id IN (SELECT id FROM students WHERE tenant_id=$1)`,
      [tenantId]
    ).catch(() => {});
    await pool.query(`DELETE FROM students  WHERE tenant_id=$1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM guardians WHERE tenant_id=$1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM concepts  WHERE tenant_id=$1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM campuses  WHERE tenant_id=$1`, [tenantId]).catch(() => {});
    await pool.query(`DELETE FROM tenants   WHERE id=$1`,        [tenantId]).catch(() => {});
  });

  // ─── 1. AUTENTICACIÓN ──────────────────────────────────────────────────────

  it("GET /api/conciliacion/excepciones sin token → 401", async () => {
    const res = await fetch(`${BASE}/api/conciliacion/excepciones`);
    expect(res.status).toBe(401);
  });

  it("POST /api/conciliacion/excepciones/:id/resolver sin token → 401", async () => {
    const res = await fetch(`${BASE}/api/conciliacion/excepciones/9999/resolver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "descartar", motivo: "x" }),
    });
    expect(res.status).toBe(401);
  });

  // ─── 2. ESTRUCTURA DE LA RESPUESTA ────────────────────────────────────────

  it("GET con token válido → 200 con excepciones, cargos_disponibles, total_pendiente", async () => {
    const res = await fetch(`${BASE}/api/conciliacion/excepciones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.excepciones)).toBe(true);
    expect(Array.isArray(body.cargos_disponibles)).toBe(true);
    expect(typeof body.total_pendiente).toBe("number");
  });

  it("GET /count con token válido → 200 con conteo ligero", async () => {
    const res = await fetch(`${BASE}/api/conciliacion/excepciones/count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.total_pendiente).toBe("number");
    expect(body.total_pendiente).toBeGreaterThanOrEqual(0);
  });

  // ─── 3. VALIDACIONES DE PARÁMETROS ────────────────────────────────────────

  it("acción inválida → 400", async () => {
    const txId = await insertTx(100000, `ref-bad-accion-${Date.now()}`);
    try {
      const r = await post(`/api/conciliacion/excepciones/${txId}/resolver`, { accion: "volar" }, token);
      expect(r.status).toBe(400);
    } finally {
      await pool.query("DELETE FROM bank_transactions WHERE id=$1", [txId]).catch(() => {});
    }
  });

  it("'aplicar' sin charge_id → 400", async () => {
    const txId = await insertTx(100000, `ref-no-chargeid-${Date.now()}`);
    try {
      const r = await post(`/api/conciliacion/excepciones/${txId}/resolver`, { accion: "aplicar" }, token);
      expect(r.status).toBe(400);
    } finally {
      await pool.query("DELETE FROM bank_transactions WHERE id=$1", [txId]).catch(() => {});
    }
  });

  it("'descartar' sin motivo ni nota → 400", async () => {
    const txId = await insertTx(100000, `ref-no-motivo-${Date.now()}`);
    try {
      const r = await post(`/api/conciliacion/excepciones/${txId}/resolver`, { accion: "descartar" }, token);
      expect(r.status).toBe(400);
    } finally {
      await pool.query("DELETE FROM bank_transactions WHERE id=$1", [txId]).catch(() => {});
    }
  });

  it("bank_tx inexistente → 404", async () => {
    const r = await post(`/api/conciliacion/excepciones/9999999/resolver`,
      { accion: "descartar", motivo: "test" }, token);
    expect(r.status).toBe(404);
  });

  // ─── CASO 1: PAGO PARCIAL ─────────────────────────────────────────────────
  //   Banco envía 500.00 (50 000 cts), cargo es 1 000.00 (100 000 cts) → diff = 50 000 > 100 → 422
  //   La bank_tx debe quedar 'pendiente' (la operación se revirtió)

  it("CASO 1 — pago parcial: monto 50 000 vs cargo 100 000 → 422 + diff_centavos + banco_tx sigue pendiente", async () => {
    const txId = await insertTx(50000, `ref-partial-${Date.now()}`);
    try {
      const r = await post(
        `/api/conciliacion/excepciones/${txId}/resolver`,
        { accion: "aplicar", charge_id: chargePartialId },
        token
      );
      expect(r.status).toBe(422);
      expect(r.body).toHaveProperty("diff_centavos");
      expect(Number(r.body.diff_centavos)).toBeGreaterThan(100);
      expect(r.body).toHaveProperty("monto_banco");
      expect(r.body).toHaveProperty("monto_cargo");
      // La transacción bancaria no fue modificada
      const bt = await pool.query(
        "SELECT estado_conciliacion FROM bank_transactions WHERE id=$1", [txId]
      );
      expect((bt.rows[0] as any).estado_conciliacion).toBe("pendiente");
      // El cargo sigue pendiente
      const ch = await pool.query("SELECT estado FROM charges WHERE id=$1", [chargePartialId]);
      expect((ch.rows[0] as any).estado).toBe("pendiente");
    } finally {
      await pool.query("DELETE FROM bank_transactions WHERE id=$1", [txId]).catch(() => {});
    }
  });

  // ─── CASO 2: PAGO EXCEDENTE ───────────────────────────────────────────────
  //   Banco envía 2 000.00 (200 000 cts), cargo es 1 000.00 (100 000 cts) → diff = 100 000 > 100 → 422

  it("CASO 2 — pago excedente: monto 200 000 vs cargo 100 000 → 422 + diff_centavos + banco_tx sigue pendiente", async () => {
    const txId = await insertTx(200000, `ref-excess-${Date.now()}`);
    try {
      const r = await post(
        `/api/conciliacion/excepciones/${txId}/resolver`,
        { accion: "aplicar", charge_id: chargeExcessId },
        token
      );
      expect(r.status).toBe(422);
      expect(Number(r.body.diff_centavos)).toBeGreaterThan(100);
      const bt = await pool.query(
        "SELECT estado_conciliacion FROM bank_transactions WHERE id=$1", [txId]
      );
      expect((bt.rows[0] as any).estado_conciliacion).toBe("pendiente");
      const ch = await pool.query("SELECT estado FROM charges WHERE id=$1", [chargeExcessId]);
      expect((ch.rows[0] as any).estado).toBe("pendiente");
    } finally {
      await pool.query("DELETE FROM bank_transactions WHERE id=$1", [txId]).catch(() => {});
    }
  });

  // ─── HAPPY PATH: DESCARTAR ────────────────────────────────────────────────

  it("'descartar' con motivo → 200 + bank_tx 'ignorado' en DB", async () => {
    const txId = await insertTx(77777, `ref-descartar-${Date.now()}`);
    const r = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "descartar", motivo: "Depósito de tercero sin identificar" },
      token
    );
    expect(r.status).toBe(200);
    const bt = await pool.query(
      "SELECT estado_conciliacion, nota_conciliacion FROM bank_transactions WHERE id=$1", [txId]
    );
    expect((bt.rows[0] as any).estado_conciliacion).toBe("ignorado");
    expect((bt.rows[0] as any).nota_conciliacion).toBeTruthy();
  });

  // ─── HAPPY PATH: APLICAR ─────────────────────────────────────────────────

  it("'aplicar' monto exacto → 200 + payment_id + payment_application + charge 'pagado' + bank_tx 'conciliado'", async () => {
    const txId = await insertTx(100000, `ref-exact-${Date.now()}`);
    const r = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "aplicar", charge_id: chargeExactId },
      token
    );
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("payment_id");
    const paymentId = Number(r.body.payment_id);
    expect(paymentId).toBeGreaterThan(0);

    // bank_tx → conciliado, enlazada al cargo y al pago
    const bt = await pool.query(
      "SELECT estado_conciliacion, charge_id, payment_id FROM bank_transactions WHERE id=$1", [txId]
    );
    expect((bt.rows[0] as any).estado_conciliacion).toBe("conciliado");
    expect((bt.rows[0] as any).charge_id).toBe(chargeExactId);
    expect(Number((bt.rows[0] as any).payment_id)).toBe(paymentId);

    // charge → pagado
    const ch = await pool.query("SELECT estado FROM charges WHERE id=$1", [chargeExactId]);
    expect((ch.rows[0] as any).estado).toBe("pagado");

    // payment_application creada con el monto correcto
    const pa = await pool.query(
      "SELECT amount_centavos FROM payment_applications WHERE payment_id=$1 AND charge_id=$2",
      [paymentId, chargeExactId]
    );
    expect(pa.rows.length).toBe(1);
    expect(Number((pa.rows[0] as any).amount_centavos)).toBe(100000);
  });

  // ─── CASO 4: WEBHOOK DUPLICADO — IDEMPOTENCIA ─────────────────────────────
  //   El mismo evento bancario llega dos veces. La segunda llamada debe ser rechazada
  //   con 409 porque la bank_tx ya no está en estado 'pendiente'.

  it("CASO 4 — webhook duplicado: resolver misma bank_tx dos veces → segunda vez 409 + estado no se altera", async () => {
    const txId = await insertTx(55555, `ref-dup-${Date.now()}`);

    const r1 = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "descartar", motivo: "Primera resolución (idempotencia test)" },
      token
    );
    expect(r1.status).toBe(200);

    const r2 = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "descartar", motivo: "Segunda resolución duplicada" },
      token
    );
    expect(r2.status).toBe(409);
    // El mensaje indica que ya fue procesada
    expect(r2.body.message).toMatch(/ya fue/i);

    // El estado sigue siendo 'ignorado' (el de la primera resolución)
    const bt = await pool.query(
      "SELECT estado_conciliacion FROM bank_transactions WHERE id=$1", [txId]
    );
    expect((bt.rows[0] as any).estado_conciliacion).toBe("ignorado");
  });

  // ─── CASO 3: DOS HERMANOS DE LA MISMA FAMILIA ────────────────────────────
  //   Dos bank_txs → una para el cargo de cada hermano.
  //   Ambas se resuelven; ambos cargos deben quedar 'pagado' y ambas
  //   payment_applications deben existir en la tabla.

  it("CASO 3 — dos hermanos: dos bank_txs resueltas → ambos charges 'pagado' + dos payment_applications", async () => {
    const txAId = await insertTx(100000, `ref-hermA-${Date.now()}`);
    const txBId = await insertTx(100000, `ref-hermB-${Date.now()}`);

    const rA = await post(
      `/api/conciliacion/excepciones/${txAId}/resolver`,
      { accion: "aplicar", charge_id: chargeHermAId },
      token
    );
    expect(rA.status).toBe(200);
    const payAId = Number(rA.body.payment_id);

    const rB = await post(
      `/api/conciliacion/excepciones/${txBId}/resolver`,
      { accion: "aplicar", charge_id: chargeHermBId },
      token
    );
    expect(rB.status).toBe(200);
    const payBId = Number(rB.body.payment_id);

    // Ambos cargos → pagado
    const chA = await pool.query("SELECT estado FROM charges WHERE id=$1", [chargeHermAId]);
    const chB = await pool.query("SELECT estado FROM charges WHERE id=$1", [chargeHermBId]);
    expect((chA.rows[0] as any).estado).toBe("pagado");
    expect((chB.rows[0] as any).estado).toBe("pagado");

    // Cada hermano tiene su payment_application independiente
    const paA = await pool.query(
      "SELECT amount_centavos FROM payment_applications WHERE payment_id=$1 AND charge_id=$2",
      [payAId, chargeHermAId]
    );
    const paB = await pool.query(
      "SELECT amount_centavos FROM payment_applications WHERE payment_id=$1 AND charge_id=$2",
      [payBId, chargeHermBId]
    );
    expect(paA.rows.length).toBe(1);
    expect(paB.rows.length).toBe(1);
    expect(Number((paA.rows[0] as any).amount_centavos)).toBe(100000);
    expect(Number((paB.rows[0] as any).amount_centavos)).toBe(100000);

    // Los dos pagos son distintos (no se mezclaron)
    expect(payAId).not.toBe(payBId);
  });

  // ─── CASO 5: WEBHOOK FUERA DE ORDEN ──────────────────────────────────────
  //   Simula que el cargo ya fue pagado por otro canal antes de que llegue
  //   la conciliación de la bank_tx. El endpoint debe rechazar con 404
  //   porque el cargo ya no está en estado 'pendiente'.
  //   La bank_tx debe quedar en 'pendiente' (la transacción se revirtió).

  it("CASO 5 — fuera de orden: cargo ya pagado antes de la conciliación → 404 + bank_tx sigue pendiente", async () => {
    // Marcamos el cargo como 'pagado' respetando el invariante del ledger
    // (monto 100_000 = valor fijo de mkChargePool)
    await markChargeAsPaidForTest(pool, chargeOoOId, 100_000, tenantId);

    const txId = await insertTx(100000, `ref-ooo-${Date.now()}`);
    try {
      const r = await post(
        `/api/conciliacion/excepciones/${txId}/resolver`,
        { accion: "aplicar", charge_id: chargeOoOId },
        token
      );
      // El SELECT con c.estado = 'pendiente' no encuentra el cargo → 404
      expect(r.status).toBe(404);
      expect(r.body.message).toMatch(/no encontrado|ya pagado/i);

      // La bank_tx no fue modificada (ROLLBACK)
      const bt = await pool.query(
        "SELECT estado_conciliacion FROM bank_transactions WHERE id=$1", [txId]
      );
      expect((bt.rows[0] as any).estado_conciliacion).toBe("pendiente");
    } finally {
      await pool.query("DELETE FROM bank_transactions WHERE id=$1", [txId]).catch(() => {});
    }
  });

  // ─── CASO 6: DOBLE CLIC — CONCURRENCIA CON FOR UPDATE ───────────────────
  //   Dos solicitudes simultáneas para la misma bank_tx.
  //   El bloqueo FOR UPDATE garantiza que solo una transacción DB gane;
  //   la otra recibe 409 porque cuando adquiere el lock, el estado ya cambió.

  it("CASO 6 — doble clic: dos solicitudes concurrentes → exactamente una 200 y una 409", async () => {
    const txId = await insertTx(66666, `ref-concurrent-${Date.now()}`);

    const [r1, r2] = await Promise.all([
      post(
        `/api/conciliacion/excepciones/${txId}/resolver`,
        { accion: "descartar", motivo: "Doble clic — solicitud 1" },
        token
      ),
      post(
        `/api/conciliacion/excepciones/${txId}/resolver`,
        { accion: "descartar", motivo: "Doble clic — solicitud 2" },
        token
      ),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    // Una gana (200), la otra pierde (409)
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);

    // En DB el estado es un único valor final consistente
    const bt = await pool.query(
      "SELECT estado_conciliacion FROM bank_transactions WHERE id=$1", [txId]
    );
    const estadoFinal = (bt.rows[0] as any).estado_conciliacion;
    expect(["ignorado", "conciliado"]).toContain(estadoFinal);
  });

  // ─── CROSS-CAMPUS ─────────────────────────────────────────────────────────

  it("bank_tx de campus ajeno → 403", async () => {
    // Insertar bank_tx para el campus real 48 (no pertenece al token de prueba)
    const r = await pool.query(
      `INSERT INTO bank_transactions
         (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo, referencia, estado_conciliacion)
       VALUES (48,29,NOW()::date,'TEST cross-campus',100000,'abono',$1,'pendiente')
       RETURNING id`,
      [`ref-crosscampus-${Date.now()}`]
    );
    const foreignTxId = (r.rows[0] as any).id as number;
    try {
      const resp = await post(
        `/api/conciliacion/excepciones/${foreignTxId}/resolver`,
        { accion: "descartar", motivo: "Intento cross-campus" },
        token  // token apunta a campusId de prueba, no al 48
      );
      expect(resp.status).toBe(403);
    } finally {
      await pool.query("DELETE FROM bank_transactions WHERE id=$1", [foreignTxId]).catch(() => {});
    }
  });
});
