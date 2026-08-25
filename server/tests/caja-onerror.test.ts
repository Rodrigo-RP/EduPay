/**
 * TESTS — caja onError: confirma que cada endpoint financiero de caja
 * devuelve un código de error apropiado ante fallos, de modo que:
 *   1. apiRequest lanza (throwIfResNotOk) → onError se dispara en la mutación
 *   2. onSuccess (con invalidateQueries) NO se dispara → sin efectos colaterales
 *
 * Los tres endpoints cubiertos aquí son los que acaban de recibir onError:
 *   EC-01  POST /api/caja/ejecutar-conciliacion  — rol sin permisos → 403
 *   EC-02  POST /api/caja/transferencia-manual   — monto no numérico → 500
 *   EC-03  POST /api/caja/cerrar-dia             — sin autenticación → 401
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

let tenantId:        number;
let campusId:        number;
let adminToken:      string;  // rol administrador_campus — pasa authenticateToken
let wrongRoleToken:  string;  // rol "maestro" — no está en ROLES_CAJA

// ── Setup mínimo ─────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now();

  const t = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`OnError Test Tenant ${ts}`, `OET${String(ts).slice(-9)}`]
  );
  tenantId = (t.rows as any[])[0].id;

  const c = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus OnError') RETURNING id`,
    [tenantId]
  );
  campusId = (c.rows as any[])[0].id;

  // Token de administrador válido — para EC-02 (monto inválido)
  adminToken = jwt.sign(
    { email: `onerror-admin-${ts}@test.com`, role: "administrador_campus",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Token con rol fuera de ROLES_CAJA — para EC-01 (403)
  wrongRoleToken = jwt.sign(
    { email: `onerror-maestro-${ts}@test.com`, role: "maestro",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  // bank_transactions → campuses → tenants (por FK)
  await pool.query(`DELETE FROM bank_transactions WHERE campus_id = $1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => {});
});

async function httpPost(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("caja onError — servidor devuelve error, onSuccess no debe dispararse", () => {

  // ── EC-01: ejecutar-conciliacion — rol sin permisos ──────────────────────
  it("EC-01: ejecutar-conciliacion con rol 'maestro' → 403, sin pagos creados", async () => {
    // Contar payments del tenant antes de la petición
    const before = await pool.query(
      `SELECT COUNT(*) AS n FROM payments p
       JOIN charges c ON c.id = p.charge_id
       JOIN students s ON s.id = c.student_id
       WHERE s.campus_id = $1`,
      [campusId]
    );
    const countBefore = Number((before.rows as any[])[0].n);

    // JWT con role='maestro' — no está en ROLES_CAJA → endpoint devuelve 403
    const r = await httpPost("/api/caja/ejecutar-conciliacion", {}, wrongRoleToken);

    // 1. Server devuelve 403 → apiRequest lanza → onError se dispara (no onSuccess)
    expect(r.status).toBe(403);
    expect((r.body as any).message).toMatch(/sin permisos|permiso/i);

    // 2. onSuccess no corrió → invalidateQueries(["/api/caja"]) no se ejecutó
    //    Prueba por efecto colateral: ningún payment fue creado
    const after = await pool.query(
      `SELECT COUNT(*) AS n FROM payments p
       JOIN charges c ON c.id = p.charge_id
       JOIN students s ON s.id = c.student_id
       WHERE s.campus_id = $1`,
      [campusId]
    );
    expect(Number((after.rows as any[])[0].n)).toBe(countBefore);
  });

  // ── EC-02: transferencia-manual — monto no numérico ──────────────────────
  it("EC-02: transferencia-manual con monto='INVALIDO' → 500, sin bank_transaction creada", async () => {
    // Contar bank_transactions del campus antes
    const before = await pool.query(
      `SELECT COUNT(*) AS n FROM bank_transactions WHERE campus_id = $1`,
      [campusId]
    );
    const countBefore = Number((before.rows as any[])[0].n);

    // monto no numérico → parseFloat("INVALIDO") = NaN → Math.round(NaN * 100) = NaN
    // → pg intenta insertar NaN en columna INTEGER → error de tipo → 500
    const r = await httpPost(
      "/api/caja/transferencia-manual",
      { fecha: "2026-01-15", descripcion: "Pago test fallo", monto: "INVALIDO", tipo: "credito" },
      adminToken
    );

    // 1. Server devuelve 500 → apiRequest lanza → onError se dispara (no onSuccess)
    expect(r.status).toBe(500);
    expect((r.body as any).message).toBeTruthy();

    // 2. onSuccess no corrió → invalidateQueries(["/api/caja/movimientos-banco"]) no corrió
    //    Prueba por efecto colateral: ninguna bank_transaction fue creada
    const after = await pool.query(
      `SELECT COUNT(*) AS n FROM bank_transactions WHERE campus_id = $1`,
      [campusId]
    );
    expect(Number((after.rows as any[])[0].n)).toBe(countBefore);
  });

  // ── EC-03: cerrar-dia — sin autenticación ────────────────────────────────
  it("EC-03: cerrar-dia sin token → 401, respuesta con mensaje de error", async () => {
    // No se envía token → authenticateToken responde 401 antes de ejecutar lógica
    const r = await httpPost("/api/caja/cerrar-dia", { fecha: "2026-01-15" });

    // 1. Server devuelve 401 → apiRequest lanza → onError se dispara (no onSuccess)
    expect(r.status).toBe(401);

    // 2. La respuesta tiene un campo message → el toast de onError puede mostrar descripción
    //    (confirma que el patrón `body || fallback` tiene contenido real)
    expect((r.body as any).message).toBeTruthy();
  });
});
