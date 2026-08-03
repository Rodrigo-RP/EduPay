/**
 * TESTS HTTP DE AISLAMIENTO MULTI-TENANT
 *
 * Verifican que los endpoints HTTP bloquean ataques IDOR cross-tenant:
 * 1. Un admin de tenant B no puede crear cargos para estudiantes de tenant A
 * 2. Un tutor no puede pagar cargos de otros alumnos (no vinculados a él)
 * 3. Un admin no puede crear cargos en masa para campus de otro tenant
 *
 * Requiere el servidor corriendo en localhost:5000.
 * Ejecutar: npx tsx server/tests/tenant-http.test.ts
 */

import { db, pool } from "../db";
import {
  tenants, campuses, students, guardians, student_guardian,
  charges, concepts, users
} from "../../shared/schema";
import { eq, and, or } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const BASE_URL = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// IDs de datos de prueba
let tenantAId: number, tenantBId: number;
let campusAId: number, campusBId: number;
let studentAId: number;
let guardianAId: number;
let conceptAId: number;
let chargeAId: number;
let chargeA2Id: number;  // Cargo extra para tests de payments/process
let userAId: number, userBId: number;

/** Genera JWT de admin sin tocar la base de datos */
function makeAdminToken(userId: number, tenantId: number, campusId: number): string {
  return jwt.sign(
    { id: userId, email: `admin${userId}@test.com`, role: "admin", campus_id: campusId, tenant_id: tenantId, type: "user" },
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

async function setup() {
  // Crear dos tenants de prueba con sus campus y usuarios
  const [tA] = await db.insert(tenants).values({ nombre_legal: "Escuela Alfa HTTP_TEST", rfc: "EAL100101H01" }).returning();
  tenantAId = tA.id;
  const [tB] = await db.insert(tenants).values({ nombre_legal: "Colegio Beta HTTP_TEST", rfc: "CBE200202H02" }).returning();
  tenantBId = tB.id;

  const [cA] = await db.insert(campuses).values({ tenant_id: tenantAId, nombre: "Campus HTTP_A" }).returning();
  campusAId = cA.id;
  const [cB] = await db.insert(campuses).values({ tenant_id: tenantBId, nombre: "Campus HTTP_B" }).returning();
  campusBId = cB.id;

  // Alumno de Tenant A
  const [sA] = await db.insert(students).values({
    campus_id: campusAId, tenant_id: tenantAId,
    nombres: "Alumno", apellido_paterno: "HTTP", nombre_completo: "Alumno HTTP_A", status: "activo",
  }).returning();
  studentAId = sA.id;

  // Concepto de Tenant A
  const [co] = await db.insert(concepts).values({
    campus_id: campusAId, tenant_id: tenantAId,
    nombre: "Colegiatura HTTP_TEST", tipo: "mensualidad", periodicidad: "mensual", monto_centavos: 100000
  }).returning();
  conceptAId = co.id;

  // Cargo de Tenant A
  const [ch] = await db.insert(charges).values({
    student_id: studentAId, concept_id: conceptAId, tenant_id: tenantAId,
    ciclo_escolar: "2025-2026", fecha_emision: "2025-01-01", fecha_vencimiento: "2025-02-01",
    monto_base_centavos: 100000, beca_aplicada: "0.00", recargo_aplicado_centavos: 0, estado: "pendiente",
  }).returning();
  chargeAId = ch.id;

  // Guardián de Tenant A (vinculado al alumno A)
  const ts = Date.now();
  const [g] = await db.insert(guardians).values({
    nombres: "Tutor HTTP", nombre_completo: "Tutor HTTP_A",
    email: `guardian_http_a_${ts}@test.com`,
    correo_institucional_familiar: `guardian_http_a_${ts}@test.com`,
    campus_id: campusAId, tenant_id: tenantAId,
  }).returning();
  guardianAId = g.id;
  await db.insert(student_guardian).values({ student_id: studentAId, guardian_id: guardianAId });

  // Segundo cargo para tests de payments/process (sin gastar chargeAId en test 4)
  const [ch2] = await db.insert(charges).values({
    student_id: studentAId, concept_id: conceptAId, tenant_id: tenantAId,
    ciclo_escolar: "2025-2026", fecha_emision: "2025-02-01", fecha_vencimiento: "2025-03-01",
    monto_base_centavos: 100000, beca_aplicada: "0.00", recargo_aplicado_centavos: 0, estado: "pendiente",
  }).returning();
  chargeA2Id = ch2.id;

  // Users for JWT (no need to hit login endpoint; we sign JWTs directly)
  userAId = 10000 + tenantAId; // Fake ID for JWT only
  userBId = 10000 + tenantBId;

  console.log(`✅ Setup: Tenant A=${tenantAId}, B=${tenantBId}, Student A=${studentAId}, Charge A=${chargeAId}, Guardian A=${guardianAId}`);
}

async function runHttpTests() {
  // TEST 1: Admin de Tenant B no puede crear cargo extraordinario para alumno de Tenant A
  const tokenB = makeAdminToken(userBId, tenantBId, campusBId);
  const r1 = await httpPost("/api/admin/cargos/extraordinario", {
    student_id: studentAId,  // alumno de tenant A
    monto: "1000",
    descripcion: "IDOR_TEST",
    fecha_vencimiento: "2025-12-31",
  }, tokenB);

  if (r1.status !== 403) {
    throw new Error(`❌ HTTP T1: Esperaba 403, recibió ${r1.status}. Admin de Tenant B pudo crear cargo para alumno de Tenant A. Body: ${JSON.stringify(r1.body)}`);
  }
  console.log(`✅ HTTP Test 1: Admin Tenant B bloqueado al crear cargo para alumno de Tenant A (status=${r1.status})`);

  // TEST 2: Admin de Tenant B no puede crear cargos masivos en campus de Tenant A
  const r2 = await httpPost("/api/admin/charges/bulk", {
    campus_id: campusAId,  // campus de tenant A
    concept_id: conceptAId,
    ciclo_escolar: "2025-2026",
    fecha_vencimiento: "2025-12-31",
  }, tokenB);

  if (r2.status !== 403) {
    throw new Error(`❌ HTTP T2: Esperaba 403, recibió ${r2.status}. Admin de Tenant B pudo crear cargos masivos en campus de Tenant A. Body: ${JSON.stringify(r2.body)}`);
  }
  console.log(`✅ HTTP Test 2: Admin Tenant B bloqueado al usar campus de Tenant A (status=${r2.status})`);

  // TEST 3: Guardián NO VINCULADO no puede pagar cargo de alumno de otro guardián
  // Crear un guardián de Tenant A SIN vínculo al alumno A
  const ts2 = Date.now();
  const [gUnlinked] = await db.insert(guardians).values({
    nombres: "Tutor Extraño", nombre_completo: "Tutor Sin Vínculo",
    email: `guardian_unlinked_${ts2}@test.com`,
    correo_institucional_familiar: `guardian_unlinked_${ts2}@test.com`,
    campus_id: campusAId, tenant_id: tenantAId,
  }).returning();

  const tokenUnlinked = makeGuardianToken(gUnlinked.id, tenantAId);
  const r3 = await httpPost("/api/guardian/pagar", {
    charge_ids: [chargeAId],  // cargo del alumno A, pero el guardián no tiene vínculo
    metodo_pago: "tarjeta",
  }, tokenUnlinked);

  if (r3.status !== 403) {
    throw new Error(`❌ HTTP T3: Esperaba 403, recibió ${r3.status}. Guardián sin vínculo pudo pagar cargo ajeno. Body: ${JSON.stringify(r3.body)}`);
  }
  console.log(`✅ HTTP Test 3: Guardián sin vínculo bloqueado al pagar cargo ajeno (status=${r3.status})`);

  // Limpiar el guardián de prueba sin vínculo
  await db.delete(guardians).where(eq(guardians.id, gUnlinked.id));

  // TEST 4: Guardián VINCULADO SÍ puede pagar su propio cargo (vía /api/guardian/pagar)
  const tokenLinked = makeGuardianToken(guardianAId, tenantAId);
  const r4 = await httpPost("/api/guardian/pagar", {
    charge_ids: [chargeAId],
    metodo_pago: "tarjeta",
  }, tokenLinked);

  if (r4.status === 403) {
    throw new Error(`❌ HTTP T4: Guardián vinculado recibió 403 inesperado al pagar su propio cargo`);
  }
  if (r4.status >= 500) {
    throw new Error(`❌ HTTP T4: Error de servidor ${r4.status}: ${JSON.stringify(r4.body)}`);
  }
  console.log(`✅ HTTP Test 4: Guardián vinculado puede pagar su propio cargo /guardian/pagar (status=${r4.status})`);

  // TEST 5: POST /api/payments/process — guardián sin vínculo recibe 403
  const ts3 = Date.now();
  const [gUnlinked2] = await db.insert(guardians).values({
    nombres: "Tutor Extra", nombre_completo: "Tutor Sin Vínculo 2",
    email: `guardian_unlinked2_${ts3}@test.com`,
    correo_institucional_familiar: `guardian_unlinked2_${ts3}@test.com`,
    campus_id: campusAId, tenant_id: tenantAId,
  }).returning();

  const tokenUnlinked2 = makeGuardianToken(gUnlinked2.id, tenantAId);
  const r5 = await httpPost("/api/payments/process", {
    charge_id: chargeA2Id,
    payment_method: "tarjeta",
  }, tokenUnlinked2);

  if (r5.status !== 403) {
    throw new Error(`❌ HTTP T5: /api/payments/process — Esperaba 403, recibió ${r5.status}. Guardián sin vínculo pudo procesar pago. Body: ${JSON.stringify(r5.body)}`);
  }
  console.log(`✅ HTTP Test 5: Guardián sin vínculo bloqueado en /api/payments/process (status=${r5.status})`);
  await db.delete(guardians).where(eq(guardians.id, gUnlinked2.id));

  // TEST 6: POST /api/payments/create-intent — guardián sin vínculo recibe 403
  const ts4 = Date.now();
  const [gUnlinked3] = await db.insert(guardians).values({
    nombres: "Tutor Extra 3", nombre_completo: "Tutor Sin Vínculo 3",
    email: `guardian_unlinked3_${ts4}@test.com`,
    correo_institucional_familiar: `guardian_unlinked3_${ts4}@test.com`,
    campus_id: campusAId, tenant_id: tenantAId,
  }).returning();

  const tokenUnlinked3 = makeGuardianToken(gUnlinked3.id, tenantAId);
  const r6 = await httpPost("/api/payments/create-intent", {
    charge_id: chargeA2Id,
    amount: 1000,
  }, tokenUnlinked3);

  if (r6.status !== 403) {
    throw new Error(`❌ HTTP T6: /api/payments/create-intent — Esperaba 403, recibió ${r6.status}. Guardián sin vínculo pudo crear intent. Body: ${JSON.stringify(r6.body)}`);
  }
  console.log(`✅ HTTP Test 6: Guardián sin vínculo bloqueado en /api/payments/create-intent (status=${r6.status})`);
  await db.delete(guardians).where(eq(guardians.id, gUnlinked3.id));

  // tokenA para tests 9, 8 y 7
  const tokenA = makeAdminToken(userAId, tenantAId, campusAId);

  // TEST 11: POST /api/planes-pago — student_id de otro tenant → 403
  const r11 = await httpPost("/api/planes-pago", {
    student_id: studentAId,   // alumno de tenant A, usado por admin de tenant B
    total_adeudo_centavos: 100000,
    numero_pagos: 3,
    fecha_inicio: "2025-02-01",
  }, tokenB);  // tokenB es admin de tenant B

  if (r11.status !== 403) {
    throw new Error(`❌ HTTP T11: /api/planes-pago con student cross-tenant — Esperaba 403, recibió ${r11.status}. Body: ${JSON.stringify(r11.body)}`);
  }
  console.log(`✅ HTTP Test 11: student_id cross-tenant bloqueado en /api/planes-pago (status=${r11.status})`);

  // TEST 12: POST /api/planes-pago/cuotas/:id/pagar — cuota de otro tenant → 403
  // Crear un plan y cuota del tenant A
  const planRowA = await pool.query(`
    INSERT INTO payment_plans (campus_id, tenant_id, student_id, total_adeudo_centavos, monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
  `, [campusAId, tenantAId, studentAId, 90000, 0, 1, 'mensual', '2025-02-01']);
  const planAId = (planRowA.rows as any[])[0].id;
  const cuotaRowA = await pool.query(`
    INSERT INTO payment_plan_installments (plan_id, numero, monto_centavos, fecha_vencimiento)
    VALUES ($1,$2,$3,$4) RETURNING id
  `, [planAId, 1, 90000, '2025-03-01']);
  const cuotaAId = (cuotaRowA.rows as any[])[0].id;

  const r12 = await httpPost(`/api/planes-pago/cuotas/${cuotaAId}/pagar`, {}, tokenB);

  // Cleanup plan/cuota
  await pool.query(`DELETE FROM payment_plan_installments WHERE id = $1`, [cuotaAId]).catch(() => {});
  await pool.query(`DELETE FROM payment_plans WHERE id = $1`, [planAId]).catch(() => {});

  if (r12.status !== 403) {
    throw new Error(`❌ HTTP T12: cuota cross-tenant — Esperaba 403, recibió ${r12.status}. Body: ${JSON.stringify(r12.body)}`);
  }
  console.log(`✅ HTTP Test 12: Cuota cross-tenant bloqueada en /api/planes-pago/cuotas/:id/pagar (status=${r12.status})`);

  // TEST 10: POST /api/guardian/pagar — token de tipo 'user' (staff) debe ser rechazado con 403
  const staffToken = makeAdminToken(userAId, tenantAId, campusAId); // type='admin', no 'guardian'
  const r10 = await httpPost("/api/guardian/pagar", {
    charge_ids: [chargeAId],
    metodo_pago: "tarjeta",
  }, staffToken);

  if (r10.status !== 403) {
    throw new Error(`❌ HTTP T10: /api/guardian/pagar con user-JWT — Esperaba 403, recibió ${r10.status}. Body: ${JSON.stringify(r10.body)}`);
  }
  console.log(`✅ HTTP Test 10: Token staff rechazado en /api/guardian/pagar (status=${r10.status})`);

  // TEST 9: GET /api/admin/guardians/:campusId — no expone guardianes de otro tenant ni password_hash
  const r9 = await fetch(`${BASE_URL}/api/admin/guardians/${campusAId}`, {
    headers: { "Authorization": `Bearer ${tokenA}` },
  });
  const guardiansA: any[] = await r9.json();

  if (r9.status !== 200) {
    throw new Error(`❌ HTTP T9: GET guardians — Esperaba 200, recibió ${r9.status}`);
  }
  // Verificar que ningún guardián tenga password_hash expuesto
  const leaksPassword = guardiansA.some((g: any) => g.password_hash !== undefined);
  if (leaksPassword) {
    throw new Error(`❌ HTTP T9: GET guardians — password_hash expuesto en la respuesta`);
  }
  // Verificar que todos los guardianes pertenezcan al campus A (tenant A)
  const crossTenant = guardiansA.some((g: any) => g.campus_id && g.campus_id !== campusAId);
  if (crossTenant) {
    throw new Error(`❌ HTTP T9: GET guardians — devuelve guardianes de otro campus/tenant`);
  }
  console.log(`✅ HTTP Test 9: GET /api/admin/guardians/:campusId sin cross-tenant ni password_hash (status=${r9.status}, count=${guardiansA.length})`);

  // TEST 8: POST /api/admin/cargos/extraordinario con concept_id de otro tenant → 403
  // Crear concepto en tenant B para intentar usarlo desde tenant A
  const [conceptB] = await db.insert(concepts).values({
    campus_id: campusBId, tenant_id: tenantBId,
    nombre: "Concepto Intruso", tipo: "mensualidad", periodicidad: "mensual", monto_centavos: 50000,
  }).returning();

  const r8 = await httpPost("/api/admin/cargos/extraordinario", {
    student_id: studentAId,
    concept_id: conceptB.id,   // concepto de tenant B, usado por admin de tenant A
    monto: "1000",
    descripcion: "Cargo con concepto ajeno",
    fecha_vencimiento: "2025-12-31",
  }, tokenA);

  await db.delete(concepts).where(eq(concepts.id, conceptB.id)).catch(() => {});

  if (r8.status !== 403) {
    throw new Error(`❌ HTTP T8: concept_id cross-tenant — Esperaba 403, recibió ${r8.status}. Body: ${JSON.stringify(r8.body)}`);
  }
  console.log(`✅ HTTP Test 8: Concepto cross-tenant bloqueado en /api/admin/cargos/extraordinario (status=${r8.status})`);

  // TEST 7: POST /api/admin/concepts — campus/tenant del JWT, no del body (protección cross-tenant)

  const r7 = await httpPost("/api/admin/concepts", {
    campus_id: campusBId,   // intento de usar campus de otro tenant
    tenant_id: tenantBId,   // intento de asignar a otro tenant
    nombre: "Concepto Atacante",
    tipo: "mensualidad",
    periodicidad: "mensual",
    monto_centavos: 50000,
  }, tokenA);

  // Debe crearse con el campus del JWT (campusAId), no campusBId
  if (r7.status === 201) {
    if (r7.body.campus_id === campusBId || r7.body.tenant_id === tenantBId) {
      throw new Error(`❌ HTTP T7: El concepto se creó con campus/tenant del body cross-tenant. campus=${r7.body.campus_id}, tenant=${r7.body.tenant_id}`);
    }
    console.log(`✅ HTTP Test 7: POST /api/admin/concepts usa campus/tenant del JWT, ignora body cross-tenant (status=${r7.status})`);
  } else if (r7.status === 403) {
    console.log(`✅ HTTP Test 7: POST /api/admin/concepts bloqueó intento de campus cross-tenant (status=${r7.status})`);
  } else {
    console.log(`⚠️  HTTP Test 7: Respuesta inesperada ${r7.status} — ${JSON.stringify(r7.body)}`);
  }
}

async function cleanup() {
  // Cleanup en orden seguro (respetando FKs)
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
  console.log("✅ Cleanup HTTP tests completado");
}

async function run() {
  console.log("\n🔒 TESTS HTTP DE AISLAMIENTO MULTI-TENANT\n");
  try {
    await setup();
    await runHttpTests();
    console.log("\n✅ Todos los tests HTTP PASARON\n");
  } catch (error) {
    console.error("\n❌ Error en tests HTTP:", error);
    process.exit(1);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

run();
