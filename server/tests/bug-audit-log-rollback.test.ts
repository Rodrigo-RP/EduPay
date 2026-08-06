/**
 * BUG INVESTIGATION: rollback silencioso cuando audit_log INSERT falla
 * ─────────────────────────────────────────────────────────────────────
 * Usa el mismo pool del servidor (db.ts) para evitar problemas de límite
 * de conexiones concurrentes con Neon serverless.
 *
 * Escenario real de producción probado:
 *   Usuario tiene JWT válido, pero su cuenta es eliminada de la DB.
 *   El JWT pasa authenticateToken (firma válida), pero cuando el endpoint
 *   intenta INSERT INTO audit_log con ese user_id → FK violation.
 *   Pregunta: ¿200+UPDATE persistido, 200+rollback silencioso, o 500?
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";          // pool del servidor — misma instancia, sin conexión extra

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
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
  // ── CARRERA: enqueueAuditLog es fire-and-forget (void) ─────────────────────
  // PASO 2 llama al endpoint, el servidor responde 200, y el test termina —
  // pero el pool.query interno de enqueueAuditLog puede aún estar en vuelo
  // cuando afterAll empieza. Si el DELETE de audit_retry_queue corre antes
  // de que ese INSERT se complete, la fila aparece DESPUÉS de la limpieza
  // con un tenant_id ya inexistente → el retry worker muere con FK violation.
  //
  // Solución: esperar 300 ms para que el event loop procese el INSERT
  // pendiente, luego hacer DOS pasadas de DELETE (la segunda captura cualquier
  // INSERT que se colara después de la primera).
  await new Promise<void>((resolve) => setTimeout(resolve, 300));

  // Primera pasada — filas ya presentes en la cola
  await pool.query(
    `DELETE FROM audit_retry_queue WHERE (payload->>'tenant_id')::int = $1`,
    [tenantId]
  ).catch(() => {});

  // Limpiar audit_log del tenant efímero (evita FK violation al borrar tenant
  // si la tabla no tiene CASCADE en tenant_id).
  await pool.query(
    `DELETE FROM audit_log WHERE tenant_id = $1`,
    [tenantId]
  ).catch(() => {});

  await pool.query(`DELETE FROM bank_transactions WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE campus_id=$1 AND tenant_id=$2`, [campusId, tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants WHERE id=$1`, [tenantId]).catch(() => {});

  // Segunda pasada — captura filas que se insertaron después de la primera limpieza.
  // audit_retry_queue no tiene FK en tenant_id (guarda el id dentro del JSONB),
  // así que este DELETE funciona incluso después de borrar el tenant.
  await pool.query(
    `DELETE FROM audit_retry_queue WHERE (payload->>'tenant_id')::int = $1`,
    [tenantId]
  ).catch(() => {});
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
     VALUES ($1,$2,NOW()::date,'BugAudit test',$3,'abono',$4,'pendiente')
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
  it("PASO 2 — CASO CRÍTICO: user eliminado de DB (JWT sigue válido) → ¿qué devuelve el servidor?", async () => {
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

    // ── ASERCIÓN: el único resultado inaceptable es 200 + rollback silencioso
    // ── POST-FIX: el UPDATE se commita antes de intentar el audit_log.
    // Aunque el INSERT en audit_log falle (FK violation por user eliminado),
    // la bank_tx ya fue actualizada y el servidor responde 200 verdadero.
    // El fallo del audit se encola en audit_retry_queue para reintento.
    expect(r.status).toBe(200);
    expect(dbState).toBe("ignorado"); // el UPDATE sí persistió
  }, 20_000);
});
