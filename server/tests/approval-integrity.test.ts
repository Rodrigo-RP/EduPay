/**
 * TESTS — Integridad del flujo de aprobaciones (paquete P5 de docs/qa/plan-correcciones-2026-11.md)
 *
 * AIN-01: una solicitud rechazada no puede aprobarse después (409) y su estado no cambia.
 * AIN-02: dos aprobaciones simultáneas: una responde 200 y la otra 409; el cambio se aplica una sola vez.
 * AIN-03: aprobar el borrado de un cargo con pagos falla con 409, no borra nada, la solicitud sigue pendiente
 *         y la bitácora registra el fallo (antes: respondía éxito y borraba el cargo con sus pagos).
 * AIN-04: la bitácora de una solicitud solo la ven el solicitante, la administración general de su escuela y el superadmin.
 * AIN-05: solo el destinatario puede marcar como leída una notificación.
 *
 * Requiere el servidor en localhost:5000, como el resto de pruebas de este directorio.
 */
import { SCHOOL_TODAY_SQL } from "../../shared/school-date";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "../test-support/session-jwt";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";
const ts = Date.now();

let tenantId: number, campusId: number, studentId: number, conceptId: number;
let tenantBId: number, campusBId: number;
let requesterId: number, approverId: number, outsiderId: number, approverBId: number;
const tokens: Record<string, string> = {};
const approvalIds: number[] = [];

async function api(method: "GET" | "POST", path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function user(tenant: number, campus: number, role: string, tag: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, '$2b$10$fakehashfortestonly000000000000000', $5) RETURNING id`,
    [tenant, campus, `AIN ${tag}`, `ain-${tag}-${ts}@test.com`, role],
  );
  return r.rows[0].id;
}
const tokenFor = (id: number, role: string, tenant: number, campus: number) =>
  jwt.sign({ id, email: `ain-${id}@test.com`, role, campus_id: campus, tenant_id: tenant }, JWT_SECRET, { expiresIn: "1h" });

async function charge(monto = 100000): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
     VALUES ($1, $2, $3, ${SCHOOL_TODAY_SQL}, ${SCHOOL_TODAY_SQL} + 30, $4, 'pendiente') RETURNING id`,
    [tenantId, studentId, conceptId, monto],
  );
  return r.rows[0].id;
}
async function solicitud(action: string, entityType: string, entityId: number, data: object = {}): Promise<number> {
  const r = await pool.query(
    `INSERT INTO pending_approvals (tenant_id, campus_id, action_type, action_description, requested_by, status, reason, requested_data, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, 'pending', 'AIN', $6::jsonb, $7, $8) RETURNING id`,
    [tenantId, campusId, action, `AIN ${action}`, requesterId, JSON.stringify(data), entityType, entityId],
  );
  approvalIds.push(r.rows[0].id);
  return r.rows[0].id;
}

beforeAll(async () => {
  tenantId = (await pool.query(`INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`, [`AIN Tenant ${ts}`, `AIN${ts}`.slice(0, 13)])).rows[0].id;
  campusId = (await pool.query(`INSERT INTO campuses (nombre, tenant_id) VALUES ('Campus AIN', $1) RETURNING id`, [tenantId])).rows[0].id;
  tenantBId = (await pool.query(`INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`, [`AIN TenantB ${ts}`, `AIB${ts}`.slice(0, 13)])).rows[0].id;
  campusBId = (await pool.query(`INSERT INTO campuses (nombre, tenant_id) VALUES ('Campus AIN-B', $1) RETURNING id`, [tenantBId])).rows[0].id;

  requesterId = await user(tenantId, campusId, "auxiliar_contable", "req");
  approverId = await user(tenantId, campusId, "administrador_general", "apr");
  outsiderId = await user(tenantId, campusId, "asistente", "out");
  approverBId = await user(tenantBId, campusBId, "administrador_general", "aprb");
  tokens.requester = tokenFor(requesterId, "auxiliar_contable", tenantId, campusId);
  tokens.approver = tokenFor(approverId, "administrador_general", tenantId, campusId);
  tokens.outsider = tokenFor(outsiderId, "asistente", tenantId, campusId);
  tokens.approverB = tokenFor(approverBId, "administrador_general", tenantBId, campusBId);

  studentId = (await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, grado, grupo, id_referencia)
     VALUES ($1, $2, 'AIN', 'Alumno', $3, '1', 'A', $4) RETURNING id`,
    [tenantId, campusId, `AIN Alumno ${ts}`, `AIN-${ts}`],
  )).rows[0].id;
  conceptId = (await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'Colegiatura AIN', 'colegiatura', 'mensual', 100000) RETURNING id`,
    [tenantId, campusId],
  )).rows[0].id;
});

afterAll(async () => {
  if (approvalIds.length) {
    await pool.query(`DELETE FROM approval_workflow_logs WHERE approval_id = ANY($1::int[])`, [approvalIds]);
    await pool.query(`DELETE FROM approval_notifications WHERE approval_id = ANY($1::int[])`, [approvalIds]);
    await pool.query(`DELETE FROM pending_approvals WHERE id = ANY($1::int[])`, [approvalIds]);
  }
  await pool.query(`DELETE FROM payment_applications WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id = $1)`, [tenantId]);
  await pool.query(`DELETE FROM payments WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM concepts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]);
  for (const t of [tenantId, tenantBId]) {
    await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [t]);
    await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [t]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [t]);
  }
});

const estadoSolicitud = async (id: number) => (await pool.query(`SELECT status FROM pending_approvals WHERE id = $1`, [id])).rows[0].status as string;

describe("Aprobaciones — integridad de la decisión y de la ejecución", () => {
  it("AIN-01: una solicitud rechazada no puede aprobarse después", async () => {
    const c = await charge();
    const id = await solicitud("modify_charge_amount", "charge", c, { amount: 77777 });
    const rej = await api("POST", "/api/approvals/decision", tokens.approver, { approval_id: id, decision: "rejected" });
    expect(rej.status).toBe(200);
    const apr = await api("POST", "/api/approvals/decision", tokens.approver, { approval_id: id, decision: "approved" });
    expect(apr.status).toBe(409);
    expect(apr.body.code).toBe("APPROVAL_ALREADY_DECIDED");
    expect(await estadoSolicitud(id)).toBe("rejected");
    const monto = (await pool.query(`SELECT monto_base_centavos FROM charges WHERE id = $1`, [c])).rows[0].monto_base_centavos;
    expect(Number(monto)).toBe(100000); // el cambio nunca se ejecutó
  });

  it("AIN-02: dos aprobaciones simultáneas: una gana y la otra recibe 409", async () => {
    const c = await charge();
    const id = await solicitud("modify_charge_amount", "charge", c, { amount: 55555 });
    const [a, b] = await Promise.all([
      api("POST", "/api/approvals/decision", tokens.approver, { approval_id: id, decision: "approved" }),
      api("POST", "/api/approvals/decision", tokens.approver, { approval_id: id, decision: "approved" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await estadoSolicitud(id)).toBe("approved");
    const aplicados = (await pool.query(
      `SELECT count(*)::int AS n FROM approval_workflow_logs WHERE approval_id = $1 AND action = 'changes_applied'`, [id])).rows[0].n;
    expect(aplicados).toBe(1);
  });

  it("AIN-03: aprobar el borrado de un cargo con pagos falla, no borra nada y la solicitud sigue pendiente", async () => {
    const c = await charge();
    const p = await pool.query(
      `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, estado) VALUES ($1, $2, 'efectivo', 30000, 'exitoso') RETURNING id`, [tenantId, c]);
    await pool.query(`INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at) VALUES ($1, $2, 30000, NOW())`, [p.rows[0].id, c]);
    const id = await solicitud("delete_charge", "charge", c);
    const r = await api("POST", "/api/approvals/decision", tokens.approver, { approval_id: id, decision: "approved" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("APPROVAL_EXECUTION_FAILED");
    expect((await pool.query(`SELECT count(*)::int AS n FROM charges WHERE id = $1`, [c])).rows[0].n).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM payments WHERE charge_id = $1`, [c])).rows[0].n).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM payment_applications WHERE charge_id = $1`, [c])).rows[0].n).toBe(1);
    expect(await estadoSolicitud(id)).toBe("pending");
    const acciones = (await pool.query(`SELECT action FROM approval_workflow_logs WHERE approval_id = $1`, [id])).rows.map((x) => x.action);
    expect(acciones).toContain("execution_failed");
    expect(acciones).not.toContain("changes_applied");
  });

  it("AIN-04: la bitácora solo la ven el solicitante, la administración general de la escuela y el superadmin", async () => {
    const id = await solicitud("modify_charge_amount", "charge", await charge(), { amount: 1 });
    expect((await api("GET", `/api/approvals/logs/${id}`, tokens.requester)).status).toBe(200);
    expect((await api("GET", `/api/approvals/logs/${id}`, tokens.approver)).status).toBe(200);
    expect((await api("GET", `/api/approvals/logs/${id}`, tokens.outsider)).status).toBe(403);
    expect((await api("GET", `/api/approvals/logs/${id}`, tokens.approverB)).status).toBe(403);
    expect((await api("GET", `/api/approvals/logs/abc`, tokens.approver)).status).toBe(400);
    expect((await api("GET", `/api/approvals/logs/999999999`, tokens.approver)).status).toBe(404);
  });

  it("AIN-05: solo el destinatario puede marcar como leída una notificación", async () => {
    const id = await solicitud("modify_charge_amount", "charge", await charge(), { amount: 1 });
    const n = await pool.query(
      `INSERT INTO approval_notifications (approval_id, recipient_id, notification_type, title, message)
       VALUES ($1, $2, 'approval_granted', 'AIN', 'AIN') RETURNING id`, [id, requesterId]);
    const nid: number = n.rows[0].id;
    const ajeno = await api("POST", `/api/approvals/notifications/${nid}/read`, tokens.outsider);
    expect(ajeno.status).toBe(404);
    expect((await pool.query(`SELECT is_read FROM approval_notifications WHERE id = $1`, [nid])).rows[0].is_read).toBe(false);
    expect((await api("POST", `/api/approvals/notifications/abc/read`, tokens.requester)).status).toBe(400);
    const propio = await api("POST", `/api/approvals/notifications/${nid}/read`, tokens.requester);
    expect(propio.status).toBe(200);
    expect((await pool.query(`SELECT is_read FROM approval_notifications WHERE id = $1`, [nid])).rows[0].is_read).toBe(true);
  });
});
