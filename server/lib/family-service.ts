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
 * Nota de schema drift:
 *  - guardians.email tiene NOT NULL en la DB real aunque Drizzle lo declara
 *    nullable. El INSERT duplica correo_institucional_familiar en email.
 */

import { pool } from "../db";

// ── Interfaz de cliente DB (compatible con pool.connect() y PoolClient) ───────

interface DbClient {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
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
  correo_institucional_familiar?: string;
  email?: string;         // alias reconocido de correo_institucional_familiar
  curp?: string;
  celular?: string;

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

// ── Función central ────────────────────────────────────────────────────────────

export async function createFamily(
  input: FamilyCreateInput,
  tenantId: number,
  campusId: number,
  externalClient?: DbClient,
): Promise<FamilyCreateResult> {
  const { nombre, student_ids, tutores } = input;
  const warnings: string[] = [];

  // ── Paso 1: Validación de porcentajes (sin queries) ─────────────────────────

  const responsables = tutores.filter(t => t.es_responsable_pago);
  if (responsables.length === 0) {
    const err = new Error("Debe haber al menos un tutor con es_responsable_pago=true") as any;
    err.status = 400;
    throw err;
  }

  const conPorcentaje = responsables.filter(t => t.porcentaje_responsabilidad != null);

  if (conPorcentaje.length > 0) {
    if (conPorcentaje.length !== responsables.length) {
      const err = new Error(
        "Si especifica porcentaje_responsabilidad, todos los tutores con " +
        "es_responsable_pago=true deben tenerlo especificado.",
      ) as any;
      err.status = 422;
      throw err;
    }
    const suma = responsables.reduce(
      (s, t) => s + Number(t.porcentaje_responsabilidad ?? 0), 0,
    );
    if (Math.round(suma * 100) !== 10000) {
      const err = new Error(
        `La suma de porcentaje_responsabilidad de los tutores responsables es ` +
        `${suma.toFixed(2)}%. Debe ser exactamente 100.`,
      ) as any;
      err.status = 422;
      throw err;
    }
  } else if (responsables.length > 1) {
    const err = new Error(
      `Con ${responsables.length} tutores responsables de pago, debe especificar ` +
      `porcentaje_responsabilidad para cada uno (suma = 100).`,
    ) as any;
    err.status = 422;
    throw err;
  }
  // Un solo responsable sin porcentaje → OK (se usará "100.00" implícito).

  if (student_ids.length === 0) {
    const err = new Error("student_ids no puede estar vacío") as any;
    err.status = 400;
    throw err;
  }

  // ── Determinar cliente y modo de transacción ─────────────────────────────────

  const ownConnection = externalClient == null;
  let client: DbClient;
  let poolClient: Awaited<ReturnType<typeof pool.connect>> | null = null;

  if (ownConnection) {
    poolClient = await pool.connect();
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

        const emailInput = tutor.correo_institucional_familiar || tutor.email || null;

        if (!found && emailInput) {
          const byEmail = await client.query(
            `SELECT id, celular, nombres, apellido_paterno,
                    correo_institucional_familiar, email
             FROM guardians
             WHERE (correo_institucional_familiar = $1 OR email = $1)
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
          if (!emailFinal) {
            const err = new Error(
              "Tutor nuevo requiere correo_institucional_familiar o email",
            ) as any;
            err.status = 422;
            throw err;
          }
          if (!tutor.nombres) {
            const err = new Error("Tutor nuevo requiere el campo 'nombres'") as any;
            err.status = 422;
            throw err;
          }

          const nombreCompleto = [tutor.nombres, tutor.apellido_paterno, tutor.apellido_materno]
            .filter(Boolean).join(" ");

          // Nota: guardians.email tiene NOT NULL en la DB real (drift vs Drizzle schema).
          // Se duplica correo_institucional_familiar en email ($5 usado dos veces).
          const ins = await client.query(
            `INSERT INTO guardians
               (tipo_guardian, nombres, apellido_paterno, apellido_materno,
                correo_institucional_familiar, email, curp, celular,
                nombre_completo, tenant_id, campus_id)
             VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10)
             RETURNING id`,
            [
              tutor.tipo_guardian || "tutor",
              tutor.nombres,
              tutor.apellido_paterno  || null,
              tutor.apellido_materno  || null,
              emailFinal,
              tutor.curp              || null,
              tutor.celular           || null,
              nombreCompleto,
              tenantId,
              campusId,
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
