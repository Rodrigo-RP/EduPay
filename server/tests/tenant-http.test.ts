/**
 * TESTS HTTP DE AISLAMIENTO MULTI-TENANT
 *
 * Verifican que los endpoints HTTP bloquean ataques IDOR cross-tenant:
 * 1. Un admin de tenant B no puede crear cargos para estudiantes de tenant A
 * 2. Un tutor no puede pagar cargos de otros alumnos (no vinculados a él)
 * 3. Un admin no puede crear cargos en masa para campus de otro tenant
 *
 * Requiere el servidor corriendo en localhost:5000.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  tenants, campuses, students, guardians, student_guardian,
  charges, concepts,
} from "../../shared/schema";
import { eq, or } from "drizzle-orm";
import jwt from "jsonwebtoken";

const BASE_URL = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// IDs compartidos — se inicializan en beforeAll
let tenantAId: number, tenantBId: number;
let campusAId: number, campusBId: number;
let studentAId: number;
let guardianAId: number;
let conceptAId: number;
let chargeAId: number;
let chargeA2Id: number;
let userAId: number, userBId: number;

/** Genera JWT de admin sin tocar la base de datos */
function makeAdminToken(userId: number, tenantId: number, campusId: number): string {
  return jwt.sign(
    { id: userId, email: `admin${userId}@test.com`, role: "administrador_campus", campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

/** Genera JWT de guardián */
function makeGuardianToken(guardianId: number, tenantId: number): string {
  return jwt.sign(
    { id: guardianId, type: "guardian", tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function httpPost(path: string, body: object, token?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => ({}));
  return { status: response.status, body: responseBody };
}

describe("Aislamiento multi-tenant — capa HTTP (IDOR)", () => {
  beforeAll(async () => {
    const ts = Date.now().toString().slice(-6);

    const [tA] = await db.insert(tenants).values({ nombre_legal: "Escuela Alfa HTTP_VT", rfc: `EAH${ts}H01` }).returning();
    tenantAId = tA.id;
    const [tB] = await db.insert(tenants).values({ nombre_legal: "Colegio Beta HTTP_VT", rfc: `CBH${ts}H02` }).returning();
    tenantBId = tB.id;

    const [cA] = await db.insert(campuses).values({ tenant_id: tenantAId, nombre: "Campus HTTP_VT_A" }).returning();
    campusAId = cA.id;
    const [cB] = await db.insert(campuses).values({ tenant_id: tenantBId, nombre: "Campus HTTP_VT_B" }).returning();
    campusBId = cB.id;

    const [sA] = await db.insert(students).values({
      campus_id: campusAId, tenant_id: tenantAId,
      nombres: "Alumno", apellido_paterno: "HTTP_VT", nombre_completo: "Alumno HTTP_VT_A", status: "activo",
    }).returning();
    studentAId = sA.id;

    const [co] = await db.insert(concepts).values({
      campus_id: campusAId, tenant_id: tenantAId,
      nombre: "Colegiatura HTTP_VT", tipo: "mensualidad", periodicidad: "mensual", monto_centavos: 100000,
    }).returning();
    conceptAId = co.id;

    const [ch] = await db.insert(charges).values({
      student_id: studentAId, concept_id: conceptAId, tenant_id: tenantAId,
      ciclo_escolar: "2025-2026", fecha_emision: "2025-01-01", fecha_vencimiento: "2025-02-01",
      monto_base_centavos: 100000, beca_aplicada: "0.00", recargo_aplicado_centavos: 0, estado: "pendiente",
    }).returning();
    chargeAId = ch.id;

    const ts2 = Date.now();
    const [g] = await db.insert(guardians).values({
      nombres: "Tutor HTTP_VT", nombre_completo: "Tutor HTTP_VT_A",
      email: `guardian_vt_a_${ts2}@test.com`,
      correo_institucional_familiar: `guardian_vt_a_${ts2}@test.com`,
      campus_id: campusAId, tenant_id: tenantAId,
    }).returning();
    guardianAId = g.id;
    await db.insert(student_guardian).values({ student_id: studentAId, guardian_id: guardianAId });

    const [ch2] = await db.insert(charges).values({
      student_id: studentAId, concept_id: conceptAId, tenant_id: tenantAId,
      ciclo_escolar: "2025-2026", fecha_emision: "2025-02-01", fecha_vencimiento: "2025-03-01",
      monto_base_centavos: 100000, beca_aplicada: "0.00", recargo_aplicado_centavos: 0, estado: "pendiente",
    }).returning();
    chargeA2Id = ch2.id;

    userAId = 10000 + tenantAId;
    userBId = 10000 + tenantBId;
  });

  afterAll(async () => {
    const tIds = [tenantAId, tenantBId].filter(Boolean);
    if (!tIds.length) return;
    const tList = tIds.join(",");

    await db.execute(`DELETE FROM invoices     WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM payments     WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM student_guardian WHERE student_id IN (SELECT id FROM students WHERE tenant_id IN (${tList}))` as any).catch(() => {});
    await db.execute(`DELETE FROM charges      WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM guardians    WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM students     WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM concepts     WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM campuses     WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM tenants      WHERE id        IN (${tList})` as any).catch(() => {});
  });

  it("T1: admin de Tenant B bloqueado al crear cargo extraordinario para alumno de Tenant A → 403", async () => {
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
    const r = await httpPost("/api/admin/cargos/extraordinario", {
      student_id: studentAId,
      monto: "1000",
      descripcion: "IDOR_TEST",
      fecha_vencimiento: "2025-12-31",
    }, tokenB);
    expect(r.status).toBe(403);
  });

  it("T2: admin de Tenant B bloqueado al crear cargos masivos en campus de Tenant A → 403", async () => {
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
    const r = await httpPost("/api/admin/charges/bulk", {
      campus_id: campusAId,
      concept_id: conceptAId,
      ciclo_escolar: "2025-2026",
      fecha_vencimiento: "2025-12-31",
    }, tokenB);
    expect(r.status).toBe(403);
  });

  it("T3: guardián sin vínculo bloqueado al pagar cargo ajeno → 403", async () => {
    const ts3 = Date.now();
    const [gUnlinked] = await db.insert(guardians).values({
      nombres: "Tutor Extraño VT", nombre_completo: "Tutor Sin Vínculo VT",
      email: `guardian_unlinked_vt_${ts3}@test.com`,
      correo_institucional_familiar: `guardian_unlinked_vt_${ts3}@test.com`,
      campus_id: campusAId, tenant_id: tenantAId,
    }).returning();

    try {
      const tokenUnlinked = makeGuardianToken(gUnlinked.id, tenantAId);
      const r = await httpPost("/api/guardian/pagar", {
        charge_ids: [chargeAId],
        metodo_pago: "tarjeta",
      }, tokenUnlinked);
      expect(r.status).toBe(403);
    } finally {
      await db.delete(guardians).where(eq(guardians.id, gUnlinked.id)).catch(() => {});
    }
  });

  it("T4: guardián vinculado puede pagar su propio cargo → no 403, no 5xx", async () => {
    const tokenLinked = makeGuardianToken(guardianAId, tenantAId);
    const r = await httpPost("/api/guardian/pagar", {
      charge_ids: [chargeAId],
      metodo_pago: "tarjeta",
    }, tokenLinked);
    expect(r.status).not.toBe(403);
    expect(r.status).toBeLessThan(500);
  });

  it("T5: guardián sin vínculo bloqueado en /api/payments/process → 403", async () => {
    const ts5 = Date.now();
    const [gUnlinked2] = await db.insert(guardians).values({
      nombres: "Tutor Extra VT", nombre_completo: "Tutor Sin Vínculo 2 VT",
      email: `guardian_unlinked2_vt_${ts5}@test.com`,
      correo_institucional_familiar: `guardian_unlinked2_vt_${ts5}@test.com`,
      campus_id: campusAId, tenant_id: tenantAId,
    }).returning();

    try {
      const tokenUnlinked2 = makeGuardianToken(gUnlinked2.id, tenantAId);
      const r = await httpPost("/api/payments/process", {
        charge_id: chargeA2Id,
        payment_method: "tarjeta",
      }, tokenUnlinked2);
      expect(r.status).toBe(403);
    } finally {
      await db.delete(guardians).where(eq(guardians.id, gUnlinked2.id)).catch(() => {});
    }
  });

  it("T6: guardián sin vínculo bloqueado en /api/payments/create-intent → 403", async () => {
    const ts6 = Date.now();
    const [gUnlinked3] = await db.insert(guardians).values({
      nombres: "Tutor Extra 3 VT", nombre_completo: "Tutor Sin Vínculo 3 VT",
      email: `guardian_unlinked3_vt_${ts6}@test.com`,
      correo_institucional_familiar: `guardian_unlinked3_vt_${ts6}@test.com`,
      campus_id: campusAId, tenant_id: tenantAId,
    }).returning();

    try {
      const tokenUnlinked3 = makeGuardianToken(gUnlinked3.id, tenantAId);
      const r = await httpPost("/api/payments/create-intent", {
        charge_id: chargeA2Id,
        amount: 1000,
      }, tokenUnlinked3);
      expect(r.status).toBe(403);
    } finally {
      await db.delete(guardians).where(eq(guardians.id, gUnlinked3.id)).catch(() => {});
    }
  });

  it("T7: POST /api/admin/concepts ignora campus/tenant del body y usa los del JWT", async () => {
    const tokenA = makeAdminToken(userAId, tenantAId, campusAId);
    const r = await httpPost("/api/admin/concepts", {
      campus_id: campusBId,   // intento de usar campus de otro tenant
      tenant_id: tenantBId,
      nombre: "Concepto Atacante VT",
      tipo: "mensualidad",
      periodicidad: "mensual",
      monto_centavos: 50000,
    }, tokenA);

    if (r.status === 201) {
      // Si se creó, debe ser con el campus/tenant del JWT (A), no del body (B)
      expect(r.body.campus_id).not.toBe(campusBId);
      expect(r.body.tenant_id).not.toBe(tenantBId);
    } else {
      // 403 también es aceptable: endpoint bloqueó el intento cross-tenant
      expect([201, 403]).toContain(r.status);
    }
  });

  it("T8: concepto cross-tenant bloqueado en /api/admin/cargos/extraordinario → 403", async () => {
    const tokenA = makeAdminToken(userAId, tenantAId, campusAId);
    const [conceptB] = await db.insert(concepts).values({
      campus_id: campusBId, tenant_id: tenantBId,
      nombre: "Concepto Intruso VT", tipo: "mensualidad", periodicidad: "mensual", monto_centavos: 50000,
    }).returning();

    try {
      const r = await httpPost("/api/admin/cargos/extraordinario", {
        student_id: studentAId,
        concept_id: conceptB.id,
        monto: "1000",
        descripcion: "Cargo con concepto ajeno VT",
        fecha_vencimiento: "2025-12-31",
      }, tokenA);
      expect(r.status).toBe(403);
    } finally {
      await db.delete(concepts).where(eq(concepts.id, conceptB.id)).catch(() => {});
    }
  });

  it("T9: GET /api/admin/guardians/:campusId no expone cross-tenant ni password_hash", async () => {
    const tokenA = makeAdminToken(userAId, tenantAId, campusAId);
    const response = await fetch(`${BASE_URL}/api/admin/guardians/${campusAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(response.status).toBe(200);

    const guardiansA: any[] = await response.json();
    // Ningún guardián debe exponer password_hash
    const leaksPassword = guardiansA.some((g: any) => g.password_hash !== undefined);
    expect(leaksPassword).toBe(false);
    // Todos los guardianes deben pertenecer al campus A
    const crossTenant = guardiansA.some((g: any) => g.campus_id && g.campus_id !== campusAId);
    expect(crossTenant).toBe(false);
  });

  it("T10: token de tipo 'user' (staff) rechazado en /api/guardian/pagar → 403", async () => {
    const staffToken = makeAdminToken(userAId, tenantAId, campusAId); // type='user', no 'guardian'
    const r = await httpPost("/api/guardian/pagar", {
      charge_ids: [chargeAId],
      metodo_pago: "tarjeta",
    }, staffToken);
    expect(r.status).toBe(403);
  });

  it("T11: student_id cross-tenant bloqueado en POST /api/planes-pago → 403", async () => {
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
    const r = await httpPost("/api/planes-pago", {
      student_id: studentAId,
      total_adeudo_centavos: 100000,
      numero_pagos: 3,
      fecha_inicio: "2025-02-01",
    }, tokenB);
    expect(r.status).toBe(403);
  });

  it("T12: cuota cross-tenant bloqueada en POST /api/planes-pago/cuotas/:id/pagar → 403", async () => {
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);

    // Crear plan y cuota del tenant A para intentar pagarla con token de tenant B
    const planRowA = await pool.query(`
      INSERT INTO payment_plans (campus_id, tenant_id, student_id, total_adeudo_centavos, monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [campusAId, tenantAId, studentAId, 90000, 0, 1, "mensual", "2025-02-01"]);
    const planAId = (planRowA.rows as any[])[0].id;

    const cuotaRowA = await pool.query(`
      INSERT INTO payment_plan_installments (plan_id, numero, monto_centavos, fecha_vencimiento)
      VALUES ($1,$2,$3,$4) RETURNING id
    `, [planAId, 1, 90000, "2025-03-01"]);
    const cuotaAId = (cuotaRowA.rows as any[])[0].id;

    try {
      const r = await httpPost(`/api/planes-pago/cuotas/${cuotaAId}/pagar`, {}, tokenB);
      expect(r.status).toBe(403);
    } finally {
      await pool.query(`DELETE FROM payment_plan_installments WHERE id = $1`, [cuotaAId]).catch(() => {});
      await pool.query(`DELETE FROM payment_plans WHERE id = $1`, [planAId]).catch(() => {});
    }
  });
});
