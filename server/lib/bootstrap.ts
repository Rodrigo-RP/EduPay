import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";

// Se usa el JSONB de onboarding ya migrado. Esta clave reservada sólo la
// escribe bootstrap; el wizard mezcla pasos de una lista cerrada, no la borra.
// No representa un permiso y nunca se toma de una petición autenticada.
export const BOOTSTRAP_PASSWORD_PENDING_SQL = `(
  c.onboarding_steps_completados->'_bootstrap'->>'user_id' = u.id::text
  AND u.password_changed_at IS NULL
)`;

export function isInitialPasswordSession(request: unknown): boolean {
  if (typeof request !== "object" || request === null || !("user" in request)) return false;
  const user = request.user;
  return typeof user === "object" && user !== null &&
    "requires_password_change" in user && user.requires_password_change === true;
}

const inputSchema = z.object({
  institutionName: z.string().trim().min(1).max(255),
  rfc: z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "RFC inválido"),
  campusName: z.string().trim().min(1).max(255),
  adminName: z.string().trim().min(1).max(255),
  adminEmail: z.string().trim().toLowerCase().email().max(255),
}).strict();

export interface BootstrapClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface BootstrapPool { connect(): Promise<BootstrapClient> }
export class BootstrapError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function idFrom(rows: Record<string, unknown>[]): number {
  const id = rows[0]?.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error("La base no confirmó el identificador creado");
  }
  return id;
}

export async function bootstrapInstitution(
  pool: BootstrapPool,
  body: unknown,
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.APP_ENV !== "production" || !env.BOOTSTRAP_TOKEN || env.BOOTSTRAP_TOKEN.length < 32) {
    throw new BootstrapError(503, "La inicialización no está habilitada.");
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!token || !timingSafeEqual(digest(token), digest(env.BOOTSTRAP_TOKEN))) {
    throw new BootstrapError(403, "Inicialización no autorizada.");
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) throw new BootstrapError(400, "Revisa el nombre de institución, RFC, campus, nombre y correo del administrador.");

  const temporaryPassword = randomBytes(24).toString("base64url") + "!aA7";
  const hash = await bcrypt.hash(temporaryPassword, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Bloquea también creaciones simultáneas por otras rutas; el chequeo y los
    // tres INSERT comparten conexión y transacción. Un segundo uso ve la base ocupada.
    await client.query("LOCK TABLE tenants, campuses, users IN SHARE ROW EXCLUSIVE MODE");
    const occupied = await client.query(`
      SELECT EXISTS (SELECT 1 FROM users)
          OR EXISTS (SELECT 1 FROM tenants)
          OR EXISTS (SELECT 1 FROM campuses) AS occupied
    `);
    if (occupied.rows[0]?.occupied !== false) {
      throw new BootstrapError(409, "La inicialización ya no está disponible.");
    }
    const data = parsed.data;
    const tenantId = idFrom((await client.query(
      "INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id",
      [data.institutionName, data.rfc],
    )).rows);
    const campusId = idFrom((await client.query(
      "INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id",
      [tenantId, data.campusName],
    )).rows);
    const userId = idFrom((await client.query(
      `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active, is_super_admin)
       VALUES ($1, $2, $3, $4, $5, 'administrador_general', true, false) RETURNING id`,
      [tenantId, campusId, data.adminName, data.adminEmail, hash],
    )).rows);
    await client.query(
      `UPDATE campuses SET onboarding_steps_completados =
         onboarding_steps_completados || jsonb_build_object('_bootstrap',
           jsonb_build_object('completed', true, 'user_id', $1::int))
       WHERE id = $2 AND tenant_id = $3`,
      [userId, campusId, tenantId],
    );
    // Outbox durable en la misma transacción, no INSERT en audit_log.
    // El worker escribe audit_log fuera de esta transacción (ADR-001).
    // Nunca se guardan token, contraseña, hash ni correo en el payload.
    await client.query(
      "INSERT INTO audit_retry_queue (payload) VALUES ($1::jsonb)",
      [JSON.stringify({
        tenant_id: tenantId, user_id: userId,
        action: "bootstrap_completed", entity_type: "tenant", entity_id: tenantId,
        metadata: { campus_id: campusId, initial_admin_id: userId, password_change_required: true },
      })],
    );
    await client.query("COMMIT");
    return { tenantId, campusId, userId, temporaryPassword, requiresPasswordChange: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Sólo el cambio obligatorio inicial: contraseña y outbox confirman juntos. */
export async function changeInitialPassword(
  pool: BootstrapPool,
  actor: { id: number; tenantId: number; campusId: number },
  previousHash: string,
  newHash: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE users SET password_hash=$1, password_changed_at=NOW(), updated_at=NOW()
        WHERE id=$2 AND tenant_id=$3 AND campus_id=$4 AND password_hash=$5
          AND password_changed_at IS NULL RETURNING id`,
      [newHash, actor.id, actor.tenantId, actor.campusId, previousHash],
    );
    if (updated.rows.length !== 1) throw new BootstrapError(409, "La contraseña ya cambió. Inicia sesión de nuevo.");
    await client.query("INSERT INTO audit_retry_queue (payload) VALUES ($1::jsonb)", [
      JSON.stringify({
        tenant_id: actor.tenantId, user_id: actor.id,
        action: "bootstrap_password_changed", entity_type: "user", entity_id: actor.id,
        metadata: { campus_id: actor.campusId },
      }),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
