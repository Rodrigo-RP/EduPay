/**
 * server/tests/becas-auto-reglas-alias-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard SCHOLARSHIPS.ASSIGN en alias GET /api/becas-auto/reglas.
 *
 * Estado anterior al fix:
 *   El alias (misc.ts) solo tenía authenticateToken.
 *   El canonical GET /api/becas-auto/reglas/:campusId ya tenía
 *   hasPermissionForUser(SCHOLARSHIPS.ASSIGN) — mismo patrón de alias huérfano
 *   ya visto en /api/riesgo/semaforo, /api/reportes/consejo y /api/planes-pago.
 *
 * Evidencia empírica (antes del fix):
 *   admisiones → HTTP 200 en el alias (0 ítems porque el campus demo no tiene
 *   reglas configuradas, pero el endpoint respondía sin restricción).
 *
 * Guard elegido: SCHOLARSHIPS.ASSIGN
 *   Mismo permiso que el canonical — consistencia deliberada, sin crear
 *   nueva inconsistencia entre alias y ruta canónica.
 *
 * Tests:
 *   BAR-G-01  admisiones (sin SCHOLARSHIPS.ASSIGN) → 403 en alias
 *   BAR-G-02  administrador_campus (con SCHOLARSHIPS.ASSIGN) → 200 (regresión)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "bar-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAdmisiones  = makeToken("admisiones");           // sin SCHOLARSHIPS.ASSIGN
const tokenAdminCampus = makeToken("administrador_campus"); // con SCHOLARSHIPS.ASSIGN

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

describe("BAR-G — Guard SCHOLARSHIPS.ASSIGN en alias /api/becas-auto/reglas", () => {

  it("BAR-G-01: admisiones (sin SCHOLARSHIPS.ASSIGN) → 403", async () => {
    const r = await fetch(`${BASE}/api/becas-auto/reglas`, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("BAR-G-02: administrador_campus (con SCHOLARSHIPS.ASSIGN) → 200 (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/becas-auto/reglas`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    // La respuesta es un array (puede ser vacío si no hay reglas configuradas)
    expect(Array.isArray(body)).toBe(true);
  });

});
