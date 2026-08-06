/**
 * AUDIT RETRY QUEUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cola durable de reintentos para inserciones en audit_log que fallaron fuera
 * de la transacción financiera principal.
 *
 * Por qué existe esto:
 *   El INSERT en audit_log corre DESPUÉS del COMMIT de la tx financiera, con
 *   pool.query() en una conexión separada (ver ADR-001). Si ese INSERT falla
 *   (e.g. FK user_id, timeout, DB busy), el descartar/pago ya está commitado
 *   y no podemos revertirlo. Sin embargo, el proyecto exige auditoría completa:
 *   toda acción financiera sensible debe tener rastro. Este módulo garantiza
 *   que el fallo sea transitorio y controlado, no una pérdida silenciosa.
 *
 * Modelo:
 *   - PostgreSQL como cola (sin Redis/BullMQ — sin nueva infraestructura).
 *   - Tabla: audit_retry_queue (creada via CREATE TABLE IF NOT EXISTS al startup).
 *   - Worker: setInterval cada 30 s, procesa registros pendientes.
 *   - Reintentos: hasta 3 intentos con backoff de 5 min por intento.
 *   - Dead letter: después de 3 fallos → status='dead' + log de error nivel
 *     ERROR en Winston (visible en logs/audit-error.log y consola).
 */

import winston from "winston";
import { pool } from "./db";

// ── Logger dedicado ─────────────────────────────────────────────────────────
export const auditLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "audit-retry" },
  transports: [
    new winston.transports.File({
      filename: "logs/audit-error.log",
      level: "error",
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, service, ...meta }) =>
            `${timestamp} [${service}] ${level}: ${message}` +
            (Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "")
        )
      ),
    }),
  ],
});

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface AuditLogPayload {
  tenant_id: number;
  user_id: number | null;
  guardian_id?: number | null;
  action: string;
  entity_type: string;
  entity_id: number;
  metadata: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  previous_value?: Record<string, unknown>;
}

// ── Init tabla ─────────────────────────────────────────────────────────────
export async function initAuditRetryQueue(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_retry_queue (
      id            BIGSERIAL PRIMARY KEY,
      payload       JSONB NOT NULL,
      attempts      INT NOT NULL DEFAULT 0,
      max_attempts  INT NOT NULL DEFAULT 3,
      last_error    TEXT,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  auditLogger.info("audit_retry_queue inicializada");
}

// ── Encolar un fallo de audit_log ─────────────────────────────────────────
/**
 * Llama esto cuando el INSERT directo en audit_log falla.
 * Inserta el payload en la cola de reintentos y emite un warning.
 * Fire-and-forget: no lanza ni bloquea.
 */
export function enqueueAuditLog(
  payload: AuditLogPayload,
  originalError: unknown
): void {
  const errMsg =
    originalError instanceof Error
      ? originalError.message
      : String(originalError);

  auditLogger.warn("audit_log INSERT falló — encolando para reintento", {
    action: payload.action,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    original_error: errMsg,
  });

  pool
    .query(
      `INSERT INTO audit_retry_queue (payload, last_error)
       VALUES ($1::jsonb, $2)`,
      [JSON.stringify(payload), errMsg]
    )
    .catch((queueErr: unknown) => {
      // Si incluso la cola falla, registramos a nivel ERROR — no hay otra red.
      // El operador DEBE ver este mensaje.
      auditLogger.error(
        "ALERTA: audit_log Y audit_retry_queue fallaron — registro de auditoría perdido",
        {
          action: payload.action,
          entity_type: payload.entity_type,
          entity_id: payload.entity_id,
          original_error: errMsg,
          queue_error:
            queueErr instanceof Error ? queueErr.message : String(queueErr),
        }
      );
    });
}

// ── Worker de reintentos ───────────────────────────────────────────────────
const RETRY_INTERVAL_MS = 30_000; // cada 30 segundos
const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = 5; // next_retry_at += 5 min * intento actual

export async function processAuditRetries(): Promise<void> {
  let rows: any[];
  try {
    // Reclamar registros pendientes cuyo tiempo de reintento ya llegó
    const result = await pool.query<{
      id: string;
      payload: AuditLogPayload;
      attempts: number;
    }>(`
      UPDATE audit_retry_queue
      SET
        attempts      = attempts + 1,
        next_retry_at = NOW() + (INTERVAL '1 minute' * $1 * (attempts + 1))
      WHERE status = 'pending'
        AND next_retry_at <= NOW()
        AND attempts < $2
      RETURNING id, payload, attempts AS attempts
    `, [BACKOFF_MINUTES, MAX_ATTEMPTS]);
    rows = result.rows;
  } catch (err) {
    auditLogger.error("audit_retry_queue: error al leer cola de reintentos", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const row of rows) {
    const p: AuditLogPayload = row.payload;
    try {
      await pool.query(
        `INSERT INTO audit_log
           (tenant_id, user_id, guardian_id, action, entity_type, entity_id, metadata,
            new_value, previous_value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, NOW())`,
        [
          p.tenant_id,
          p.user_id      ?? null,
          p.guardian_id  ?? null,
          p.action,
          p.entity_type,
          p.entity_id,
          JSON.stringify(p.metadata),
          p.new_value      ? JSON.stringify(p.new_value)      : null,
          p.previous_value ? JSON.stringify(p.previous_value) : null,
        ]
      );

      await pool
        .query(`UPDATE audit_retry_queue SET status = 'done' WHERE id = $1`, [
          row.id,
        ])
        .catch(() => {});

      auditLogger.info("audit_log reintento exitoso", {
        queue_id: row.id,
        action: p.action,
        entity_id: p.entity_id,
        attempt: row.attempts,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      if (row.attempts >= MAX_ATTEMPTS) {
        // Dead letter — marcar como muerto y emitir error nivel ERROR
        await pool
          .query(
            `UPDATE audit_retry_queue
             SET status = 'dead', last_error = $1
             WHERE id = $2`,
            [errMsg, row.id]
          )
          .catch(() => {});

        auditLogger.error(
          "ALERTA: audit_log permanentemente sin registrar tras reintentos máximos",
          {
            queue_id: row.id,
            action: p.action,
            entity_type: p.entity_type,
            entity_id: p.entity_id,
            tenant_id: p.tenant_id,
            user_id: p.user_id,
            metadata: p.metadata,
            attempts: row.attempts,
            last_error: errMsg,
          }
        );
      } else {
        // Fallo transitorio — actualizar last_error, el UPDATE de next_retry_at
        // ya se hizo arriba en el UPDATE de reclamación
        await pool
          .query(
            `UPDATE audit_retry_queue SET last_error = $1 WHERE id = $2`,
            [errMsg, row.id]
          )
          .catch(() => {});

        auditLogger.warn("audit_log reintento falló — se volverá a intentar", {
          queue_id: row.id,
          action: p.action,
          entity_id: p.entity_id,
          attempt: row.attempts,
          error: errMsg,
        });
      }
    }
  }
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startAuditRetryWorker(): void {
  if (workerInterval) return; // idempotente
  workerInterval = setInterval(() => {
    processAuditRetries().catch((err) => {
      auditLogger.error("audit_retry worker: error inesperado", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, RETRY_INTERVAL_MS);

  // También procesar inmediatamente al arrancar (reintentos de la sesión anterior)
  processAuditRetries().catch(() => {});

  auditLogger.info(
    `audit_retry worker iniciado (intervalo: ${RETRY_INTERVAL_MS / 1000}s, max_attempts: ${MAX_ATTEMPTS})`
  );
}

export function stopAuditRetryWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
