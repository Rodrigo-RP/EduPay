/**
 * server/tests/firebase-bridge-deactivation.test.ts
 * Capa: Vitest contra PostgreSQL real desechable (marcador edupay:test; el globalSetup bloquea cualquier otra base).
 *
 * Valida con SQL real lo que las pruebas aisladas solo ven con una conexión simulada: la consulta de usuarios
 * vinculados, la desactivación de usuarios por baja declarada en el Dashboard, que un superadmin nunca se desactive,
 * los límites por corrida, la idempotencia y la auditoría. Usa una escuela propia que se borra al terminar
 * (users, external_identities, firebase_staff_candidates y audit_log caen en cascada con la escuela).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { runFirebaseSync, SyncGuardError } from "../lib/firebase-bridge-sync";
import type { BridgePayload } from "../lib/firebase-bridge-plan";

const STAMP = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const SCHOOL = `ESC_DB_${STAMP}`;
let tenantId = 0;
const userIds: Record<string, number> = {};

const person = (uid: string, over: Record<string, unknown> = {}) => ({
  uid, estado: "activo", rol: "Administrativo", idEscuela: SCHOOL, nombre: `Persona ${uid}`, primerApellido: "Prueba", segundoApellido: null,
  email: `${uid}.${STAMP}@example.invalid`, registroSep: [], ...over,
});
const payload = (personal: unknown[]): BridgePayload => ({
  generadoEn: new Date().toISOString(), escuelas: [SCHOOL], alumnos: [], tutores: [], vinculos: [], personal,
} as unknown as BridgePayload);

async function addUser(uid: string, over: { role?: string; superAdmin?: boolean } = {}) {
  const u = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, tenant_id, is_active, is_super_admin)
     VALUES ($1, 'hash-no-usable', $2, $3, $4, true, $5) RETURNING id`,
    [`${uid}.${STAMP}@example.invalid`, `Usuario ${uid}`, over.role ?? "asistente", tenantId, over.superAdmin === true],
  );
  userIds[uid] = Number(u.rows[0].id);
  await pool.query(
    `INSERT INTO external_identities (provider, subject, tenant_id, user_id) VALUES ('firebase', $1, $2, $3)`,
    [`${uid}-${STAMP}`, tenantId, userIds[uid]],
  );
  // Un usuario vinculado siempre nació de un candidato: la baja de quien no tiene registro local ya no crea candidatos.
  await pool.query(
    `INSERT INTO firebase_staff_candidates (tenant_id, firebase_uid, nombre_completo, email, rol_dashboard, registro_sep, estado, synced_at)
     VALUES ($1, $2, $3, $4, 'Administrativo', '[]'::jsonb, 'activo', now())`,
    [tenantId, `${uid}-${STAMP}`, `Usuario ${uid}`, `${uid}.${STAMP}@example.invalid`],
  );
}
const uidOf = (name: string) => `${name}-${STAMP}`;
const active = async (name: string) =>
  (await pool.query(`SELECT is_active FROM users WHERE id = $1`, [userIds[name]])).rows[0].is_active as boolean;

beforeAll(async () => {
  const t = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc, firebase_id_escuela) VALUES ($1, 'XAXX010101000', $2) RETURNING id`,
    [`Escuela de prueba ${STAMP}`, SCHOOL],
  );
  tenantId = Number(t.rows[0].id);
});

afterAll(async () => {
  if (tenantId) await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("Sincronización con el Dashboard: desactivación de usuarios (PostgreSQL real)", () => {
  it("la baja declarada desactiva al usuario vinculado, nunca al superadmin, y deja auditoría", async () => {
    await addUser("a"); await addUser("b", { role: "super_admin", superAdmin: true }); await addUser("c");
    const personal = [person(uidOf("a"), { estado: "baja" }), person(uidOf("b"), { estado: "baja" }), person(uidOf("c"))];

    const dry = await runFirebaseSync({ db: pool, tenantId, payload: payload(personal), apply: false });
    expect(dry.applied).toBe(false);
    expect(dry.report.usersToDeactivate).toBe(1);
    expect(dry.report.warnings.superadminEnBajaEnDashboard).toBe(1);
    expect(await active("a")).toBe(true); // el simulacro no escribe

    const applied = await runFirebaseSync({ db: pool, tenantId, payload: payload(personal), apply: true });
    expect(applied.applied).toBe(true);
    expect(await active("a")).toBe(false);
    expect(await active("b")).toBe(true); // superadmin: nunca se desactiva solo
    expect(await active("c")).toBe(true);

    const audit = await pool.query(
      `SELECT entity_id, metadata FROM audit_log WHERE tenant_id = $1 AND action = 'user.deactivated_by_dashboard'`, [tenantId],
    );
    expect(audit.rows.map((r) => Number(r.entity_id))).toEqual([userIds.a]);
    expect(JSON.parse(audit.rows[0].metadata)).toMatchObject({ rol: "asistente", motivo: "baja_en_dashboard" });

    // El vínculo se conserva (reactivar es decisión de un superadmin) y el candidato queda como baja.
    const link = await pool.query(`SELECT 1 FROM external_identities WHERE tenant_id = $1 AND user_id = $2`, [tenantId, userIds.a]);
    expect(link.rowCount).toBe(1);
    const cand = await pool.query(`SELECT estado FROM firebase_staff_candidates WHERE tenant_id = $1 AND firebase_uid = $2`, [tenantId, uidOf("a")]);
    expect(cand.rows[0].estado).toBe("baja");
  });

  it("es idempotente: repetir la corrida no vuelve a desactivar ni audita de nuevo", async () => {
    const personal = [person(uidOf("a"), { estado: "baja" }), person(uidOf("b"), { estado: "baja" }), person(uidOf("c"))];
    const again = await runFirebaseSync({ db: pool, tenantId, payload: payload(personal), apply: true });
    expect(again.report.usersToDeactivate).toBe(0);
    const audit = await pool.query(`SELECT count(*)::int AS n FROM audit_log WHERE tenant_id = $1 AND action = 'user.deactivated_by_dashboard'`, [tenantId]);
    expect(audit.rows[0].n).toBe(1);
  });

  it("que alguien falte en la lista no lo desactiva", async () => {
    await runFirebaseSync({ db: pool, tenantId, payload: payload([]), apply: true });
    expect(await active("c")).toBe(true);
  });

  it("supera el límite: aborta sin escribir nada y solo una corrida manual revisada lo aplica", async () => {
    for (const n of ["d", "e", "f", "g", "h"]) await addUser(n);
    const bajas = ["d", "e", "f"].map((n) => person(uidOf(n), { estado: "baja" }));

    await expect(runFirebaseSync({ db: pool, tenantId, payload: payload(bajas), apply: true })).rejects.toBeInstanceOf(SyncGuardError);
    for (const n of ["d", "e", "f"]) expect(await active(n)).toBe(true);

    const forced = await runFirebaseSync({ db: pool, tenantId, payload: payload(bajas), apply: true, allowMassChanges: true });
    expect(forced.applied).toBe(true);
    for (const n of ["d", "e", "f"]) expect(await active(n)).toBe(false);
    for (const n of ["g", "h", "c"]) expect(await active(n)).toBe(true);
  });

  it("si otra corrida tiene el candado, esta se omite con SyncBusyError (sin esperar)", async () => {
    const { SyncBusyError } = await import("../lib/firebase-bridge-sync");
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      const got = await holder.query(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`, [`firebase-bridge:${tenantId}`]);
      expect(got.rows[0].locked).toBe(true);
      const started = Date.now();
      await expect(runFirebaseSync({ db: pool, tenantId, payload: payload([]), apply: true })).rejects.toBeInstanceOf(SyncBusyError);
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
  });
});
