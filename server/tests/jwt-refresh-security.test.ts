/**
 * server/tests/jwt-refresh-security.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regresión de seguridad: POST /api/auth/refresh — bypass de autenticación
 *
 * CONTEXTO:
 *   La rama catch de /api/auth/refresh usaba jwt.decode() (sin verificación de
 *   firma) para obtener el payload de un token "inválido o expirado". Esto
 *   permitía que cualquier JWT forjado con firma arbitraria pero con un id de
 *   usuario real en DB obtuviera un token nuevo válido — bypass total de
 *   autenticación sin conocer el JWT_SECRET.
 *
 *   Corrección (auth.ts): la rama catch ahora usa
 *     jwt.verify(token, JWT_SECRET, { ignoreExpiration: true })
 *   que verifica la firma criptográfica pero tolera el claim exp vencido.
 *   Firma inválida → lanza → 401. Token bien firmado pero expirado → 200.
 *
 * ESCENARIOS:
 *   JRS-01  Token forjado (firma inválida, id real) → 401. NO da token nuevo.
 *           Reproduce exactamente el ataque original.
 *   JRS-02  Token malformado (cadena arbitraria) → 401.
 *   JRS-03  Token bien firmado pero expirado (caso legítimo) → 200 con nuevo token.
 *   JRS-04  Token bien firmado y aún vigente → 200 con nuevo token.
 *   JRS-05  Sin cabecera Authorization → 401.
 *   JRS-06  Token forjado de guardian (id real guardián) → 401.
 *
 * INVARIANTE:
 *   Este archivo NO puede debilitarse ni eliminarse sin revisión explícita
 *   de seguridad. Cada test lleva el comentario «SECURITY REGRESSION».
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const FAKE_SECRET = "SECRETO_FALSO_QUE_NO_ES_JWT_SECRET_____________________";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId:   number;
let campusId:   number;
let userId:     number;
let guardianId: number;

const userEmail    = `jrs-user-${Date.now()}@test.invalid`;
const guardianEmail = `jrs-guardian-${Date.now()}@test.invalid`;

beforeAll(async () => {
  // Reutilizar tenant/campus del seed demo
  const tenantRow = await pool.query(
    `SELECT id FROM tenants LIMIT 1`,
  );
  tenantId = (tenantRow.rows[0] as any).id;

  const campusRow = await pool.query(
    `SELECT id FROM campuses WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  campusId = (campusRow.rows[0] as any).id;

  // Crear usuario de test
  const hash = await bcrypt.hash("TestPass123!", 10);
  const uRow = await pool.query(
    `INSERT INTO users
       (tenant_id, campus_id, email, password_hash, name, role, is_active)
     VALUES ($1, $2, $3, $4, 'JRS Test User', 'asistente', true)
     RETURNING id`,
    [tenantId, campusId, userEmail, hash],
  );
  userId = (uRow.rows[0] as any).id;

  // Crear guardian de test
  const gRow = await pool.query(
    `INSERT INTO guardians
       (tenant_id, campus_id, correo_institucional_familiar, email,
        nombres, apellido_paterno, nombre_completo,
        password_hash, tipo_guardian)
     VALUES ($1, $2, $3, $3, 'JRS', 'Guardian', 'JRS Guardian', $4, 'padre')
     RETURNING id`,
    [tenantId, campusId, guardianEmail, hash],
  );
  guardianId = (gRow.rows[0] as any).id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM users    WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM guardians WHERE id = $1`, [guardianId]);
});

// ── Helper ────────────────────────────────────────────────────────────────────
async function postRefresh(token: string) {
  return fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/refresh — seguridad de firma JWT", () => {

  // SECURITY REGRESSION — JRS-01
  // Reproduce el ataque original: JWT firmado con secreto arbitrario pero con
  // un id de usuario real que existe en DB. Antes del fix devolvía 200 + token.
  it("JRS-01 — token forjado (firma inválida, id de usuario real) → 401", async () => {
    const forged = jwt.sign(
      { id: userId, email: userEmail, role: "asistente",
        campus_id: campusId, tenant_id: tenantId, type: "user" },
      FAKE_SECRET,
      { expiresIn: "24h" },
    );

    const res = await postRefresh(forged);
    const body = await res.json();

    expect(res.status, "Firma inválida debe rechazarse con 401").toBe(401);
    expect(body).not.toHaveProperty("token",
      "No debe emitirse ningún token con firma falsa");
  });

  // SECURITY REGRESSION — JRS-02
  it("JRS-02 — token completamente malformado → 401", async () => {
    const res = await postRefresh("esto.no.es.un.jwt");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty("token");
  });

  // SECURITY REGRESSION — JRS-03 (caso legítimo — NO debe romperse)
  // Token real firmado con JWT_SECRET pero ya expirado.
  it("JRS-03 — token legítimo expirado (caso legítimo) → 200 + token nuevo", async () => {
    // Firmado hace 2 horas, expiró hace 1 hora (expiresIn: 1h → ya vencido)
    const expired = jwt.sign(
      { id: userId, email: userEmail, role: "asistente",
        campus_id: campusId, tenant_id: tenantId, type: "user" },
      JWT_SECRET,
      { expiresIn: -1 },   // expira 1 segundo en el pasado
    );

    const res = await postRefresh(expired);
    expect(res.status, "Token expirado legítimo debe refrescarse con 200").toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");

    // El token recibido debe ser verificable con el JWT_SECRET real
    const decoded = jwt.verify(body.token, JWT_SECRET) as any;
    expect(decoded.id).toBe(userId);
  });

  // SECURITY REGRESSION — JRS-04
  it("JRS-04 — token vigente (caso normal) → 200 + token nuevo", async () => {
    const valid = jwt.sign(
      { id: userId, email: userEmail, role: "asistente",
        campus_id: campusId, tenant_id: tenantId, type: "user" },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    const res = await postRefresh(valid);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    const decoded = jwt.verify(body.token, JWT_SECRET) as any;
    expect(decoded.id).toBe(userId);
  });

  // SECURITY REGRESSION — JRS-05
  it("JRS-05 — sin cabecera Authorization → 401", async () => {
    const res = await fetch(`${BASE}/api/auth/refresh`, { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty("token");
  });

  // SECURITY REGRESSION — JRS-06
  // El mismo ataque pero con tipo 'guardian' y un id de guardian real.
  it("JRS-06 — token forjado de guardian (firma inválida, id real) → 401", async () => {
    const forged = jwt.sign(
      { id: guardianId, email: guardianEmail,
        tenant_id: tenantId, campus_id: campusId, type: "guardian" },
      FAKE_SECRET,
      { expiresIn: "4h" },
    );

    const res = await postRefresh(forged);
    expect(res.status, "Firma inválida de guardian también debe rechazarse").toBe(401);
    const body = await res.json();
    expect(body).not.toHaveProperty("token");
  });

});
