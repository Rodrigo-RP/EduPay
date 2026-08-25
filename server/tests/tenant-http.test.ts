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
// resetPaymentRateLimitStore se llama globalmente desde tests/setup.ts

const BASE_URL = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// IDs compartidos — se inicializan en beforeAll
let tenantAId: number, tenantBId: number;
let campusAId: number, campusBId: number;
let studentAId: number;
let guardianAId: number;
let conceptAId: number;
let chargeAId: number;
let chargeA2Id: number;
let userAId: number, userBId: number;
let familyCreditAId: number;  // crédito del tenant A (para T13)

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

    // ── Setup para T13: crear un pago + crédito en tenant A ──────────────────
    // Admin de tenant B intentará aplicarlo — debe recibir 403.
    const payRow = await pool.query(
      `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, estado)
       VALUES ($1,$2,'efectivo',200000,'exitoso') RETURNING id`,
      [tenantAId, chargeAId]
    );
    const creditPaymentId: number = payRow.rows[0].id;
    const fcRow = await pool.query(
      `INSERT INTO family_credits
         (tenant_id, campus_id, student_id, payment_id, amount_centavos, origen, status)
       VALUES ($1,$2,$3,$4,50000,'excedente_caja','activo') RETURNING id`,
      [tenantAId, campusAId, studentAId, creditPaymentId]
    );
    familyCreditAId = fcRow.rows[0].id;
  });

  afterAll(async () => {
    const tIds = [tenantAId, tenantBId].filter(Boolean);
    if (!tIds.length) return;
    const tList = tIds.join(",");

    await db.execute(`DELETE FROM invoices        WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM family_credits  WHERE tenant_id IN (${tList})` as any).catch(() => {});
    await db.execute(`DELETE FROM payment_applications WHERE payment_id IN (SELECT id FROM payments WHERE tenant_id IN (${tList}))` as any).catch(() => {});
    await db.execute(`DELETE FROM payments        WHERE tenant_id IN (${tList})` as any).catch(() => {});
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

  it("T11: charge_ids cross-tenant bloqueado en POST /api/planes-pago Modo A → 403", async () => {
    // ADR-002 Modo A: intento de reestructurar un charge de tenant A con token de tenant B
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
    const r = await httpPost("/api/planes-pago", {
      charge_ids: [chargeAId],   // charge pertenece a tenant A
      numero_pagos: 3,
      frecuencia: "mensual",
      fecha_inicio: "2025-02-01",
    }, tokenB);                  // token de tenant B → debe ser 403
    expect(r.status).toBe(403);
  });

  it("T13: admin de Tenant B no puede aplicar crédito de Tenant A → 403", async () => {
    // El endpoint verifica credit.tenant_id === req.user.tenant_id antes de proceder.
    // Admin B intenta consumir un family_credit que pertenece a tenant A.
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
    const r = await httpPost(
      `/api/admin/family-credits/${familyCreditAId}/aplicar`,
      { charge_id: chargeA2Id },   // cargo de tenant A
      tokenB
    );
    expect(r.status).toBe(403);

    // El crédito de tenant A sigue activo — no fue tocado
    const creditAfter = await pool.query(
      `SELECT status FROM family_credits WHERE id = $1`,
      [familyCreditAId]
    );
    expect(creditAfter.rows[0].status).toBe("activo");
  });

  it("T14: admin de Tenant B no puede pagar-manual un charge de Tenant A → 403", async () => {
    // chargeA2Id pertenece a tenantA; tokenB está autenticado como admin de tenantB.
    // El endpoint verifica que charge.tenant_id === req.user.tenant_id → 403 si no coincide.
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
    const r = await httpPost(
      `/api/admin/charges/${chargeA2Id}/pagar-manual`,
      { metodo: "efectivo" },
      tokenB
    );
    expect(r.status).toBe(403);

    // El charge de tenant A no debe haber sido modificado
    const ch = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeA2Id]);
    expect((ch.rows[0] as any).estado).toBe("pendiente");
  });

  it("T12: POST /api/planes-pago/cuotas/:id/pagar devuelve 410 (endpoint deprecado ADR-002)", async () => {
    // El endpoint fue deprecado en ADR-002; devuelve 410 para cualquier llamada autenticada.
    // El aislamiento IDOR se verifica en T11 (Modo A) y en los tests de planes-pago.test.ts.
    const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
    const r = await httpPost(`/api/planes-pago/cuotas/99999/pagar`, {}, tokenB);
    expect(r.status).toBe(410);
    expect(r.body.message).toContain("Endpoint deprecado");
  });
});
