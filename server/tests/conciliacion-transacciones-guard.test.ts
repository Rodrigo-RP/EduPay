/**
 * server/tests/conciliacion-transacciones-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard PAYMENTS.READ en endpoints de transacciones bancarias.
 *
 * Estado anterior al fix:
 *   GET /api/conciliacion/transacciones (alias)          — solo authenticateToken
 *   GET /api/conciliacion/transacciones/:campusId        — solo checkCampusTenant
 *   Cualquier usuario autenticado obtenía HTTP 200 con todos los movimientos
 *   bancarios del campus: monto, descripción, referencia SPEI, CLABE ordenante,
 *   nombre ordenante, estado de conciliación, fecha y tipo.
 *
 * Evidencia empírica (antes del fix):
 *   admisiones / asistente → HTTP 200 en ambas rutas · 53 transacciones
 *   bancarias reales expuestas sin restricción.
 *
 * Guard elegido: PAYMENTS.READ (no PAYMENTS.PROCESS)
 *   El endpoint es SELECT puro — usar PAYMENTS.PROCESS para una lectura sería
 *   un mismatch semántico (PROCESS es para mutaciones de pago). PAYMENTS.READ
 *   es la acción correcta para consultar registros de transacciones financieras.
 *   — admisiones (sin PAYMENTS.READ) → bloqueado ✓
 *   — asistente, auxiliar_contable, administrador_campus → tienen PAYMENTS.READ
 *     → pasan ✓
 *
 * Nota: GET /api/caja/movimientos-banco (mismo dominio, misma tabla) también
 *   carece de guard de rol — solo tiene authenticateToken. Ese endpoint
 *   queda fuera de este fix; pendiente de decisión separada.
 *
 * Tests:
 *   CTG-01  admisiones (sin PAYMENTS.READ) → 403 en alias
 *   CTG-02  admisiones (sin PAYMENTS.READ) → 403 en canonical /:campusId
 *   CTG-03  administrador_campus (con PAYMENTS.READ) → 200 + array (regresión alias)
 *   CTG-04  administrador_campus (con PAYMENTS.READ) → 200 + array (regresión canonical)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "ctg-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAdmisiones  = makeToken("admisiones");           // sin PAYMENTS.READ
const tokenAdminCampus = makeToken("administrador_campus"); // con PAYMENTS.READ

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

describe("CTG — Guard PAYMENTS.READ en transacciones bancarias de conciliación", () => {

  it("CTG-01: admisiones (sin PAYMENTS.READ) → 403 en alias /api/conciliacion/transacciones", async () => {
    const r = await fetch(`${BASE}/api/conciliacion/transacciones`, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("CTG-02: admisiones (sin PAYMENTS.READ) → 403 en canonical /api/conciliacion/transacciones/:campusId", async () => {
    const r = await fetch(`${BASE}/api/conciliacion/transacciones/${CAMPUS_ID}`, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("CTG-03: administrador_campus (con PAYMENTS.READ) → 200 + array en alias (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/conciliacion/transacciones`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("CTG-04: administrador_campus (con PAYMENTS.READ) → 200 + array en canonical (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/conciliacion/transacciones/${CAMPUS_ID}`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

});
