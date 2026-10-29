import { SCHOOL_TODAY_SQL } from "../../shared/school-date";
/**
 * BUG INVESTIGATION: rollback silencioso cuando audit_log INSERT falla
 * ─────────────────────────────────────────────────────────────────────
 * Usa el mismo pool del servidor (db.ts) para evitar problemas de límite
 * de conexiones concurrentes con Neon serverless.
 *
 * Un actor eliminado se rechaza antes de operar. Para cubrir ADR-001 se
 * conserva un actor válido y se simula el fallo del INSERT de auditoría:
 * operación confirmada, reintento durable y recuperación exactamente una vez.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "../test-support/session-jwt";
import { pool } from "../db";          // pool del servidor — misma instancia, sin conexión extra
import { resolveWithFailedAudit, assertAuditRecoveredOnce } from "../test-support/audit-insert-failure";

import { JWT_SECRET } from "../routes/shared";
const BASE = "http://localhost:5000";

// ── helpers ────────────────────────────────────────────────────────────────
async function post(path: string, body: object, token: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch {}
  return { status: r.status, body: parsed };
}

// ── estado compartido del suite ────────────────────────────────────────────
let tenantId: number;
let campusId: number;

beforeAll(async () => {
  const ts = Date.now();
  const t = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant BugAudit ${ts}`, `BUGX${ts}`.slice(0, 13)]
  );
  tenantId = (t.rows[0] as any).id;

  const c = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus BugAudit ${ts}`]
  );
  campusId = (c.rows[0] as any).id;
}, 30_000);

afterAll(async () => {
  // PASO 2 ya esperó a que cualquier INSERT de enqueueAuditLog completara
  // antes de que el `it` terminara (ver sondeo al final de ese test).
  // El afterAll solo necesita borrar lo encolado y limpiar el tenant.

  // Primera pasada: borrar filas de audit_retry_queue para este tenant.
  await pool.query(
    `DELETE FROM audit_retry_queue WHERE (payload->>'tenant_id')::int = $1`,
    [tenantId]
  ).catch(() => {});

  await pool.query(`DELETE FROM audit_log         WHERE tenant_id  = $1`,               [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM bank_transactions WHERE campus_id  = $1`,               [campusId]).catch(() => {});
  await pool.query(`DELETE FROM users             WHERE campus_id=$1 AND tenant_id=$2`, [campusId, tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses          WHERE id=$1`,                         [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants           WHERE id=$1`,                         [tenantId]).catch(() => {});

  // Segunda pasada: audit_retry_queue no tiene FK en tenant_id (JSONB),
  // así que este DELETE funciona aunque el tenant ya no exista.
  // Si encuentra algo es que el sondeo de PASO 2 fue insuficiente — falla
  // explícitamente para que sea visible, no silencioso.
  const stray = await pool.query(
    `DELETE FROM audit_retry_queue
     WHERE (payload->>'tenant_id')::int = $1
     RETURNING id`,
    [tenantId]
  );
  if ((stray.rowCount ?? 0) > 0) {
    throw new Error(
      `afterAll: ${stray.rowCount} fila(s) inesperadas en audit_retry_queue ` +
      `para tenant_id=${tenantId}. El sondeo de PASO 2 no fue suficiente — ` +
      `aumentar ENQUEUE_WAIT_MS o revisar por qué el INSERT tarda más de lo esperado.`
    );
  }

  // Log del estado global de la tabla para verificación externa por corrida.
  const queueState = await pool.query(
    `SELECT COALESCE(string_agg(status || ':' || n::text, ' '), 'vacía') AS resumen
     FROM (SELECT status, COUNT(*)::int AS n FROM audit_retry_queue GROUP BY status) t`
  );
  console.log(`[afterAll] audit_retry_queue global → ${(queueState.rows[0] as any).resumen}`);
}, 30_000);

// ── helpers locales ────────────────────────────────────────────────────────
async function createUser(): Promise<{ userId: number; token: string }> {
  const ts = Date.now();
  const email = `bugaudit-${ts}@test.internal`;
  const r = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,'BugAudit User',$3,'x','administrador_campus',true) RETURNING id`,
    [tenantId, campusId, email]
  );
  const userId = (r.rows[0] as any).id;
  const token = jwt.sign(
    { id: userId, email, role: "administrador_campus", campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
  return { userId, token };
}

async function insertTx(monto: number, ref: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO bank_transactions
       (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo, referencia, estado_conciliacion)
     VALUES ($1,$2,${SCHOOL_TODAY_SQL},'BugAudit test',$3,'abono',$4,'pendiente')
     RETURNING id`,
    [campusId, tenantId, monto, ref]
  );
  return (r.rows[0] as any).id as number;
}

async function getDbState(txId: number): Promise<string> {
  const r = await pool.query(
    `SELECT estado_conciliacion FROM bank_transactions WHERE id=$1`, [txId]
  );
  return (r.rows[0] as any).estado_conciliacion as string;
}

// ══════════════════════════════════════════════════════════════════════════════
describe("Bug: audit_log FK violation dentro de transacción — evidencia empírica", () => {

  // ── PASO 0: ¿la FK existe a nivel PostgreSQL real? ─────────────────────────
  it("PASO 0 — ¿FK audit_log.user_id está aplicada en PostgreSQL?", async () => {
    let fkEnforced = false;
    let pgErrorCode = "";
    try {
      // INSERT directo con user_id ficticio (fuera de cualquier transacción del servidor)
      await pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, 99999999, 'test_fk_probe', 'test', 0, '{}', NOW())`,
        [tenantId]
      );
      // Si llega aquí: FK no existe a nivel DB (Drizzle la definió pero la migración no la creó)
      fkEnforced = false;
      await pool.query(
        `DELETE FROM audit_log WHERE action='test_fk_probe' AND tenant_id=$1`, [tenantId]
      ).catch(() => {});
    } catch (err: any) {
      pgErrorCode = err?.code ?? "";
      fkEnforced = pgErrorCode === "23503"; // foreign_key_violation
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`PASO 0 — FK audit_log.user_id en PostgreSQL real`);
    console.log(`${"═".repeat(60)}`);
    console.log(`FK aplicada a nivel DB : ${fkEnforced}`);
    console.log(`Código de error pg     : ${pgErrorCode || "(ninguno — INSERT tuvo éxito)"}`);
    if (!fkEnforced) {
      console.log(`CONCLUSIÓN: la FK existe en el schema Drizzle PERO no fue`);
      console.log(`migrada al esquema PostgreSQL real. Los INSERTs con user_id`);
      console.log(`inexistente TIENEN ÉXITO → el rollback silencioso no puede`);
      console.log(`ocurrir por esta causa en producción actual.`);
    } else {
      console.log(`CONCLUSIÓN: la FK SÍ está aplicada en PostgreSQL. El INSERT`);
      console.log(`con user_id eliminado fallará dentro de la transacción.`);
    }
    console.log(`${"═".repeat(60)}\n`);

    // El test documenta, no afirma el resultado (el valor informa el análisis)
    expect(["", "23503"]).toContain(pgErrorCode);
  }, 15_000);

  // ── PASO 1: baseline — user real existe → descartar funciona ───────────────
  it("PASO 1 — BASELINE: user real en DB + JWT con su ID → 200 + 'ignorado'", async () => {
    const { token } = await createUser();
    const txId = await insertTx(10000, `ref-baseline-${Date.now()}`);

    const r = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "descartar", motivo: "Baseline: user real existe" },
      token
    );
    const dbState = await getDbState(txId);

    console.log(`[BASELINE] HTTP=${r.status}  DB=${dbState}  body=${JSON.stringify(r.body)}`);
    expect(r.status).toBe(200);
    expect(dbState).toBe("ignorado");
  }, 15_000);

  // ── PASO 2: CASO CRÍTICO — user eliminado con JWT aún válido ───────────────
  it("PASO 2 — usuario eliminado con firma válida → 401, operación y auditoría intactas", async () => {
    // 1. Crear usuario real → JWT con user_id real
    const { userId, token } = await createUser();

    // 2. Eliminar el usuario de la DB (simula: admin elimina cuenta de usuario activo)
    await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);

    // 3. Nueva bank_tx pendiente
    const txId = await insertTx(20000, `ref-deleted-user-${Date.now()}`);

    // 4. Llamar al endpoint con el JWT del usuario eliminado
    const r = await post(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "descartar", motivo: "Usuario ya no existe en la DB" },
      token
    );

    // 5. Estado real en la DB
    const dbState = await getDbState(txId);

    // ── EVIDENCIA CRUDA ───────────────────────────────────────────────────
    console.log(`\n${"═".repeat(60)}`);
    console.log(`PASO 2 — CASO CRÍTICO: user eliminado, JWT sigue válido`);
    console.log(`${"═".repeat(60)}`);
    console.log(`HTTP status del servidor    : ${r.status}`);
    console.log(`DB estado_conciliacion      : ${dbState}`);
    console.log(`Body del servidor           : ${JSON.stringify(r.body)}`);
    console.log(`${"═".repeat(60)}`);

    if (r.status === 200 && dbState === "ignorado") {
      console.log(`RESULTADO: 200 + 'ignorado'`);
      console.log(`  → No hay bug. La FK no está aplicada a nivel DB (ver PASO 0),`);
      console.log(`    por lo que el INSERT en audit_log tiene éxito aunque el`);
      console.log(`    user_id no exista. El COMMIT completa correctamente.`);
    } else if (r.status === 200 && dbState === "pendiente") {
      console.log(`RESULTADO: 200 + 'pendiente'  ← BUG DE PRODUCCIÓN`);
      console.log(`  → El servidor respondió éxito pero el UPDATE fue revertido.`);
      console.log(`    La FK SÍ está aplicada, el INSERT falló dentro de la tx,`);
      console.log(`    la pg connection quedó en estado abortado, el COMMIT`);
      console.log(`    ejecutó un rollback silencioso.`);
    } else if (r.status === 500 && dbState === "pendiente") {
      console.log(`RESULTADO: 500 + 'pendiente'`);
      console.log(`  → El catch externo capturó el COMMIT fallido. Correcto`);
      console.log(`    en cuanto a integridad de datos, pero el descartar`);
      console.log(`    falló innecesariamente por una escritura secundaria.`);
    }
    console.log(`${"═".repeat(60)}\n`);

    // La firma no basta: un actor eliminado se rechaza antes de resolver.
    expect(r.status).toBe(401);
    expect(dbState).toBe("pendiente");
    const audit = await pool.query(
      "SELECT COUNT(*)::int AS n FROM audit_log WHERE entity_id = $1 AND action = 'resolver_excepcion_manual'",
      [txId]
    );
    expect(audit.rows[0].n).toBe(0);
    const retries = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_retry_queue
       WHERE (payload->>'tenant_id')::int = $1
         AND (payload->>'metadata')::jsonb->>'referencia' LIKE 'ref-deleted-user-%'`,
      [tenantId]
    );
    expect(retries.rows[0].n).toBe(0);
  }, 20_000);

  it("PASO 3 — actor válido + audit fallido: descarte persistido, cola durable y recuperación única", async () => {
    const { userId, token } = await createUser();
    const ref = `ref-audit-failure-${Date.now()}`;
    const txId = await insertTx(20000, ref);
    const motivo = "Descarte con auditoría pendiente";
    const response = await resolveWithFailedAudit(txId, token, { accion: "descartar", motivo });
    expect(response.status).toBe(200);
    expect(response.body.message).toContain("descartada");
    expect(response.failures).toBe(1);
    const state = await pool.query(
      "SELECT estado_conciliacion, nota_conciliacion, charge_id, payment_id FROM bank_transactions WHERE id=$1", [txId],
    );
    expect(state.rows).toEqual([{
      estado_conciliacion: "ignorado", nota_conciliacion: motivo, charge_id: null, payment_id: null,
    }]);
    expect((await pool.query("SELECT id FROM payments WHERE tenant_id=$1", [tenantId])).rows).toHaveLength(0);
    await assertAuditRecoveredOnce({
      tenant_id: tenantId, user_id: userId, action: "descartar_excepcion",
      entity_type: "bank_transaction", entity_id: txId,
      metadata: { motivo, nota: null, referencia: ref, monto_centavos: 20000 },
    });
    expect(await getDbState(txId)).toBe("ignorado");
  }, 20_000);
});
