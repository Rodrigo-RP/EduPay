import type { Pool } from "@neondatabase/serverless";
import { assertMutable } from "./ledger-mutability";

/** Only the three existing direct-edit approval actions are accepted. */
export async function mutateApprovedCharge(
  pool: Pool,
  approval: { entity_id: number; tenant_id: number; campus_id: number; action_type: string },
  data: { amount?: number; due_date?: string },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT c.id, c.estado FROM charges c
         JOIN students s ON s.id = c.student_id
        WHERE c.id = $1 AND c.tenant_id = $2 AND s.campus_id = $3
        FOR UPDATE OF c`,
      [approval.entity_id, approval.tenant_id, approval.campus_id],
    );
    if (!locked.rows.length) {
      throw Object.assign(new Error("Cargo no encontrado en este plantel"), { status: 404 });
    }
    assertMutable(locked.rows[0]);

    switch (approval.action_type) {
      case "modify_charge_amount":
        await client.query(
          "UPDATE charges SET monto_base_centavos = $1 WHERE id = $2 AND tenant_id = $3",
          [data.amount, approval.entity_id, approval.tenant_id],
        );
        break;
      case "modify_payment_due_date":
        await client.query(
          "UPDATE charges SET fecha_vencimiento = $1 WHERE id = $2 AND tenant_id = $3",
          [data.due_date, approval.entity_id, approval.tenant_id],
        );
        break;
      case "delete_charge":
        await client.query("DELETE FROM charges WHERE id = $1 AND tenant_id = $2",
          [approval.entity_id, approval.tenant_id]);
        break;
      default:
        throw new Error("Acción de cargo no soportada");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
