import type { PoolClient } from "@neondatabase/serverless";

/** Movimientos confirmados, no una reducción ficticia de ingresos históricos. */
export async function cashRefundOutflows(reader: Pick<PoolClient, "query">, tenant: number, campus: number, day: string) {
  const result = await reader.query<{ amount: string }>(
    `SELECT COALESCE(SUM(amount_centavos),0)::text AS amount FROM credit_refunds
     WHERE tenant_id=$1 AND campus_id=$2 AND method='efectivo' AND status='exitosa' AND business_date=$3::date`,
    [tenant, campus, day]);
  return Number(result.rows[0].amount);
}
