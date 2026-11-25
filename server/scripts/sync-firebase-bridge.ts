/**
 * Sincroniza alumnos, tutores y vínculos desde el puente del Dashboard (Firebase) hacia la base de EduPay (PostgreSQL; producción es Cloud SQL PG18).
 *
 *   npm run sync:firebase-bridge -- --tenant=<id>                          dry-run: solo SELECT, imprime el reporte
 *   npm run sync:firebase-bridge -- --tenant=<id> --apply --confirm-tenant=<id>   escribe (una transacción)
 *   ... --apply --confirm-tenant=<id> --allow-mass-changes   solo manual y revisada: permite superar los límites de cambios masivos
 *
 * Si la corrida supera los límites de cambios masivos se ABORTA sin escribir y termina con código 1 (línea
 * `[sync:abortado]` en stderr, severidad ERROR en Cloud Logging). Si ya hay otra corrida en curso, se omite
 * (`[sync:omitida]`, código 0).
 *
 * Variables: DATABASE_URL, EDUPAY_BRIDGE_URL y, fuera de Google Cloud, EDUPAY_BRIDGE_SA_KEY (JSON de la cuenta de
 * servicio). Contrato y pasos: docs/SINCRONIZACION-DASHBOARD.md. El reporte solo trae conteos, nunca datos personales.
 * Aplicar contra una base real exige autorización explícita del dueño (CLAUDE.md).
 */
import { pool } from "../db";
import { bridgeOptionsFromEnv, fetchBridgePayload, BridgeError } from "../lib/firebase-bridge-client";
import { runFirebaseSync, SyncGuardError, SyncBusyError } from "../lib/firebase-bridge-sync";

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

async function main() {
  const tenantId = Number(arg("tenant"));
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) throw new Error("Indica --tenant=<id numérico>.");
  const apply = arg("apply") === "true";
  if (apply && Number(arg("confirm-tenant")) !== tenantId) {
    throw new Error("Para aplicar repite el id: --apply --confirm-tenant=<mismo id>.");
  }

  const idEscuela = (await pool.query(`SELECT firebase_id_escuela FROM tenants WHERE id = $1`, [tenantId])).rows[0]?.firebase_id_escuela;
  if (!idEscuela) throw new Error("La escuela no tiene firebase_id_escuela; asóciala primero (PUT /api/super-admin/tenants/:id/firebase-escuela).");

  const payload = await fetchBridgePayload(bridgeOptionsFromEnv(), idEscuela);
  const allowMassChanges = arg("allow-mass-changes") === "true";
  if (allowMassChanges && !apply) throw new Error("--allow-mass-changes solo tiene sentido con --apply.");
  const result = await runFirebaseSync({ db: pool, tenantId, payload, apply, allowMassChanges });
  console.log(JSON.stringify({ modo: result.applied ? "aplicado" : "dry-run (no se escribió nada)", tenantId, reporte: result.report }, null, 2));
  // En simulacro no se aborta (no escribe nada), pero el reporte ya trae `guards`; un aviso facilita ver el problema en los registros.
  if (!result.report.guards.ok) console.error(`[sync:aviso] Esta corrida superaría los límites de seguridad: ${result.report.guards.violations.join(" ")}`);
}

main()
  .catch((err) => {
    if (err instanceof SyncBusyError) { console.log(`[sync:omitida] ${err.message}`); return; }
    if (err instanceof SyncGuardError) {
      console.error(`[sync:abortado] ${err.message} No se escribió nada. Revisa el Dashboard y, si los cambios son correctos, aplica a mano con --allow-mass-changes. Detalle: ${JSON.stringify(err.guards)}`);
      process.exitCode = 1;
      return;
    }
    console.error(err instanceof BridgeError ? `[puente:${err.code}] ${err.message}` : `Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
