/**
 * server/tests/semaforo-riesgo-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard RECEIVABLES.READ en endpoints de semáforo de riesgo.
 *
 * Estado anterior al fix:
 *   GET /api/riesgo/semaforo        (alias, misc.ts)       — solo authenticateToken
 *   GET /api/riesgo/semaforo/:campusId (canonical, conciliacion.ts) — solo checkCampusTenant
 *   Cualquier usuario autenticado obtenía adeudo, días vencido, tasa de pago
 *   histórica y risk score por familia sin restricción de rol.
 *
 * Fix aplicado:
 *   hasPermissionForUser(user, MODULES.RECEIVABLES, ACTIONS.READ) en ambas rutas.
 *   Módulo elegido: RECEIVABLES (no FINANCIAL) porque los datos son operativos
 *   de Cuentas por Cobrar (adeudo/mora/scoring por familia), no análisis
 *   financiero agregado. El sidebar ya asocia este endpoint a CxC.
 *
 * Matriz RBAC — RECEIVABLES.READ:
 *   CON permiso:  super_admin, administrador_general, administrador_campus,
 *                 contador_general, auxiliar_contable
 *   SIN permiso:  asistente   (no incluido en su lista de permisos)
 *                 admisiones  (restricción explícita: "No puede acceder a cuentas por cobrar")
 *
 * Corrección colateral:
 *   El alias (misc.ts) tenía FILTER dentro del MAX() — sintaxis PostgreSQL
 *   incorrecta que causaba HTTP 500 para todos los roles.
 *   Corregido a MAX(expr) FILTER(WHERE …) (patrón canónico según semaforo-sql.md).
 *
 * Tests:
 *   SEM-G-01  asistente  → 403 en alias  /api/riesgo/semaforo
 *   SEM-G-02  admisiones → 403 en alias  /api/riesgo/semaforo
 *   SEM-G-03  administrador_campus → 200 + array en alias  (regresión)
 *   SEM-G-04  asistente  → 403 en canonical /api/riesgo/semaforo/:campusId
 *   SEM-G-05  admisiones → 403 en canonical /api/riesgo/semaforo/:campusId
 *   SEM-G-06  administrador_campus → 200 + array en canonical (regresión)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "sem-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAsistente   = makeToken("asistente");
const tokenAdmisiones  = makeToken("admisiones");
const tokenAdminCampus = makeToken("administrador_campus"); // tiene RECEIVABLES.READ

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SEM-G — Guard RECEIVABLES.READ en semáforo de riesgo", () => {

  // ── GET /api/riesgo/semaforo (alias, misc.ts) ─────────────────────────────

  describe("GET /api/riesgo/semaforo — alias sin campusId (misc.ts)", () => {

    it("SEM-G-01: asistente (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/riesgo/semaforo`, { headers: H(tokenAsistente) });
      expect(r.status).toBe(403);
    });

    it("SEM-G-02: admisiones (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/riesgo/semaforo`, { headers: H(tokenAdmisiones) });
      expect(r.status).toBe(403);
    });

    it("SEM-G-03: administrador_campus (con RECEIVABLES.READ) → 200 + array con scoring (regresión)", async () => {
      const r    = await fetch(`${BASE}/api/riesgo/semaforo`, { headers: H(tokenAdminCampus) });
      const body = await r.json().catch(() => null);
      expect(r.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      // Verifica que la estructura de scoring está presente
      if (body.length > 0) {
        expect(body[0]).toHaveProperty("score");
        expect(body[0]).toHaveProperty("semaforo");
        expect(body[0]).toHaveProperty("adeudo_centavos");
      }
    });

  });

  // ── GET /api/riesgo/semaforo/:campusId (canonical, conciliacion.ts) ───────

  describe("GET /api/riesgo/semaforo/:campusId — canonical con campusId (conciliacion.ts)", () => {

    it("SEM-G-04: asistente (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/riesgo/semaforo/${CAMPUS_ID}`, { headers: H(tokenAsistente) });
      expect(r.status).toBe(403);
    });

    it("SEM-G-05: admisiones (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/riesgo/semaforo/${CAMPUS_ID}`, { headers: H(tokenAdmisiones) });
      expect(r.status).toBe(403);
    });

    it("SEM-G-06: administrador_campus (con RECEIVABLES.READ) → 200 + array con scoring (regresión)", async () => {
      const r    = await fetch(`${BASE}/api/riesgo/semaforo/${CAMPUS_ID}`, { headers: H(tokenAdminCampus) });
      const body = await r.json().catch(() => null);
      expect(r.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      if (body.length > 0) {
        expect(body[0]).toHaveProperty("score");
        expect(body[0]).toHaveProperty("semaforo");
        expect(body[0]).toHaveProperty("adeudo_centavos");
      }
    });

  });

});
