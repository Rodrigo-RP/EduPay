import { pool } from "../db";
import { chargeBalance, type ChargeBalanceInput } from "../../shared/charge-balance";
import { schoolDate, schoolDateSQL } from "../../shared/school-date";
import { creditAudit } from "./credit-audit";
import { CreditError, type CreditScope } from "./stripe-family-credit";

interface CreditRow {
  id: number; tenant_id: number; campus_id: number; family_id: number | null;
  student_id: number | null; payment_id: number; amount_centavos: string;
  origen: string; status: string; familia: string | null; alumno: string | null;
  fecha: string;
}
interface FamilyCharge extends ChargeBalanceInput {
  id: number; student_id: number; concepto: string; fecha_vencimiento: string;
}
export interface CreditException {
  id: string; origen: "family_credit" | "orphan_credit"; descripcion: string;
  monto_centavos: number; fecha: string; family_id: number | null;
  credito_ids: number[]; cargos: { id: number; concepto: string; pendiente_centavos: number }[];
  familias: { id: number; nombre: string }[];
  saldo_a_favor_centavos?: number;
  alumno?: string | null;
}

export async function familyCreditExceptions(scope: Pick<CreditScope, "tenant_id" | "campus_id">): Promise<CreditException[]> {
  const credits = await pool.query<CreditRow>(
    `SELECT fc.*, f.nombre AS familia, s.nombre_completo AS alumno,
       ${schoolDateSQL("fc.created_at")}::text AS fecha
     FROM family_credits fc
     LEFT JOIN families f ON f.id=fc.family_id AND f.tenant_id=$1 AND f.campus_id=$2
     LEFT JOIN students s ON s.id=fc.student_id AND s.tenant_id=$1 AND s.campus_id=$2
     WHERE fc.tenant_id=$1 AND fc.campus_id=$2 AND fc.status='activo'
       AND (fc.family_id IS NULL OR f.id IS NOT NULL)
     ORDER BY fc.id`, [scope.tenant_id, scope.campus_id]);
  const result: CreditException[] = [];
  const orphan = credits.rows.filter(c => c.family_id === null);
  const families = orphan.length ? (await pool.query<{ id: number; nombre: string }>(
    "SELECT id,nombre FROM families WHERE tenant_id=$1 AND campus_id=$2 AND status='activo' ORDER BY nombre,id",
    [scope.tenant_id, scope.campus_id])).rows : [];
  for (const credit of orphan) result.push({
    id: `orphan:${credit.id}`, origen: "orphan_credit",
    descripcion: "Saldo a favor sin familia asignada", monto_centavos: Number(credit.amount_centavos),
    fecha: credit.fecha, family_id: null, credito_ids: [credit.id], cargos: [], familias: families, alumno: credit.alumno,
  });
  for (const familyId of Array.from(new Set(credits.rows.flatMap(c => c.family_id === null ? [] : [c.family_id])))) {
    const own = credits.rows.filter(c => c.family_id === familyId);
    const available = own.reduce((sum, c) => sum + Number(c.amount_centavos), 0);
    const charges = await pool.query<FamilyCharge>(
      `SELECT c.*, co.nombre AS concepto,
        COALESCE((SELECT SUM(pa.amount_centavos) FROM payment_applications pa WHERE pa.charge_id=c.id),0)::bigint AS ya_pagado
       FROM charges c JOIN students s ON s.id=c.student_id
       JOIN family_students fs ON fs.student_id=s.id
       LEFT JOIN concepts co ON co.id=c.concept_id
       WHERE fs.family_id=$1 AND c.tenant_id=$2 AND s.tenant_id=$2 AND s.campus_id=$3
         AND c.estado NOT IN ('cancelado','reestructurado','pagado')
       ORDER BY c.fecha_vencimiento ASC NULLS LAST,c.id`,
      [familyId, scope.tenant_id, scope.campus_id]);
    const pending = charges.rows.map(c => ({ id: c.id, concepto: c.concepto,
      pendiente_centavos: chargeBalance(c).pendiente_centavos })).filter(c => c.pendiente_centavos > 0);
    if (!pending.length) continue;
    result.push({ id: `credit:${familyId}`, origen: "family_credit",
      descripcion: own[0].familia ?? "Familia", monto_centavos: Math.min(available, pending[0].pendiente_centavos),
      fecha: schoolDate(), family_id: familyId, credito_ids: own.map(c => c.id),
      cargos: pending, familias: [], saldo_a_favor_centavos: available });
  }
  return result;
}

/** Tanto la ruta histórica como la propuesta usan este mismo mecanismo.
 * Los IDs de créditos son el snapshot de la propuesta. Nunca se reemplazan por
 * nuevos remanentes en un reintento: el lock + consumido impide el segundo gasto.
 */
export async function applyFamilyCredits(scope: CreditScope, creditIds: number[], chargeId: number, approvedAmount?: number) {
  const client = await pool.connect();
  const audits: { id: number; application: number; amount: number }[] = [];
  let remainingCredit = 0;
  let newCreditId: number | null = null;
  let total = 0;
  let state = "parcial";
  try {
    await client.query("BEGIN");
    const credits = await client.query<CreditRow>(
      `SELECT * FROM family_credits WHERE id=ANY($1::int[]) AND tenant_id=$2 AND campus_id=$3
       ORDER BY id FOR UPDATE`, [creditIds, scope.tenant_id, scope.campus_id]);
    if (credits.rows.length !== new Set(creditIds).size) throw new CreditError(404, "Crédito no encontrado");
    if (credits.rows.some(c => c.status !== "activo")) throw new CreditError(409, "El crédito ya fue aplicado; actualiza la bandeja");
    const familyId = credits.rows[0]?.family_id;
    if (!familyId || credits.rows.some(c => c.family_id !== familyId)) {
      throw new CreditError(409, "Asigna los créditos a una misma familia antes de aplicarlos");
    }
    const family = await client.query(
      "SELECT id FROM families WHERE id=$1 AND tenant_id=$2 AND campus_id=$3",
      [familyId, scope.tenant_id, scope.campus_id]);
    if (!family.rows.length) throw new CreditError(404, "Familia no encontrada");
    const charges = await client.query<FamilyCharge>(
      `SELECT c.* FROM charges c JOIN students s ON s.id=c.student_id
       JOIN family_students fs ON fs.student_id=s.id
       WHERE c.id=$1 AND c.tenant_id=$2 AND s.tenant_id=$2 AND s.campus_id=$3
         AND fs.family_id=$4 FOR UPDATE OF c`,
      [chargeId, scope.tenant_id, scope.campus_id, familyId]);
    if (!charges.rows.length) throw new CreditError(404, "Cargo no encontrado en la familia");
    const paid = await client.query(
      "SELECT COALESCE(SUM(amount_centavos),0)::bigint AS ya_pagado FROM payment_applications WHERE charge_id=$1", [chargeId]);
    let pending = chargeBalance({ ...charges.rows[0], ya_pagado: paid.rows[0].ya_pagado }).pendiente_centavos;
    if (pending <= 0 || charges.rows[0].estado === "pagado") throw new CreditError(409, "El cargo ya no tiene pendiente");
    let budget = Math.min(pending, approvedAmount ?? pending);
    for (const credit of credits.rows) {
      if (budget === 0) break;
      // No usar créditos huérfanos de pago ni aplicar un pago no confirmado.
      const payment = await client.query(
        `SELECT id FROM payments WHERE id=$1 AND tenant_id=$2 AND estado='exitoso' FOR SHARE`,
        [credit.payment_id, scope.tenant_id]);
      if (!payment.rows.length) throw new CreditError(409, "El crédito no tiene un pago confirmado");
      const amount = Math.min(Number(credit.amount_centavos), pending, budget);
      const application = await client.query(
        `INSERT INTO payment_applications (payment_id,charge_id,amount_centavos,applied_at)
         VALUES ($1,$2,$3,NOW()) RETURNING id`, [credit.payment_id, chargeId, amount]);
      await client.query(
        "UPDATE family_credits SET status='consumido',consumed_application_id=$1,consumed_at=NOW() WHERE id=$2",
        [application.rows[0].id, credit.id]);
      const remainder = Number(credit.amount_centavos) - amount;
      if (remainder > 0) {
        const row = await client.query(
          `INSERT INTO family_credits (tenant_id,campus_id,family_id,student_id,payment_id,amount_centavos,origen,status,descripcion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'activo',$8) RETURNING id`,
          [scope.tenant_id, scope.campus_id, familyId, credit.student_id, credit.payment_id,
            remainder, credit.origen, `Remanente de crédito #${credit.id}`]);
        newCreditId = row.rows[0].id;
        remainingCredit += remainder;
      }
      total += amount;
      pending -= amount;
      budget -= amount;
      audits.push({ id: credit.id, application: application.rows[0].id, amount });
    }
    state = pending === 0 ? "pagado" : "parcial";
    await client.query("UPDATE charges SET estado=$1,updated_at=NOW() WHERE id=$2", [state, chargeId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  for (const audit of audits) await creditAudit({
    tenant_id: scope.tenant_id, user_id: scope.id ?? null, action: "credit.applied",
    entity_type: "family_credit", entity_id: audit.id,
    metadata: { charge_id: chargeId, payment_application_id: audit.application, campus_id: scope.campus_id },
    new_value: { status: "consumido", monto_aplicado: audit.amount },
  });
  return { monto_aplicado_centavos: total, remanente_centavos: remainingCredit,
    nuevo_credit_id: newCreditId, charge_nuevo_estado: state,
    payment_application_id: audits[0]?.application, message: "Saldo a favor aplicado al cargo." };
}

export async function assignOrphanCredit(scope: CreditScope, creditId: number, familyId: number, reason: string) {
  const client = await pool.connect();
  let changed = false;
  try {
    await client.query("BEGIN");
    const credits = await client.query<CreditRow>(
      "SELECT * FROM family_credits WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 FOR UPDATE",
      [creditId, scope.tenant_id, scope.campus_id]);
    if (!credits.rows.length) throw new CreditError(404, "Crédito no encontrado");
    const credit = credits.rows[0];
    const family = await client.query(
      "SELECT id FROM families WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 AND status='activo' FOR SHARE",
      [familyId, scope.tenant_id, scope.campus_id]);
    if (!family.rows.length) throw new CreditError(404, "Familia no encontrada");
    if (credit.family_id !== familyId) {
      if (credit.family_id !== null || credit.status !== "activo") throw new CreditError(409, "El crédito ya no está pendiente de asignación");
      await client.query("UPDATE family_credits SET family_id=$1 WHERE id=$2", [familyId, creditId]);
      changed = true;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (changed) await creditAudit({ tenant_id: scope.tenant_id, user_id: scope.id,
    action: "credit.family_assigned", entity_type: "family_credit", entity_id: creditId,
    metadata: { justificacion: reason, campus_id: scope.campus_id },
    previous_value: { family_id: null }, new_value: { family_id: familyId } });
  return { message: "Saldo a favor asignado a la familia.", duplicate: !changed };
}
