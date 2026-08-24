/**
 * Reglas de acceso al portal asociadas a familias activas.
 *
 * Una familia archivada conserva su historial; sólo deja de otorgar acceso.
 * Un tutor compartido conserva acceso mientras pertenezca a otra familia activa.
 */

import { pool } from "../db";

interface DbClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export async function guardianHasActiveFamily(
  guardianId: number,
  tenantId: number,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM student_guardian sg
       JOIN family_students fs ON fs.student_id = sg.student_id
       JOIN families f ON f.id = fs.family_id
       WHERE sg.guardian_id = $1
         AND f.tenant_id = $2
         AND f.status = 'activo'
     ) AS has_active_family`,
    [guardianId, tenantId],
  );
  return Boolean((result.rows[0] as any)?.has_active_family);
}

export async function getFamilyGuardianIds(
  client: DbClient,
  familyId: number,
  tenantId: number,
): Promise<number[]> {
  const result = await client.query(
    `SELECT DISTINCT sg.guardian_id
       FROM family_students fs
       JOIN student_guardian sg ON sg.student_id = fs.student_id
       JOIN guardians g ON g.id = sg.guardian_id
      WHERE fs.family_id = $1
        AND g.tenant_id = $2`,
    [familyId, tenantId],
  );
  return (result.rows as any[]).map((row) => Number(row.guardian_id));
}

export async function getGuardiansWithoutActiveFamilies(
  client: DbClient,
  guardianIds: number[],
  tenantId: number,
): Promise<number[]> {
  if (guardianIds.length === 0) return [];
  const result = await client.query(
    `SELECT candidate.guardian_id
       FROM unnest($1::int[]) AS candidate(guardian_id)
      WHERE NOT EXISTS (
        SELECT 1
          FROM student_guardian sg
          JOIN family_students fs ON fs.student_id = sg.student_id
          JOIN families f ON f.id = fs.family_id
         WHERE sg.guardian_id = candidate.guardian_id
           AND f.tenant_id = $2
           AND f.status = 'activo'
      )`,
    [guardianIds, tenantId],
  );
  return (result.rows as any[]).map((row) => Number(row.guardian_id));
}