/**
 * Sincronización Firebase → EduPay: lee el estado local, arma el plan (`firebase-bridge-plan.ts`) y, solo si se
 * pide aplicar, lo ejecuta en UNA transacción. Dry-run por defecto: solo SELECT.
 *
 * Garantías: un candado por escuela serializa las corridas (si ya hay otra en curso, ésta se OMITE, no espera) y el
 * plan se calcula DENTRO de la transacción (con el candado ya tomado); nunca borra; nunca modifica un vínculo
 * alumno-tutor existente (ahí vive la decisión de la escuela sobre el responsable de pago); no toca cargos, pagos ni
 * becas. Lo único que hace sobre usuarios es DESACTIVAR (`is_active = false`) a quien el Dashboard declara de baja,
 * nunca a un superadministrador. Si una corrida supera los límites de cambios masivos, se aborta sin escribir nada
 * (salvo `allowMassChanges`). La auditoría va después del COMMIT y, si falla, a la cola de reintentos (ADR-001).
 */
import type { Pool } from "pg";
import { enqueueAuditLog, type AuditLogPayload } from "../audit-retry";
import { publishDataChange } from "./realtime-bus";
import {
  planFirebaseSync, studentKey,
  type BridgePayload, type LocalState, type LocalStaffCandidate, type LocalLinkedUser, type LocalStudent, type SyncGuards, type SyncPlan, type SyncReport,
} from "./firebase-bridge-plan";

/** La corrida supera los límites de cambios masivos: no se escribió nada. Hay que revisar y aplicar a mano. */
export class SyncGuardError extends Error {
  constructor(public readonly guards: SyncGuards) {
    super(`Sincronización abortada por límites de seguridad: ${guards.violations.join(" ")}`);
    this.name = "SyncGuardError";
  }
}

/** Otra sincronización de la misma escuela está en curso: esta corrida se omite. */
export class SyncBusyError extends Error {
  constructor() { super("Otra sincronización de esta escuela está en curso; se omite esta corrida."); this.name = "SyncBusyError"; }
}

interface Queryable { query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> }
export type BridgeDb = Pick<Pool, "connect">;

export async function loadLocalState(db: Queryable, tenantId: number): Promise<LocalState> {
  const tenant = (await db.query(`SELECT id, firebase_id_escuela FROM tenants WHERE id = $1`, [tenantId])).rows[0];
  if (!tenant) throw new Error(`No existe la escuela (tenant) ${tenantId}.`);

  const [campus, students, guardians, links, unlinkedStudents, unlinkedGuardians, staff, linkedUsers] = await Promise.all([
    db.query(`SELECT nivel, campus_id FROM firebase_campus_map WHERE tenant_id = $1`, [tenantId]),
    db.query(
      `SELECT fs.firebase_uid, s.id, s.campus_id, s.nivel_escolar, s.grado, s.grupo, s.turno, s.status,
              (SELECT MIN(fam.family_id) FROM family_students fam WHERE fam.student_id = s.id) AS family_id
         FROM firebase_students fs JOIN students s ON s.id = fs.student_id
        WHERE fs.tenant_id = $1`, [tenantId]),
    db.query(
      `SELECT ei.subject, g.id, g.email
         FROM external_identities ei JOIN guardians g ON g.id = ei.guardian_id
        WHERE ei.tenant_id = $1 AND ei.provider = 'firebase' AND ei.guardian_id IS NOT NULL`, [tenantId]),
    db.query(
      `SELECT sg.student_id, sg.guardian_id
         FROM student_guardian sg JOIN firebase_students fs ON fs.student_id = sg.student_id
        WHERE fs.tenant_id = $1`, [tenantId]),
    db.query(
      `SELECT s.nombre_completo, s.campus_id
         FROM students s JOIN campuses c ON c.id = s.campus_id
        WHERE c.tenant_id = $1 AND NOT EXISTS (SELECT 1 FROM firebase_students fs WHERE fs.student_id = s.id)`, [tenantId]),
    db.query(
      `SELECT lower(g.email) AS email
         FROM guardians g
        WHERE g.tenant_id = $1
          AND NOT EXISTS (SELECT 1 FROM external_identities ei WHERE ei.guardian_id = g.id AND ei.provider = 'firebase')`, [tenantId]),
    db.query(
      `SELECT firebase_uid, nombre_completo, email, rol_dashboard, departamento, registro_sep, estado
         FROM firebase_staff_candidates WHERE tenant_id = $1`, [tenantId]),
    db.query(
      `SELECT ei.subject, u.id, u.role, u.is_active, u.is_super_admin
         FROM external_identities ei JOIN users u ON u.id = ei.user_id
        WHERE ei.tenant_id = $1 AND ei.provider = 'firebase' AND ei.user_id IS NOT NULL`, [tenantId]),
  ]);

  return {
    tenantId,
    firebaseIdEscuela: tenant.firebase_id_escuela ?? null,
    campusByNivel: new Map(campus.rows.map((r) => [String(r.nivel).trim().toLowerCase(), Number(r.campus_id)])),
    studentByUid: new Map(students.rows.map((r): [string, LocalStudent] => [String(r.firebase_uid), {
      studentId: Number(r.id), campusId: r.campus_id == null ? null : Number(r.campus_id), nivel: r.nivel_escolar ?? null,
      grado: r.grado ?? null, grupo: r.grupo ?? null, turno: r.turno ?? null, status: r.status ?? null,
      familyId: r.family_id == null ? null : Number(r.family_id),
    }])),
    guardianByUid: new Map(guardians.rows.map((r) => [String(r.subject), { guardianId: Number(r.id), email: r.email ?? null }])),
    existingLinks: new Set(links.rows.map((r) => `${Number(r.student_id)}:${Number(r.guardian_id)}`)),
    unlinkedStudentKeys: new Set(unlinkedStudents.rows.map((r) => studentKey(String(r.nombre_completo ?? ""), r.campus_id == null ? null : Number(r.campus_id)))),
    unlinkedGuardianEmails: new Set(unlinkedGuardians.rows.map((r) => String(r.email ?? "")).filter(Boolean)),
    staffByUid: new Map(staff.rows.map((r): [string, LocalStaffCandidate] => [String(r.firebase_uid), {
      nombreCompleto: String(r.nombre_completo ?? ""), email: r.email ?? null, rolDashboard: r.rol_dashboard ?? null,
      departamento: r.departamento ?? null,
      registroSep: Array.isArray(r.registro_sep) ? r.registro_sep : [], estado: String(r.estado ?? "activo"),
    }])),
    linkedStaffUsers: new Map(linkedUsers.rows.map((r): [string, LocalLinkedUser] => [String(r.subject), {
      userId: Number(r.id), role: String(r.role ?? ""), isActive: r.is_active !== false, isSuperAdmin: r.is_super_admin === true,
    }])),
  };
}

const UPDATABLE = new Set(["nivel_escolar", "grado", "grupo", "turno", "campus_id", "status"]);

async function executePlan(client: Queryable, plan: SyncPlan, local: LocalState): Promise<void> {
  const tenantId = plan.tenantId;
  const studentIds = new Map<string, number>(Array.from(local.studentByUid).map(([uid, s]) => [uid, s.studentId]));
  const guardianIds = new Map<string, number>(Array.from(local.guardianByUid).map(([uid, g]) => [uid, g.guardianId]));
  const familyIds = new Map<string, number>();

  for (const g of plan.guardianCreates) {
    const ins = await client.query(
      `INSERT INTO guardians (tipo_guardian, nombres, apellido_paterno, apellido_materno, email, nombre_completo, celular, telefono_casa_oficina, tenant_id, campus_id)
       VALUES ('tutor', $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [g.nombres, g.apellido_paterno, g.apellido_materno, g.email, g.nombre_completo, g.celular, g.telefono_casa_oficina, tenantId, g.campus_id],
    );
    const id = Number(ins.rows[0].id);
    const ident = await client.query(
      `INSERT INTO external_identities (provider, subject, tenant_id, guardian_id, linked_by)
       VALUES ('firebase', $1, $2, $3, NULL) ON CONFLICT (provider, subject) DO NOTHING`,
      [g.uid, tenantId, id],
    );
    if (!ident.rowCount) throw new Error("Un uid de Firebase ya está vinculado a otra persona de EduPay; se cancela toda la sincronización.");
    guardianIds.set(g.uid, id);
  }

  for (const f of plan.families) {
    const ins = await client.query(
      `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal, status)
       VALUES ($1, $2, $3, $4, 'activo') RETURNING id`,
      [tenantId, f.campus_id, f.nombre, f.principalGuardianUid ? guardianIds.get(f.principalGuardianUid) ?? null : null],
    );
    familyIds.set(f.key, Number(ins.rows[0].id));
  }

  for (const s of plan.studentCreates) {
    const ins = await client.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, apellido_materno, nombre_completo, nivel_escolar, grado, grupo, turno, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [tenantId, s.campus_id, s.nombres, s.apellido_paterno, s.apellido_materno, s.nombre_completo, s.nivel_escolar, s.grado, s.grupo, s.turno, s.status],
    );
    const id = Number(ins.rows[0].id);
    await client.query(`INSERT INTO firebase_students (tenant_id, firebase_uid, student_id) VALUES ($1, $2, $3)`, [tenantId, s.uid, id]);
    const familyId = "existingId" in s.family ? s.family.existingId : familyIds.get(s.family.newKey);
    if (familyId == null) throw new Error("Plan inconsistente: alumno sin familia.");
    await client.query(`INSERT INTO family_students (family_id, student_id) VALUES ($1, $2)`, [familyId, id]);
    studentIds.set(s.uid, id);
  }

  for (const u of plan.studentUpdates) {
    const keys = Object.keys(u.fields).filter((k) => UPDATABLE.has(k));
    if (!keys.length) continue;
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    await client.query(
      `UPDATE students SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => (u.fields as Record<string, unknown>)[k]), u.studentId],
    );
  }

  for (const l of plan.links) {
    const sid = studentIds.get(l.studentUid); const gid = guardianIds.get(l.guardianUid);
    if (sid == null || gid == null) throw new Error("Plan inconsistente: vínculo sin alumno o tutor.");
    // El responsable de pago nace con el valor por defecto de la tabla y nunca se reescribe aquí.
    await client.query(`INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [sid, gid]);
  }

  // Candidatos de personal: solo se guardan o se actualizan. Nunca se crean usuarios ni vínculos desde la sincronización.
  for (const c of plan.staffUpserts) {
    await client.query(
      `INSERT INTO firebase_staff_candidates (tenant_id, firebase_uid, nombre_completo, email, rol_dashboard, departamento, registro_sep, estado, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
       ON CONFLICT (tenant_id, firebase_uid) DO UPDATE
         SET nombre_completo = EXCLUDED.nombre_completo, email = EXCLUDED.email, rol_dashboard = EXCLUDED.rol_dashboard,
             departamento = EXCLUDED.departamento,
             registro_sep = EXCLUDED.registro_sep, estado = EXCLUDED.estado, synced_at = now()`,
      [tenantId, c.uid, c.nombre_completo, c.email, c.rol_dashboard, c.departamento, JSON.stringify(c.registro_sep), c.estado],
    );
  }

  // Baja o cuenta deshabilitada declarada por el Dashboard: el usuario queda inactivo. Con eso cada petición de su
  // sesión abierta recibe 401, su inicio de sesión (contraseña o SSO) se rechaza y sus conexiones en vivo se cierran.
  // El vínculo con su uid se conserva: reactivarlo es decisión de un superadmin. Nunca a un superadmin de plataforma.
  for (const d of plan.userDeactivations) {
    await client.query(
      `UPDATE users SET is_active = false, updated_at = now()
        WHERE id = $1 AND is_active IS DISTINCT FROM false AND COALESCE(is_super_admin, false) = false AND role <> 'super_admin'`,
      [d.userId],
    );
  }
}

export interface RunSyncOptions {
  db: BridgeDb;
  tenantId: number;
  payload: BridgePayload;
  apply: boolean;
  /** Solo para una corrida manual y revisada: permite superar los límites de cambios masivos. */
  allowMassChanges?: boolean;
}

export interface RunSyncResult { applied: boolean; report: SyncReport }

export async function runFirebaseSync({ db, tenantId, payload, apply, allowMassChanges = false }: RunSyncOptions): Promise<RunSyncResult> {
  const client = await db.connect();
  let committed = false;
  let report: SyncReport;
  let deactivations: SyncPlan["userDeactivations"] = [];
  try {
    if (!apply) {
      await client.query("BEGIN READ ONLY");
      const local = await loadLocalState(client, tenantId);
      report = planFirebaseSync(payload, local).report;
      await client.query("ROLLBACK");
      return { applied: false, report };
    }
    await client.query("BEGIN");
    // Con una corrida cada pocos minutos, esperar el candado acumularía corridas: si está ocupado, se omite esta.
    const lock = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`, [`firebase-bridge:${tenantId}`]);
    if (lock.rows[0]?.locked === false) throw new SyncBusyError();
    const local = await loadLocalState(client, tenantId);
    const plan = planFirebaseSync(payload, local);
    // Límites de cambios masivos: ante un Dashboard con datos anómalos no se escribe nada (el ROLLBACK lo hace el catch).
    if (!plan.report.guards.ok && !allowMassChanges) throw new SyncGuardError(plan.report.guards);
    await executePlan(client, plan, local);
    await client.query("COMMIT");
    committed = true;
    report = plan.report;
    deactivations = plan.userDeactivations;
  } catch (err) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const audits: AuditLogPayload[] = [{
    tenant_id: tenantId, user_id: null, action: "firebase_bridge.sync", entity_type: "tenant", entity_id: tenantId,
    metadata: { generadoEn: report.generadoEn, creados: { alumnos: report.studentsToCreate, tutores: report.guardiansToCreate, vinculos: report.linksToCreate, familias: report.familiesToCreate, personal: report.staffToCreate }, actualizados: report.studentsToUpdate, personalActualizado: report.staffToUpdate, usuariosDesactivados: report.usersToDeactivate, omitidos: report.skipped, avisos: report.warnings, masivoPermitido: allowMassChanges || undefined },
  },
  // Una entrada por usuario desactivado: quién (uid y rol), por qué y que la decisión vino del Dashboard.
  ...deactivations.map((d): AuditLogPayload => ({
    tenant_id: tenantId, user_id: null, action: "user.deactivated_by_dashboard", entity_type: "user", entity_id: d.userId,
    metadata: { uid: d.uid, rol: d.role, motivo: d.motivo, origen: "firebase_bridge.sync" },
  }))];
  const auditClient = await db.connect();
  try {
    for (const audit of audits) {
      try {
        await auditClient.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
          [audit.tenant_id, audit.user_id, audit.action, audit.entity_type, audit.entity_id, JSON.stringify(audit.metadata)],
        );
      } catch (err) {
        enqueueAuditLog(audit, err);
      }
    }
  } finally {
    auditClient.release();
  }
  // Avisa a los navegadores abiertos (por LISTEN/NOTIFY, desde este proceso hacia el servicio) solo si la corrida cambió algo.
  const changed = Object.entries(report as unknown as Record<string, unknown>)
    .some(([key, value]) => /To(Create|Update|Deactivate)$/.test(key) && typeof value === "number" && value > 0);
  if (changed) {
    try {
      const noticeClient = await db.connect();
      try { await publishDataChange(noticeClient, { tenantId, source: "sync" }); } finally { noticeClient.release(); }
    } catch { /* el aviso es opcional: los datos ya están confirmados */ }
  }
  return { applied: true, report };
}
