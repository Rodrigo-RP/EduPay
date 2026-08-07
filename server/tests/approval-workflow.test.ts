/**
 * TESTS — Approval Workflow: entity_id y tenant_id reales
 *
 * Verifica que POST /api/approvals/request:
 *   - Captura el entity_id real desde proposed_value (no 1 hardcodeado)
 *   - Guarda el tenant_id del solicitante (no null)
 *   - Rechaza entity_id inventados (payment no existe en la DB) → 422
 *   - Rechaza entity_id de otro tenant (aislamiento cross-tenant) → 422
 *
 * AWF-01: Ciclo completo — payment real (exitoso) → solicitar refund_payment →
 *         aprobar como admin_general → verificar estado='reversado' en la DB.
 * AWF-02: entity_id inventado → 422 (no existe en la DB).
 * AWF-03: entity_id de tenantA solicitado desde JWT con tenantB → 422.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId:    number;
let campusId:    number;
let studentId:   number;
let conceptId:   number;
let chargeId:    number;
let paymentId:   number;  // estado='exitoso', pertenece a tenantId

// Usuarios reales en DB (FK en approval_workflow_logs.user_id es NOT NULL)
let requesterId: number;  // auxiliar_contable — puede solicitar
let approverId:  number;  // administrador_general — puede aprobar

let requesterToken: string;
let approverToken:  string;

// IDs de registros creados durante los tests (para cleanup)
const createdApprovalIds: number[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function apiFetch(
  method: "GET" | "POST",
  path: string,
  token: string,
  body?: object,
) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now();

  // Tenant y campus propios del test
  const tenantRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`AWF Test Tenant ${ts}`, `AWF${ts}`.slice(0, 13)]
  );
  tenantId = tenantRow.rows[0].id;

  const campusRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1, $2) RETURNING id`,
    ["Campus AWF", tenantId]
  );
  campusId = campusRow.rows[0].id;

  // Usuarios reales (necesarios por FK NOT NULL en approval_workflow_logs.user_id)
  const reqRow = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role)
     VALUES ($1, $2, 'AWF Requester', $3,
             '$2b$10$fakehashfortestonly000000000000000', 'auxiliar_contable')
     RETURNING id`,
    [tenantId, campusId, `awf-req-${ts}@test.com`]
  );
  requesterId = reqRow.rows[0].id;

  const aprRow = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role)
     VALUES ($1, $2, 'AWF Approver', $3,
             '$2b$10$fakehashfortestonly000000000000000', 'administrador_general')
     RETURNING id`,
    [tenantId, campusId, `awf-apr-${ts}@test.com`]
  );
  approverId = aprRow.rows[0].id;

  // JWT — incluyen 'id' real para FK en approval_workflow_logs
  requesterToken = jwt.sign(
    { id: requesterId, email: "awf-requester@test.com", role: "auxiliar_contable",
      campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  approverToken = jwt.sign(
    { id: approverId,  email: "awf-approver@test.com",  role: "administrador_general",
      campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Alumno y concepto para los cargos
  const stuRow = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                           nombre_completo, grado, grupo, id_referencia)
     VALUES ($1, $2, 'AWF', 'Alumno', $3, '1', 'A', $4) RETURNING id`,
    [tenantId, campusId, `AWF Alumno ${ts}`, `AWF-${ts}`]
  );
  studentId = stuRow.rows[0].id;

  const concRow = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'Colegiatura AWF', 'colegiatura', 'mensual', 150000) RETURNING id`,
    [tenantId, campusId]
  );
  conceptId = concRow.rows[0].id;

  // Cargo pendiente
  const chRow = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
                          monto_base_centavos, estado)
     VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + 30, 150000, 'pendiente') RETURNING id`,
    [tenantId, studentId, conceptId]
  );
  chargeId = chRow.rows[0].id;

  // Payment en estado 'exitoso' (condición para refund_payment)
  const payRow = await pool.query(
    `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, estado)
     VALUES ($1, $2, 'efectivo', 150000, 'exitoso') RETURNING id`,
    [tenantId, chargeId]
  );
  paymentId = payRow.rows[0].id;
});

afterAll(async () => {
  // Limpiar en orden respetando FKs
  if (createdApprovalIds.length > 0) {
    await pool.query(
      `DELETE FROM approval_workflow_logs WHERE approval_id = ANY($1::int[])`,
      [createdApprovalIds]
    );
    await pool.query(
      `DELETE FROM approval_notifications WHERE approval_id = ANY($1::int[])`,
      [createdApprovalIds]
    );
    await pool.query(
      `DELETE FROM pending_approvals WHERE id = ANY($1::int[])`,
      [createdApprovalIds]
    );
  }
  // Entidades del test (orden inverso al de creación)
  await pool.query(`DELETE FROM payments  WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges   WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM concepts  WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM students  WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM users     WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses  WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants   WHERE id        = $1`, [tenantId]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Approval Workflow — entity_id y tenant_id reales", () => {

  // ── AWF-01 ───────────────────────────────────────────────────────────────
  it("AWF-01: ciclo completo — payment real → solicitar refund → aprobar → estado='reversado'", async () => {
    // Paso 1: auxiliar_contable solicita refund_payment sobre el paymentId real
    const reqRes = await apiFetch(
      "POST", "/api/approvals/request",
      requesterToken,
      {
        action_type:       "refund_payment",
        action_description:"Reembolso de pago por error en importe",
        proposed_value:    { payment_id: paymentId },
        current_value:     { estado: "exitoso" },
        reason:            "El tutor pagó un monto incorrecto y solicita devolución",
      }
    );
    expect(reqRes.status).toBe(200);
    expect(typeof reqRes.body.approval_id).toBe("number");

    const approvalId = reqRes.body.approval_id as number;
    createdApprovalIds.push(approvalId);

    // Verificar que la solicitud tiene los valores correctos en la DB
    const approvalRow = await pool.query(
      `SELECT entity_id, entity_type, tenant_id, status
       FROM pending_approvals WHERE id = $1`,
      [approvalId]
    );
    expect(approvalRow.rows).toHaveLength(1);
    const saved = approvalRow.rows[0];
    expect(saved.entity_id).toBe(paymentId);      // ← era 1 hardcodeado
    expect(saved.entity_type).toBe("payment");    // ← era 'approval' hardcodeado
    expect(Number(saved.tenant_id)).toBe(tenantId); // ← era null
    expect(saved.status).toBe("pending");

    // Paso 2: admin_general aprueba la solicitud
    const decRes = await apiFetch(
      "POST", "/api/approvals/decision",
      approverToken,
      {
        approval_id: approvalId,
        decision:    "approved",
        notes:       "Reembolso autorizado según verificación de tesorería",
      }
    );
    expect(decRes.status).toBe(200);
    expect(decRes.body.decision).toBe("approved");

    // Paso 3: verificar que executeApprovedChange actuó sobre el payment CORRECTO
    const pmtRow = await pool.query(
      `SELECT estado FROM payments WHERE id = $1`,
      [paymentId]
    );
    expect(pmtRow.rows[0].estado).toBe("reversado");

    // El payment con ID=1 (el hardcodeado anterior) no debe haber sido tocado
    // (si existe; comprobamos que paymentId real fue el objetivo)
    const idOneRow = await pool.query(
      `SELECT id FROM payments WHERE id = 1 AND tenant_id = $1`,
      [tenantId]
    );
    // No puede existir un payment con id=1 Y tenant_id=tenantId (son de otro tenant)
    expect(idOneRow.rows).toHaveLength(0);
  });

  // ── AWF-02 ───────────────────────────────────────────────────────────────
  it("AWF-02: payment_id inventado que no existe en la DB → 422, no se crea la solicitud", async () => {
    const fakePaymentId = 9_999_999;

    const res = await apiFetch(
      "POST", "/api/approvals/request",
      requesterToken,
      {
        action_type:       "refund_payment",
        action_description:"Reembolso de pago inexistente",
        proposed_value:    { payment_id: fakePaymentId },
        current_value:     {},
        reason:            "Prueba de validación de entity_id",
      }
    );
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/payment.*9999999|no existe/i);

    // Confirmar que NO se creó ninguna solicitud pendiente con ese entity_id
    const approvalCount = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM pending_approvals
       WHERE tenant_id = $1 AND entity_id = $2`,
      [tenantId, fakePaymentId]
    );
    expect(approvalCount.rows[0].cnt).toBe(0);
  });

  // ── AWF-03 ───────────────────────────────────────────────────────────────
  it("AWF-03: entity_id de tenantA solicitado desde JWT con tenantB → 422 (aislamiento cross-tenant)", async () => {
    // JWT con tenant_id diferente al tenant del payment — simula un usuario de otro tenant
    const wrongTenantId = tenantId + 99_999;
    const crossTenantToken = jwt.sign(
      { id: requesterId, email: "awf-cross@test.com", role: "auxiliar_contable",
        campus_id: campusId, tenant_id: wrongTenantId },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await apiFetch(
      "POST", "/api/approvals/request",
      crossTenantToken,
      {
        action_type:       "refund_payment",
        action_description:"Intento cross-tenant de reembolso",
        proposed_value:    { payment_id: paymentId },  // payment pertenece a tenantId, no a wrongTenantId
        current_value:     {},
        reason:            "Prueba de aislamiento cross-tenant",
      }
    );
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/no existe|no pertenece/i);

    // No se creó solicitud en el tenant incorrecto
    const approvalCount = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM pending_approvals
       WHERE tenant_id = $1 AND entity_id = $2`,
      [wrongTenantId, paymentId]
    );
    expect(approvalCount.rows[0].cnt).toBe(0);
  });

  // ── AWF-04 ───────────────────────────────────────────────────────────────
  it("AWF-04: proposed_value sin payment_id (campo requerido ausente) → 422", async () => {
    const res = await apiFetch(
      "POST", "/api/approvals/request",
      requesterToken,
      {
        action_type:       "refund_payment",
        action_description:"Solicitud sin entity_id",
        proposed_value:    { motivo: "sin id" },  // ← no incluye payment_id
        current_value:     {},
        reason:            "Prueba de campo faltante",
      }
    );
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/payment_id.*requerido|requerido/i);
  });

  // ── AWF-05 ───────────────────────────────────────────────────────────────
  it("AWF-05: tenant_id se guarda correctamente en solicitudes de charge (modify_charge_amount)", async () => {
    const reqRes = await apiFetch(
      "POST", "/api/approvals/request",
      requesterToken,
      {
        action_type:       "modify_charge_amount",
        action_description:"Reducir monto del cargo por error de captura",
        proposed_value:    { charge_id: chargeId, amount: 120000 },
        current_value:     { amount: 150000 },
        reason:            "El cargo original tenía un monto incorrecto ingresado por error",
      }
    );
    expect(reqRes.status).toBe(200);
    const approvalId = reqRes.body.approval_id as number;
    createdApprovalIds.push(approvalId);

    const row = await pool.query(
      `SELECT entity_id, entity_type, tenant_id FROM pending_approvals WHERE id = $1`,
      [approvalId]
    );
    expect(row.rows[0].entity_id).toBe(chargeId);
    expect(row.rows[0].entity_type).toBe("charge");
    expect(Number(row.rows[0].tenant_id)).toBe(tenantId);
  });

});
