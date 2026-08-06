/**
 * Helpers compartidos para tests que necesitan manipular el ledger
 * sin violar el invariante: charge 'pagado' ⇒ existe payment_application.
 *
 * Ver .local/tasks/fix-test-orphan-charges.md — la consulta de salud
 *   SELECT id FROM charges WHERE estado='pagado'
 *   AND NOT EXISTS (SELECT 1 FROM payment_applications WHERE charge_id=charges.id)
 * detectaba falsos positivos generados por fixtures que hacían
 * UPDATE/INSERT directo de estado='pagado'.
 */

import type { Pool } from "pg";

/**
 * Marca un charge como pagado respetando el invariante del ledger:
 * dentro de UNA transacción inserta el payment (efectivo/exitoso),
 * el payment_application, y actualiza el charge a 'pagado'.
 * ROLLBACK y relanza si algo falla.
 */
export async function markChargeAsPaidForTest(
  pool: Pool,
  chargeId: number,
  amountCentavos: number,
  tenantId: number
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payR = await client.query(
      `INSERT INTO payments (tenant_id, charge_id, metodo, referencia_pasarela,
                             monto_centavos, fecha_pago, estado)
       VALUES ($1,$2,'efectivo','TEST-HELPER-PAID',$3,CURRENT_DATE,'exitoso')
       RETURNING id`,
      [tenantId, chargeId, amountCentavos]
    );
    const paymentId = (payR.rows[0] as any).id as number;
    // payment_applications no tiene columna tenant_id (ver shared/schema.ts)
    await client.query(
      `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos)
       VALUES ($1,$2,$3)`,
      [paymentId, chargeId, amountCentavos]
    );
    await client.query(
      `UPDATE charges SET estado='pagado' WHERE id=$1`,
      [chargeId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
