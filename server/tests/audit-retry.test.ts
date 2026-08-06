/**
 * Tests dedicados para server/audit-retry.ts
 *
 * Cubren tres escenarios de la cola de reintentos:
 *
 *  1. INSERT en audit_log falla UNA vez → se recupera en el segundo reintento:
 *     el registro termina insertado en audit_log y el status de la cola queda 'done'.
 *
 *  2. INSERT en audit_log falla las 3 veces (max_attempts agotados) → status='dead'
 *     y se emite log de nivel ERROR con el payload completo.
 *
 *  3. Doble falla: audit_log Y audit_retry_queue fallan → se emite la alerta
 *     adicional de nivel ERROR con el error original y el error de cola.
 *
 * Estrategia:
 *  - processAuditRetries() se llama directamente (sin depender del setInterval del worker).
 *  - vi.spyOn(pool, 'query') intercepta sólo los INSERT INTO audit_log que el worker
 *    intenta, y pasa el resto al pool real (UPDATE de claims, UPDATE de estado, SELECT).
 *  - vi.spyOn(auditLogger, 'error/warn') verifica los mensajes emitidos.
 *  - afterEach limpia filas de test y restaura todos los mocks.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { pool } from "../db";
import {
  initAuditRetryQueue,
  processAuditRetries,
  enqueueAuditLog,
  auditLogger,
  type AuditLogPayload,
} from "../audit-retry";

// ── Payload base de prueba ─────────────────────────────────────────────────────
// user_id: null  → permitido por el schema (onDelete: set null); no genera FK violation.
// entity_id: 9_999_999 → imposible en producción, fácil de filtrar en cleanup.
const MARKER_ACTION = "test_audit_retry_unit";

const makePayload = (tenantId: number): AuditLogPayload => ({
  tenant_id: tenantId,
  user_id: null,
  action: MARKER_ACTION,
  entity_type: "bank_transaction",
  entity_id: 9_999_999,
  metadata: { test: true, suite: "audit-retry.test.ts" },
});

describe("audit-retry — cola de reintentos", () => {
  let realTenantId: number;

  beforeAll(async () => {
    // Asegurar que la tabla existe
    await initAuditRetryQueue();
    // Obtener un tenant_id real para que el FK de audit_log.tenant_id no falle
    const { rows } = await pool.query<{ id: number }>(
      "SELECT id FROM tenants ORDER BY id LIMIT 1"
    );
    if (!rows.length) throw new Error("No hay tenants en la DB de prueba");
    realTenantId = rows[0].id;
  });

  afterEach(async () => {
    // 1. Restaurar todos los spies antes de las queries de limpieza
    vi.restoreAllMocks();
    // 2. Limpiar filas de test (queue y audit_log)
    await pool
      .query(
        `DELETE FROM audit_retry_queue WHERE payload->>'action' = $1`,
        [MARKER_ACTION]
      )
      .catch(() => {});
    await pool
      .query(`DELETE FROM audit_log WHERE action = $1`, [MARKER_ACTION])
      .catch(() => {});
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1 — Falla una vez, se recupera en el segundo reintento
  // ═══════════════════════════════════════════════════════════════════════════
  it(
    "TEST 1 — falla una vez y se recupera: status='done' y audit_log tiene el registro",
    async () => {
      const payload = makePayload(realTenantId);

      // ── Insertar fila directamente en la cola (simula lo que haría enqueueAuditLog)
      const {
        rows: [qRow],
      } = await pool.query<{ id: string }>(
        `INSERT INTO audit_retry_queue (payload, attempts, next_retry_at)
         VALUES ($1::jsonb, 0, NOW())
         RETURNING id`,
        [JSON.stringify(payload)]
      );
      const queueId = qRow.id;

      // ── Spy: primer INSERT INTO audit_log → falla; segundo → pasa al pool real
      let auditInsertCalls = 0;
      const orig = pool.query.bind(pool);

      vi.spyOn(pool, "query").mockImplementation(async (...args: any[]) => {
        const sql =
          typeof args[0] === "string"
            ? args[0]
            : ((args[0]?.text ?? "") as string);
        if (sql.trimStart().startsWith("INSERT INTO audit_log")) {
          auditInsertCalls++;
          if (auditInsertCalls === 1) {
            throw new Error("Simulated first-attempt failure (audit_log)");
          }
          // Segundo intento: dejar pasar al pool real
          return (orig as any)(...args);
        }
        return (orig as any)(...args);
      });

      // ── CICLO 1: debe fallar el INSERT y mantener la fila en pending
      await processAuditRetries();

      const {
        rows: [after1],
      } = await pool.query(
        "SELECT status, attempts FROM audit_retry_queue WHERE id = $1",
        [queueId]
      );
      expect(after1.status).toBe("pending");
      expect(Number(after1.attempts)).toBe(1);

      // ── Adelantar next_retry_at para que el worker vuelva a reclamar la fila
      //    (en producción esperaría 5 min; en el test forzamos NOW())
      await pool.query(
        "UPDATE audit_retry_queue SET next_retry_at = NOW() WHERE id = $1",
        [queueId]
      );

      // ── CICLO 2: debe tener éxito
      await processAuditRetries();

      const {
        rows: [after2],
      } = await pool.query(
        "SELECT status, attempts FROM audit_retry_queue WHERE id = $1",
        [queueId]
      );
      expect(after2.status).toBe("done");
      expect(Number(after2.attempts)).toBe(2);

      // El worker intentó exactamente 2 veces (1 fallo + 1 éxito)
      expect(auditInsertCalls).toBe(2);

      // La fila en audit_log existe (el segundo INSERT llegó a la DB real)
      const {
        rows: auditRows,
      } = await pool.query(
        "SELECT id FROM audit_log WHERE action = $1 AND entity_id = 9999999",
        [MARKER_ACTION]
      );
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2 — Falla las 3 veces → status='dead' + log ERROR con payload completo
  // ═══════════════════════════════════════════════════════════════════════════
  it(
    "TEST 2 — falla 3 veces: status='dead' y auditLogger.error recibe el payload completo",
    async () => {
      const payload = makePayload(realTenantId);

      // Insertar con attempts=2 (ya tiene 2 intentos fallidos previos)
      // El próximo ciclo lo incrementará a 3 = MAX_ATTEMPTS → dead letter
      const {
        rows: [qRow],
      } = await pool.query<{ id: string }>(
        `INSERT INTO audit_retry_queue (payload, attempts, last_error, next_retry_at)
         VALUES ($1::jsonb, 2, 'Previous failures', NOW())
         RETURNING id`,
        [JSON.stringify(payload)]
      );
      const queueId = qRow.id;

      // ── Spy: todos los INSERT INTO audit_log fallan
      const orig = pool.query.bind(pool);
      vi.spyOn(pool, "query").mockImplementation(async (...args: any[]) => {
        const sql =
          typeof args[0] === "string"
            ? args[0]
            : ((args[0]?.text ?? "") as string);
        if (sql.trimStart().startsWith("INSERT INTO audit_log")) {
          throw new Error("Simulated persistent failure — dead letter test");
        }
        return (orig as any)(...args);
      });

      // ── Spy en auditLogger.error para verificar el mensaje
      const errorSpy = vi.spyOn(auditLogger, "error");

      // ── Ciclo del worker: attempts pasa de 2 → 3 = MAX_ATTEMPTS → dead letter
      await processAuditRetries();

      // ── La fila debe estar en 'dead'
      const {
        rows: [afterDead],
      } = await pool.query(
        "SELECT status, attempts, last_error FROM audit_retry_queue WHERE id = $1",
        [queueId]
      );
      expect(afterDead.status).toBe("dead");
      expect(Number(afterDead.attempts)).toBe(3);
      expect(afterDead.last_error).toMatch(/persistent failure/);

      // ── El log ERROR debe haberse emitido
      const errorCalls = errorSpy.mock.calls;
      const deadLetterCall = errorCalls.find(([msg]: any[]) =>
        typeof msg === "string" &&
        msg.includes("permanentemente sin registrar")
      );
      expect(deadLetterCall).toBeDefined();

      // ── El payload completo debe estar en el metadata del log
      const meta = deadLetterCall![1] as Record<string, unknown>;
      expect(meta.action).toBe(payload.action);
      expect(meta.entity_type).toBe(payload.entity_type);
      expect(meta.entity_id).toBe(payload.entity_id);
      expect(meta.tenant_id).toBe(payload.tenant_id);
      expect(meta.user_id).toBeNull();
      expect(meta.queue_id).toBe(queueId);
      expect(meta.attempts).toBe(3);
      expect(String(meta.last_error)).toMatch(/persistent failure/);
      // metadata del payload también debe estar presente
      expect(meta.metadata).toMatchObject({ test: true });
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3 — Doble falla: audit_log Y audit_retry_queue fallan
  // ═══════════════════════════════════════════════════════════════════════════
  it(
    "TEST 3 — doble falla: si audit_retry_queue también falla, auditLogger.error emite la alerta adicional con ambos errores",
    async () => {
      const payload = makePayload(realTenantId);

      // ── Spy: el INSERT INTO audit_retry_queue rechaza
      const orig = pool.query.bind(pool);
      vi.spyOn(pool, "query").mockImplementation(async (...args: any[]) => {
        const sql =
          typeof args[0] === "string"
            ? args[0]
            : ((args[0]?.text ?? "") as string);
        if (sql.includes("INSERT INTO audit_retry_queue")) {
          throw new Error("Simulated queue table write failure");
        }
        return (orig as any)(...args);
      });

      // ── Spy en auditLogger.error
      const errorSpy = vi.spyOn(auditLogger, "error");

      // ── Llamar enqueueAuditLog — es fire-and-forget (void); el .catch() es asíncrono
      const originalAuditError = new Error("Original audit_log FK failure");
      enqueueAuditLog(payload, originalAuditError);

      // Dar tiempo al microtask/macrotask chain para que el .catch() interno ejecute
      await new Promise((r) => setTimeout(r, 150));

      // ── Debe haberse emitido la alerta de doble falla
      const doubleFailCall = errorSpy.mock.calls.find(([msg]: any[]) =>
        typeof msg === "string" &&
        msg.includes("audit_log Y audit_retry_queue fallaron")
      );
      expect(doubleFailCall).toBeDefined();

      // ── El metadata debe contener ambos errores
      const meta = doubleFailCall![1] as Record<string, unknown>;
      expect(meta.action).toBe(payload.action);
      expect(meta.entity_type).toBe(payload.entity_type);
      expect(meta.entity_id).toBe(payload.entity_id);
      expect(String(meta.original_error)).toMatch(/Original audit_log FK failure/);
      expect(String(meta.queue_error)).toMatch(/queue table write failure/);
    }
  );
});
