/**
 * CF-EXPORT — guard de rol en los 3 endpoints de exportación masiva de datos
 *
 * Antes del fix: solo authenticateToken — cualquier rol descargaba padrón
 * completo de alumnos (nombre_completo, CURP, matrícula).
 *
 * Guard aplicado: hasPermission(role, MODULES.REPORTS, ACTIONS.EXPORT)
 * Roles CON permiso: administrador_general, administrador_campus,
 *                    contador_general, admisiones, super_admin
 * Roles SIN permiso: asistente, auxiliar_contable
 *
 * Endpoints cubiertos:
 *   GET /api/export/:type                    (payments.ts)
 *   GET /api/export-legacy/:type             → 404 (ruta eliminada)
 *   GET /api/admin/students/:campusId/export (admin.ts)
 *   GET /api/charges/export                  (guardian.ts)
 *
 * EXP-01  /api/export/:type sin token → 401
 * EXP-02  /api/export/:type rol asistente → 403
 * EXP-03  /api/export/:type rol auxiliar_contable → 403
 * EXP-04  /api/export/:type rol administrador_campus → 200 + xlsx
 * EXP-05  /api/export/:type rol contador_general → 200
 * EXP-06  /api/export-legacy/:type → 404 (ruta eliminada del servidor)
 * EXP-07  /api/admin/students/:campusId/export sin token → 401
 * EXP-08  /api/admin/students/:campusId/export rol asistente → 403
 * EXP-09  /api/admin/students/:campusId/export rol administrador_campus → 200
 * EXP-10  /api/charges/export sin token → 401
 * EXP-11  /api/charges/export rol asistente → 403
 * EXP-12  /api/charges/export rol auxiliar_contable → 403
 * EXP-13  /api/charges/export rol administrador_campus → 200 + xlsx
 * EXP-14  /api/charges/export rol admisiones → 200 (admisiones tiene EXPORT)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

async function apiGet(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const ct = r.headers.get("content-type") || "";
  // Si es binario, devolvemos solo status y content-type
  const isFile = ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("csv");
  const body   = isFile ? null : await r.json().catch(() => null);
  return { status: r.status, contentType: ct, body };
}

// ── fixtures ──────────────────────────────────────────────────────────────────
const TS = Date.now().toString().slice(-7);

let tenantId: number;
let campusId: number;

let tokAsistente:       string;
let tokAuxiliar:        string;
let tokAdminCampus:     string;
let tokContador:        string;
let tokAdmisiones:      string;

const makeToken = (id: number, role: string, cId: number) =>
  jwt.sign({ id, role, campus_id: cId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });

const insertUser = async (role: string) => {
  const r = await pool.query(
    `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
    [campusId, tenantId, `${role}.exp.${TS}@test.mx`, `User EXP ${role}`, role],
  );
  return (r.rows[0] as any).id as number;
};

beforeAll(async () => {
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant EXP ${TS}`, `EXP${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus EXP ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  const idA  = await insertUser("asistente");
  const idAx = await insertUser("auxiliar_contable");
  const idAC = await insertUser("administrador_campus");
  const idCG = await insertUser("contador_general");
  const idAd = await insertUser("admisiones");

  tokAsistente    = makeToken(idA,  "asistente",           campusId);
  tokAuxiliar     = makeToken(idAx, "auxiliar_contable",   campusId);
  tokAdminCampus  = makeToken(idAC, "administrador_campus", campusId);
  tokContador     = makeToken(idCG, "contador_general",    campusId);
  tokAdmisiones   = makeToken(idAd, "admisiones",          campusId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM users   WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id=$1`,       [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`,       [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-EXPORT — guard de rol en endpoints de exportación masiva", () => {

  // ── GET /api/export/:type ─────────────────────────────────────────────────

  it("EXP-01: /api/export/:type sin token → 401", async () => {
    const { status } = await apiGet("/api/export/estudiantes");
    expect(status).toBe(401);
  });

  it("EXP-02: /api/export/:type rol asistente → 403", async () => {
    const { status, body } = await apiGet("/api/export/estudiantes", tokAsistente);
    expect(status).toBe(403);
    expect(body?.message).toMatch(/permiso/i);
  });

  it("EXP-03: /api/export/:type rol auxiliar_contable → 403", async () => {
    const { status } = await apiGet("/api/export/estudiantes", tokAuxiliar);
    expect(status).toBe(403);
  });

  it("EXP-04: /api/export/:type rol administrador_campus → 200 + xlsx", async () => {
    const { status, contentType } = await apiGet("/api/export/estudiantes", tokAdminCampus);
    expect(status).toBe(200);
    expect(contentType).toContain("spreadsheetml");
  });

  it("EXP-05: /api/export/:type rol contador_general → 200", async () => {
    const { status, contentType } = await apiGet("/api/export/conceptos", tokContador);
    expect(status).toBe(200);
    expect(contentType).toContain("spreadsheetml");
  });

  // ── Ruta legacy eliminada ─────────────────────────────────────────────────

  it("EXP-06: /api/export-legacy/:type → ya no sirve datos xlsx (ruta eliminada, SPA responde)", async () => {
    // El handler fue eliminado del código. Express no tiene ruta para este path;
    // el dev-server de Vite responde con el HTML de la SPA (200 + text/html).
    // La garantía de seguridad es que la respuesta NO es un archivo xlsx descargable.
    const { status, contentType } = await apiGet("/api/export-legacy/estudiantes", tokAdminCampus);
    // Puede ser 200 (fallback SPA) o 404 — lo que NO debe ser es xlsx
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
    // Y si llegara a responder como API, también queremos que no sea 200 con datos
    // (status 200 + HTML es aceptable; status 200 + xlsx sería la vulnerabilidad)
    const isFileDownload = contentType.includes("spreadsheetml") || contentType.includes("excel");
    expect(isFileDownload).toBe(false);
  });

  // ── GET /api/admin/students/:campusId/export ──────────────────────────────

  it("EXP-07: /api/admin/students/:campusId/export sin token → 401", async () => {
    const { status } = await apiGet(`/api/admin/students/${campusId}/export`);
    expect(status).toBe(401);
  });

  it("EXP-08: /api/admin/students/:campusId/export rol asistente → 403", async () => {
    const { status } = await apiGet(`/api/admin/students/${campusId}/export`, tokAsistente);
    expect(status).toBe(403);
  });

  it("EXP-09: /api/admin/students/:campusId/export rol administrador_campus → 200 + xlsx", async () => {
    const { status, contentType } = await apiGet(
      `/api/admin/students/${campusId}/export`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    expect(contentType).toContain("spreadsheetml");
  });

  // ── GET /api/charges/export ───────────────────────────────────────────────

  it("EXP-10: /api/charges/export sin token → 401", async () => {
    const { status } = await apiGet("/api/charges/export");
    expect(status).toBe(401);
  });

  it("EXP-11: /api/charges/export rol asistente → 403", async () => {
    const { status, body } = await apiGet("/api/charges/export", tokAsistente);
    expect(status).toBe(403);
    expect(body?.message).toMatch(/permiso/i);
  });

  it("EXP-12: /api/charges/export rol auxiliar_contable → 403", async () => {
    const { status } = await apiGet("/api/charges/export", tokAuxiliar);
    expect(status).toBe(403);
  });

  it("EXP-13: /api/charges/export rol administrador_campus → 200 + xlsx", async () => {
    const { status, contentType } = await apiGet("/api/charges/export", tokAdminCampus);
    expect(status).toBe(200);
    expect(contentType).toContain("spreadsheetml");
  });

  it("EXP-14: /api/charges/export rol admisiones → 200 (admisiones tiene REPORTS.EXPORT)", async () => {
    const { status, contentType } = await apiGet("/api/charges/export", tokAdmisiones);
    expect(status).toBe(200);
    expect(contentType).toContain("spreadsheetml");
  });
});
