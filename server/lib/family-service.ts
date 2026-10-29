/**
 * family-service.ts — Función central de creación/vinculación de familias.
 *
 * Diseño (aprobado): ambos endpoints (POST /api/admin/families y el import
 * masivo POST /api/import/data/familias/tutores) llaman a esta función.
 * Toda la lógica de dominio vive aquí; las rutas normalizan el input y delegan.
 *
 * Contrato:
 *  - Detección de familia existente: por student_ids en family_students,
 *    no por nombre. El nombre es solo una etiqueta de display.
 *  - Deduplicación de guardians: CURP > email. Nunca sobrescribe email/CURP
 *    de un guardian existente; el celular solo se completa si estaba vacío.
 *  - Porcentajes: suma exactamente 100 para los responsables de pago,
 *    excepción: un solo responsable sin porcentaje → default 100 (sin error).
 *  - guardian_id_principal = primer tutor con es_responsable_pago=true.
 *
 * Transacción:
 *  - Sin externalClient: crea su propio pool.connect() + BEGIN/COMMIT/ROLLBACK.
 *  - Con externalClient: participa en la transacción exterior; no emite
 *    BEGIN/COMMIT/ROLLBACK propios. El llamador es responsable de la txn.
 *    Usar SAVEPOINTs en el llamador para garantizar rollback parcial si falla.
 *
 * Contacto: correo opcional y NULL en ambas columnas si está ausente.
 * El tutor principal debe tener celular mexicano; no se inventan contactos.
 */

import { pool } from "../db";
import { getFamilyGuardianIds, getGuardiansWithoutActiveFamilies } from "./family-access";
import { CURP_RE } from "./validators";
import { normalizeGuardianEmail, normalizeGuardianMobile } from "./guardian-contact";

// ── Interfaz de cliente DB (compatible con pool.connect() y PoolClient) ───────

interface DbClient {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

interface ReleasableDbClient extends DbClient {
  release(): void;
}

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface TutorInput {
  /** Si viene, busca y vincula el guardian existente por ID. */
  guardian_id?: number;

  /** Datos para crear guardian nuevo (cuando no viene guardian_id). */
  tipo_guardian?: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  correo_institucional_familiar?: string | null;
  email?: string | null;  // alias reconocido de correo_institucional_familiar
  curp?: string;
  rfc?: string;
  celular?: string | null;
  telefono_casa_oficina?: string;
  calle?: string;
  numero_exterior?: string;
  numero_interior?: string;
  colonia?: string;
  codigo_postal?: string;
  municipio?: string;
  estado?: string;
  contacto_emergencia_nombre?: string;
  contacto_emergencia_telefono?: string;
  contacto_emergencia_relacion?: string;

  /** Relación con el(los) alumno(s). */
  es_responsable_pago: boolean;
  porcentaje_responsabilidad?: string | number;
}

export interface FamilyCreateInput {
  nombre: string;
  student_ids: number[];
  tutores: TutorInput[];
}

export interface FamilyCreateResult {
  family_id: number;
  family_nombre: string;
  guardians_created: Array<{ id: number; nombre: string }>;
  guardians_linked: Array<{ id: number }>;
  students_linked: number[];
  warnings: string[];
}

export interface FamilyActor { tenantId: number; campusId: number; userId: number }
export const familyNumber = (id: number) => `FAM${String(id).padStart(3, "0")}`;
const familyError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const redactIdentifiers = (text: string) => text
  .replace(new RegExp(`\\b${CURP_RE.source.slice(1, -1)}\\b`, "gi"), value => `****${value.slice(-4)}`)
  .replace(/\b[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}\b/gi, value => `****${value.slice(-4)}`);
const guardianFields = [
  "tipo_guardian", "nombres", "apellido_paterno", "apellido_materno",
  "curp", "rfc", "correo_institucional_familiar", "celular", "telefono_casa_oficina",
  "calle", "numero_exterior", "numero_interior", "colonia", "codigo_postal",
  "municipio", "estado", "contacto_emergencia_nombre",
  "contacto_emergencia_telefono", "contacto_emergencia_relacion",
] as const;

function normalizedTutor(raw: any): TutorInput {
  if (!raw || typeof raw !== "object") throw familyError("Tutor inválido");
  const tutor: any = { ...raw };
  for (const key of guardianFields) {
    if (raw[key] != null && typeof raw[key] !== "string") throw familyError(`${key} debe ser texto`);
    if (typeof raw[key] === "string") tutor[key] = raw[key].trim();
  }
  tutor.correo_institucional_familiar = normalizeGuardianEmail(
    raw.correo_institucional_familiar !== undefined ? raw.correo_institucional_familiar : raw.email,
  );
  tutor.celular = raw.celular === undefined ? undefined : normalizeGuardianMobile(raw.celular);
  if (!tutor.nombres || !tutor.apellido_paterno) throw familyError("Nombre y primer apellido del tutor son obligatorios");
  if (!["padre", "madre", "otro"].includes(tutor.tipo_guardian)) {
    throw familyError("El tipo de tutor debe ser padre, madre u otro");
  }
  tutor.curp = tutor.curp?.toUpperCase() || null;
  tutor.rfc = tutor.rfc?.toUpperCase() || null;
  if (tutor.curp && !CURP_RE.test(tutor.curp)) throw familyError("CURP con formato oficial inválido");
  if (tutor.rfc && !/^[A-ZÑ&]{4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/.test(tutor.rfc)) {
    throw familyError("RFC de persona física inválido: debe tener 13 caracteres");
  }
  if (tutor.codigo_postal && !/^\d{5}$/.test(tutor.codigo_postal)) {
    throw familyError("El código postal debe tener cinco dígitos");
  }
  for (const field of ["celular", "telefono_casa_oficina", "contacto_emergencia_telefono"]) {
    if (!tutor[field]) continue;
    const phone = tutor[field].replace(/[\s().-]/g, "");
    tutor[field] = /^\d{10}$/.test(phone) ? `+52${phone}` : /^52\d{10}$/.test(phone) ? `+${phone}` : phone;
    if (!/^\+52\d{10}$/.test(tutor[field])) {
      throw familyError(`${field}: escribe diez dígitos nacionales, con prefijo +52 opcional`);
    }
  }
  return tutor;
}

function requirePrincipalMobile(tutor: any) {
  if (!normalizeGuardianMobile(tutor?.celular)) {
    throw familyError("El celular del tutor principal es obligatorio: escribe diez dígitos nacionales, con prefijo +52 opcional");
  }
}

function validateResponsibilities(tutores: TutorInput[]) {
  const responsables = tutores.filter(t => t.es_responsable_pago);
  if (!responsables.length) throw familyError("Debe haber al menos un tutor con es_responsable_pago=true");
  const specified = responsables.filter(t => t.porcentaje_responsabilidad != null);
  if (specified.length && specified.length !== responsables.length) {
    throw familyError("Si especifica porcentaje_responsabilidad, todos los tutores con es_responsable_pago=true deben tenerlo especificado.", 422);
  }
  if (specified.length) {
    const suma = responsables.reduce((sum, t) => sum + Number(t.porcentaje_responsabilidad), 0);
    if (Math.round(suma * 100) !== 10000) {
      throw familyError(`La suma de porcentaje_responsabilidad de los tutores responsables es ${suma.toFixed(2)}%. Debe ser exactamente 100.`, 422);
    }
  } else if (responsables.length > 1) {
    throw familyError(`Con ${responsables.length} tutores responsables de pago, debe especificar porcentaje_responsabilidad para cada uno (suma = 100).`, 422);
  }
}

async function rejectDuplicateTutors(client: DbClient, tutores: TutorInput[], actor: FamilyActor) {
  // Sin migraciones: serializa altas/ediciones concurrentes por las claves de identidad
  // de la institución. Orden global para evitar inversión de bloqueos entre tutores.
  const keys = Array.from(new Set(tutores.flatMap(t => [
    ...(t.curp ? [`${actor.tenantId}:curp:${t.curp}`] : []),
    ...(t.correo_institucional_familiar ? [`${actor.tenantId}:email:${t.correo_institucional_familiar}`] : []),
  ]))).sort();
  for (const key of keys) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
  for (const tutor of tutores) {
    if (!tutor.curp && !tutor.correo_institucional_familiar) continue;
    const duplicate = await client.query(
      `SELECT g.id,g.campus_id,
         (SELECT f.id FROM families f LEFT JOIN family_students fs ON fs.family_id=f.id
          LEFT JOIN student_guardian sg ON sg.student_id=fs.student_id
          WHERE f.tenant_id=g.tenant_id AND (sg.guardian_id=g.id OR f.guardian_id_principal=g.id)
          ORDER BY f.id LIMIT 1) AS family_id
       FROM guardians g WHERE g.tenant_id=$1 AND g.id<>$2
       AND (($3::text IS NOT NULL AND UPPER(TRIM(g.curp))=$3)
         OR ($4::text IS NOT NULL AND (LOWER(TRIM(g.email))=$4 OR LOWER(TRIM(g.correo_institucional_familiar))=$4)))
       LIMIT 1`,
      [actor.tenantId, tutor.guardian_id || 0, tutor.curp || null, tutor.correo_institucional_familiar || null],
    );
    if (duplicate.rows.length) {
      const found = duplicate.rows[0];
      const reference = found.campus_id !== actor.campusId
        ? "otra familia de la institución (campus distinto)"
        : found.family_id ? `la familia ${familyNumber(found.family_id)}` : "un tutor existente sin familia vinculada";
      throw familyError(`CURP o correo ya registrado en ${reference}`, 409);
    }
  }
}

async function assertNoFamilyDebt(client: DbClient, familyId: number, actor: FamilyActor) {
  // Se bloquean los mismos cargos que bloquea el cobro antes de leer aplicaciones.
  const charges = await client.query(
    `SELECT c.id FROM charges c JOIN students s ON s.id=c.student_id
     JOIN family_students fs ON fs.student_id=s.id
     WHERE fs.family_id=$1 AND c.tenant_id=$2 AND s.campus_id=$3
       AND c.estado NOT IN ('cancelado','condonado')
     ORDER BY c.id FOR UPDATE OF c`,
    [familyId, actor.tenantId, actor.campusId],
  );
  if (!charges.rows.length) return;
  const debt = await client.query(
    `SELECT COALESCE(SUM(GREATEST(0,
       ROUND(c.monto_base_centavos*(1-COALESCE(c.beca_aplicada,0)::numeric/100))
       + COALESCE(c.recargo_aplicado_centavos,0)
       - COALESCE((SELECT SUM(pa.amount_centavos) FROM payment_applications pa WHERE pa.charge_id=c.id),0)
     )),0) AS saldo FROM charges c WHERE c.id=ANY($1::int[]) AND c.tenant_id=$2`,
    [charges.rows.map(c => c.id), actor.tenantId],
  );
  if (Number(debt.rows[0].saldo) > 0) {
    throw familyError("No se puede archivar: la familia tiene saldo pendiente", 409);
  }
}

/** Management writes share the transaction; imports retain their explicit linking contract. */
export async function manageFamily(
  operation: "create" | "update" | "status",
  familyId: number | null,
  input: any,
  actor: FamilyActor,
): Promise<any> {
  if (![actor.tenantId, actor.campusId, actor.userId].every(id => Number.isInteger(id) && id > 0)) {
    throw familyError("Sesión sin contexto administrativo válido", 403);
  }
  if (operation !== "create" && (!Number.isInteger(familyId) || Number(familyId) <= 0)) {
    throw familyError("Identificador de familia inválido");
  }
  if (operation !== "status" &&
      (typeof input?.nombre !== "string" || !input.nombre.trim() ||
       !Array.isArray(input.tutores) || !input.tutores.length)) {
    throw familyError("Nombre de familia y al menos un tutor son obligatorios");
  }
  if (operation === "status" && !["activo", "archivada"].includes(input?.status)) {
    throw familyError("Estatus de familia inválido");
  }
  if (operation !== "status") {
    input = { ...input, tutores: input.tutores.map(normalizedTutor) };
    const seen = new Set<string>();
    for (const tutor of input.tutores) {
      for (const key of [tutor.curp && `curp:${tutor.curp}`, tutor.correo_institucional_familiar && `email:${tutor.correo_institucional_familiar}`].filter(Boolean)) {
        if (seen.has(key as string)) throw familyError("Hay tutores repetidos en el formulario", 409);
        seen.add(key as string);
      }
    }
  }
  if (operation === "create" && (
    !Array.isArray(input.student_ids) || !input.student_ids.length ||
    input.student_ids.some((id: any) => !Number.isInteger(id) || id <= 0)
  )) throw familyError("Vincula al menos un alumno mediante identificadores válidos");
  if (operation === "create") {
    validateResponsibilities(input.tutores);
    requirePrincipalMobile(input.tutores.find((t: TutorInput) => t.es_responsable_pago) || input.tutores[0]);
  }
  if (operation === "status" && input.status === "archivada" &&
      (typeof input.motivo !== "string" || !input.motivo.trim() ||
       input.confirmacion !== true || input.confirmacion_final !== true)) {
    throw familyError("Archivar exige un motivo y las dos confirmaciones");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let result: any;
    let family: any;
    let beforeTutors: any[] = [];
    if (operation !== "create") {
      const found = await client.query(
        `SELECT * FROM families WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 FOR UPDATE`,
        [familyId, actor.tenantId, actor.campusId],
      );
      family = found.rows[0];
      if (!family) throw familyError("Familia no encontrada en este campus", 404);
      if (operation === "status" && family.status === input.status) {
        await client.query("COMMIT");
        return { id: familyId, status: family.status, numero_familia: familyNumber(familyId!), guardian_ids_revoked: [] };
      }
      if (operation === "update") {
        const linked = await getFamilyGuardianIds(client, familyId!, actor.tenantId);
        beforeTutors = (await client.query(
          `SELECT * FROM guardians WHERE id=ANY($1::int[]) AND tenant_id=$2 AND campus_id=$3 ORDER BY id FOR UPDATE`,
          [linked, actor.tenantId, actor.campusId],
        )).rows;
        for (const tutor of input.tutores) {
          if (!beforeTutors.some(g => g.id === Number(tutor.guardian_id))) {
            throw familyError("Tutor no encontrado en esta familia", 404);
          }
        }
        const principal = beforeTutors.find(g => g.id === family.guardian_id_principal)
          || (beforeTutors.length === 1 ? beforeTutors[0] : null);
        const updatedPrincipal = input.tutores.find((t: any) => Number(t.guardian_id) === principal?.id);
        requirePrincipalMobile(updatedPrincipal?.celular !== undefined ? updatedPrincipal : principal);
      }
    }
    if (operation !== "status") await rejectDuplicateTutors(client, input.tutores, actor);
    if (operation === "create") {
      const students = await client.query(
        `SELECT id FROM students WHERE id=ANY($1::int[]) AND tenant_id=$2 AND campus_id=$3 ORDER BY id FOR UPDATE`,
        [input.student_ids, actor.tenantId, actor.campusId],
      );
      if (students.rows.length !== new Set(input.student_ids).size) {
        throw familyError("Alumno no encontrado en este campus", 404);
      }
      const existing = await client.query(
        `SELECT DISTINCT f.id FROM families f JOIN family_students fs ON fs.family_id=f.id
         WHERE fs.student_id=ANY($1::int[]) AND f.tenant_id=$2 ORDER BY f.id`,
        [input.student_ids, actor.tenantId],
      );
      if (existing.rows.length > 1) throw familyError("Los alumnos pertenecen a familias distintas", 422);
      if (existing.rows.length) throw familyError(`Alumno vinculado a la familia ${familyNumber(existing.rows[0].id)}`, 409);
      if (input.tutores.some((t: TutorInput) => t.guardian_id)) {
        throw familyError("El tutor ya existe; edita su familia en lugar de crear otra", 409);
      }
      result = await createFamily(input, actor.tenantId, actor.campusId, client);
      familyId = result.family_id;
    } else if (operation === "update") {
      if (family.archived_at || family.status === "archivada") {
        throw familyError("Reactiva la familia antes de editar sus datos", 409);
      }
      const linked = await getFamilyGuardianIds(client, familyId!, actor.tenantId);
      for (const tutor of input.tutores) {
        if (!linked.includes(Number(tutor.guardian_id))) {
          throw familyError("Tutor no encontrado en esta familia", 404);
        }
        const keys = guardianFields.filter(key => tutor[key] !== undefined);
        const values: any[] = keys.map(key => tutor[key] || null);
        const assignments = keys.map((key, i) => `${key}=$${i + 1}`);
        if (tutor.correo_institucional_familiar !== undefined) {
          assignments.push(`email=$${values.push(tutor.correo_institucional_familiar)}`);
        }
        if (tutor.nombres !== undefined) {
          assignments.push(`nombre_completo=$${values.push(
            [tutor.nombres, tutor.apellido_paterno, tutor.apellido_materno].filter(Boolean).join(" "),
          )}`);
        }
        if (assignments.length) {
          values.push(tutor.guardian_id, actor.tenantId, actor.campusId);
          await client.query(
            `UPDATE guardians SET ${assignments.join(",")}, updated_at=NOW()
             WHERE id=$${values.length - 2} AND tenant_id=$${values.length - 1} AND campus_id=$${values.length}`,
            values,
          );
        }
      }
      await client.query(
        `UPDATE families SET nombre=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 AND campus_id=$4`,
        [input.nombre.trim(), familyId, actor.tenantId, actor.campusId],
      );
      result = { id: familyId, nombre: input.nombre.trim() };
    } else {
      if (input.status === "archivada") await assertNoFamilyDebt(client, familyId!, actor);
      await client.query(
        `UPDATE families SET status=$1::varchar, archived_at=CASE WHEN $1::varchar='archivada' THEN NOW() ELSE NULL END,
         archived_by=CASE WHEN $1::varchar='archivada' THEN $2::int ELSE NULL END, updated_at=NOW()
         WHERE id=$3 AND tenant_id=$4 AND campus_id=$5`,
        [input.status, actor.userId, familyId, actor.tenantId, actor.campusId],
      );
      let revoked: number[] = [];
      if (input.status === "archivada") {
        const linked = await getFamilyGuardianIds(client, familyId!, actor.tenantId);
        revoked = await getGuardiansWithoutActiveFamilies(client, linked, actor.tenantId);
        if (revoked.length) {
          await client.query(
            `UPDATE guardians SET password_changed_at=NOW()+INTERVAL '1 second',updated_at=NOW()
             WHERE id=ANY($1::int[]) AND tenant_id=$2`, [revoked, actor.tenantId],
          );
          await client.query(
            `UPDATE magic_link_tokens SET revoked_at=NOW()
             WHERE guardian_id=ANY($1::int[]) AND tenant_id=$2 AND revoked_at IS NULL`,
            [revoked, actor.tenantId],
          );
        }
      }
      result = { id: familyId, status: input.status, guardian_ids_revoked: revoked };
    }
    const changes: any[] = [];
    if (operation === "status") {
      changes.push({ campo: "status", antes: family.status, despues: input.status });
    } else {
      if (family?.nombre !== input.nombre.trim()) changes.push({ campo: "nombre" });
      for (const [index, tutor] of input.tutores.entries()) {
        const before = beforeTutors.find(g => g.id === Number(tutor.guardian_id)) || {};
        for (const key of guardianFields) {
          if (tutor[key] !== undefined && (before[key] || null) !== (tutor[key] || null)) {
            const change: any = { campo: `tutores.${tutor.guardian_id || index}.${key}` };
            // Ni los errores ni el audit contienen CURP/RFC completos.
            if (key === "curp" || key === "rfc") {
              change.antes = before[key] ? `****${String(before[key]).slice(-4)}` : null;
              change.despues = tutor[key] ? `****${String(tutor[key]).slice(-4)}` : null;
            }
            changes.push(change);
          }
        }
      }
    }
    if (changes.length) await client.query(
      `INSERT INTO audit_log (tenant_id,user_id,action,entity_type,entity_id,metadata)
       VALUES ($1,$2,$3,'family',$4,$5::jsonb)`,
      [actor.tenantId, actor.userId,
        operation === "status" ? input.status === "archivada" ? "archive" : "reactivate" : operation,
        familyId, JSON.stringify({
          campus_id: actor.campusId, cambios: changes,
          ...(operation === "status" && input.status === "archivada" ? { motivo: redactIdentifiers(input.motivo.trim()) } : {}),
        })],
    );
    await client.query("COMMIT");
    return { ...result, numero_familia: familyNumber(familyId!) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Función central ────────────────────────────────────────────────────────────

export async function createFamily(
  input: FamilyCreateInput,
  tenantId: number,
  campusId: number,
  externalClient?: DbClient,
): Promise<FamilyCreateResult> {
  const { nombre, student_ids } = input;
  const tutores = input.tutores.map(t => ({
    ...t,
    correo_institucional_familiar: normalizeGuardianEmail(
      t.correo_institucional_familiar !== undefined ? t.correo_institucional_familiar : t.email,
    ),
    celular: normalizeGuardianMobile(t.celular),
  }));
  const warnings: string[] = [];

  // ── Paso 1: Validación de porcentajes (sin queries) ─────────────────────────

  validateResponsibilities(tutores);
  // Un solo responsable sin porcentaje → OK (se usará "100.00" implícito).

  if (student_ids.length === 0) {
    const err = new Error("student_ids no puede estar vacío") as any;
    err.status = 400;
    throw err;
  }

  for (const tutor of tutores) {
    for (const [field, value] of [
      ["celular", tutor.celular],
      ["contacto_emergencia_telefono", tutor.contacto_emergencia_telefono],
    ] as const) {
      if (value && !/^\+[1-9]\d{7,14}$/.test(value)) {
        const err = new Error(`${field} debe estar normalizado en formato E.164`) as any;
        err.status = 422;
        throw err;
      }
    }
    if (tutor.codigo_postal && !/^\d{5}$/.test(tutor.codigo_postal)) {
      const err = new Error("codigo_postal debe tener exactamente 5 dígitos") as any;
      err.status = 422;
      throw err;
    }
  }

  // ── Determinar cliente y modo de transacción ─────────────────────────────────

  const ownConnection = externalClient == null;
  let client: DbClient;
  let poolClient: ReleasableDbClient | null = null;

  if (ownConnection) {
    poolClient = await pool.connect() as unknown as ReleasableDbClient;
    client = poolClient;
  } else {
    client = externalClient!;
  }

  const guardiansCreated: Array<{ id: number; nombre: string }> = [];
  const guardiansLinked:  Array<{ id: number }>                 = [];

  try {
    if (ownConnection) {
      await client.query("BEGIN");
    }

    // ── Paso 2: Verificar que los alumnos pertenecen al campus del token ────────

    const studentsCheck = await client.query(
      `SELECT id FROM students WHERE id = ANY($1::int[]) AND campus_id = $2 AND tenant_id = $3`,
      [student_ids, campusId, tenantId],
    );
    if ((studentsCheck.rows as any[]).length !== student_ids.length) {
      const found   = (studentsCheck.rows as any[]).map((r: any) => r.id);
      const missing = student_ids.filter(id => !found.includes(id));
      const err = new Error(
        `Alumno(s) no encontrado(s) en este campus: ${missing.join(", ")}`,
      ) as any;
      err.status = 422;
      throw err;
    }

    // ── Paso 3: Detectar familia(s) existente(s) vía family_students ────────────

    const fsCheck = await client.query(
      `SELECT DISTINCT family_id FROM family_students WHERE student_id = ANY($1::int[])`,
      [student_ids],
    );
    const existingFamilyIds = (fsCheck.rows as any[]).map((r: any) => Number(r.family_id));

    if (existingFamilyIds.length > 1) {
      const err = new Error(
        `Los alumnos del grupo pertenecen a familias distintas ` +
        `(ids: ${existingFamilyIds.join(", ")}). Separe el grupo en el CSV ` +
        `o unifique las familias manualmente.`,
      ) as any;
      err.status = 422;
      throw err;
    }

    const existingFamilyId: number | null =
      existingFamilyIds.length === 1 ? existingFamilyIds[0] : null;

    // ── Paso 4a: Obtener o crear familia ─────────────────────────────────────────

    let familyId:     number;
    let familyNombre: string;

    if (existingFamilyId !== null) {
      const famRow = await client.query(
        `SELECT id, nombre FROM families WHERE id = $1`,
        [existingFamilyId],
      );
      familyId     = (famRow.rows[0] as any).id;
      familyNombre = (famRow.rows[0] as any).nombre;
    } else {
      const famIns = await client.query(
        `INSERT INTO families (tenant_id, campus_id, nombre)
         VALUES ($1, $2, $3)
         RETURNING id, nombre`,
        [tenantId, campusId, nombre],
      );
      familyId     = (famIns.rows[0] as any).id;
      familyNombre = (famIns.rows[0] as any).nombre;
    }

    // ── Paso 4b: Resolver / crear guardians ──────────────────────────────────────

    const resolvedTutores: Array<{
      guardian_id:         number;
      es_responsable_pago: boolean;
      porcentaje:          string;
    }> = [];
    let firstResponsableId: number | null = null;

    for (const tutor of tutores) {
      let guardianId: number;

      if (tutor.guardian_id != null) {
        const chk = await client.query(
          `SELECT id FROM guardians WHERE id = $1 AND tenant_id = $2`,
          [tutor.guardian_id, tenantId],
        );
        if ((chk.rows as any[]).length === 0) {
          const err = new Error(
            `Tutor con id=${tutor.guardian_id} no encontrado en este tenant`,
          ) as any;
          err.status = 422;
          throw err;
        }
        guardianId = tutor.guardian_id;
        guardiansLinked.push({ id: guardianId });
      } else {
        // Deduplicar por CURP → email
        let found: any = null;

        if (tutor.curp) {
          const byCurp = await client.query(
            `SELECT id, celular, nombres, apellido_paterno,
                    correo_institucional_familiar, email
             FROM guardians
             WHERE curp = $1 AND tenant_id = $2
             LIMIT 1`,
            [tutor.curp, tenantId],
          );
          if ((byCurp.rows as any[]).length > 0) found = byCurp.rows[0];
        }

        const emailInput = tutor.correo_institucional_familiar ?? null;

        if (!found && emailInput) {
          const byEmail = await client.query(
            `SELECT id, celular, nombres, apellido_paterno,
                    correo_institucional_familiar, email
             FROM guardians
             WHERE (LOWER(TRIM(correo_institucional_familiar)) = $1 OR LOWER(TRIM(email)) = $1)
               AND tenant_id = $2
             LIMIT 1`,
            [emailInput, tenantId],
          );
          if ((byEmail.rows as any[]).length > 0) found = byEmail.rows[0];
        }

        if (found) {
          guardianId = found.id;
          guardiansLinked.push({ id: guardianId });

          const celularExistente = found.celular ?? "";
          if (!celularExistente && tutor.celular) {
            await client.query(
              `UPDATE guardians SET celular = $1, updated_at = NOW() WHERE id = $2`,
              [tutor.celular, guardianId],
            );
          } else if (celularExistente && tutor.celular && celularExistente !== tutor.celular) {
            const contactRef = found.correo_institucional_familiar || found.email || `id:${guardianId}`;
            warnings.push(
              `Tutor ${contactRef} (id: ${guardianId}) ya existe; ` +
              `celular conservado del sistema ('${celularExistente}'), no sobrescrito.`,
            );
          }

          if (tutor.curp && emailInput && found.correo_institucional_familiar !== emailInput) {
            warnings.push(
              `Tutor encontrado por CURP (id: ${guardianId}); ` +
              `email '${emailInput}' del input ignorado — ` +
              `se conserva '${found.correo_institucional_familiar}'.`,
            );
          }
        } else {
          // Crear nuevo guardian
          const emailFinal = emailInput;
          if (!tutor.nombres) {
            const err = new Error("Tutor nuevo requiere el campo 'nombres'") as any;
            err.status = 422;
            throw err;
          }

          const nombreCompleto = [tutor.nombres, tutor.apellido_paterno, tutor.apellido_materno]
            .filter(Boolean).join(" ");

          // Un correo ausente se escribe como NULL en ambas columnas ($5).
          const ins = await client.query(
            `INSERT INTO guardians
                (tipo_guardian, nombres, apellido_paterno, apellido_materno,
                 correo_institucional_familiar, email, curp, celular,
                 calle, numero_exterior, numero_interior, colonia, codigo_postal, municipio, estado,
                 contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion,
                 nombre_completo, tenant_id, campus_id, rfc, telefono_casa_oficina)
             VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             RETURNING id`,
            [
              tutor.tipo_guardian || "tutor",
              tutor.nombres,
              tutor.apellido_paterno  || null,
              tutor.apellido_materno  || null,
              emailFinal,
              tutor.curp              || null,
              tutor.celular           || null,
               tutor.calle             || null,
               tutor.numero_exterior   || null,
               tutor.numero_interior   || null,
               tutor.colonia           || null,
               tutor.codigo_postal     || null,
               tutor.municipio         || null,
               tutor.estado            || null,
               tutor.contacto_emergencia_nombre   || null,
               tutor.contacto_emergencia_telefono || null,
               tutor.contacto_emergencia_relacion || null,
              nombreCompleto,
              tenantId,
              campusId,
              tutor.rfc || null,
              tutor.telefono_casa_oficina || null,
            ],
          );
          guardianId = (ins.rows[0] as any).id;
          guardiansCreated.push({ id: guardianId, nombre: nombreCompleto });
        }
      }

      // Porcentaje efectivo para student_guardian
      let porcentaje: string;
      if (tutor.es_responsable_pago) {
        porcentaje = tutor.porcentaje_responsabilidad != null
          ? String(tutor.porcentaje_responsabilidad)
          : "100.00";
      } else {
        porcentaje = tutor.porcentaje_responsabilidad != null
          ? String(tutor.porcentaje_responsabilidad)
          : "0.00";
      }

      resolvedTutores.push({
        guardian_id:         guardianId,
        es_responsable_pago: tutor.es_responsable_pago,
        porcentaje,
      });

      if (tutor.es_responsable_pago && firstResponsableId === null) {
        firstResponsableId = guardianId;
      }
    }

    // ── Paso 4c: Vincular family_students y student_guardian ─────────────────────

    for (const studentId of student_ids) {
      await client.query(
        `INSERT INTO family_students (family_id, student_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [familyId, studentId],
      );

      for (const rt of resolvedTutores) {
        await client.query(
          `INSERT INTO student_guardian
             (student_id, guardian_id, es_responsable_pago, porcentaje_responsabilidad)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (student_id, guardian_id) DO UPDATE
             SET es_responsable_pago        = EXCLUDED.es_responsable_pago,
                 porcentaje_responsabilidad = EXCLUDED.porcentaje_responsabilidad`,
          [studentId, rt.guardian_id, rt.es_responsable_pago, rt.porcentaje],
        );
      }
    }

    // El importador también debe comprobar el contacto real del principal.
    // En tutores reutilizados se lee el celular conservado, no uno inventado.
    if (firstResponsableId !== null) {
      const principal = await client.query(
        "SELECT celular FROM guardians WHERE id=$1 AND tenant_id=$2",
        [firstResponsableId, tenantId],
      );
      requirePrincipalMobile(principal.rows[0]);
    }

    // ── Paso 4d: Poblar guardian_id_principal ────────────────────────────────────

    if (firstResponsableId !== null) {
      await client.query(
        `UPDATE families SET guardian_id_principal = $1, updated_at = NOW() WHERE id = $2`,
        [firstResponsableId, familyId],
      );
    }

    if (ownConnection) {
      await client.query("COMMIT");
    }

    return {
      family_id:         familyId,
      family_nombre:     familyNombre,
      guardians_created: guardiansCreated,
      guardians_linked:  guardiansLinked,
      students_linked:   student_ids,
      warnings,
    };
  } catch (err) {
    if (ownConnection) {
      await client.query("ROLLBACK");
    }
    throw err;
  } finally {
    if (ownConnection && poolClient) {
      poolClient.release();
    }
  }
}
