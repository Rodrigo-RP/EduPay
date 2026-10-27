import type { Request, Response } from "express";
import type { Pool } from "@neondatabase/serverless";
import { z } from "zod";

const payloadSchema = z.object({
  es_responsable_pago: z.boolean().optional(),
  porcentaje_responsabilidad: z.number().finite().min(0).max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

// Both public paths share the same transaction and audit guarantees.
export function guardianResponsibilityHandler(pool: Pick<Pool, "connect">) {
  return async (req: Request & { user?: any }, res: Response) => {
    const studentId = Number(req.params.studentId);
    const guardianId = Number(req.params.guardianId);
    const parsed = payloadSchema.safeParse(req.body);
    if (!Number.isSafeInteger(studentId) || studentId <= 0
      || !Number.isSafeInteger(guardianId) || guardianId <= 0 || !parsed.success) {
      return res.status(400).json({ message: "Datos inválidos para actualizar responsabilidad de pago" });
    }
    const user = req.user;
    if (!user?.id || !user.tenant_id || !user.campus_id) {
      return res.status(403).json({ message: "Se requiere usuario, institución y campus válidos" });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      // Serializa los cambios de todos los tutores del mismo alumno.
      const student = await client.query(
        `SELECT id FROM students WHERE id = $1 AND tenant_id = $2 AND campus_id = $3 FOR UPDATE`,
        [studentId, user.tenant_id, user.campus_id],
      );
      if (!student.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Alumno no encontrado" });
      }
      const relationships = await client.query(
        `SELECT guardian_id, es_responsable_pago, porcentaje_responsabilidad
         FROM student_guardian WHERE student_id = $1 FOR UPDATE`, [studentId],
      );
      const before = relationships.rows.find((row) => row.guardian_id === guardianId);
      if (!before) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Relación alumno-tutor no encontrada" });
      }
      const others = relationships.rows.filter((row) =>
        row.guardian_id !== guardianId && row.es_responsable_pago);
      if (parsed.data.es_responsable_pago === false && others.length === 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({ message: "El alumno debe conservar al menos un responsable de pago. Activa primero al otro tutor." });
      }
      const warning = parsed.data.es_responsable_pago === true && !before.es_responsable_pago
        && others.some((row) => Number(row.porcentaje_responsabilidad) === 100)
        ? "Ya existe otro tutor responsable del 100 % del pago. Revisa quién debe permanecer como responsable."
        : null;
      const updated = await client.query(
        `UPDATE student_guardian
         SET es_responsable_pago = COALESCE($1, es_responsable_pago),
             porcentaje_responsabilidad = COALESCE($2, porcentaje_responsabilidad)
         WHERE student_id = $3 AND guardian_id = $4 RETURNING *`,
        [parsed.data.es_responsable_pago ?? null, parsed.data.porcentaje_responsabilidad ?? null, studentId, guardianId],
      );
      await client.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, previous_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [user.tenant_id, user.id, "update_guardian_responsibility", "student_guardian", studentId,
          JSON.stringify({ campus_id: user.campus_id, student_id: studentId, guardian_id: guardianId,
            before, after: updated.rows[0], warning }),
          JSON.stringify(before), JSON.stringify(updated.rows[0])],
      );
      await client.query("COMMIT");
      return res.json({ ...updated.rows[0], warning });
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({ message: "No se pudo guardar el cambio de responsable de pago" });
    } finally {
      client?.release();
    }
  };
}
