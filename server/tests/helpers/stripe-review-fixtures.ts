import { randomUUID } from "node:crypto";
import { pool } from "../../db";
import { assertTestDatabase } from "../../lib/database-safety";
import { schoolDate } from "../../../shared/school-date";

export async function reviewFixture(scope?: { tenant_id: number; campus_id: number }) {
  await assertTestDatabase(pool);
  const tag = randomUUID().replaceAll("-", "").slice(0, 10);
  const tenant = scope?.tenant_id ?? (await pool.query(
    "INSERT INTO tenants (nombre_legal,rfc) VALUES ($1,$2) RETURNING id",
    [`Prueba Stripe ${tag}`, `SR${tag}`])).rows[0].id;
  const campus = scope?.campus_id ?? (await pool.query(
    "INSERT INTO campuses (tenant_id,nombre) VALUES ($1,$2) RETURNING id",
    [tenant, `Campus Stripe ${tag}`])).rows[0].id;
  const concept = (await pool.query(
    `INSERT INTO concepts (tenant_id,campus_id,nombre,tipo,periodicidad,monto_centavos)
     VALUES ($1,$2,$3,'colegiatura','mensual',12345) RETURNING id`,
    [tenant, campus, `Concepto Stripe ${tag}`])).rows[0].id;
  const name = `Alumno Stripe ${tag}`;
  const student = (await pool.query(
    `INSERT INTO students (tenant_id,campus_id,nombre_completo,nombres,apellido_paterno,id_referencia)
     VALUES ($1,$2,$3,'Alumno','Stripe',$4) RETURNING id`,
    [tenant, campus, name, `SR${tag}`])).rows[0].id;
  const charge = (await pool.query(
    `INSERT INTO charges (tenant_id,student_id,concept_id,fecha_emision,fecha_vencimiento,monto_base_centavos,estado)
     VALUES ($1,$2,$3,$4,$4,12345,'pendiente') RETURNING id`,
    [tenant, student, concept, schoolDate()])).rows[0].id;
  const eventIds: number[] = [];
  const event = async (options: { wrapper?: boolean; payload?: string; status?: string; metadataCampus?: number } = {}) => {
    const pi = { id: `pi_fixture_${randomUUID().replaceAll("-", "")}`,
      amount: 12345, amount_received: 12345, currency: "mxn", status: "succeeded",
      metadata: { tenant_id: String(tenant), charge_id: String(charge),
        campus_id: String(options.metadataCampus ?? campus) } };
    const result = await pool.query(
      `INSERT INTO payment_events (tenant_id,provider,provider_event_id,payload,status,created_at)
       VALUES ($1,'stripe',$2,$3,$4,'2026-10-29 01:30:00') RETURNING id`,
      [tenant, pi.id, options.payload ?? JSON.stringify(options.wrapper ? { data: { object: pi } } : pi),
        options.status ?? "requires_review"]);
    const id = result.rows[0].id;
    eventIds.push(id);
    return { id, pi };
  };
  const snapshot = async () => (await pool.query(
    `SELECT row_to_json(c)::text AS cargo,
       (SELECT COUNT(*)::int FROM payments WHERE charge_id=c.id) AS pagos,
       (SELECT COUNT(*)::int FROM payment_applications WHERE charge_id=c.id) AS aplicaciones,
       (SELECT COUNT(*)::int FROM family_credits WHERE student_id=c.student_id) AS creditos
     FROM charges c WHERE c.id=$1`, [charge])).rows[0];
  const cleanup = async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM audit_log WHERE entity_type='payment_event' AND entity_id=ANY($1::int[]) AND tenant_id=$2", [eventIds, tenant]);
      await client.query("DELETE FROM payment_events WHERE id=ANY($1::int[]) AND tenant_id=$2", [eventIds, tenant]);
      await client.query("DELETE FROM family_credits WHERE student_id=$1", [student]);
      await client.query("DELETE FROM payment_applications WHERE charge_id=$1", [charge]);
      await client.query("DELETE FROM payments WHERE charge_id=$1", [charge]);
      await client.query("DELETE FROM charges WHERE id=$1", [charge]);
      await client.query("DELETE FROM students WHERE id=$1", [student]);
      await client.query("DELETE FROM concepts WHERE id=$1", [concept]);
      if (!scope) {
        await client.query("DELETE FROM campuses WHERE id=$1", [campus]);
        await client.query("DELETE FROM tenants WHERE id=$1", [tenant]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  return { tenant, campus, concept, student, charge, name, event, snapshot, cleanup };
}
