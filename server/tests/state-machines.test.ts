/**
 * Tests para Task #9: Máquinas de estado y auditoría inmutable.
 *
 * Cubre:
 *  1. Transiciones válidas de Charge, Payment e Invoice son permitidas
 *  2. Transiciones inválidas lanzan InvalidStateTransitionError con mensaje en español
 *  3. Estados terminales no permiten ninguna transición de salida
 *  4. updateChargeStatus emite una entrada en audit_log
 *  5. audit_log bloquea UPDATE y DELETE vía RLS
 *  6. allowedTransitions retorna el conjunto correcto
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import { markChargeAsPaidForTest } from "./test-helpers";
import { storage } from "../storage";
import { transition, allowedTransitions, InvalidStateTransitionError } from "../state-machines";

// ── Helpers ────────────────────────────────────────────────────────────────

async function createTestTenant(): Promise<number> {
  const r = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ('Test SM Tenant', 'XAXX010101000') RETURNING id`
  );
  return (r.rows[0] as any).id;
}

async function createTestCampus(tenantId: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus SM Test') RETURNING id`,
    [tenantId]
  );
  return (r.rows[0] as any).id;
}

async function createTestStudent(tenantId: number, campusId: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO students (campus_id, nombre_completo, grado, grupo, tenant_id)
     VALUES ($1, 'Alumno SM Test', '1ro', 'A', $2) RETURNING id`,
    [campusId, tenantId]
  );
  return (r.rows[0] as any).id;
}

async function createTestCharge(studentId: number, tenantId: number, estado = "pendiente"): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges (student_id, monto_base_centavos, estado, fecha_emision, fecha_vencimiento, tenant_id)
     VALUES ($1, 100000, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $3) RETURNING id`,
    [studentId, estado, tenantId]
  );
  return (r.rows[0] as any).id;
}

// ── Limpieza ────────────────────────────────────────────────────────────────

let tenantId: number;
let campusId: number;
let studentId: number;
let userId: number;
const chargeIds: number[] = [];
const paymentIds: number[] = [];
const invoiceIds: number[] = [];

beforeAll(async () => {
  tenantId  = await createTestTenant();
  campusId  = await createTestCampus(tenantId);
  studentId = await createTestStudent(tenantId, campusId);
  userId    = await createTestUser(tenantId);
});

afterAll(async () => {
  // Limpieza del ledger en UNA transacción: si el proceso muere a mitad,
  // el rollback automático evita charges 'pagado' huérfanos sin payment_application.
  // (payment_applications se borra por cascade al borrar payments/charges)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Audit_log primero — tiene FKs a charges, payments, invoices, users
    await client.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]);
    if (invoiceIds.length > 0)
      await client.query(`DELETE FROM invoices WHERE id = ANY($1)`, [invoiceIds]);
    if (paymentIds.length > 0)
      await client.query(`DELETE FROM payments WHERE id = ANY($1)`, [paymentIds]);
    if (chargeIds.length > 0)
      await client.query(`DELETE FROM charges WHERE id = ANY($1)`, [chargeIds]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await pool.query(`DELETE FROM users    WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]);
});

// ── Tests: state machine pura ──────────────────────────────────────────────

describe("transition() — Charge válidas", () => {
  it("pendiente → pagado permitida", () => {
    expect(() => transition("charge", "pendiente", "pagado")).not.toThrow();
  });
  it("pendiente → parcial permitida", () => {
    expect(() => transition("charge", "pendiente", "parcial")).not.toThrow();
  });
  it("pendiente → vencido permitida", () => {
    expect(() => transition("charge", "pendiente", "vencido")).not.toThrow();
  });
  it("pendiente → cancelado permitida", () => {
    expect(() => transition("charge", "pendiente", "cancelado")).not.toThrow();
  });
  it("parcial → pagado permitida", () => {
    expect(() => transition("charge", "parcial", "pagado")).not.toThrow();
  });
  it("vencido → pagado permitida", () => {
    expect(() => transition("charge", "vencido", "pagado")).not.toThrow();
  });
});

describe("transition() — Charge inválidas", () => {
  it("pagado → pendiente lanza InvalidStateTransitionError", () => {
    expect(() => transition("charge", "pagado", "pendiente"))
      .toThrow(InvalidStateTransitionError);
  });
  it("mensaje de error está en español con nombres de estados", () => {
    let err: InvalidStateTransitionError | null = null;
    try { transition("charge", "pagado", "parcial"); } catch (e) { err = e as any; }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/Transición inválida/);
    expect(err!.message).toMatch(/pagado/);
    expect(err!.message).toMatch(/parcial/);
    expect(err!.entity).toBe("charge");
    expect(err!.from).toBe("pagado");
    expect(err!.to).toBe("parcial");
  });
  it("cancelado → pagado lanza InvalidStateTransitionError (estado terminal)", () => {
    expect(() => transition("charge", "cancelado", "pagado"))
      .toThrow(InvalidStateTransitionError);
  });
});

describe("transition() — Payment", () => {
  it("pendiente → exitoso permitida", () => {
    expect(() => transition("payment", "pendiente", "exitoso")).not.toThrow();
  });
  it("pendiente → fallido permitida", () => {
    expect(() => transition("payment", "pendiente", "fallido")).not.toThrow();
  });
  it("exitoso → reversado permitida", () => {
    expect(() => transition("payment", "exitoso", "reversado")).not.toThrow();
  });
  it("exitoso → pendiente es inválida", () => {
    expect(() => transition("payment", "exitoso", "pendiente"))
      .toThrow(InvalidStateTransitionError);
  });
  it("fallido → exitoso es inválida (terminal)", () => {
    expect(() => transition("payment", "fallido", "exitoso"))
      .toThrow(InvalidStateTransitionError);
  });
});

describe("transition() — Invoice", () => {
  it("pendiente → emitido permitida", () => {
    expect(() => transition("invoice", "pendiente", "emitido")).not.toThrow();
  });
  it("emitido → cancelado permitida", () => {
    expect(() => transition("invoice", "emitido", "cancelado")).not.toThrow();
  });
  it("cancelado → emitido es inválida (terminal)", () => {
    expect(() => transition("invoice", "cancelado", "emitido"))
      .toThrow(InvalidStateTransitionError);
  });
});

describe("allowedTransitions()", () => {
  it("pendiente charge tiene 4 transiciones permitidas", () => {
    const allowed = allowedTransitions("charge", "pendiente");
    expect(allowed.length).toBe(4);
    expect(allowed).toContain("pagado");
    expect(allowed).toContain("parcial");
    expect(allowed).toContain("vencido");
    expect(allowed).toContain("cancelado");
  });
  it("pagado charge no tiene transiciones (terminal)", () => {
    expect(allowedTransitions("charge", "pagado")).toHaveLength(0);
  });
});

// ── Tests: integración con BD ──────────────────────────────────────────────

// ── Helpers adicionales para payment e invoice ─────────────────────────────

async function createTestUser(tenantId: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO users (campus_id, name, email, password_hash, role, tenant_id)
     VALUES ((SELECT id FROM campuses WHERE tenant_id = $1 LIMIT 1), 'Admin SM Test', $2, 'hash', 'admin', $1)
     RETURNING id`,
    [tenantId, `admin-sm-${Date.now()}@test.com`]
  );
  return (r.rows[0] as any).id;
}

async function createTestPayment(chargeId: number, tenantId: number, estado = "pendiente"): Promise<number> {
  const r = await pool.query(
    `INSERT INTO payments (charge_id, metodo, monto_centavos, estado, referencia_pasarela, tenant_id)
     VALUES ($1, 'tarjeta', 100000, $2, $3, $4) RETURNING id`,
    [chargeId, estado, `REF-${Date.now()}`, tenantId]
  );
  return (r.rows[0] as any).id;
}

async function createTestInvoice(paymentId: number, tenantId: number, estado = "pendiente"): Promise<number> {
  const r = await pool.query(
    `INSERT INTO invoices (payment_id, uuid_cfdi, xml_url, pdf_url, estado, tenant_id)
     VALUES ($1, $2, '/xml/test.xml', '/pdf/test.pdf', $3, $4) RETURNING id`,
    [paymentId, `INV-${Date.now()}`, estado, tenantId]
  );
  return (r.rows[0] as any).id;
}

// ── Tests: integración con BD ──────────────────────────────────────────────

describe("updateChargeStatus() + audit_log", () => {
  it("transición válida actualiza estado y crea entrada en audit_log", async () => {
    const chargeId = await createTestCharge(studentId, tenantId, "pendiente");
    chargeIds.push(chargeId);

    await storage.updateChargeStatus(chargeId, "pagado", {
      tenantId,
      userId,
      ip: "127.0.0.1",
      metadata: { test: "state-machine-integration" },
    });

    // Verificar que el estado se actualizó
    const chargeRows = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    expect((chargeRows.rows[0] as any).estado).toBe("pagado");

    // Verificar que se creó la entrada de auditoría
    const auditRows = await pool.query(
      `SELECT * FROM audit_log WHERE entity_type = 'charge' AND entity_id = $1`,
      [chargeId]
    );
    expect(auditRows.rows.length).toBe(1);
    const entry = auditRows.rows[0] as any;
    expect(entry.action).toBe("charge.status_changed");
    expect(entry.user_id).toBe(userId);
    expect(entry.ip_address).toBe("127.0.0.1");
    expect(JSON.parse(entry.previous_value).estado).toBe("pendiente");
    expect(JSON.parse(entry.new_value).estado).toBe("pagado");
  });

  it("transición inválida lanza error y NO modifica BD ni crea audit_log", async () => {
    const chargeId = await createTestCharge(studentId, tenantId);
    chargeIds.push(chargeId);
    await markChargeAsPaidForTest(pool, chargeId, 100_000, tenantId);

    await expect(
      storage.updateChargeStatus(chargeId, "pendiente", { tenantId })
    ).rejects.toThrow(InvalidStateTransitionError);

    // Estado no cambió
    const chargeRows = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    expect((chargeRows.rows[0] as any).estado).toBe("pagado");

    // No se creó auditoría
    const auditRows = await pool.query(
      `SELECT * FROM audit_log WHERE entity_type = 'charge' AND entity_id = $1`,
      [chargeId]
    );
    expect(auditRows.rows.length).toBe(0);
  });

  it("audit_log registra guardianId cuando el actor es un tutor", async () => {
    const chargeId = await createTestCharge(studentId, tenantId, "pendiente");
    chargeIds.push(chargeId);

    // Crear un guardian de prueba
    const gRow = await pool.query(
      `INSERT INTO guardians (nombre_completo, email, campus_id, tenant_id)
       VALUES ('Tutor SM Test', $1, $2, $3) RETURNING id`,
      [`guardian-sm-${Date.now()}@test.com`, campusId, tenantId]
    );
    const gId = (gRow.rows[0] as any).id;

    await storage.updateChargeStatus(chargeId, "parcial", {
      tenantId,
      guardianId: gId,
      ip: "192.168.1.1",
      metadata: { flujo: 'guardian_pago_parcial' },
    });

    const auditRows = await pool.query(
      `SELECT guardian_id, user_id, ip_address FROM audit_log WHERE entity_type = 'charge' AND entity_id = $1`,
      [chargeId]
    );
    expect(auditRows.rows.length).toBe(1);
    const entry = auditRows.rows[0] as any;
    expect(entry.guardian_id).toBe(gId);
    expect(entry.user_id).toBeNull();
    expect(entry.ip_address).toBe("192.168.1.1");

    // Limpieza
    await pool.query(`DELETE FROM audit_log WHERE entity_type = 'charge' AND entity_id = $1`, [chargeId]);
    await pool.query(`DELETE FROM charges WHERE id = $1`, [chargeId]);
    chargeIds.pop();
    await pool.query(`DELETE FROM guardians WHERE id = $1`, [gId]);
  });
});

describe("updatePaymentStatus() + audit_log", () => {
  it("pendiente → exitoso registra audit_log correctamente", async () => {
    const chargeId = await createTestCharge(studentId, tenantId, "pendiente");
    chargeIds.push(chargeId);
    const paymentId = await createTestPayment(chargeId, tenantId, "pendiente");
    paymentIds.push(paymentId);

    await storage.updatePaymentStatus(paymentId, "exitoso", {
      tenantId,
      userId,
      ip: "10.0.0.1",
      metadata: { referencia: "TEST-001" },
    });

    const rows = await pool.query(
      `SELECT * FROM audit_log WHERE entity_type = 'payment' AND entity_id = $1`,
      [paymentId]
    );
    expect(rows.rows.length).toBe(1);
    const entry = rows.rows[0] as any;
    expect(entry.action).toBe("payment.status_changed");
    expect(JSON.parse(entry.previous_value).estado).toBe("pendiente");
    expect(JSON.parse(entry.new_value).estado).toBe("exitoso");

    const pmtRow = await pool.query(`SELECT estado FROM payments WHERE id = $1`, [paymentId]);
    expect((pmtRow.rows[0] as any).estado).toBe("exitoso");
  });

  it("exitoso → pendiente (inválido) lanza error y no audita", async () => {
    const chargeId = await createTestCharge(studentId, tenantId, "pendiente");
    chargeIds.push(chargeId);
    const paymentId = await createTestPayment(chargeId, tenantId, "exitoso");
    paymentIds.push(paymentId);

    await expect(
      storage.updatePaymentStatus(paymentId, "pendiente", { tenantId })
    ).rejects.toThrow(InvalidStateTransitionError);

    const rows = await pool.query(
      `SELECT * FROM audit_log WHERE entity_type = 'payment' AND entity_id = $1`,
      [paymentId]
    );
    expect(rows.rows.length).toBe(0);
  });
});

describe("updateInvoiceStatus() + audit_log", () => {
  it("pendiente → emitido registra audit_log correctamente", async () => {
    const chargeId = await createTestCharge(studentId, tenantId, "pendiente");
    chargeIds.push(chargeId);
    const paymentId = await createTestPayment(chargeId, tenantId, "exitoso");
    paymentIds.push(paymentId);
    const invoiceId = await createTestInvoice(paymentId, tenantId, "pendiente");
    invoiceIds.push(invoiceId);

    await storage.updateInvoiceStatus(invoiceId, "emitido", {
      tenantId,
      userId,
      ip: "10.0.0.2",
    });

    const rows = await pool.query(
      `SELECT * FROM audit_log WHERE entity_type = 'invoice' AND entity_id = $1`,
      [invoiceId]
    );
    expect(rows.rows.length).toBe(1);
    const entry = rows.rows[0] as any;
    expect(entry.action).toBe("invoice.status_changed");
    expect(JSON.parse(entry.new_value).estado).toBe("emitido");
  });

  it("cancelado → emitido (inválido) lanza error y no audita", async () => {
    const chargeId = await createTestCharge(studentId, tenantId, "pendiente");
    chargeIds.push(chargeId);
    const paymentId = await createTestPayment(chargeId, tenantId, "exitoso");
    paymentIds.push(paymentId);
    const invoiceId = await createTestInvoice(paymentId, tenantId, "cancelado");
    invoiceIds.push(invoiceId);

    await expect(
      storage.updateInvoiceStatus(invoiceId, "emitido", { tenantId })
    ).rejects.toThrow(InvalidStateTransitionError);
  });
});

describe("audit_log — políticas RLS de inmutabilidad", () => {
  /**
   * NOTA SOBRE RLS EN NEON:
   * Neon usa conexiones de superusuario que no están sujetas a RLS.
   * Igual que las políticas multi-tenant, la defensa principal es la capa de aplicación.
   * Estos tests verifican que las políticas EXISTEN en la base de datos (schema-level),
   * que es lo que importa para una conexión de aplicación no-superusuario en producción.
   */

  it("existen políticas RLS de bloqueo para UPDATE en audit_log", async () => {
    const res = await pool.query(`
      SELECT polname, polcmd
      FROM pg_policy
      JOIN pg_class ON pg_class.oid = pg_policy.polrelid
      WHERE pg_class.relname = 'audit_log'
        AND polcmd IN ('w')
    `);
    const updatePolicies = (res.rows as any[]);
    // Debe haber al menos una política FOR UPDATE
    expect(updatePolicies.length).toBeGreaterThanOrEqual(1);
    // Y la política debe usar USING(false) — lo verificamos por el nombre
    const noUpdatePolicy = updatePolicies.find(p => p.polname === "audit_log_no_update");
    expect(noUpdatePolicy).toBeDefined();
  });

  it("existen políticas RLS de bloqueo para DELETE en audit_log", async () => {
    const res = await pool.query(`
      SELECT polname, polcmd
      FROM pg_policy
      JOIN pg_class ON pg_class.oid = pg_policy.polrelid
      WHERE pg_class.relname = 'audit_log'
        AND polcmd IN ('d')
    `);
    const deletePolicies = (res.rows as any[]);
    expect(deletePolicies.length).toBeGreaterThanOrEqual(1);
    const noDeletePolicy = deletePolicies.find(p => p.polname === "audit_log_no_delete");
    expect(noDeletePolicy).toBeDefined();
  });

  it("RLS está habilitado en audit_log", async () => {
    const res = await pool.query(`
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'audit_log'
    `);
    expect((res.rows[0] as any).relrowsecurity).toBe(true);
  });

  it("INSERT en audit_log funciona correctamente (política permisiva)", async () => {
    const res = await pool.query(
      `INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, previous_value, new_value)
       VALUES ($1, 'test.rls.insert', 'charge', 9999990, '{}', '{}')
       RETURNING id`,
      [tenantId]
    );
    expect((res.rows[0] as any).id).toBeGreaterThan(0);
    // Limpieza manual (superusuario puede borrar en tests — en app la política bloquea)
    await pool.query(`DELETE FROM audit_log WHERE entity_id = 9999990 AND action = 'test.rls.insert'`);
  });
});
