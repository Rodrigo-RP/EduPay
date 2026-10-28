import { pool } from "../db";
import { schoolDateSQL, SCHOOL_TODAY_SQL } from "../../shared/school-date";

export const STRIPE_REVIEW_REASON = "Stripe cobró, pero el pago no se pudo aplicar al cargo";
type Scope = { tenant_id: number; campus_id: number };
type Reader = { query: (sql: string, values?: any[]) => Promise<any> };

// payload es texto histórico: no hacer casts JSON en SQL que rompan toda la
// bandeja ante un registro malformado. Nunca consultar Stripe ni confiar en
// metadata.campus_id: el campus se obtiene exclusivamente del cargo.
function intentOf(event: any) {
  try {
    const raw = JSON.parse(event.payload);
    const pi = raw?.data?.object ?? raw;
    const chargeId = Number(pi?.metadata?.charge_id);
    if (pi?.id !== event.provider_event_id || pi.status !== "succeeded" ||
        pi.currency !== "mxn" || !Number.isSafeInteger(pi.amount_received) ||
        pi.amount_received <= 0 || pi.amount !== pi.amount_received ||
        !Number.isSafeInteger(chargeId) || chargeId <= 0 || chargeId > 2147483647 ||
        Number(pi.metadata?.tenant_id) !== event.tenant_id) return null;
    return { pi, chargeId };
  } catch { return null; }
}

export async function stripeReviewExceptions(scope: Scope, reader: Reader = pool) {
  const events = await reader.query(
    `SELECT pe.*, ${schoolDateSQL("pe.created_at")}::text AS fecha,
            GREATEST(0, ${SCHOOL_TODAY_SQL} - ${schoolDateSQL("pe.created_at")}) AS dias_sin_conciliar
       FROM payment_events pe
      WHERE pe.tenant_id=$1 AND pe.provider='stripe' AND pe.status='requires_review'
      ORDER BY pe.created_at, pe.id`, [scope.tenant_id]);
  const valid = events.rows.map((event: any) => ({ event, intent: intentOf(event) }))
    .filter((item: any) => item.intent);
  if (!valid.length) return [];
  const charges = await reader.query(
    `SELECT c.id, s.id AS student_id, s.nombre_completo AS alumno, con.nombre AS concepto
       FROM charges c JOIN students s ON s.id=c.student_id
       JOIN campuses ca ON ca.id=s.campus_id
       LEFT JOIN concepts con ON con.id=c.concept_id
      WHERE c.id=ANY($1::int[]) AND c.tenant_id=$2 AND s.tenant_id=$2
        AND s.campus_id=$3 AND ca.tenant_id=$2`,
    [valid.map((item: any) => item.intent.chargeId), scope.tenant_id, scope.campus_id]);
  const byId = new Map(charges.rows.map((charge: any) => [charge.id, charge]));
  return valid.flatMap(({ event, intent }: any) => {
    const charge: any = byId.get(intent.chargeId);
    return charge ? [{
      id: `stripe:${event.id}`, event_id: event.id, origen: "stripe",
      fecha: event.fecha, descripcion: STRIPE_REVIEW_REASON,
      monto_centavos: intent.pi.amount_received, tipo: "cobro Stripe por revisar",
      referencia: intent.pi.id, payment_intent_id: intent.pi.id,
      alumno: charge.alumno, concepto: charge.concepto,
      estado_conciliacion: "requires_review", dias_sin_conciliar: event.dias_sin_conciliar,
    }] : [];
  });
}
