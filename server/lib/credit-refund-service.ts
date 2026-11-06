import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { creditAudit } from "./credit-audit";
import { validTotp } from "./totp-service";
import { CreditError } from "./stripe-family-credit";
import { schoolDate } from "../../shared/school-date";
import { centavos, positiveId, isoFinancialDate } from "./financial-input";
import { canRefund, refundMethods, assertRefundAmount, type RefundScope, type RefundMethod } from "./credit-refund-policy";
import { stripeRefundProvider, type RefundProvider } from "./refund-provider";

export interface RefundRow {
  id: number; tenant_id: number; campus_id: number; credit_id: number; payment_id: number;
  amount_centavos: string; method: RefundMethod; status: string; reason: string;
  created_by: number; stripe_refund_id: string | null; payment_intent_id: string | null;
  destination: string | null; idempotency_key: string; return_key: string;
  return_status: string; return_transfer_id: string | null; attempted_at: Date | null;
  return_attempted_at: Date | null; last_event_created: string;
  incident: string | null;
}
interface Credit {
  id: number; payment_id: number; tenant_id: number; campus_id: number; status: string;
  family_id: number | null; student_id: number | null; amount_centavos: string; origen: string;
}
export function assertRefundRole(scope: RefundScope) {
  if (!scope.tenant_id || !scope.campus_id || !canRefund(scope.role))
    throw new CreditError(403, "Solo la administración general puede devolver saldo a favor");
}
async function ownCredit(client: PoolClient, scope: RefundScope, id: number) {
  const result = await client.query<Credit>(
    "SELECT * FROM family_credits WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 FOR UPDATE",
    [id, scope.tenant_id, scope.campus_id]);
  if (!result.rows.length) throw new CreditError(404, "Saldo a favor no encontrado");
  return result.rows[0];
}
async function context(client: PoolClient, scope: RefundScope, credit: Credit,
  provider: RefundProvider, excludeRefund = 0) {
  // El lock del pago serializa devoluciones de créditos distintos del mismo cobro.
  const payments = await client.query<{ id: number; monto_centavos: string; referencia_pasarela: string | null }>(
    "SELECT id,monto_centavos,referencia_pasarela FROM payments WHERE id=$1 AND tenant_id=$2 AND estado='exitoso' FOR UPDATE",
    [credit.payment_id, scope.tenant_id]);
  const payment = payments.rows[0];
  if (!payment) throw new CreditError(409, "No hay un pago de origen confirmado");
  const history = await client.query<{ previous_failure: boolean; funds_returned: boolean; reserved: string }>(
    `SELECT COALESCE(bool_or(status IN ('fallida','rechazada')),false) AS previous_failure,
      COALESCE(bool_and(return_status IN ('no_necesario','completo')),true) AS funds_returned,
      COALESCE(SUM(amount_centavos) FILTER (WHERE status IN ('preparada','pendiente','requiere_accion','exitosa')),0)::text AS reserved
     FROM credit_refunds WHERE payment_id=$1 AND tenant_id=$2 AND id<>$3`,
    [payment.id, scope.tenant_id, excludeRefund]);
  const prior = history.rows[0];
  const pi = credit.origen === "excedente_caja" ? null :
    payment.referencia_pasarela?.startsWith("pi_") ? await provider.payment(payment.referencia_pasarela) : null;
  const methods = refundMethods(credit.origen, pi, prior.previous_failure, prior.funds_returned);
  const remaining = Number(payment.monto_centavos) - Number(prior.reserved);
  return { methods, pi, remaining, payment };
}
export async function creditRefundOptions(scope: RefundScope, creditId: number, provider = stripeRefundProvider()) {
  assertRefundRole(scope);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const credit = await ownCredit(client, scope, creditId);
    const ctx = await context(client, scope, credit, provider);
    await client.query("COMMIT");
    return { methods: credit.status === "activo" ? ctx.methods : [], available_centavos: Number(credit.amount_centavos) };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function prepareCreditRefund(scope: RefundScope, body: {
  credit_id?: unknown; monto_centavos?: unknown; method?: unknown; motivo?: unknown;
}, provider = stripeRefundProvider()) {
  assertRefundRole(scope);
  const creditId = positiveId(body.credit_id);
  const amount = centavos(body.monto_centavos);
  if (typeof body.motivo !== "string" || !body.motivo.trim() || body.motivo.length > 2000)
    throw new CreditError(400, "Escribe el motivo de la devolución");
  const reason = body.motivo.trim();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const credit = await ownCredit(client, scope, creditId);
    const existing = await client.query<RefundRow>(
      "SELECT * FROM credit_refunds WHERE credit_id=$1 AND status='preparada' FOR UPDATE", [creditId]);
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.created_by !== scope.id || row.method !== body.method ||
          Number(row.amount_centavos) !== amount || row.reason !== reason)
        throw new CreditError(409, "Ya existe una devolución preparada; revisa el registro antes de continuar");
      await client.query("COMMIT");
      return publicRefund(row);
    }
    if (credit.status !== "activo") throw new CreditError(409, "Este saldo ya no está disponible");
    const ctx = await context(client, scope, credit, provider);
    if (!ctx.methods.some(method => method === body.method))
      throw new CreditError(400, "Este método no corresponde al pago; actualiza las opciones");
    assertRefundAmount(amount, Number(credit.amount_centavos), ctx.remaining);
    if (ctx.pi && body.method === "stripe")
      assertRefundAmount(amount, Number(credit.amount_centavos), ctx.pi.amount - ctx.pi.refunded);
    const result = await client.query<RefundRow>(
      `INSERT INTO credit_refunds (tenant_id,campus_id,credit_id,payment_id,amount_centavos,method,reason,created_by,
        idempotency_key,return_key,payment_intent_id,destination)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [scope.tenant_id, scope.campus_id, creditId, credit.payment_id, amount, body.method, reason, scope.id,
        `refund:${randomUUID()}`, `refund-return:${randomUUID()}`, ctx.pi?.id ?? null, ctx.pi?.destination ?? null]);
    await client.query("COMMIT");
    return publicRefund(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export function publicRefund(row: RefundRow) {
  return { id: row.id, credit_id: row.credit_id, monto_centavos: Number(row.amount_centavos),
    method: row.method, status: row.status, motivo: row.reason, return_status: row.return_status,
    stripe_refund_id: row.stripe_refund_id, return_transfer_id: row.return_transfer_id,
    incident: row.incident,
    verificacion: row.method === "stripe" ? (row.status === "exitosa" ? "Confirmada por webhook de Stripe" : "Sin confirmación de devolución por Stripe") :
      (row.status === "exitosa" ? "Registrada por la escuela" : "Sin entrega registrada") };
}
export async function assertRefundTotp(scope: RefundScope, code: unknown) {
  const users = await pool.query<{ twofa_secret: string | null }>(
    `SELECT twofa_secret FROM users WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 AND is_active=true AND role=$4`,
    [scope.id, scope.tenant_id, scope.campus_id, scope.role]);
  const secret = users.rows[0]?.twofa_secret;
  if (!secret || !validTotp(secret, scope.id, code))
    throw new CreditError(403, "Escribe el código vigente de tu aplicación de autenticación");
}
/** Se consume el crédito original sin alterar su importe y se crea un remanente
 * con el mismo origen. Nunca se modifica el pago ni una aplicación del ledger.
 */
export async function completeRefundCredit(client: PoolClient, row: RefundRow) {
  const credits = await client.query<Credit>("SELECT * FROM family_credits WHERE id=$1 FOR UPDATE", [row.credit_id]);
  const credit = credits.rows[0];
  if (!credit || credit.status !== "en_devolucion") throw new Error("Crédito no reservado");
  const remainder = Number(credit.amount_centavos) - Number(row.amount_centavos);
  if (remainder < 0) throw new Error("Devolución mayor al crédito");
  await client.query("UPDATE family_credits SET status='devuelto',consumed_at=NOW() WHERE id=$1", [credit.id]);
  if (remainder) await client.query(
    `INSERT INTO family_credits (tenant_id,campus_id,family_id,student_id,payment_id,amount_centavos,origen,status,descripcion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'activo',$8)`,
    [row.tenant_id, row.campus_id, credit.family_id, credit.student_id, row.payment_id,
      remainder, credit.origen, `Remanente de devolución #${row.id}`]);
}
export async function confirmCreditRefund(scope: RefundScope, id: number, body: {
  totp?: unknown; confirmacion?: unknown; dinero_entregado?: unknown; clave_rastreo?: unknown; fecha?: unknown;
}, provider = stripeRefundProvider()) {
  assertRefundRole(scope);
  if (body.confirmacion !== true) throw new CreditError(400, "Confirma de nuevo la devolución");
  await assertRefundTotp(scope, body.totp);
  const client = await pool.connect();
  let row: RefundRow;
  let changed = false;
  try {
    await client.query("BEGIN");
    const rows = await client.query<RefundRow>(
      "SELECT * FROM credit_refunds WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 FOR UPDATE",
      [id, scope.tenant_id, scope.campus_id]);
    row = rows.rows[0];
    if (!row) throw new CreditError(404, "Devolución no encontrada");
    if (row.created_by !== scope.id) throw new CreditError(403, "Confirma la devolución que tú preparaste");
    if (row.status === "preparada") {
      const credit = await ownCredit(client, scope, row.credit_id);
      if (credit.status !== "activo") throw new CreditError(409, "El crédito ya no está disponible");
      const ctx = await context(client, scope, credit, provider, row.id);
      if (!ctx.methods.includes(row.method)) throw new CreditError(409, "El método dejó de estar disponible");
      assertRefundAmount(Number(row.amount_centavos), Number(credit.amount_centavos), ctx.remaining);
      if (row.method === "stripe" && ctx.pi)
        assertRefundAmount(Number(row.amount_centavos), Number(credit.amount_centavos), ctx.pi.amount - ctx.pi.refunded);
      let date = schoolDate();
      let tracking: string | null = null;
      if (row.method !== "stripe") {
        if (body.dinero_entregado !== true)
          throw new CreditError(400, "Declara expresamente que ya entregaste o transferiste el dinero");
        if (row.method === "transferencia_escuela") {
          date = isoFinancialDate(body.fecha);
          if (date > schoolDate()) throw new CreditError(400, "La transferencia ya realizada no puede tener fecha futura");
          if (typeof body.clave_rastreo !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(body.clave_rastreo.trim()))
            throw new CreditError(400, "Escribe la clave de rastreo SPEI, sin datos bancarios");
          tracking = body.clave_rastreo.trim();
        }
        if (row.method === "efectivo") {
          // Mismo lock que cerrar-dia: no registrar egresos después del corte.
          await client.query("SELECT pg_advisory_xact_lock($1,$2)", [scope.tenant_id, scope.campus_id]);
          const closure = await client.query(
            "SELECT id FROM cash_closures WHERE tenant_id=$1 AND campus_id=$2 AND fecha=$3",
            [scope.tenant_id, scope.campus_id, date]);
          if (closure.rows.length) throw new CreditError(409, "La caja de hoy ya está cerrada; no registres otra salida de efectivo");
        }
      }
      await client.query("UPDATE family_credits SET status='en_devolucion' WHERE id=$1", [row.credit_id]);
      const updated = await client.query<RefundRow>(
        `UPDATE credit_refunds SET status=$1,confirmed_at=NOW(),business_date=$2,tracking_key=$3 WHERE id=$4 RETURNING *`,
        [row.method === "stripe" ? "pendiente" : "exitosa", date, tracking, id]);
      row = updated.rows[0];
      if (row.method !== "stripe") await completeRefundCredit(client, row);
      changed = true;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (changed) await creditAudit({ tenant_id: scope.tenant_id, user_id: scope.id, action: "credit.refund_confirmed",
    entity_type: "credit_refund", entity_id: id, metadata: { campus_id: scope.campus_id, metodo: row.method,
      motivo: row.reason, verificacion: row.method === "stripe" ? "pendiente_webhook" : "Registrada por la escuela" },
    new_value: { status: row.status, monto_centavos: Number(row.amount_centavos) } });
  // Import dinámico evita dependencia circular con el procesador de webhooks.
  if (row.method === "stripe" && row.status === "pendiente") {
    const { dispatchRefund } = await import("./credit-refund-stripe");
    await dispatchRefund(row.id, provider);
    const fresh = await pool.query<RefundRow>("SELECT * FROM credit_refunds WHERE id=$1", [id]);
    row = fresh.rows[0];
  }
  return publicRefund(row);
}
