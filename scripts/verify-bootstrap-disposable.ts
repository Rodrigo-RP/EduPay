import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import { assertTestDatabase } from "../server/lib/database-safety";
import { bootstrapInstitution, BootstrapError, changeInitialPassword, BOOTSTRAP_PASSWORD_PENDING_SQL, type BootstrapClient } from "../server/lib/bootstrap";

// Sólo CI, en una segunda base vacía y desechable. Nunca sobre DATABASE_URL
// del espacio de trabajo ni sobre la futura base de producción.
if (process.env.CI !== "true") throw new Error("Esta prueba sólo corre en CI desechable");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message); // No volcar objetos con credenciales.
}
try {
  const identity = await pool.query("SELECT current_database() AS name");
  check(identity.rows[0]?.name === "edupay_bootstrap_ci", "Nombre de base de prueba inesperado");
  await assertTestDatabase(pool);
  const token = randomBytes(32).toString("hex");
  const env = { APP_ENV: "production", BOOTSTRAP_TOKEN: token };
  const data = {
    institutionName: "Prueba desechable", rfc: "XAXX010101000", campusName: "Prueba",
    adminName: "Prueba", adminEmail: "initial@example.invalid",
  };
  const counts = async () => (await pool.query(`SELECT
    (SELECT count(*)::int FROM tenants) AS tenants,
    (SELECT count(*)::int FROM campuses) AS campuses,
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM audit_retry_queue) AS audits`)).rows[0];
  check(Object.values(await counts()).every(value => value === 0), "La prueba exige base vacía");
  // Un fallo real dentro de la transacción revierte todas las filas.
  const failOutbox = {
    async connect(): Promise<BootstrapClient> {
      const client = await pool.connect();
      return {
        async query(sql, values) {
          if (sql.startsWith("INSERT INTO audit_retry_queue")) throw new Error("outbox_simulado");
          return client.query(sql, values);
        },
        release() { client.release(); },
      };
    },
  };
  let rolledBack = false;
  try { await bootstrapInstitution(failOutbox, data, token, env); }
  catch (error) { rolledBack = error instanceof Error && error.message === "outbox_simulado"; }
  check(rolledBack && Object.values(await counts()).every(value => value === 0), "El fallo no revirtió todo");

  // Dos solicitudes concurrentes: exactamente una confirma.
  const results = await Promise.allSettled([
    bootstrapInstitution(pool, data, token, env),
    bootstrapInstitution(pool, data, token, env),
  ]);
  check(results.filter(result => result.status === "fulfilled").length === 1, "Bootstrap duplicado");
  const denied = results.find(result => result.status === "rejected");
  check(denied?.status === "rejected" && denied.reason instanceof BootstrapError && denied.reason.status === 409, "El segundo uso no fue rechazado");
  const success = results.find(result => result.status === "fulfilled");
  check(success?.status === "fulfilled", "No hubo inicialización");
  const actual = await counts();
  check(Object.values(actual).every(value => value === 1), "Número de filas inesperado");
  const user = (await pool.query(`SELECT u.password_hash, u.role, u.is_super_admin,
    u.password_changed_at, c.onboarding_steps_completados
    FROM users u JOIN campuses c ON c.id=u.campus_id WHERE u.id=$1`, [success.value.userId])).rows[0];
  check(user.role === "administrador_general" && user.is_super_admin === false && user.password_changed_at === null, "Rol o contraseña temporal incorrectos");
  check(await bcrypt.compare(success.value.temporaryPassword, user.password_hash), "El hash no corresponde");
  check(user.onboarding_steps_completados._bootstrap.completed === true, "No quedó el marcador durable");
  const newHash = await bcrypt.hash(randomBytes(32).toString("hex"), 4);
  const actor = { id: success.value.userId, tenantId: success.value.tenantId, campusId: success.value.campusId };
  await changeInitialPassword(pool, actor, user.password_hash, newHash);
  const changed = (await pool.query(`SELECT ${BOOTSTRAP_PASSWORD_PENDING_SQL} AS pending,
    u.password_changed_at FROM users u JOIN campuses c ON c.id=u.campus_id WHERE u.id=$1`, [actor.id])).rows[0];
  check(changed.pending === false && changed.password_changed_at !== null, "No terminó el cambio obligatorio");
  let repeatDenied = false;
  try { await changeInitialPassword(pool, actor, user.password_hash, newHash); }
  catch (error) { repeatDenied = error instanceof BootstrapError && error.status === 409; }
  check(repeatDenied, "Se permitió reusar la contraseña temporal");
  check((await counts()).audits === 2, "Auditorías duplicadas o faltantes");
  console.log("[bootstrap:disposable] rollback real correcto; concurrencia 1 creada/1 rechazada; 1 institución, 1 campus, 1 administrador; 2 outbox y cambio obligatorio confirmado");
} finally { await pool.end(); }
