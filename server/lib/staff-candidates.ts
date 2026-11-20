/**
 * Candidatos de personal del Dashboard → usuarios de EduPay.
 *
 * La sincronización del puente solo propone candidatos (`firebase_staff_candidates`); aquí un superadministrador
 * decide quién entra, con qué rol de EduPay, en qué campus y con qué permisos adicionales. El rol del Dashboard es
 * solo referencia. Nada se vincula por correo: el vínculo es por `uid` de Firebase.
 *
 * Asignar crea el usuario y su vínculo SSO en UNA transacción. El usuario recibe una contraseña aleatoria que nadie
 * conoce (el acceso es solo por SSO; el login directo está oculto). Revocar quita el vínculo y desactiva al usuario;
 * no lo borra, para conservar la trazabilidad.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { Pool } from "pg";
import { USER_ROLES, PERMISSIONS } from "@shared/user-roles";
import { SsoError } from "./sso/assertion";

export interface Queryable { query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> }
export type StaffDb = Pick<Pool, "connect" | "query">;

const ASSIGNABLE_ROLES: readonly string[] = Object.values(USER_ROLES);
const VALID_PERMISSIONS = new Set(Object.keys(PERMISSIONS));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StaffCandidateRow {
  id: number;
  tenant_id: number;
  firebase_uid: string;
  nombre_completo: string;
  email: string | null;
  rol_dashboard: string | null;
  departamento: string | null;
  registro_sep: Array<{ clave: string; nivel: string | null }>;
  estado: string;
  synced_at: string;
  /** Campus de EduPay sugeridos a partir de los niveles de `registroSep` (solo orientativo). */
  campus_sugeridos: number[];
  /** Usuario de EduPay ya vinculado, si lo hay. */
  usuario: { id: number; role: string; campus_id: number | null; is_active: boolean; custom_permissions: string[] } | null;
}

export async function listStaffCandidates(db: Queryable, tenantId?: number): Promise<StaffCandidateRow[]> {
  const filter = tenantId ? "WHERE c.tenant_id = $1" : "";
  const rows = (await db.query(
    `SELECT c.id, c.tenant_id, c.firebase_uid, c.nombre_completo, c.email, c.rol_dashboard, c.departamento, c.registro_sep, c.estado, c.synced_at,
            u.id AS user_id, u.role AS user_role, u.campus_id AS user_campus_id, u.is_active AS user_is_active,
            u.custom_permissions AS user_custom_permissions
       FROM firebase_staff_candidates c
       LEFT JOIN external_identities ei ON ei.provider = 'firebase' AND ei.subject = c.firebase_uid AND ei.tenant_id = c.tenant_id
       LEFT JOIN users u ON u.id = ei.user_id
       ${filter}
      ORDER BY c.nombre_completo
      LIMIT 1000`,
    tenantId ? [tenantId] : [],
  )).rows;
  const maps = (await db.query(`SELECT tenant_id, nivel, campus_id FROM firebase_campus_map ${tenantId ? "WHERE tenant_id = $1" : ""}`, tenantId ? [tenantId] : [])).rows;
  const campusByNivel = new Map(maps.map((m) => [`${m.tenant_id}:${String(m.nivel).trim().toLowerCase()}`, Number(m.campus_id)]));

  return rows.map((r): StaffCandidateRow => {
    const registro = Array.isArray(r.registro_sep) ? r.registro_sep : [];
    const sugeridos = new Set<number>();
    for (const reg of registro) {
      const campus = campusByNivel.get(`${r.tenant_id}:${String(reg?.nivel ?? "").trim().toLowerCase()}`);
      if (campus !== undefined) sugeridos.add(campus);
    }
    return {
      id: Number(r.id), tenant_id: Number(r.tenant_id), firebase_uid: String(r.firebase_uid), nombre_completo: String(r.nombre_completo),
      email: r.email ?? null, rol_dashboard: r.rol_dashboard ?? null, departamento: r.departamento ?? null, registro_sep: registro, estado: String(r.estado),
      synced_at: new Date(r.synced_at).toISOString(), campus_sugeridos: Array.from(sugeridos).sort((a, b) => a - b),
      usuario: r.user_id == null ? null : {
        id: Number(r.user_id), role: String(r.user_role), campus_id: r.user_campus_id == null ? null : Number(r.user_campus_id),
        is_active: r.user_is_active !== false, custom_permissions: Array.isArray(r.user_custom_permissions) ? r.user_custom_permissions : [],
      },
    };
  });
}

export interface AssignInput {
  candidateId: number;
  role: string;
  campusId: number;
  /** Solo si el candidato no trae correo en el Dashboard. */
  email?: string | null;
  customPermissions?: string[];
  actorId: number;
}

export interface AssignResult { userId: number; identityId: number; tenantId: number; role: string; campusId: number }

export async function assignStaffCandidate(db: StaffDb, input: AssignInput): Promise<AssignResult> {
  const { candidateId, role, campusId, actorId } = input;
  if (!Number.isInteger(candidateId) || candidateId <= 0) throw new SsoError("invalid_request", "Candidato inválido.");
  if (!ASSIGNABLE_ROLES.includes(role)) throw new SsoError("invalid_request", "Rol inválido. Elige un rol de personal de EduPay.");
  if (!Number.isInteger(campusId) || campusId <= 0) throw new SsoError("invalid_request", "Elige un campus.");
  const custom = Array.from(new Set(input.customPermissions ?? []));
  if (custom.some((p) => typeof p !== "string" || !VALID_PERMISSIONS.has(p))) throw new SsoError("invalid_request", "Hay permisos que no existen.");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const cand = (await client.query(
      `SELECT id, tenant_id, firebase_uid, nombre_completo, email, estado FROM firebase_staff_candidates WHERE id = $1 FOR UPDATE`,
      [candidateId],
    )).rows[0];
    if (!cand) throw new SsoError("invalid_request", "El candidato no existe.");
    if (cand.estado !== "activo") throw new SsoError("invalid_request", "La persona está de baja en el Dashboard.");
    const tenantId = Number(cand.tenant_id);

    const campus = (await client.query(`SELECT id FROM campuses WHERE id = $1 AND tenant_id = $2`, [campusId, tenantId])).rows[0];
    if (!campus) throw new SsoError("invalid_request", "Ese campus no pertenece a la escuela del candidato.");

    const already = (await client.query(
      `SELECT id FROM external_identities WHERE provider = 'firebase' AND subject = $1`, [cand.firebase_uid],
    )).rows[0];
    if (already) throw new SsoError("already_linked", "Esta persona ya tiene acceso a EduPay.");

    const email = String(cand.email ?? input.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new SsoError("invalid_request", "El candidato no trae correo; indícalo para crear el usuario.");

    // Nunca se reutiliza un usuario existente por coincidir el correo: sería vincular por correo.
    const dup = (await client.query(`SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1`, [email])).rows[0];
    if (dup) throw new SsoError("already_linked", "Ya existe un usuario de EduPay con ese correo. Revísalo antes de asignar.");

    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const user = (await client.query(
      `INSERT INTO users (tenant_id, campus_id, email, password_hash, name, role, is_active, is_super_admin, custom_permissions, platform_permissions)
       VALUES ($1, $2, $3, $4, $5, $6, true, false, $7, '{}') RETURNING id`,
      [tenantId, campusId, email, passwordHash, cand.nombre_completo, role, custom],
    )).rows[0];
    const ident = (await client.query(
      `INSERT INTO external_identities (provider, subject, tenant_id, user_id, linked_by)
       VALUES ('firebase', $1, $2, $3, $4) RETURNING id`,
      [cand.firebase_uid, tenantId, user.id, actorId],
    )).rows[0];
    await client.query("COMMIT");
    return { userId: Number(user.id), identityId: Number(ident.id), tenantId, role, campusId };
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    if (err?.code === "23505") throw new SsoError("already_linked", "Esta persona o ese correo ya tienen acceso a EduPay.");
    throw err;
  } finally {
    client.release();
  }
}

export interface RevokeResult { tenantId: number; userId: number }

/** Quita el acceso: desvincula el uid y desactiva al usuario (sin borrarlo). Invalida sus sesiones actuales. */
export async function revokeStaffCandidate(db: StaffDb, candidateId: number): Promise<RevokeResult | null> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const cand = (await client.query(`SELECT tenant_id, firebase_uid FROM firebase_staff_candidates WHERE id = $1 FOR UPDATE`, [candidateId])).rows[0];
    if (!cand) { await client.query("ROLLBACK"); return null; }
    const ident = (await client.query(
      `DELETE FROM external_identities WHERE provider = 'firebase' AND subject = $1 AND tenant_id = $2 AND user_id IS NOT NULL RETURNING user_id`,
      [cand.firebase_uid, cand.tenant_id],
    )).rows[0];
    if (!ident) { await client.query("ROLLBACK"); return null; }
    await client.query(`UPDATE users SET is_active = false, password_changed_at = now(), updated_at = now() WHERE id = $1`, [ident.user_id]);
    await client.query("COMMIT");
    return { tenantId: Number(cand.tenant_id), userId: Number(ident.user_id) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
