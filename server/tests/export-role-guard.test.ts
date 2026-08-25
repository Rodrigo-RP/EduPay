/**
 * CF-EXPORT — guard de rol en los endpoints de exportación masiva de datos
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
 *   GET /api/export/:type        → ELIMINADO (#182). El único case útil era
 *                                  'conceptos'; sin cases, se eliminó el endpoint.
 *                                  SPA fallback responde; garantía = no xlsx.
 *   GET /api/export-legacy/:type → SPA fallback (ruta eliminada)
 *   GET /api/admin/students/:campusId/export → SPA fallback (R4 retirado, migrado a RPT-02)
 *   GET /api/charges/export      → RETIRADO (migrado a POST /api/reportes/cobranza/exportar)
 *                                  Tests de RPT-03 en rpt03-cobranza.test.ts (COB-17..19).
 *
 * EXP-01  /api/export/conceptos sin token    → no xlsx (endpoint eliminado)
 * EXP-02  /api/export/conceptos asistente    → no xlsx (endpoint eliminado)
 * EXP-03  /api/export/conceptos auxiliar     → no xlsx (endpoint eliminado)
 * EXP-04  /api/export/estudiantes admin      → no xlsx (endpoint eliminado)
 * EXP-05  /api/export/conceptos contador     → no xlsx (endpoint eliminado; era 200+xlsx)
 * EXP-06  /api/export-legacy/:type           → no xlsx (ruta eliminada)
 * EXP-07  /api/admin/students/:id/export     → no xlsx (R4 retirado, migrado a RPT-02)
 * EXP-08  /api/admin/students/:id/export     → no xlsx (R4 retirado)
 * EXP-09  /api/admin/students/:id/export     → no xlsx (R4 retirado)
 * EXP-10  /api/charges/export sin token       → no xlsx (R5 retirado, migrado a RPT-03)
 * EXP-11  /api/charges/export rol asistente   → no xlsx (R5 retirado)
 * EXP-12  /api/charges/export rol auxiliar    → no xlsx (R5 retirado)
 * EXP-13  /api/charges/export rol admin       → no xlsx (R5 retirado; usar RPT-03)
 * EXP-14  /api/charges/export rol admisiones  → no xlsx (R5 retirado; usar RPT-03)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

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

  // ── GET /api/export/:type — ELIMINADO (#182) ─────────────────────────────
  // El endpoint fue retirado porque su único case útil ('conceptos') no tenía
  // flujo contable real. El SPA responde en su lugar; garantía = no xlsx.

  it("EXP-01: /api/export/conceptos sin token → no xlsx (endpoint eliminado)", async () => {
    const { contentType } = await apiGet("/api/export/conceptos");
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-02: /api/export/conceptos rol asistente → no xlsx (endpoint eliminado)", async () => {
    const { contentType } = await apiGet("/api/export/conceptos", tokAsistente);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-03: /api/export/conceptos rol auxiliar_contable → no xlsx (endpoint eliminado)", async () => {
    const { contentType } = await apiGet("/api/export/conceptos", tokAuxiliar);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-04: /api/export/estudiantes admin → no xlsx (endpoint eliminado; exportación migrada a RPT-02)", async () => {
    const { contentType } = await apiGet("/api/export/estudiantes", tokAdminCampus);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-05: /api/export/conceptos contador → no xlsx (endpoint eliminado; antes devolvía 200+xlsx)", async () => {
    const { contentType } = await apiGet("/api/export/conceptos", tokContador);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
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

  // ── GET /api/admin/students/:campusId/export — R4 retirado → migrado a RPT-02 ──
  // La ruta fue eliminada de admin.ts. Express no tiene handler para este path;
  // el SPA de Vite responde con HTML o el proxy devuelve un fallback.
  // La garantía de seguridad es que la respuesta NO es un archivo xlsx descargable.

  it("EXP-07: /api/admin/students/:campusId/export (R4 retirado) → no xlsx sin token", async () => {
    const { contentType } = await apiGet(`/api/admin/students/${campusId}/export`);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-08: /api/admin/students/:campusId/export (R4 retirado) → no xlsx con asistente", async () => {
    const { contentType } = await apiGet(
      `/api/admin/students/${campusId}/export`,
      tokAsistente,
    );
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-09: /api/admin/students/:campusId/export (R4 retirado) → no xlsx con admin_campus", async () => {
    const { contentType } = await apiGet(
      `/api/admin/students/${campusId}/export`,
      tokAdminCampus,
    );
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  // ── GET /api/charges/export — R5 RETIRADO, migrado a POST /api/reportes/cobranza/exportar ──
  // Guards de RPT-03 verificados en rpt03-cobranza.test.ts (COB-17..19).
  // Aquí solo se confirma que la URL antigua ya no sirve xlsx.

  it("EXP-10: /api/charges/export sin token → no xlsx (R5 retirado)", async () => {
    const { contentType } = await apiGet("/api/charges/export");
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-11: /api/charges/export rol asistente → no xlsx (R5 retirado)", async () => {
    const { contentType } = await apiGet("/api/charges/export", tokAsistente);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-12: /api/charges/export rol auxiliar_contable → no xlsx (R5 retirado)", async () => {
    const { contentType } = await apiGet("/api/charges/export", tokAuxiliar);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-13: /api/charges/export rol administrador_campus → no xlsx (R5 retirado; usar RPT-03)", async () => {
    const { contentType } = await apiGet("/api/charges/export", tokAdminCampus);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });

  it("EXP-14: /api/charges/export rol admisiones → no xlsx (R5 retirado; usar RPT-03)", async () => {
    const { contentType } = await apiGet("/api/charges/export", tokAdmisiones);
    expect(contentType).not.toContain("spreadsheetml");
    expect(contentType).not.toContain("octet-stream");
  });
});
