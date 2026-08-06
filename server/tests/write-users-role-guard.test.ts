/**
 * Prueba de regresión: POST /api/users, PUT /api/users/:id,
 * DELETE /api/admin/users/:id — guard hasPermission (MODULES.USERS / ACTIONS.CREATE|UPDATE|DELETE)
 *
 * VULNERABILIDAD ORIGINAL:
 *   Los endpoints de escritura solo tenían authenticateToken + canEditUser (jerarquía).
 *   Un 'asistente' (nivel 2) superaba el guard para crear/editar/borrar usuarios con
 *   rol 'admisiones' (nivel 1) aunque la matriz de permisos nunca le asigna MODULES.USERS.
 *   Confirmado empíricamente: POST /api/users con JWT de asistente → HTTP 500 (llegó a
 *   storage.createUser antes de ser frenado; el 500 fue por FK de tenant de prueba).
 *
 * DESPUÉS del fix:
 *   hasPermission(role, MODULES.USERS, ACTIONS.*) es la PRIMERA verificación en cada
 *   endpoint. Un rol sin el permiso de módulo recibe 403 inmediato, sin evaluar jerarquía.
 *
 * NOTA sobre la matriz:
 *   administrador_campus y administrador_campus tenían USERS.READ en la matriz pero no
 *   CREATE/UPDATE/DELETE, aunque sus restricciones documentadas confirman que sí deben
 *   poder gestionar usuarios de nivel inferior. Se corrigió la matriz en permissions.ts
 *   en el mismo commit que este guard.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

let tenantId: number;
let campusId: number;
let tokenAsistente: string;
let tokenAdminCampus: string;
let targetUserIdForPut: number;
let targetUserIdForDelete: number;
let createdUserIdFromPost: number | null = null;

async function apiFetch(
  method: string,
  path: string,
  token: string,
  body?: object
) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // Tenant con datos válidos para que no haya FK errors en la DB
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`WriteUsersGuardTest ${ts}`, `WUG${ts}`]
  );
  tenantId = tRow.rows[0].id;

  // Campus
  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus WUG ${ts}`, tenantId]
  );
  campusId = cRow.rows[0].id;

  // JWTs — sin 'id' para evitar rollback silencioso del audit_log FK
  tokenAsistente = jwt.sign(
    { role: "asistente", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  tokenAdminCampus = jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Usuario target para el test de PUT (creado directamente en DB)
  const putRow = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, campus_id, tenant_id, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
    [
      `WUG PUT Target ${ts}`,
      `wug-put-${ts}@test.edu`,
      "hash",
      "admisiones",
      campusId,
      tenantId,
    ]
  );
  targetUserIdForPut = putRow.rows[0].id;

  // Usuario target para el test de DELETE (creado directamente en DB)
  const delRow = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, campus_id, tenant_id, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
    [
      `WUG DEL Target ${ts}`,
      `wug-del-${ts}@test.edu`,
      "hash",
      "admisiones",
      campusId,
      tenantId,
    ]
  );
  targetUserIdForDelete = delRow.rows[0].id;
});

// ── Teardown ───────────────────────────────────────────────────────────────
afterAll(async () => {
  // Usuario creado por el test WUG-04 (si el endpoint lo devolvió)
  if (createdUserIdFromPost) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [createdUserIdFromPost]);
  }
  // Target de PUT + cualquier residuo en el campus
  await pool.query(`DELETE FROM users WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ── Negativos: asistente ───────────────────────────────────────────────────

describe("POST /api/users — guard hasPermission ACTIONS.CREATE", () => {
  it("WUG-01: asistente → 403 inmediato, sin INSERT en users", async () => {
    const countBefore = parseInt(
      (
        await pool.query(`SELECT COUNT(*) FROM users WHERE campus_id = $1`, [
          campusId,
        ])
      ).rows[0].count
    );

    const { status, body } = await apiFetch("POST", "/api/users", tokenAsistente, {
      name: "Intruso",
      email: "intruso@test.edu",
      password_hash: "hash",
      role: "admisiones",
    });

    const countAfter = parseInt(
      (
        await pool.query(`SELECT COUNT(*) FROM users WHERE campus_id = $1`, [
          campusId,
        ])
      ).rows[0].count
    );

    expect(
      status,
      `Esperado 403, recibido ${status} — body: ${JSON.stringify(body)}`
    ).toBe(403);
    expect(countBefore, "No debe haberse insertado ningún usuario").toBe(
      countAfter
    );
  });
});

describe("PUT /api/users/:id — guard hasPermission ACTIONS.UPDATE", () => {
  it("WUG-02: asistente → 403 inmediato, sin UPDATE en users", async () => {
    const nameBefore = (
      await pool.query(`SELECT name FROM users WHERE id = $1`, [
        targetUserIdForPut,
      ])
    ).rows[0].name;

    const { status, body } = await apiFetch(
      "PUT",
      `/api/users/${targetUserIdForPut}`,
      tokenAsistente,
      { name: "Nombre Inyectado Por Intruso" }
    );

    const nameAfter = (
      await pool.query(`SELECT name FROM users WHERE id = $1`, [
        targetUserIdForPut,
      ])
    ).rows[0].name;

    expect(
      status,
      `Esperado 403, recibido ${status} — body: ${JSON.stringify(body)}`
    ).toBe(403);
    expect(nameBefore, "El nombre no debe haber cambiado").toBe(nameAfter);
  });
});

describe("DELETE /api/admin/users/:id — guard hasPermission ACTIONS.DELETE", () => {
  it("WUG-03: asistente → 403 por módulo (no por jerarquía), usuario intacto", async () => {
    const { status, body } = await apiFetch(
      "DELETE",
      `/api/admin/users/${targetUserIdForDelete}`,
      tokenAsistente
    );

    const stillExists = (
      await pool.query(`SELECT 1 FROM users WHERE id = $1`, [
        targetUserIdForDelete,
      ])
    ).rowCount;

    expect(
      status,
      `Esperado 403, recibido ${status} — body: ${JSON.stringify(body)}`
    ).toBe(403);
    expect(stillExists, "El usuario no debe haber sido eliminado").toBe(1);
  });
});

// ── Control positivo: administrador_campus ─────────────────────────────────

describe("POST /api/users — control positivo administrador_campus", () => {
  it("WUG-04: administrador_campus (con USERS.CREATE) → 201 con id en body", async () => {
    const ts2 = Date.now().toString().slice(-6);
    const { status, body } = await apiFetch(
      "POST",
      "/api/users",
      tokenAdminCampus,
      {
        name: `WUG Positivo ${ts2}`,
        email: `wug-pos-${ts2}@test.edu`,
        password_hash: "hash_positivo",
        role: "admisiones",
        is_active: true,
      }
    );

    if (body?.id) createdUserIdFromPost = body.id;

    expect(
      status,
      `Esperado 201, recibido ${status} — body: ${JSON.stringify(body)}`
    ).toBe(201);
    expect(body, "La respuesta debe tener un id").toHaveProperty("id");
  });
});

describe("PUT /api/users/:id — control positivo administrador_campus", () => {
  it("WUG-05: administrador_campus (con USERS.UPDATE) → 200 con nombre actualizado", async () => {
    const { status, body } = await apiFetch(
      "PUT",
      `/api/users/${targetUserIdForPut}`,
      tokenAdminCampus,
      { name: "Nombre Actualizado Por Admin" }
    );

    expect(
      status,
      `Esperado 200, recibido ${status} — body: ${JSON.stringify(body)}`
    ).toBe(200);
    expect(body?.name, "El nombre debe haberse actualizado").toBe(
      "Nombre Actualizado Por Admin"
    );
  });
});

describe("DELETE /api/admin/users/:id — control positivo administrador_campus", () => {
  it("WUG-06: administrador_campus (con USERS.DELETE) → 200, usuario eliminado", async () => {
    const { status, body } = await apiFetch(
      "DELETE",
      `/api/admin/users/${targetUserIdForDelete}`,
      tokenAdminCampus
    );

    const goneFromDb = (
      await pool.query(`SELECT 1 FROM users WHERE id = $1`, [
        targetUserIdForDelete,
      ])
    ).rowCount;

    expect(
      status,
      `Esperado 200, recibido ${status} — body: ${JSON.stringify(body)}`
    ).toBe(200);
    expect(goneFromDb, "El usuario debe haber sido eliminado de la DB").toBe(0);
  });
});
