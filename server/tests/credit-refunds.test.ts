import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { pool } from "../db";
import { reviewFixture } from "./helpers/stripe-review-fixtures";
import { encryptTotp } from "../lib/totp-crypto";
import { SCHOOL_TODAY_SQL, schoolDate } from "../../shared/school-date";
import { JWT_SECRET } from "../routes/shared";
import { registerCreditRefundRoutes, refundExceptions } from "../routes/credit-refunds";
import { registerConciliacionRoutes } from "../routes/conciliacion";
import { creditRefundOptions, prepareCreditRefund, confirmCreditRefund } from "../lib/credit-refund-service";
import { processRefundWebhook, retryRefund } from "../lib/credit-refund-stripe";
import { cashRefundOutflows } from "../lib/refund-cash";
import type { RefundProvider, ProviderRefund } from "../lib/refund-provider";

const require = createRequire(import.meta.url);
const speakeasy: typeof import("speakeasy") = require("speakeasy");
const secret = speakeasy.generateSecret({ length: 20 }).base32;
const code = () => speakeasy.totp({ secret, encoding: "base32" });
let fixture: Awaited<ReturnType<typeof reviewFixture>>;
let actor: number;
let server: Server;
let base: string;
const scope = () => ({ id: actor, tenant_id: fixture.tenant, campus_id: fixture.campus, role: "administrador_general" });
const created = new Map<number, ProviderRefund>();
let paymentClock = Date.now() / 1000;
let spei = false;
const payment = vi.fn(async (id: string) => ({ id, amount: 100000, refunded: 0,
  created: paymentClock, destination: "acct_refund_fixture", currency: "mxn", customerEmail: true, spei }));
const create = vi.fn(async (pi: string, amount: number, id: number, _key: string) => {
  const refund = { id: `re_${id}`, amount, payment_intent: pi, currency: "mxn", status: "succeeded",
    metadata: { edupay_credit_refund: String(id) }, transfer_reversal: "trr_fixture", failure_balance_transaction: null };
  created.set(id, refund);
  return refund;
});
const retrieve = vi.fn(async (id: string) => {
  const refund = Array.from(created.values()).find(refund => refund.id === id);
  if (!refund) throw new Error("Reembolso simulado inexistente");
  return refund;
});
const returnFunds = vi.fn(async (_destination: string, _amount: number, id: number, _key: string) => `tr_return_${id}`);
const provider: RefundProvider = { payment, create, retrieve, returnFunds };
beforeAll(async () => {
  fixture = await reviewFixture();
  actor = (await pool.query(
    `INSERT INTO users (tenant_id,campus_id,email,password_hash,role,is_active)
     VALUES ($1,$2,$3,$4,'administrador_general',true) RETURNING id`,
    [fixture.tenant, fixture.campus, `${randomUUID()}@test.invalid`, await bcrypt.hash(randomUUID(), 4)])).rows[0].id;
  await pool.query("UPDATE users SET twofa_secret=$1 WHERE id=$2", [encryptTotp(secret, actor), actor]);
  const app = express(); app.use(express.json());
  registerCreditRefundRoutes(app, provider);
  registerConciliacionRoutes(app);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  vi.clearAllMocks(); spei = false; paymentClock = Date.now() / 1000;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (!fixture) return;
  await pool.query("DELETE FROM cash_closures WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM credit_refund_events WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM credit_refunds WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM audit_log WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM audit_retry_queue WHERE payload->>'tenant_id'=$1", [String(fixture.tenant)]);
  await pool.query("DELETE FROM family_credits WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM payments WHERE tenant_id=$1", [fixture.tenant]);
  await pool.query("DELETE FROM users WHERE id=$1", [actor]);
  await fixture.cleanup();
});
async function credit(cash = false) {
  const pay = (await pool.query(
    `INSERT INTO payments (tenant_id,metodo,monto_centavos,fecha_pago,estado,referencia_pasarela)
     VALUES ($1,$2,100000,${SCHOOL_TODAY_SQL},'exitoso',$3) RETURNING id`,
    [fixture.tenant, cash ? "efectivo" : "tarjeta", cash ? null : `pi_${randomUUID()}`])).rows[0].id;
  return (await pool.query(
    `INSERT INTO family_credits (tenant_id,campus_id,student_id,payment_id,amount_centavos,origen)
     VALUES ($1,$2,$3,$4,100000,$5) RETURNING id`,
    [fixture.tenant, fixture.campus, fixture.student, pay, cash ? "excedente_caja" : "stripe_no_aplicado"])).rows[0].id as number;
}
const body = (id: number, method = "stripe", amount = 50000) => ({
  credit_id: id, method, monto_centavos: amount, motivo: "Devolver excedente confirmado",
});
async function request(path: string, payload: object, role = "administrador_general") {
  const token = jwt.sign({ ...scope(), role, password_version: 0, twofa_verified: true,
    session_started_at: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: "1h" });
  return fetch(`${base}/api/admin/credit-refunds/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}
async function confirm(id: number) {
  return confirmCreditRefund(scope(), id, { totp: code(), confirmacion: true }, provider);
}
async function event(id: number, status: string, stamp = 100) {
  const refund = created.get(id);
  if (!refund) throw new Error("Sin reembolso simulado");
  const current = { ...refund, status, failure_balance_transaction: status === "failed" ? "txn_failed" : null };
  created.set(id, current);
  await processRefundWebhook({ id: `evt_${id}_${status}_${stamp}`, type: "refund.updated", created: stamp, refund: current }, provider);
}

it("rol inferior -> 403, sin consultar Stripe ni crear devolución", async () => {
  const id = await credit();
  expect((await request("preparar", body(id), "administrador_campus")).status).toBe(403);
  expect(create).not.toHaveBeenCalled(); expect(payment).not.toHaveBeenCalled();
});
it("sin TOTP, TOTP incorrecto o sin segunda confirmación no reserva el crédito", async () => {
  const id = await credit();
  const row = await prepareCreditRefund(scope(), body(id), provider);
  expect((await request("confirmar", { refund_id: row.id, confirmacion: true })).status).toBe(403);
  expect((await request("confirmar", { refund_id: row.id, confirmacion: true, totp: "no-valido" })).status).toBe(403);
  expect((await request("confirmar", { refund_id: row.id, totp: code() })).status).toBe(400);
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("activo");
  expect(create).not.toHaveBeenCalled();
});
it("doble clic concurrente y respuesta inmediata succeeded -> una devolución, pendiente hasta webhook", async () => {
  const id = await credit();
  const rows = await Promise.all([prepareCreditRefund(scope(), body(id), provider), prepareCreditRefund(scope(), body(id), provider)]);
  expect(rows[0].id).toBe(rows[1].id);
  const confirmations = await Promise.all([confirm(rows[0].id), confirm(rows[0].id)]);
  expect(confirmations.every(r => r.status === "pendiente")).toBe(true);
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]?.[1]).toBe(50000);
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("en_devolucion");
  await event(rows[0].id, "succeeded");
  await event(rows[0].id, "succeeded");
  await event(rows[0].id, "pending", 99);
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("devuelto");
  expect((await pool.query("SELECT status FROM credit_refunds WHERE id=$1", [rows[0].id])).rows[0].status).toBe("exitosa");
  expect((await pool.query(
    "SELECT amount_centavos::text,origen FROM family_credits WHERE payment_id=(SELECT payment_id FROM family_credits WHERE id=$1) AND status='activo'", [id])).rows)
    .toEqual([{ amount_centavos: "50000", origen: "stripe_no_aplicado" }]);
  expect((await pool.query(
    "SELECT id FROM audit_log WHERE entity_type='credit_refund' AND entity_id=$1 AND action='credit.refund_webhook'", [rows[0].id])).rows).toHaveLength(1);
});
it("SPEI 181 días -> no ofrece Stripe, sólo transferencia de escuela con evidencia", async () => {
  spei = true; paymentClock -= 181 * 86400;
  const id = await credit();
  expect((await creditRefundOptions(scope(), id, provider)).methods).toEqual(["transferencia_escuela"]);
  expect((await request("preparar", body(id))).status).toBe(400);
  const row = await prepareCreditRefund(scope(), body(id, "transferencia_escuela"), provider);
  expect((await request("confirmar", { refund_id: row.id, totp: code(), confirmacion: true })).status).toBe(400);
  expect((await request("confirmar", { refund_id: row.id, totp: code(), confirmacion: true,
    dinero_entregado: true, fecha: schoolDate() })).status).toBe(400);
  const result = await confirmCreditRefund(scope(), row.id, { totp: code(), confirmacion: true, dinero_entregado: true,
    clave_rastreo: "RASTREO-PRUEBA", fecha: schoolDate() }, provider);
  expect(result.verificacion).toBe("Registrada por la escuela"); expect(result.status).toBe("exitosa");
  expect(create).not.toHaveBeenCalled();
});
it("tarjeta de 900 días se permite; fallida retorna fondos una vez y ofrece transferencia alternativa", async () => {
  paymentClock -= 900 * 86400;
  const id = await credit();
  expect((await creditRefundOptions(scope(), id, provider)).methods).toEqual(["stripe"]);
  const row = await prepareCreditRefund(scope(), body(id), provider); await confirm(row.id);
  await event(row.id, "failed");
  await event(row.id, "failed");
  expect(returnFunds).toHaveBeenCalledTimes(1);
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("activo");
  expect((await creditRefundOptions(scope(), id, provider)).methods).toEqual(["transferencia_escuela"]);
});
it("retorno fallido -> incidencia, crédito reservado, reintento idempotente y después activo", async () => {
  const id = await credit();
  const row = await prepareCreditRefund(scope(), body(id), provider); await confirm(row.id);
  returnFunds.mockRejectedValueOnce(new Error("Proveedor no disponible"));
  await event(row.id, "failed");
  expect((await refundExceptions(scope())).find(r => r.refund_id === row.id)?.descripcion)
    .toBe("Fondos de la escuela pendientes de regresar");
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("en_devolucion");
  await Promise.all([retryRefund(scope(), row.id, provider), retryRefund(scope(), row.id, provider)]);
  expect(returnFunds).toHaveBeenCalledTimes(2); // Un fallido + un retorno confirmado.
  expect(returnFunds.mock.calls[0][3]).toBe(returnFunds.mock.calls[1][3]);
  expect((await pool.query("SELECT return_status,return_transfer_id FROM credit_refunds WHERE id=$1", [row.id])).rows[0])
    .toEqual({ return_status: "completo", return_transfer_id: `tr_return_${row.id}` });
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("activo");
});
it("failed sin evidencia de fondos retornados no transfiere ni libera el crédito", async () => {
  const id = await credit();
  const row = await prepareCreditRefund(scope(), body(id), provider); await confirm(row.id);
  const refund = { ...created.get(row.id)!, status: "failed" };
  created.set(row.id, refund);
  await processRefundWebhook({ id: `evt_wait_${row.id}`, created: 100, type: "refund.failed", refund }, provider);
  expect(returnFunds).not.toHaveBeenCalled();
  expect((await creditRefundOptions(scope(), id, provider)).methods).toEqual([]);
});
it("requires_action aparece en bandeja; charge.refunded no finaliza nada", async () => {
  const id = await credit(); const row = await prepareCreditRefund(scope(), body(id), provider); await confirm(row.id);
  await event(row.id, "requires_action");
  expect((await refundExceptions(scope())).some(r => r.refund_id === row.id)).toBe(true);
  await processRefundWebhook({ id: "evt_charge_ignored", type: "charge.refunded", created: 101,
    refund: created.get(row.id)! }, provider);
  expect((await pool.query("SELECT status FROM credit_refunds WHERE id=$1", [row.id])).rows[0].status).toBe("requiere_accion");
});
it("efectivo requiere declarar entrega, genera egreso escolar y nunca llama a Stripe", async () => {
  const id = await credit(true);
  const before = await cashRefundOutflows(pool, fixture.tenant, fixture.campus, schoolDate());
  const row = await prepareCreditRefund(scope(), body(id, "efectivo"), provider);
  const result = await confirmCreditRefund(scope(), row.id, { totp: code(), confirmacion: true, dinero_entregado: true }, provider);
  expect(result.verificacion).toBe("Registrada por la escuela");
  expect(await cashRefundOutflows(pool, fixture.tenant, fixture.campus, schoolDate())).toBe(before + 50000);
  expect(create).not.toHaveBeenCalled(); expect(payment).not.toHaveBeenCalled();
  const token = jwt.sign({ ...scope(), password_version: 0, twofa_verified: true,
    session_started_at: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: "1h" });
  const close = await fetch(`${base}/api/caja/cerrar-dia`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fecha: schoolDate(), efectivo_capturado_centavos: 0 }),
  });
  expect(close.status).toBe(201);
  const closed = await close.json();
  expect(closed.cierre.devoluciones_efectivo_centavos).toBe(50000);
  const read = await fetch(`${base}/api/caja/cierre-dia`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await read.json()).cierre.devoluciones_efectivo_centavos).toBe(50000);
  const late = await prepareCreditRefund(scope(), body(await credit(true), "efectivo"), provider);
  await expect(confirmCreditRefund(scope(), late.id,
    { totp: code(), confirmacion: true, dinero_entregado: true }, provider)).rejects.toMatchObject({ status: 409 });
});
it("importe mayor al crédito -> 400, y otro tenant o campus -> 404", async () => {
  const id = await credit();
  expect((await request("preparar", body(id, "stripe", 100001))).status).toBe(400);
  await expect(creditRefundOptions({ ...scope(), campus_id: fixture.campus + 999999 }, id, provider))
    .rejects.toMatchObject({ status: 404 });
  await expect(creditRefundOptions({ ...scope(), tenant_id: fixture.tenant + 999999 }, id, provider))
    .rejects.toMatchObject({ status: 404 });
  expect((await refundExceptions({ ...scope(), tenant_id: fixture.tenant + 999999 }))).toEqual([]);
});
it("rechazo inequívoco de tarjeta devuelve crédito activo y ofrece transferencia escolar", async () => {
  const id = await credit();
  const row = await prepareCreditRefund(scope(), body(id), provider);
  create.mockRejectedValueOnce(Object.assign(new Error("Reembolso rechazado"), { type: "StripeInvalidRequestError", statusCode: 400 }));
  await confirm(row.id);
  expect((await creditRefundOptions(scope(), id, provider)).methods).toEqual(["transferencia_escuela"]);
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("activo");
  expect(returnFunds).not.toHaveBeenCalled();
});
it("timeout no libera crédito ni presenta éxito; se reintenta con la misma clave", async () => {
  const id = await credit(); const row = await prepareCreditRefund(scope(), body(id), provider);
  create.mockRejectedValueOnce(new Error("Timeout"));
  expect((await confirm(row.id)).status).toBe("pendiente");
  await retryRefund(scope(), row.id, provider);
  const keys = (await pool.query("SELECT idempotency_key FROM credit_refunds WHERE id=$1", [row.id])).rows[0];
  expect(keys.idempotency_key).toMatch(/^refund:/);
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0][3]).toBe(create.mock.calls[1][3]);
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("en_devolucion");
});
it("remanente del pago tiene en cuenta devoluciones previas y reservas de otros créditos", async () => {
  const id = await credit();
  const first = await prepareCreditRefund(scope(), body(id, "stripe", 60000), provider);
  await confirm(first.id); await event(first.id, "succeeded");
  // Se emula un crédito adicional del mismo pago: no debe permitir sobredevolver.
  const additional = (await pool.query(
    `INSERT INTO family_credits (tenant_id,campus_id,payment_id,amount_centavos,origen)
     SELECT tenant_id,campus_id,payment_id,50000,origen FROM family_credits WHERE id=$1 RETURNING id`, [id])).rows[0].id;
  expect((await request("preparar", body(additional, "stripe", 50000))).status).toBe(400);
});
it("no reenvía una solicitud ambigua después de la retención segura de idempotencia", async () => {
  const id = await credit(); const row = await prepareCreditRefund(scope(), body(id), provider);
  create.mockRejectedValueOnce(new Error("Timeout"));
  await confirm(row.id);
  await pool.query("UPDATE credit_refunds SET attempted_at=NOW()-INTERVAL '25 hours' WHERE id=$1", [row.id]);
  await retryRefund(scope(), row.id, provider);
  expect(create).toHaveBeenCalledTimes(1);
  expect((await refundExceptions(scope())).find(r => r.refund_id === row.id)?.descripcion).toMatch(/revisión/);
  expect((await pool.query("SELECT status FROM family_credits WHERE id=$1", [id])).rows[0].status).toBe("en_devolucion");
});
it("rechaza datos bancarios adicionales y no altera pagos ni aplicaciones ni cargos", async () => {
  const snapshot = await fixture.snapshot();
  const id = await credit();
  expect((await request("preparar", { ...body(id), clabe: "NO-GUARDAR" })).status).toBe(400);
  const row = await prepareCreditRefund(scope(), body(id), provider); await confirm(row.id); await event(row.id, "succeeded");
  const after = await fixture.snapshot();
  expect(after.cargo).toBe(snapshot.cargo); expect(after.aplicaciones).toBe(snapshot.aplicaciones);
  expect((await pool.query("SELECT estado,monto_centavos::text FROM payments WHERE id=(SELECT payment_id FROM family_credits WHERE id=$1)", [id])).rows[0])
    .toEqual({ estado: "exitoso", monto_centavos: "100000" });
});
