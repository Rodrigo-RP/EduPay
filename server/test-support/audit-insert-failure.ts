import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { expect, vi } from "vitest";
import { pool } from "../db";
import { processAuditRetries, stopAuditRetryWorker, type AuditLogPayload } from "../audit-retry";
import { registerConciliacionRoutes } from "../routes/conciliacion";

/**
 * Servidor privado del test con las rutas y autenticación reales.
 * No registra bypasses HTTP ni cambia el servidor de la aplicación.
 */
export async function resolveWithFailedAudit(
  txId: number, token: string, body: object,
): Promise<{ status: number; body: { message?: string; payment_id?: number }; failures: number }> {
  stopAuditRetryWorker();
  const app = express();
  app.use(express.json());
  registerConciliacionRoutes(app);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de prueba sin puerto");
  const original = pool.query.bind(pool);
  let failures = 0;
  const spy = vi.spyOn(pool, "query").mockImplementation((...args: Parameters<typeof pool.query>) => {
    if (typeof args[0] === "string" && /^\s*INSERT INTO audit_log\b/i.test(args[0])) {
      failures++;
      return Promise.reject(new Error("Falla de audit_log simulada con actor válido"));
    }
    return original(...args);
  });
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/conciliacion/excepciones/${txId}/resolver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), failures };
  } finally {
    spy.mockRestore();
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
  }
}

/** Espera la cola durable, procesa dos veces y exige una sola auditoría. */
export async function assertAuditRecoveredOnce(expected: AuditLogPayload): Promise<void> {
  const params = [expected.tenant_id, expected.entity_id, expected.action];
  const queuedSql = `SELECT id, payload, status, last_error FROM audit_retry_queue
    WHERE (payload->>'tenant_id')::int = $1
      AND (payload->>'entity_id')::int = $2 AND payload->>'action' = $3`;
  const auditSql = `SELECT user_id, metadata::text AS meta_text FROM audit_log
    WHERE tenant_id = $1 AND entity_id = $2 AND action = $3`;
  await vi.waitFor(async () => {
    const queued = await pool.query<{ id: string; payload: AuditLogPayload; status: string; last_error: string }>(queuedSql, params);
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0].status).toBe("pending");
    expect(queued.rows[0].last_error).toContain("Falla de audit_log simulada");
    expect(queued.rows[0].payload).toMatchObject(expected);
  }, { timeout: 5000, interval: 50 });
  expect((await pool.query(auditSql, params)).rows).toHaveLength(0);
  await processAuditRetries();
  await processAuditRetries();
  const queued = await pool.query(queuedSql, params);
  expect(queued.rows).toHaveLength(1);
  expect(queued.rows[0].status).toBe("done");
  const audit = await pool.query<{ user_id: number; meta_text: string }>(auditSql, params);
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].user_id).toBe(expected.user_id);
  expect(JSON.parse(audit.rows[0].meta_text)).toMatchObject(expected.metadata);
}
