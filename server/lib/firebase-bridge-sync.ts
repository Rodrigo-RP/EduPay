/**
 * Sincronización Firebase → EduPay: lee el estado local, arma el plan (`firebase-bridge-plan.ts`) y, solo si se
 * pide aplicar, lo ejecuta en UNA transacción. Dry-run por defecto: solo SELECT.
 *
 * Garantías: un candado por escuela serializa las corridas y el plan se calcula DENTRO de la transacción (con el
 * candado ya tomado); nunca borra; nunca modifica un vínculo alumno-tutor existente (ahí vive la decisión de la
 * escuela sobre el responsable de pago); no toca cargos, pagos ni becas. La auditoría va después del COMMIT y, si
 * falla, a la cola de reintentos (ADR-001).
 */
import type { Pool } from "pg";
import { enqueueAuditLog, type AuditLogPayload } from "../audit-retry";
import {
  planFirebaseSync, studentKey,
  type BridgePayload, type LocalState, type LocalStudent, type SyncPlan, type SyncReport,
} from "./firebase-bridge-plan";

interface Queryable { query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> }
export type BridgeDb = Pick<Pool, "connect">;

export async function loadLocalState(db: Queryable, tenantId: number): Promise<LocalState> {
  const tenant = (await db.query(`SELECT id, firebase_id_escuela FROM tenants WHERE id = $1`, [tenantId])).rows[0];
  if (!tenant) throw new Error(`No existe la escuela (tenant) ${tenantId}.`);

  const [campus, students, guardians, links, unlinkedStudents, unlinkedGuardians] = await Promise.all([
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
}

export interface RunSyncOptions {
  db: BridgeDb;
  tenantId: number;
  payload: BridgePayload;
  apply: boolean;
}

export interface RunSyncResult { applied: boolean; report: SyncReport }

export async function runFirebaseSync({ db, tenantId, payload, apply }: RunSyncOptions): Promise<RunSyncResult> {
  const client = await db.connect();
  let committed = false;
  let report: SyncReport;
  try {
    if (!apply) {
      await client.query("BEGIN READ ONLY");
      const local = await loadLocalState(client, tenantId);
      report = planFirebaseSync(payload, local).report;
      await client.query("ROLLBACK");
      return { applied: false, report };
    }
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`firebase-bridge:${tenantId}`]);
    const local = await loadLocalState(client, tenantId);
    const plan = planFirebaseSync(payload, local);
    await executePlan(client, plan, local);
    await client.query("COMMIT");
    committed = true;
    report = plan.report;
  } catch (err) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const audit: AuditLogPayload = {
    tenant_id: tenantId, user_id: null, action: "firebase_bridge.sync", entity_type: "tenant", entity_id: tenantId,
    metadata: { generadoEn: report.generadoEn, creados: { alumnos: report.studentsToCreate, tutores: report.guardiansToCreate, vinculos: report.linksToCreate, familias: report.familiesToCreate }, actualizados: report.studentsToUpdate, omitidos: report.skipped, avisos: report.warnings },
  };
  const auditClient = await db.connect();
  try {
    await auditClient.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
      [audit.tenant_id, audit.user_id, audit.action, audit.entity_type, audit.entity_id, JSON.stringify(audit.metadata)],
    );
  } catch (err) {
    enqueueAuditLog(audit, err);
  } finally {
    auditClient.release();
  }
  return { applied: true, report };
}
