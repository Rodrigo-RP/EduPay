/**
 * Archivado lógico de familias y acceso al portal.
 *
 * Cubre la política aprobada:
 * - Un tutor compartido conserva acceso mientras otra familia esté activa.
 * - El último archivado invalida la sesión, bloquea login y revoca ligas vigentes.
 * - Reactivar devuelve autorización para una sesión nueva, sin revivir ligas revocadas.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const TENANT_ID = 29;
const CAMPUS_ID = 48;
const ADMIN_ID = 80;
const PASSWORD = "ArchivoSeguro2026!";
const stamp = Date.now().toString();

let guardianId = 0;
let studentOneId = 0;
let studentTwoId = 0;
let familyOneId = 0;
let familyTwoId = 0;
let preArchiveSession = "";
let rawMagicToken = "";

function adminToken() {
  return jwt.sign(
    {
      id: ADMIN_ID,
      email: `admin-archive-${stamp}@test.mx`,
      role: "administrador_campus",
      tenant_id: TENANT_ID,
      campus_id: CAMPUS_ID,
      type: "user",
    },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}

function guardianHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function setFamilyStatus(familyId: number, status: "activo" | "archivada") {
  const response = await fetch(`${BASE}/api/admin/families/${familyId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${adminToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  return { response, body: await response.json() as any };
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const guardian = await pool.query(
    `INSERT INTO guardians
       (tipo_guardian, nombres, apellido_paterno, correo_institucional_familiar,
        email, nombre_completo, password_hash, tenant_id, campus_id)
     VALUES ('padre', 'Tutor Archivo', 'Prueba', $1, $1, 'Tutor Archivo Prueba', $2, $3, $4)
     RETURNING id`,
    [`tutor-archive-${stamp}@test.mx`, passwordHash, TENANT_ID, CAMPUS_ID],
  );
  guardianId = Number((guardian.rows[0] as any).id);

  const students = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombre_completo, id_referencia, status)
     VALUES
       ($1, $2, 'Alumno Archivo Uno', $3, 'activo'),
       ($1, $2, 'Alumno Archivo Dos', $4, 'activo')
     RETURNING id`,
    [CAMPUS_ID, TENANT_ID, `ARC-1-${stamp}`, `ARC-2-${stamp}`],
  );
  studentOneId = Number((students.rows[0] as any).id);
  studentTwoId = Number((students.rows[1] as any).id);

  const families = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal, status)
     VALUES
       ($1, $2, 'Familia Archivo A', $3, 'activo'),
       ($1, $2, 'Familia Archivo B', $3, 'activo')
     RETURNING id`,
    [TENANT_ID, CAMPUS_ID, guardianId],
  );
  familyOneId = Number((families.rows[0] as any).id);
  familyTwoId = Number((families.rows[1] as any).id);

  await pool.query(
    `INSERT INTO family_students (family_id, student_id)
     VALUES ($1,$2),($3,$4)`,
    [familyOneId, studentOneId, familyTwoId, studentTwoId],
  );
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id, es_responsable_pago, porcentaje_responsabilidad)
     VALUES ($1,$3,true,'100.00'),($2,$3,true,'100.00')`,
    [studentOneId, studentTwoId, guardianId],
  );

  rawMagicToken = `archive-magic-${stamp}`;
  await pool.query(
    `INSERT INTO magic_link_tokens (tenant_id, guardian_id, token, expires_at, uses, max_uses)
     VALUES ($1,$2,$3,NOW() + INTERVAL '1 day',0,3)`,
    [TENANT_ID, guardianId, crypto.createHash("sha256").update(rawMagicToken).digest("hex")],
  );

  preArchiveSession = jwt.sign(
    { id: guardianId, tenant_id: TENANT_ID, campus_id: CAMPUS_ID, type: "guardian" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
});

afterAll(async () => {
  if (guardianId) {
    await pool.query(`DELETE FROM magic_link_tokens WHERE guardian_id = $1`, [guardianId]);
  }
  if (studentOneId || studentTwoId) {
    await pool.query(`DELETE FROM student_guardian WHERE student_id = ANY($1::int[])`, [[studentOneId, studentTwoId].filter(Boolean)]);
  }
  if (familyOneId || familyTwoId) {
    await pool.query(`DELETE FROM family_students WHERE family_id = ANY($1::int[])`, [[familyOneId, familyTwoId].filter(Boolean)]);
    await pool.query(`DELETE FROM families WHERE id = ANY($1::int[])`, [[familyOneId, familyTwoId].filter(Boolean)]);
  }
  if (guardianId) await pool.query(`DELETE FROM guardians WHERE id = $1`, [guardianId]);
  if (studentOneId || studentTwoId) {
    await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [[studentOneId, studentTwoId].filter(Boolean)]);
  }
});

describe("Archivado de familia y portal de tutores", () => {
  it("conserva la sesión de un tutor compartido mientras otra familia está activa", async () => {
    const archived = await setFamilyStatus(familyOneId, "archivada");
    expect(archived.response.status, JSON.stringify(archived.body)).toBe(200);
    expect(archived.body.guardian_ids_revoked).toEqual([]);

    const dashboard = await fetch(`${BASE}/api/guardian/dashboard`, {
      headers: guardianHeaders(preArchiveSession),
    });
    expect(dashboard.status).toBe(200);
  });

  it("revoca sesión, login y magic link cuando se archiva la última familia activa", async () => {
    const archived = await setFamilyStatus(familyTwoId, "archivada");
    expect(archived.response.status, JSON.stringify(archived.body)).toBe(200);
    expect(archived.body.guardian_ids_revoked).toContain(guardianId);

    const dashboard = await fetch(`${BASE}/api/guardian/dashboard`, {
      headers: guardianHeaders(preArchiveSession),
    });
    const dashboardBody = await dashboard.json();
    expect(dashboard.status).toBe(401);
    expect(dashboardBody.code).toBe("SESSION_INVALIDATED");

    const login = await fetch(`${BASE}/api/auth/guardian-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `tutor-archive-${stamp}@test.mx`, password: PASSWORD }),
    });
    expect(login.status).toBe(403);

    const magic = await fetch(`${BASE}/api/auth/magic/${rawMagicToken}`);
    expect(magic.status).toBe(410);
  });

  it("reactivar autoriza una sesión nueva pero no revive una liga previamente revocada", async () => {
    const reactivated = await setFamilyStatus(familyTwoId, "activo");
    expect(reactivated.response.status, JSON.stringify(reactivated.body)).toBe(200);
    expect(reactivated.body.status).toBe("activo");

    // El marcador de invalidación conserva un margen de un segundo por JWT.iat.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const login = await fetch(`${BASE}/api/auth/guardian-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `tutor-archive-${stamp}@test.mx`, password: PASSWORD }),
    });
    const loginBody = await login.json();
    expect(login.status).toBe(200);
    expect(loginBody.token).toEqual(expect.any(String));

    const magic = await fetch(`${BASE}/api/auth/magic/${rawMagicToken}`);
    expect(magic.status).toBe(410);
  });
});