/**
 * Prueba: DELETE /api/users/:id y DELETE /api/admin/users/:id generan audit_log
 *
 * UA-01: borrar via endpoint primario → audit_log con actor, víctima, endpoint
 * UA-02: borrar via alias admin   → audit_log con actor, víctima, endpoint
 *
 * Patrón: sondeo dentro del mismo `it` (ver memoria: enqueue-audit-cross-process-race.md)
 * JWT con 'id' real para que audit_log.user_id tenga FK válido.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Estado ─────────────────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let actorId:   number; // administrador_campus (nivel 5) — permanece toda la suite
let target1Id: number; // contador_general (nivel 4) — se borra en UA-01
let target2Id: number; // auxiliar_contable (nivel 3) — se borra en UA-02
let tokenActor: string;

async function del(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Sondea audit_log hasta encontrar la fila o agotar el tiempo. */
async function pollAuditLog(
  entityId: number,
  action: string,
  timeoutMs = 3000
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pool.query(
      `SELECT * FROM audit_log
       WHERE entity_type = 'user' AND entity_id = $1 AND action = $2
       ORDER BY created_at DESC LIMIT 1`,
      [entityId, action]
    );
    if (r.rows.length > 0) return r.rows[0] as Record<string, unknown>;
    await new Promise((res) => setTimeout(res, 100));
  }
  return null;
}

// ── Setup / Teardown ───────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);
  const hash = await bcrypt.hash("Test1234!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`UsersAuditTest ${ts}`, `UAT${ts}`]
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus UAT ${ts}`]
  );
  campusId = (cRow.rows[0] as any).id;

  // Actor: administrador_campus (nivel 5)
  const aRow = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,$5,'administrador_campus',true) RETURNING id`,
    [tenantId, campusId, "Actor Admin", `actor.uat${ts}@test.internal`, hash]
  );
  actorId = (aRow.rows[0] as any).id;

  // Target 1: contador_general (nivel 4) — se borrará via endpoint primario
  const t1Row = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,$5,'contador_general',true) RETURNING id`,
    [tenantId, campusId, "Target Contador", `contador.uat${ts}@test.internal`, hash]
  );
  target1Id = (t1Row.rows[0] as any).id;

  // Target 2: auxiliar_contable (nivel 3) — se borrará via alias admin
  const t2Row = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,$5,'auxiliar_contable',true) RETURNING id`,
    [tenantId, campusId, "Target Auxiliar", `auxiliar.uat${ts}@test.internal`, hash]
  );
  target2Id = (t2Row.rows[0] as any).id;

  tokenActor = jwt.sign(
    {
      id:        actorId,
      email:     `actor.uat${ts}@test.internal`,
      role:      "administrador_campus",
      campus_id: campusId,
      tenant_id: tenantId,
      type:      "user",
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  if (!tenantId) return;
  // audit_log no tiene FK en entity_id → limpiar en cualquier orden
  await pool.query(
    `DELETE FROM audit_log WHERE entity_type = 'user' AND entity_id = ANY($1)`,
    [[actorId, target1Id, target2Id].filter(Boolean)]
  ).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════
describe("DELETE usuarios → audit_log", () => {

  it("UA-01: DELETE /api/users/:id genera entrada en audit_log con actor, víctima y endpoint", async () => {
    const r = await del(`/api/users/${target1Id}`, tokenActor);
    expect(r.status).toBe(200);

    // Sondear audit_log (fire-and-forget → puede tardar unos ms)
    const row = await pollAuditLog(target1Id, "user_deleted");
    expect(row, "No apareció entrada en audit_log para el borrado via endpoint primario").not.toBeNull();

    // Quién ejecutó
    expect(Number(row!.user_id)).toBe(actorId);
    // metadata es columna TEXT en audit_log → parsear antes de acceder
    const meta = typeof row!.metadata === "string"
      ? JSON.parse(row!.metadata as string)
      : row!.metadata as any;
    expect(meta.deleted_user_id).toBe(target1Id);
    expect(meta.deleted_user_role).toBe("contador_general");
    expect(typeof meta.deleted_user_email).toBe("string");
    expect(meta.endpoint).toBe("DELETE /api/users/:id");
    // Campos de contexto del audit_log
    expect(row!.entity_type).toBe("user");
    expect(Number(row!.entity_id)).toBe(target1Id);
    expect(Number(row!.tenant_id)).toBe(tenantId);
  });

  it("UA-02: DELETE /api/admin/users/:id genera entrada en audit_log con actor, víctima y endpoint", async () => {
    const r = await del(`/api/admin/users/${target2Id}`, tokenActor);
    expect(r.status).toBe(200);

    const row = await pollAuditLog(target2Id, "user_deleted");
    expect(row, "No apareció entrada en audit_log para el borrado via alias /api/admin/users/:id").not.toBeNull();

    expect(Number(row!.user_id)).toBe(actorId);
    const meta = typeof row!.metadata === "string"
      ? JSON.parse(row!.metadata as string)
      : row!.metadata as any;
    expect(meta.deleted_user_id).toBe(target2Id);
    expect(meta.deleted_user_role).toBe("auxiliar_contable");
    expect(typeof meta.deleted_user_email).toBe("string");
    expect(meta.endpoint).toBe("DELETE /api/admin/users/:id");
    expect(row!.entity_type).toBe("user");
    expect(Number(row!.entity_id)).toBe(target2Id);
    expect(Number(row!.tenant_id)).toBe(tenantId);
  });
});
