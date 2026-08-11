/**
 * server/tests/custom-permissions.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PUT /api/users/:id → custom_permissions — persistencia y guards de seguridad
 *
 * ESCENARIOS:
 *   CP-01  Guardar custom_permissions vía PUT — persiste exactamente los
 *          valores enviados; respuesta 200 incluye el campo actualizado.
 *   CP-02  GET /api/users después del save → custom_permissions coincide.
 *   CP-03  Rol sin permiso USERS.UPDATE (admisiones) → 403, DB sin cambios.
 *   CP-04  Jerarquía: asistente (nivel 2) → administrador_campus (nivel 5) → 403, DB sin cambios.
 *
 * EVIDENCIA DE DISEÑO (confirmada antes de implementar):
 *   PUT /api/users/:id extrae campos protegidos por destructuring explícito
 *   (id, campus_id, tenant_id, created_at, updated_at, password_hash, twofa_secret).
 *   custom_permissions NO está en esa lista → fluye en updateData →
 *   storage.updateUser(id, updateData) → db.update(users).set(updates).
 *   El campo ya se persistía; el bug era que el frontend nunca llamaba al endpoint.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ──────────────────────────────────────────────────────
let tenantId:       number;
let campusId:       number;

let adminId:        number;    // administrador_campus (actor principal)
let asistenteId:    number;    // asistente (actor para test jerarquía)
let admisionesId:   number;    // admisiones (sin USERS.UPDATE)
let targetId:       number;    // auxiliar_contable (objeto del update)

let tokenAdmin:      string;
let tokenAsistente:  string;
let tokenAdmisiones: string;

// Permisos custom que usaremos como fixture
const CUSTOM_SET_A = ["students.read", "invoices.create", "reports.view"];
const CUSTOM_SET_B = ["payments.read"];  // set distinto para sobrescritura

function makeToken(userId: number, email: string, role: string) {
  return jwt.sign(
    { id: userId, email, role, campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function putUser(targetUserId: number, body: object, token: string) {
  const r = await fetch(`${BASE}/api/users/${targetUserId}`, {
    method:  "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}

async function getCustomPermissionsFromDB(userId: number): Promise<string[] | null> {
  const r = await pool.query(
    `SELECT custom_permissions FROM users WHERE id = $1`,
    [userId]
  );
  return r.rows[0]?.custom_permissions ?? null;
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`CustomPermTest ${ts}`, `CPT${ts}`]
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus CPT ${ts}`]
  );
  campusId = (cRow.rows[0] as any).id;

  const hash = await bcrypt.hash("TestPass123!", 10);

  // Actor principal — administrador_campus (nivel 5)
  const aRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active,custom_permissions)
     VALUES ($1,$2,$3,$4,$5,'administrador_campus',true,'{}') RETURNING id`,
    [tenantId, campusId, "Admin CPT", `admin.cpt.${ts}@test.internal`, hash]
  );
  adminId = (aRow.rows[0] as any).id;

  // Actor jerarquía — asistente (nivel 2)
  const sRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active,custom_permissions)
     VALUES ($1,$2,$3,$4,$5,'asistente',true,'{}') RETURNING id`,
    [tenantId, campusId, "Asistente CPT", `asistente.cpt.${ts}@test.internal`, hash]
  );
  asistenteId = (sRow.rows[0] as any).id;

  // Actor sin permiso — admisiones (nivel 1)
  const mRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active,custom_permissions)
     VALUES ($1,$2,$3,$4,$5,'admisiones',true,'{}') RETURNING id`,
    [tenantId, campusId, "Admisiones CPT", `admisiones.cpt.${ts}@test.internal`, hash]
  );
  admisionesId = (mRow.rows[0] as any).id;

  // Target — auxiliar_contable (nivel 3, editable por admin)
  const xRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active,custom_permissions)
     VALUES ($1,$2,$3,$4,$5,'auxiliar_contable',true,'{}') RETURNING id`,
    [tenantId, campusId, "Target CPT", `target.cpt.${ts}@test.internal`, hash]
  );
  targetId = (xRow.rows[0] as any).id;

  tokenAdmin      = makeToken(adminId,      `admin.cpt.${ts}@test.internal`,      "administrador_campus");
  tokenAsistente  = makeToken(asistenteId,  `asistente.cpt.${ts}@test.internal`,  "asistente");
  tokenAdmisiones = makeToken(admisionesId, `admisiones.cpt.${ts}@test.internal`, "admisiones");
});

// ── Teardown ───────────────────────────────────────────────────────────────
afterAll(async () => {
  if (!tenantId) return;
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════
describe("PUT /api/users/:id — custom_permissions", () => {

  // ─────────────────────────────────────────────────────────────────────────
  it("CP-01: Save exitoso — respuesta 200, custom_permissions persistido en DB con valores exactos", async () => {
    const permsBefore = await getCustomPermissionsFromDB(targetId);
    // Confirmar que empieza vacío
    expect(permsBefore).toBeDefined();

    const { status, body } = await putUser(targetId, { custom_permissions: CUSTOM_SET_A }, tokenAdmin);

    expect(status, `Esperado 200, recibido ${status}: ${JSON.stringify(body)}`).toBe(200);

    // La respuesta debe devolver el campo actualizado
    expect(body.custom_permissions, "Respuesta debe incluir custom_permissions").toBeDefined();
    // Verificar que los valores están en la respuesta (orden puede variar)
    for (const perm of CUSTOM_SET_A) {
      expect(body.custom_permissions, `${perm} debe estar en la respuesta`).toContain(perm);
    }

    // Verificar directamente en la DB
    const permsInDB = await getCustomPermissionsFromDB(targetId);
    expect(permsInDB, "custom_permissions debe existir en DB").toBeDefined();
    expect(permsInDB!.sort(), "DB debe contener exactamente los valores enviados").toEqual(
      [...CUSTOM_SET_A].sort()
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("CP-02: Recarga — GET /api/users devuelve custom_permissions actualizado", async () => {
    // El usuario ya tiene CUSTOM_SET_A de CP-01
    const r = await fetch(`${BASE}/api/users`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(r.status, "GET /api/users debe retornar 200").toBe(200);
    const users = await r.json();

    const targetFromList = users.find((u: any) => u.id === targetId);
    expect(targetFromList, "El usuario target debe aparecer en la lista").toBeDefined();
    expect(targetFromList!.custom_permissions, "custom_permissions debe estar presente en el GET").toBeDefined();
    for (const perm of CUSTOM_SET_A) {
      expect(targetFromList!.custom_permissions, `${perm} debe persistir después de recarga`).toContain(perm);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("CP-02b: Sobrescritura — un segundo PUT reemplaza los permisos anteriores", async () => {
    // Enviar CUSTOM_SET_B (distinto de CUSTOM_SET_A)
    const { status } = await putUser(targetId, { custom_permissions: CUSTOM_SET_B }, tokenAdmin);
    expect(status).toBe(200);

    const permsInDB = await getCustomPermissionsFromDB(targetId);
    expect(permsInDB!.sort(), "DB debe reflejar el nuevo set, no el anterior").toEqual(
      [...CUSTOM_SET_B].sort()
    );
    // Confirmar que los del set anterior ya no están
    for (const oldPerm of CUSTOM_SET_A) {
      expect(permsInDB, `${oldPerm} no debe estar si fue removido`).not.toContain(oldPerm);
    }

    // Restaurar CUSTOM_SET_A para que CP-02 ya validado siga siendo coherente
    await putUser(targetId, { custom_permissions: CUSTOM_SET_A }, tokenAdmin);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("CP-03: Rol sin permiso USERS.UPDATE (admisiones) → 403, DB sin cambios", async () => {
    const permsBefore = await getCustomPermissionsFromDB(targetId);

    const { status, body } = await putUser(
      targetId,
      { custom_permissions: ["students.read", "invoices.delete"] },
      tokenAdmisiones
    );

    expect(status, `admisiones debe recibir 403, recibido ${status}: ${JSON.stringify(body)}`).toBe(403);

    // DB no cambió
    const permsAfter = await getCustomPermissionsFromDB(targetId);
    expect(permsAfter!.sort(), "DB no debe haber cambiado después de un 403").toEqual(
      (permsBefore ?? []).sort()
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("CP-04: Jerarquía — asistente (nivel 2) → administrador_campus (nivel 5) → 403, DB sin cambios", async () => {
    // adminId es administrador_campus (nivel 5) — asistente (nivel 2) no puede editarlo
    const permsBefore = await getCustomPermissionsFromDB(adminId);

    const { status, body } = await putUser(
      adminId,
      { custom_permissions: ["students.read"] },
      tokenAsistente
    );

    expect(
      status,
      `asistente → administrador_campus debe dar 403, recibido ${status}: ${JSON.stringify(body)}`
    ).toBe(403);

    // DB del admin no cambió
    const permsAfter = await getCustomPermissionsFromDB(adminId);
    expect(permsAfter, "DB del admin no debe haber cambiado").toEqual(permsBefore);
  });

});
