/**
 * server/tests/dashboard-comandos-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard FINANCIAL.READ en GET /api/dashboard/comandos (ambas rutas).
 *
 * Estado anterior al fix:
 *   GET /api/dashboard/comandos/:campusId  (conciliacion.ts) — solo checkCampusTenant
 *   GET /api/dashboard/comandos            (misc.ts)         — solo authenticateToken
 *   Cualquier usuario autenticado obtenía HTTP 200 con KPIs financieros
 *   reales del campus: facturado_mes, tasa_cobro, mora, estudiantes activos,
 *   spei_pendientes, cfdi_pendientes.
 *
 * Evidencia empírica (antes del fix):
 *   admisiones → HTTP 200 en ambas rutas
 *   facturado_mes=666666, tasa_cobro=12, mora=88, estudiantes=8, spei_pendientes=5
 *
 * Guard elegido: FINANCIAL.READ
 *   Mismo permiso ya usado para KPIs financieros agregados en /api/reportes/consejo
 *   (tarea #133). Consistencia deliberada: datos de análisis financiero del campus
 *   → FINANCIAL.READ.
 *
 * Roles con FINANCIAL.READ: super_admin, administrador_general, administrador_campus,
 *   contador_general.
 * Roles SIN FINANCIAL.READ (bloqueados): auxiliar_contable, admisiones, asistente.
 *   → Bloqueo real, no ceremonial (a diferencia de CALENDAR.READ / DASHBOARD.READ).
 *
 * Tests:
 *   DCG-01  admisiones (sin FINANCIAL.READ) → 403 en canonical /:campusId
 *   DCG-02  admisiones (sin FINANCIAL.READ) → 403 en alias
 *   DCG-03  administrador_campus (con FINANCIAL.READ) → 200 + resumen en canonical
 *   DCG-04  administrador_campus (con FINANCIAL.READ) → 200 + resumen en alias
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "dcg-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAdmisiones  = makeToken("admisiones");           // sin FINANCIAL.READ
const tokenAdminCampus = makeToken("administrador_campus"); // con FINANCIAL.READ

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

describe("DCG — Guard FINANCIAL.READ en GET /api/dashboard/comandos", () => {

  it("DCG-01: admisiones (sin FINANCIAL.READ) → 403 en canonical /:campusId", async () => {
    const r = await fetch(`${BASE}/api/dashboard/comandos/${CAMPUS_ID}`, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("DCG-02: admisiones (sin FINANCIAL.READ) → 403 en alias", async () => {
    const r = await fetch(`${BASE}/api/dashboard/comandos`, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("DCG-03: administrador_campus (con FINANCIAL.READ) → 200 + resumen en canonical (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/dashboard/comandos/${CAMPUS_ID}`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(body).toHaveProperty("resumen");
    expect(typeof body.resumen.facturado_mes).toBe("number");
  });

  it("DCG-04: administrador_campus (con FINANCIAL.READ) → 200 + resumen en alias (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/dashboard/comandos`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(body).toHaveProperty("resumen");
    expect(typeof body.resumen.facturado_mes).toBe("number");
  });

});
