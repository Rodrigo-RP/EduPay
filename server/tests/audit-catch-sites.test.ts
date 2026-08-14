/**
 * Tests para los 5 sitios de .catch() → enqueueAuditLog en endpoints financieros.
 *
 * Estrategia:
 *  - En cada test se spy-ea pool.query para que el INSERT INTO audit_log lance
 *    un error, lo que dispara el mismo código que el catch handler de la ruta:
 *      pool.query(INSERT INTO audit_log …).catch(err => enqueueAuditLog(payload, err))
 *  - Se verifica que la fila aterriza en audit_retry_queue con el payload íntegro
 *    (incluyendo new_value / previous_value cuando aplica).
 *  - Se llama processAuditRetries() directamente (spy restaurado) para confirmar
 *    que el registro se recupera en audit_log con los mismos valores, no NULL.
 *
 * Sitios cubiertos:
 *  SITE-1  conciliacion.ts  — POST /api/caja/pago-efectivo   (new_value)
 *  SITE-2  guardian.ts      — POST /api/guardian/pagar lote  (previous_value + new_value)
 *  SITE-3  payments.ts      — POST /api/payments/process     (previous_value + new_value)
 *  SITE-4  charges.ts       — POST /api/admin/charges/:id/pagar-manual (solo metadata)
 *  SITE-5  admin.ts         — POST /api/admin/family-credits/:id/aplicar (new_value)
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { pool } from "../db";

import {
  initAuditRetryQueue,
  processAuditRetries,
  stopAuditRetryWorker,
  enqueueAuditLog,
  type AuditLogPayload,
} from "../audit-retry";

// ── Marcador de acción único para este suite (fácil de filtrar en cleanup) ──
const SITE_MARKER = "test_audit_catch_site";

// ── Helpers ─────────────────────────────────────────────────────────────────

let realTenantId: number;

beforeAll(async () => {

  await initAuditRetryQueue();
  stopAuditRetryWorker();
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM tenants ORDER BY id LIMIT 1"
  );
  if (!rows.length) throw new Error("No hay tenants en la DB de prueba");
  realTenantId = rows[0].id;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await pool.query(
    `DELETE FROM audit_retry_queue WHERE payload->>'action' = $1`,
    [SITE_MARKER]
  ).catch(() => {});
  await pool.query(`DELETE FROM audit_log WHERE action = $1`, [SITE_MARKER]).catch(() => {});
});

/**
 * Simula el patrón exacto del route code:
 *   pool.query(INSERT INTO audit_log …).catch(err => enqueueAuditLog(payload, err))
 *
 * Con el spy activo el INSERT lanza; el catch llama enqueueAuditLog.
 * Espera a que la fila aparezca en audit_retry_queue (fire-and-forget).
 */
async function forceAuditFailureAndEnqueue(
  payload: AuditLogPayload,
  insertSql: string,
  insertParams: unknown[]
): Promise<string> {
  // Spy: interceptar INSERT INTO audit_log y lanzar
  const orig = pool.query.bind(pool);
  vi.spyOn(pool, "query").mockImplementation(async (...args: any[]) => {
    const sql = typeof args[0] === "string" ? args[0] : ((args[0]?.text ?? "") as string);
    if (sql.trimStart().startsWith("INSERT INTO audit_log")) {
      throw new Error("Simulated audit INSERT failure (catch-site test)");
    }
    return (orig as any)(...args);
  });

  // Ejecutar el mismo patrón que la ruta
  await pool.query(insertSql, insertParams).catch((err) => enqueueAuditLog(payload, err));

  // Restaurar spy antes de consultar la DB
  vi.restoreAllMocks();

  // Sondear hasta que la fila aparezca (enqueueAuditLog es fire-and-forget)
  const POLL_MS = 50;
  const DEADLINE = Date.now() + 2_000;
  while (true) {
    const { rows } = await pool.query(
      `SELECT id FROM audit_retry_queue WHERE payload->>'action' = $1`,
      [SITE_MARKER]
    );
    if (rows.length > 0) return (rows[0] as any).id as string;
    if (Date.now() >= DEADLINE) {
      throw new Error(`Timeout esperando fila en audit_retry_queue para acción=${SITE_MARKER}`);
    }
    await new Promise<void>((r) => setTimeout(r, POLL_MS));
  }
}

/**
 * Llama a processAuditRetries() y verifica que la fila en audit_log
 * tiene los valores esperados de new_value y previous_value.
 */
async function assertRecoveredAuditLog(queueId: string, checks: {
  new_value?: Record<string, unknown>;
  previous_value?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Adelantar next_retry_at para que el worker reclame inmediatamente
  await pool.query(
    "UPDATE audit_retry_queue SET next_retry_at = NOW() WHERE id = $1", [queueId]
  );

  await processAuditRetries();

  // Verificar status de la cola
  const { rows: [qRow] } = await pool.query(
    "SELECT status FROM audit_retry_queue WHERE id = $1", [queueId]
  );
  expect(qRow.status).toBe("done");

  // Verificar el registro recuperado en audit_log
  const { rows: auditRows } = await pool.query(
    `SELECT new_value, previous_value, metadata
     FROM audit_log WHERE action = $1 AND tenant_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [SITE_MARKER, realTenantId]
  );
  expect(auditRows.length).toBeGreaterThanOrEqual(1);
  const row = auditRows[0];

  const parseCol = (v: unknown) =>
    v == null ? null : typeof v === "string" ? JSON.parse(v) : v;

  if (checks.new_value !== undefined) {
    const nv = parseCol(row.new_value);
    expect(nv).not.toBeNull();
    expect(nv).toMatchObject(checks.new_value);
  }
  if (checks.previous_value !== undefined) {
    const pv = parseCol(row.previous_value);
    expect(pv).not.toBeNull();
    expect(pv).toMatchObject(checks.previous_value);
  }
  if (checks.metadata !== undefined) {
    const meta = parseCol(row.metadata);
    expect(meta).toMatchObject(checks.metadata);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
describe("audit catch sites — enqueue + retry + recovery", () => {

  // ── SITE-1: conciliacion.ts — caja/pago-efectivo ─────────────────────────
  it("SITE-1 caja/pago-efectivo: INSERT de audit falla → encola con new_value y se recupera íntegro", async () => {
    const payload: AuditLogPayload = {
      tenant_id:   realTenantId,
      user_id:     null,
      action:      SITE_MARKER,
      entity_type: "charge",
      entity_id:   9_999_001,
      new_value:   { estado: "pagado" },
      metadata:    {
        flujo: "caja_efectivo",
        payment_id: 11111,
        monto_operador: 50000,
        monto_aplicado: 50000,
        recibido_por: "Cajero Test",
        observaciones: "Test SITE-1",
      },
    };

    const queueId = await forceAuditFailureAndEnqueue(
      payload,
      `INSERT INTO audit_log
         (tenant_id, user_id, action, entity_type, entity_id, new_value, metadata)
       VALUES ($1,$2,'${SITE_MARKER}','charge',$3,$4,$5)`,
      [
        realTenantId, null, 9_999_001,
        JSON.stringify(payload.new_value),
        JSON.stringify(payload.metadata),
      ]
    );

    // Verificar que el payload en la cola tiene new_value íntegro
    const { rows: [queueRow] } = await pool.query(
      `SELECT payload FROM audit_retry_queue WHERE id = $1`, [queueId]
    );
    const storedPayload = typeof queueRow.payload === "string"
      ? JSON.parse(queueRow.payload) : queueRow.payload;
    expect(storedPayload.new_value).toMatchObject({ estado: "pagado" });
    expect(storedPayload.metadata.flujo).toBe("caja_efectivo");

    await assertRecoveredAuditLog(queueId, {
      new_value: { estado: "pagado" },
      metadata:  { flujo: "caja_efectivo" },
    });
  });

  // ── SITE-2: guardian.ts — guardian/pagar (lote) ──────────────────────────
  it("SITE-2 guardian/pagar: INSERT de audit falla → encola con previous_value + new_value y se recupera íntegro", async () => {
    const payload: AuditLogPayload = {
      tenant_id:      realTenantId,
      user_id:        null,
      guardian_id:    null,
      action:         SITE_MARKER,
      entity_type:    "charge",
      entity_id:      9_999_002,
      previous_value: { estado: "pendiente" },
      new_value:      { estado: "pagado" },
      metadata:       { flujo: "guardian_pagar_lote", payment_id: 22222, monto_centavos: null },
    };

    const queueId = await forceAuditFailureAndEnqueue(
      payload,
      `INSERT INTO audit_log
         (tenant_id, guardian_id, action, entity_type, entity_id, previous_value, new_value, metadata)
       VALUES ($1,$2,'${SITE_MARKER}','charge',$3,$4,$5,$6)`,
      [
        realTenantId, null, 9_999_002,
        JSON.stringify(payload.previous_value),
        JSON.stringify(payload.new_value),
        JSON.stringify(payload.metadata),
      ]
    );

    // Verificar payload en cola
    const { rows: [queueRow] } = await pool.query(
      `SELECT payload FROM audit_retry_queue WHERE id = $1`, [queueId]
    );
    const storedPayload = typeof queueRow.payload === "string"
      ? JSON.parse(queueRow.payload) : queueRow.payload;
    expect(storedPayload.previous_value).toMatchObject({ estado: "pendiente" });
    expect(storedPayload.new_value).toMatchObject({ estado: "pagado" });
    expect(storedPayload.metadata.flujo).toBe("guardian_pagar_lote");

    await assertRecoveredAuditLog(queueId, {
      previous_value: { estado: "pendiente" },
      new_value:      { estado: "pagado" },
      metadata:       { flujo: "guardian_pagar_lote" },
    });
  });

  // ── SITE-3: payments.ts — payments/process ───────────────────────────────
  it("SITE-3 payments/process: INSERT de audit falla → encola con previous_value + new_value y se recupera íntegro", async () => {
    // guardian_id: null — mismo razonamiento que SITE-2: el test verifica la
    // preservación de previous_value/new_value, no la FK de guardian.
    const payload: AuditLogPayload = {
      tenant_id:      realTenantId,
      user_id:        null,
      guardian_id:    null,
      action:         SITE_MARKER,
      entity_type:    "charge",
      entity_id:      9_999_003,
      previous_value: { estado: "pendiente" },
      new_value:      { estado: "pagado" },
      metadata:       { flujo: "guardian_pago", payment_id: 33333 },
    };

    const queueId = await forceAuditFailureAndEnqueue(
      payload,
      `INSERT INTO audit_log
         (tenant_id, guardian_id, action, entity_type, entity_id, previous_value, new_value, metadata)
       VALUES ($1,$2,'${SITE_MARKER}','charge',$3,$4,$5,$6)`,
      [
        realTenantId, null, 9_999_003,
        JSON.stringify(payload.previous_value),
        JSON.stringify(payload.new_value),
        JSON.stringify(payload.metadata),
      ]
    );

    const { rows: [queueRow] } = await pool.query(
      `SELECT payload FROM audit_retry_queue WHERE id = $1`, [queueId]
    );
    const storedPayload = typeof queueRow.payload === "string"
      ? JSON.parse(queueRow.payload) : queueRow.payload;
    expect(storedPayload.previous_value).toMatchObject({ estado: "pendiente" });
    expect(storedPayload.new_value).toMatchObject({ estado: "pagado" });
    expect(storedPayload.metadata.flujo).toBe("guardian_pago");

    await assertRecoveredAuditLog(queueId, {
      previous_value: { estado: "pendiente" },
      new_value:      { estado: "pagado" },
      metadata:       { flujo: "guardian_pago" },
    });
  });

  // ── SITE-4: charges.ts — pagar-manual ────────────────────────────────────
  it("SITE-4 pagar-manual: INSERT de audit falla → encola payload completo (solo metadata) y se recupera íntegro", async () => {
    const payload: AuditLogPayload = {
      tenant_id:   realTenantId,
      user_id:     null,
      action:      SITE_MARKER,
      entity_type: "charge",
      entity_id:   9_999_004,
      metadata:    {
        payment_id: 44444,
        metodo: "transferencia",
        saldo_centavos: 75000,
        observaciones: "Pago manual admin test SITE-4",
      },
    };

    const queueId = await forceAuditFailureAndEnqueue(
      payload,
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,'${SITE_MARKER}','charge',$3,$4)`,
      [
        realTenantId, null, 9_999_004,
        JSON.stringify(payload.metadata),
      ]
    );

    const { rows: [queueRow] } = await pool.query(
      `SELECT payload FROM audit_retry_queue WHERE id = $1`, [queueId]
    );
    const storedPayload = typeof queueRow.payload === "string"
      ? JSON.parse(queueRow.payload) : queueRow.payload;
    expect(storedPayload.metadata.metodo).toBe("transferencia");
    expect(storedPayload.metadata.saldo_centavos).toBe(75000);
    // new_value y previous_value ausentes — así es el sitio SITE-4
    expect(storedPayload.new_value).toBeUndefined();
    expect(storedPayload.previous_value).toBeUndefined();

    await assertRecoveredAuditLog(queueId, {
      metadata: { metodo: "transferencia", saldo_centavos: 75000 },
    });
  });

  // ── SITE-5: admin.ts — family-credits/:id/aplicar ────────────────────────
  it("SITE-5 family-credits/aplicar: INSERT de audit falla → encola con new_value y se recupera íntegro", async () => {
    const payload: AuditLogPayload = {
      tenant_id:   realTenantId,
      user_id:     null,
      action:      SITE_MARKER,
      entity_type: "family_credit",
      entity_id:   9_999_005,
      new_value:   { status: "consumido", monto_aplicado: 50000 },
      metadata:    {
        charge_id: 55555,
        payment_application_id: 66666,
        charge_nuevo_estado: "pagado",
        remanente_centavos: 0,
        nuevo_credit_id: null,
      },
    };

    const queueId = await forceAuditFailureAndEnqueue(
      payload,
      `INSERT INTO audit_log
         (tenant_id, user_id, action, entity_type, entity_id, new_value, metadata)
       VALUES ($1,$2,'${SITE_MARKER}','family_credit',$3,$4,$5)`,
      [
        realTenantId, null, 9_999_005,
        JSON.stringify(payload.new_value),
        JSON.stringify(payload.metadata),
      ]
    );

    const { rows: [queueRow] } = await pool.query(
      `SELECT payload FROM audit_retry_queue WHERE id = $1`, [queueId]
    );
    const storedPayload = typeof queueRow.payload === "string"
      ? JSON.parse(queueRow.payload) : queueRow.payload;
    expect(storedPayload.new_value).toMatchObject({ status: "consumido", monto_aplicado: 50000 });
    expect(storedPayload.metadata.charge_nuevo_estado).toBe("pagado");

    await assertRecoveredAuditLog(queueId, {
      new_value: { status: "consumido", monto_aplicado: 50000 },
      metadata:  { charge_nuevo_estado: "pagado" },
    });
  });
});
