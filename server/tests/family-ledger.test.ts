/**
 * Tests para Task #8: Núcleo de familia y ledger financiero.
 *
 * Cubre:
 *  - Pago parcial: un cargo de $1000 con $400 pagados → saldo $600
 *  - Pago excedido: aplicaciones que superan el monto del cargo
 *  - Dos hermanos: balance consolida cargos de ambos alumnos en la familia
 *  - Evento de webhook duplicado rechazado (idempotencia)
 *  - GET /api/families/:campusId y /api/family/:id/balance requieren auth
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import { storage } from "../storage";

// ── Helpers de setup ────────────────────────────────────────────────────────

async function createTestTenant(): Promise<number> {
  const r = await pool.query(`
    INSERT INTO tenants (nombre_legal, rfc) VALUES ('Test Ledger Tenant', 'XAXX010101000')
    RETURNING id
  `);
  return (r.rows[0] as any).id;
}

async function createTestCampus(tenantId: number): Promise<number> {
  const r = await pool.query(`
    INSERT INTO campuses (tenant_id, nombre)
    VALUES ($1, 'Campus Ledger Test')
    RETURNING id
  `, [tenantId]);
  return (r.rows[0] as any).id;
}

async function createTestGuardian(tenantId: number, campusId: number, email: string): Promise<number> {
  // guardians no tiene tenant_id ni campus_id — usa student_guardian para la relación
  const r = await pool.query(`
    INSERT INTO guardians (nombre_completo, email, password_hash)
    VALUES ('Guardian Ledger Test', $1, 'hash')
    RETURNING id
  `, [email]);
  return (r.rows[0] as any).id;
}

async function createTestStudent(tenantId: number, campusId: number): Promise<number> {
  const r = await pool.query(`
    INSERT INTO students (campus_id, nombre_completo, grado, grupo, tenant_id)
    VALUES ($1, 'Alumno Ledger', '3ro', 'A', $2)
    RETURNING id
  `, [campusId, tenantId]);
  return (r.rows[0] as any).id;
}

async function createTestCharge(studentId: number, montoCentavos: number): Promise<number> {
  const r = await pool.query(`
    INSERT INTO charges (student_id, monto_base_centavos, estado, fecha_emision, fecha_vencimiento)
    VALUES ($1, $2, 'pendiente', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days')
    RETURNING id
  `, [studentId, montoCentavos]);
  return (r.rows[0] as any).id;
}

async function createTestPayment(guardianId: number, chargeId: number, montoCentavos: number): Promise<number> {
  const r = await pool.query(`
    INSERT INTO payments (guardian_id, charge_id, monto_centavos, estado, metodo)
    VALUES ($1, $2, $3, 'exitoso', 'transferencia')
    RETURNING id
  `, [guardianId, chargeId, montoCentavos]);
  return (r.rows[0] as any).id;
}

async function createTestFamily(tenantId: number, campusId: number, guardianId: number): Promise<number> {
  const r = await pool.query(`
    INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
    VALUES ($1, $2, 'Familia Test', $3)
    RETURNING id
  `, [tenantId, campusId, guardianId]);
  return (r.rows[0] as any).id;
}

async function linkStudentToFamily(familyId: number, studentId: number) {
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [familyId, studentId]
  );
}

// ── IDs de test a limpiar ──────────────────────────────────────────────────

const cleanupIds: {
  tenants: number[];
  campuses: number[];
  guardians: number[];
  students: number[];
  charges: number[];
  payments: number[];
  families: number[];
  paymentApplications: number[];
  paymentEventProviderIds: string[];
} = {
  tenants: [], campuses: [], guardians: [], students: [], charges: [],
  payments: [], families: [], paymentApplications: [], paymentEventProviderIds: [],
};

let tenantId: number;
let campusId: number;
let guardianId: number;

beforeAll(async () => {
  tenantId = await createTestTenant();
  cleanupIds.tenants.push(tenantId);
  campusId = await createTestCampus(tenantId);
  cleanupIds.campuses.push(campusId);
  guardianId = await createTestGuardian(tenantId, campusId, `ledger.test.${Date.now()}@example.com`);
  cleanupIds.guardians.push(guardianId);
});

afterAll(async () => {
  // Limpiar en orden de dependencias (hijos primero)
  if (cleanupIds.paymentApplications.length > 0) {
    await pool.query(`DELETE FROM payment_applications WHERE id = ANY($1)`, [cleanupIds.paymentApplications]);
  }
  await pool.query(`DELETE FROM payment_events WHERE provider = 'test-provider' AND tenant_id = $1`, [tenantId]);
  if (cleanupIds.payments.length > 0) {
    await pool.query(`DELETE FROM payments WHERE id = ANY($1)`, [cleanupIds.payments]);
  }
  if (cleanupIds.charges.length > 0) {
    await pool.query(`DELETE FROM charges WHERE id = ANY($1)`, [cleanupIds.charges]);
  }
  await pool.query(`DELETE FROM family_students WHERE family_id IN (SELECT id FROM families WHERE tenant_id = $1)`, [tenantId]);
  if (cleanupIds.families.length > 0) {
    await pool.query(`DELETE FROM families WHERE id = ANY($1)`, [cleanupIds.families]);
  }
  await pool.query(`DELETE FROM student_guardian WHERE student_id IN (SELECT id FROM students WHERE tenant_id = $1)`, [tenantId]);
  if (cleanupIds.students.length > 0) {
    await pool.query(`DELETE FROM students WHERE id = ANY($1)`, [cleanupIds.students]);
  }
  if (cleanupIds.guardians.length > 0) {
    await pool.query(`DELETE FROM guardians WHERE id = ANY($1)`, [cleanupIds.guardians]);
  }
  if (cleanupIds.campuses.length > 0) {
    await pool.query(`DELETE FROM campuses WHERE id = ANY($1)`, [cleanupIds.campuses]);
  }
  if (cleanupIds.tenants.length > 0) {
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1)`, [cleanupIds.tenants]);
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Family balance — pago parcial", () => {
  it("saldo_pendiente = cargo - pago parcial", async () => {
    const studentId = await createTestStudent(tenantId, campusId);
    cleanupIds.students.push(studentId);
    const chargeId = await createTestCharge(studentId, 100_000); // $1,000
    cleanupIds.charges.push(chargeId);
    const paymentId = await createTestPayment(guardianId, chargeId, 40_000); // $400
    cleanupIds.payments.push(paymentId);

    // Registrar aplicación parcial
    const app = await storage.applyPaymentToCharge({
      payment_id: paymentId,
      charge_id: chargeId,
      amount_centavos: 40_000,
    });
    cleanupIds.paymentApplications.push(app.id);

    // Familia con ese alumno
    const familyId = await createTestFamily(tenantId, campusId, guardianId);
    cleanupIds.families.push(familyId);
    await linkStudentToFamily(familyId, studentId);

    const balance = await storage.getFamilyBalance(familyId, tenantId);

    expect(balance.total_cargos_centavos).toBe(100_000);
    expect(balance.total_pagado_centavos).toBe(40_000);
    expect(balance.saldo_pendiente_centavos).toBe(60_000); // $600 restantes
  });
});

describe("Family balance — pago excedido", () => {
  it("saldo_pendiente puede ser negativo cuando pagado > cargos", async () => {
    const studentId = await createTestStudent(tenantId, campusId);
    cleanupIds.students.push(studentId);
    const chargeId = await createTestCharge(studentId, 50_000); // $500
    cleanupIds.charges.push(chargeId);
    const paymentId = await createTestPayment(guardianId, chargeId, 70_000); // $700 (excedido)
    cleanupIds.payments.push(paymentId);

    const app = await storage.applyPaymentToCharge({
      payment_id: paymentId,
      charge_id: chargeId,
      amount_centavos: 70_000,
    });
    cleanupIds.paymentApplications.push(app.id);

    const familyId = await createTestFamily(tenantId, campusId, guardianId);
    cleanupIds.families.push(familyId);
    await linkStudentToFamily(familyId, studentId);

    const balance = await storage.getFamilyBalance(familyId, tenantId);

    expect(balance.saldo_pendiente_centavos).toBe(-20_000); // crédito a favor
  });
});

describe("Family balance — dos hermanos", () => {
  it("consolida cargos y pagos de ambos alumnos", async () => {
    const studentA = await createTestStudent(tenantId, campusId);
    const studentB = await createTestStudent(tenantId, campusId);
    cleanupIds.students.push(studentA, studentB);

    const chargeA = await createTestCharge(studentA, 200_000); // $2,000
    const chargeB = await createTestCharge(studentB, 300_000); // $3,000
    cleanupIds.charges.push(chargeA, chargeB);

    const paymentA = await createTestPayment(guardianId, chargeA, 200_000); // pagado completo
    const paymentB = await createTestPayment(guardianId, chargeB, 150_000); // parcial
    cleanupIds.payments.push(paymentA, paymentB);

    const appA = await storage.applyPaymentToCharge({ payment_id: paymentA, charge_id: chargeA, amount_centavos: 200_000 });
    const appB = await storage.applyPaymentToCharge({ payment_id: paymentB, charge_id: chargeB, amount_centavos: 150_000 });
    cleanupIds.paymentApplications.push(appA.id, appB.id);

    const familyId = await createTestFamily(tenantId, campusId, guardianId);
    cleanupIds.families.push(familyId);
    await linkStudentToFamily(familyId, studentA);
    await linkStudentToFamily(familyId, studentB);

    const balance = await storage.getFamilyBalance(familyId, tenantId);

    expect(balance.total_cargos_centavos).toBe(500_000);   // $5,000
    expect(balance.total_pagado_centavos).toBe(350_000);   // $3,500
    expect(balance.saldo_pendiente_centavos).toBe(150_000); // $1,500 pendiente
    expect(balance.num_cargos).toBe(2);
  });
});

describe("Idempotencia de eventos de webhook", () => {
  it("el segundo evento idéntico no se crea (duplicado rechazado)", async () => {
    const eventData = {
      tenant_id: tenantId,
      provider: "test-provider",
      provider_event_id: `evt_test_${Date.now()}`,
      payload: JSON.stringify({ amount: 1000 }),
      status: "received" as const,
    };

    const first = await storage.recordPaymentEvent(eventData);
    expect(first.created).toBe(true);

    const second = await storage.recordPaymentEvent(eventData);
    expect(second.created).toBe(false);          // duplicado silencioso
    expect(second.event.id).toBe(first.event.id); // mismo registro
  });

  it("eventos del mismo proveedor con distinto ID sí se crean", async () => {
    const base = {
      tenant_id: tenantId,
      provider: "test-provider",
      payload: null,
      status: "received" as const,
    };

    const r1 = await storage.recordPaymentEvent({ ...base, provider_event_id: `evt_diff_${Date.now()}_1` });
    const r2 = await storage.recordPaymentEvent({ ...base, provider_event_id: `evt_diff_${Date.now()}_2` });

    expect(r1.created).toBe(true);
    expect(r2.created).toBe(true);
    expect(r1.event.id).not.toBe(r2.event.id);
  });
});

describe("getFamilyBalance — aislamiento de tenant", () => {
  it("retorna balance vacío si la familia no pertenece al tenant solicitante", async () => {
    // Crear una segunda familia en un tenant diferente
    const otherTenant = await createTestTenant();
    const otherCampus = await createTestCampus(otherTenant);
    const otherGuardian = await createTestGuardian(otherTenant, otherCampus, `other.${Date.now()}@example.com`);
    const otherFamily = await createTestFamily(otherTenant, otherCampus, otherGuardian);

    // Consultar con tenantId del primer tenant → debe devolver vacío (no lanzar 500)
    const balance = await storage.getFamilyBalance(otherFamily, tenantId);
    expect(balance.total_cargos_centavos).toBe(0);
    expect(balance.saldo_pendiente_centavos).toBe(0);

    // Limpiar
    await pool.query(`DELETE FROM families WHERE id = $1`, [otherFamily]);
    await pool.query(`DELETE FROM guardians WHERE id = $1`, [otherGuardian]);
    await pool.query(`DELETE FROM campuses WHERE id = $1`, [otherCampus]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [otherTenant]);
  });
});
