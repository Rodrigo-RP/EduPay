/**
 * server/tests/consejo-alias-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard FINANCIAL.READ en alias GET /api/reportes/consejo.
 *
 * Estado anterior al fix:
 *   GET /api/reportes/consejo (alias, misc.ts) solo tenía authenticateToken.
 *   Cualquier usuario autenticado obtenía HTTP 200 con el top-10 de deudores
 *   (nombre del estudiante, nombre de familia, adeudo_centavos, semáforo)
 *   más los KPIs financieros del campus (ingresos, facturado, mora, etc.).
 *
 * Evidencia empírica (antes del fix):
 *   asistente → HTTP 200 · top_deudores: 10 entradas con nombres reales
 *   Ejemplo: "Diego Emmanuel Sánchez", adeudo_centavos: 1000000, semaforo: "rojo"
 *
 * Fix aplicado (misc.ts):
 *   hasPermissionForUser(user, MODULES.FINANCIAL, ACTIONS.READ)
 *   — mismo permiso que ya protegía la ruta canonical
 *     GET /api/reportes/consejo/:campusId (guardada desde la tarea #133).
 *
 * Diferencias alias vs canonical (preservadas, no cambiadas):
 *   - Alias: campusId siempre del JWT (no acepta param en URL).
 *   - Alias: sin checkCampusTenant (campusId del JWT firmado → equivalente).
 *   - SQL top_deudores: = 'pendiente' vs IN ('pendiente') — funcionalmente idéntico.
 *   - Forma de respuesta: idéntica en ambas rutas.
 *
 * Matriz RBAC — FINANCIAL.READ:
 *   CON permiso:  super_admin (scope:all), administrador_general,
 *                 administrador_campus, contador_general
 *   SIN permiso:  asistente, admisiones, auxiliar_contable
 *
 * Tests:
 *   CON-A-01  asistente   (sin FINANCIAL.READ) → 403
 *   CON-A-02  admisiones  (sin FINANCIAL.READ) → 403
 *   CON-A-03  administrador_campus (con FINANCIAL.READ) → 200 + kpis + top_deudores
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "consejo-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAsistente   = makeToken("asistente");
const tokenAdmisiones  = makeToken("admisiones");
const tokenAdminCampus = makeToken("administrador_campus");

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

describe("CON-A — Guard FINANCIAL.READ en alias /api/reportes/consejo", () => {

  it("CON-A-01: asistente (sin FINANCIAL.READ) → 403", async () => {
    const r = await fetch(`${BASE}/api/reportes/consejo`, { headers: H(tokenAsistente) });
    expect(r.status).toBe(403);
  });

  it("CON-A-02: admisiones (sin FINANCIAL.READ) → 403", async () => {
    const r = await fetch(`${BASE}/api/reportes/consejo`, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("CON-A-03: administrador_campus (con FINANCIAL.READ) → 200 con kpis y top_deudores (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/reportes/consejo`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(body).toHaveProperty("kpis");
    expect(body).toHaveProperty("top_deudores");
    expect(Array.isArray(body.top_deudores)).toBe(true);
    // KPIs presentes
    expect(typeof body.kpis.ingresos_mes).toBe("number");
    expect(typeof body.kpis.tasa_cobro).toBe("number");
  });

});
