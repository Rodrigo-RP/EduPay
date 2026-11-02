import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { pool } from "../db";
import { storage } from "../storage";
import { reviewFixture } from "./helpers/stripe-review-fixtures";
import { registerStripeFamilyCredit, CreditError } from "../lib/stripe-family-credit";
import { applyFamilyCredits, assignOrphanCredit, familyCreditExceptions } from "../lib/family-credit-service";
import { SCHOOL_TODAY_SQL, schoolDate } from "../../shared/school-date";

let own: Awaited<ReturnType<typeof reviewFixture>>;
let foreign: Awaited<ReturnType<typeof reviewFixture>>;
let familyId: number;
let actor: number;
let otherCampus: number;
const scope = () => ({ tenant_id: own.tenant, campus_id: own.campus, id: actor });

beforeAll(async () => {
  own = await reviewFixture();
  foreign = await reviewFixture();
  actor = (await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active)
     VALUES ($1,$2,'Actor créditos',$3,$4,'administrador_general',true) RETURNING id`,
    [own.tenant, own.campus, `credit.${randomUUID()}@test.invalid`, await bcrypt.hash(randomUUID(), 4)])).rows[0].id;
  familyId = (await pool.query(
    "INSERT INTO families (tenant_id,campus_id,nombre) VALUES ($1,$2,'Familia créditos') RETURNING id",
    [own.tenant, own.campus])).rows[0].id;
  await pool.query("INSERT INTO family_students (family_id,student_id) VALUES ($1,$2)", [familyId, own.student]);
  otherCampus = (await pool.query(
    "INSERT INTO campuses (tenant_id,nombre) VALUES ($1,'Otro campus créditos') RETURNING id", [own.tenant])).rows[0].id;
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(async () => {
  if (own) {
    await pool.query("DELETE FROM audit_retry_queue WHERE payload->>'tenant_id'=$1", [String(own.tenant)]);
    await pool.query("DELETE FROM audit_log WHERE tenant_id=$1", [own.tenant]);
    await pool.query("DELETE FROM family_credits WHERE tenant_id=$1", [own.tenant]);
    await pool.query("DELETE FROM payment_applications WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id=$1)", [own.tenant]);
    await pool.query("DELETE FROM payments WHERE tenant_id=$1", [own.tenant]);
    await pool.query("DELETE FROM charges WHERE tenant_id=$1 AND id<>$2", [own.tenant, own.charge]);
    await pool.query("DELETE FROM family_students WHERE family_id=$1", [familyId]);
    await pool.query("DELETE FROM families WHERE id=$1", [familyId]);
    await pool.query("DELETE FROM users WHERE id=$1", [actor]);
    await pool.query("DELETE FROM campuses WHERE id=$1", [otherCampus]);
  }
  await own?.cleanup();
  await foreign?.cleanup();
});

async function credit(amount = 100000, orphan = false) {
  const payment = (await pool.query(
    `INSERT INTO payments (tenant_id,metodo,monto_centavos,fecha_pago,estado)
     VALUES ($1,'efectivo',$2,${SCHOOL_TODAY_SQL},'exitoso') RETURNING id`, [own.tenant, amount])).rows[0].id;
  return (await pool.query(
    `INSERT INTO family_credits (tenant_id,campus_id,family_id,student_id,payment_id,amount_centavos,origen,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'stripe_no_aplicado','2000-01-01') RETURNING id`,
    [own.tenant, own.campus, orphan ? null : familyId, own.student, payment, amount])).rows[0].id as number;
}
async function charge(base = 100000, beca = 0, due = schoolDate()) {
  return (await pool.query(
    `INSERT INTO charges (tenant_id,student_id,concept_id,monto_base_centavos,beca_aplicada,
       fecha_emision,fecha_vencimiento,estado,ciclo_escolar)
     VALUES ($1,$2,$3,$4,$5,${SCHOOL_TODAY_SQL},$6,'pendiente','2036-2037') RETURNING id`,
    [own.tenant, own.student, own.concept, base, beca, due])).rows[0].id as number;
}

it("Stripe: registro y dos clics simultáneos producen un pago sin cargo, un crédito y una auditoría", async () => {
  const event = await own.event();
  const before = await own.snapshot();
  const results = await Promise.all([registerStripeFamilyCredit(scope(), event.id, "Cobro confirmado"),
    registerStripeFamilyCredit(scope(), event.id, "Cobro confirmado")]);
  expect(results.map(r => r.duplicate).sort()).toEqual([false, true]);
  expect((await registerStripeFamilyCredit(scope(), event.id, "Reintento")).duplicate).toBe(true);
  const pay = await pool.query(
    `SELECT charge_id,monto_centavos,fecha_pago::date::text AS dia FROM payments WHERE referencia_pasarela=$1`, [event.pi.id]);
  expect(pay.rows).toHaveLength(1);
  expect(pay.rows[0].charge_id).toBeNull();
  expect(Number(pay.rows[0].monto_centavos)).toBe(event.pi.amount_received);
  expect(pay.rows[0].dia).toBe(schoolDate());
  const snapshot = await own.snapshot();
  expect(snapshot.cargo).toBe(before.cargo);
  expect(snapshot.aplicaciones).toBe(before.aplicaciones);
  const audit = await pool.query("SELECT id FROM audit_log WHERE tenant_id=$1 AND action='STRIPE_REVIEW_CREDIT' AND entity_id=$2", [own.tenant, event.id]);
  expect(audit.rows).toHaveLength(1);
});

it("otro tenant o campus no ve, registra ni aplica; no mueve dinero", async () => {
  const event = await own.event();
  const id = await credit();
  const target = await charge();
  for (const denied of [{ ...scope(), campus_id: otherCampus },
    { ...scope(), tenant_id: foreign.tenant, campus_id: foreign.campus }]) {
    expect((await familyCreditExceptions(denied)).some(p => p.credito_ids.includes(id))).toBe(false);
    await expect(registerStripeFamilyCredit(denied, event.id, "Fuera de alcance")).rejects.toMatchObject({ status: 404 });
    await expect(applyFamilyCredits(denied, [id], target)).rejects.toMatchObject({ status: 404 });
    await expect(assignOrphanCredit(denied, id, familyId, "Fuera de alcance")).rejects.toMatchObject({ status: 404 });
  }
});

it("$1,000 con beca 50% y crédito $1,000: aplica $500, conserva origen y $500 activos", async () => {
  const id = await credit();
  const target = await charge(100000, 50);
  const result = await applyFamilyCredits(scope(), [id], target);
  expect(result.monto_aplicado_centavos).toBe(50000);
  expect(result.remanente_centavos).toBe(50000);
  const remainder = (await pool.query("SELECT * FROM family_credits WHERE id=$1", [result.nuevo_credit_id])).rows[0];
  expect(remainder.status).toBe("activo");
  expect(remainder.origen).toBe("stripe_no_aplicado");
  expect(Number(remainder.amount_centavos)).toBe(50000);
  await expect(applyFamilyCredits(scope(), [id], target)).rejects.toBeInstanceOf(CreditError);
});

it("dos aplicaciones simultáneas gastan el crédito una sola vez", async () => {
  const id = await credit(25000);
  const target = await charge();
  const results = await Promise.allSettled([applyFamilyCredits(scope(), [id], target),
    applyFamilyCredits(scope(), [id], target)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((await pool.query("SELECT amount_centavos FROM payment_applications WHERE charge_id=$1", [target])).rows).toHaveLength(1);
});

it("créditos distintos concurrentes nunca superan el pendiente del cargo", async () => {
  const first = await credit(70000);
  const second = await credit(70000);
  const target = await charge();
  const results = await Promise.all([applyFamilyCredits(scope(), [first], target),
    applyFamilyCredits(scope(), [second], target)]);
  expect(results.reduce((sum, r) => sum + r.monto_aplicado_centavos, 0)).toBe(100000);
  expect(results.reduce((sum, r) => sum + r.remanente_centavos, 0)).toBe(40000);
  expect(Number((await pool.query(
    "SELECT SUM(amount_centavos) AS n FROM payment_applications WHERE charge_id=$1", [target])).rows[0].n)).toBe(100000);
});

it("propuesta: familia, cargo más antiguo y mínimo del crédito y pendiente; no aplica sola", async () => {
  const id = await credit(100000);
  const target = await charge(100000, 50, "1999-01-01");
  const proposals = await familyCreditExceptions(scope());
  const proposal = proposals.find(p => p.family_id === familyId)!;
  expect(proposal.credito_ids).toContain(id);
  expect(proposal.cargos[0].id).toBe(target);
  expect(proposal.monto_centavos).toBe(50000);
  expect(proposal.cargos.some(c => c.id !== target)).toBe(true);
  expect((await pool.query("SELECT id FROM payment_applications WHERE charge_id=$1", [target])).rows).toHaveLength(0);
});

it("huérfano visible, asignación idempotente y otra familia/campus no pueden apropiárselo", async () => {
  const id = await credit(12345, true);
  const before = await familyCreditExceptions(scope());
  expect(before.find(p => p.credito_ids.includes(id))?.descripcion).toBe("Saldo a favor sin familia asignada");
  expect((await assignOrphanCredit(scope(), id, familyId, "Familia verificada")).duplicate).toBe(false);
  expect((await assignOrphanCredit(scope(), id, familyId, "Reintento")).duplicate).toBe(true);
  expect((await familyCreditExceptions(scope())).some(p => p.origen === "orphan_credit" && p.credito_ids.includes(id))).toBe(false);
});

it("crédito de 2000 permanece activo en un cargo del ciclo 2036 y no reduce deuda sin aplicar", async () => {
  const id = await credit(100000);
  const target = await charge(100000, 50);
  const before = await storage.getFamilyBalance(familyId, own.tenant);
  expect(before.saldo_neto_centavos).toBe(before.saldo_pendiente_centavos);
  expect(before.saldo_pendiente_centavos).toBe(before.total_cargos_centavos - before.total_pagado_centavos);
  expect(before.saldo_a_favor_centavos).toBeGreaterThanOrEqual(100000);
  await applyFamilyCredits(scope(), [id], target);
  const after = await storage.getFamilyBalance(familyId, own.tenant);
  expect(after.saldo_pendiente_centavos).toBe(before.saldo_pendiente_centavos - 50000);
  expect(after.saldo_a_favor_centavos).toBe(before.saldo_a_favor_centavos - 50000);
});

it("un fallo al crear el crédito revierte pago y evento juntos", async () => {
  const event = await own.event();
  const original = pool.connect.bind(pool);
  vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
    const client = await original();
    const query = client.query.bind(client);
    vi.spyOn(client, "query").mockImplementation((...args: Parameters<typeof client.query>) => {
      if (String(args[0]).includes("INSERT INTO family_credits")) throw new Error("Fallo de prueba");
      return query(...args);
    });
    return client;
  });
  await expect(registerStripeFamilyCredit(scope(), event.id, "No debe quedar a medias")).rejects.toThrow();
  expect((await pool.query("SELECT id FROM payments WHERE referencia_pasarela=$1", [event.pi.id])).rows).toHaveLength(0);
  expect((await pool.query("SELECT status FROM payment_events WHERE id=$1", [event.id])).rows[0].status).toBe("requires_review");
});
