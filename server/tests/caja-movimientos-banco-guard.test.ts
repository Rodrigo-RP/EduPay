/**
 * server/tests/caja-movimientos-banco-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard PAYMENTS.READ en GET /api/caja/movimientos-banco.
 *
 * Estado anterior al fix:
 *   Solo authenticateToken — cualquier usuario autenticado obtenía HTTP 200
 *   con todos los movimientos bancarios del campus: monto_centavos,
 *   descripcion, referencia, clabe_ordenante, nombre_ordenante,
 *   estado_conciliacion, tipo, fecha.
 *
 * Evidencia empírica (antes del fix):
 *   admisiones → HTTP 200 · 53 transacciones de bank_transactions.
 *
 * Guard elegido: PAYMENTS.READ
 *   Mismo permiso que /api/conciliacion/transacciones (mismo dominio,
 *   misma tabla bank_transactions). Consistencia deliberada.
 *   — admisiones (sin PAYMENTS.READ) → bloqueado ✓
 *   — administrador_campus (con PAYMENTS.READ) → pasa ✓
 *
 * Tests:
 *   CMB-G-01  admisiones (sin PAYMENTS.READ) → 403
 *   CMB-G-02  administrador_campus (con PAYMENTS.READ) → 200 + array (regresión)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "cmb-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAdmisiones  = makeToken("admisiones");           // sin PAYMENTS.READ
const tokenAdminCampus = makeToken("administrador_campus"); // con PAYMENTS.READ

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

describe("CMB-G — Guard PAYMENTS.READ en GET /api/caja/movimientos-banco", () => {

  it("CMB-G-01: admisiones (sin PAYMENTS.READ) → 403", async () => {
    const r = await fetch(`${BASE}/api/caja/movimientos-banco`, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("CMB-G-02: administrador_campus (con PAYMENTS.READ) → 200 + array (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/caja/movimientos-banco`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

});
