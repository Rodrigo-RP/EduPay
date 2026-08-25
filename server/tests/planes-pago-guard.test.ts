/**
 * server/tests/planes-pago-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard RECEIVABLES.READ en endpoints de planes de pago.
 *
 * Estado anterior al fix:
 *   GET /api/planes-pago (alias, misc.ts)          — solo authenticateToken
 *   GET /api/planes-pago/:campusId (canonical)     — solo checkCampusTenant
 *   Cualquier usuario autenticado obtenía HTTP 200 con planes de pago reales:
 *   nombre del alumno, total_adeudo_centavos, cuotas_pagadas, e installments
 *   (array completo de charges del plan con montos, estados y fechas de vencimiento).
 *
 * Evidencia empírica (antes del fix):
 *   asistente / admisiones → HTTP 200 en ambas rutas
 *   Ejemplo alias: plan id:107, student:"Sofía Valentina López",
 *                  total_adeudo_centavos:280000, installments:3 cuotas
 *
 * Guard elegido: RECEIVABLES.READ (no CHARGES.READ)
 *   Aunque los planes de pago viven como charges en el ledger (ADR-002),
 *   la respuesta expone la estructura consolidada de deuda reestructurada
 *   por alumno (total + todas las cuotas de golpe + historial de pago).
 *   Eso es CxC, no un lookup de cargo individual.
 *   — asistente tiene CHARGES.READ pero NO RECEIVABLES.READ → bloqueado
 *   — admisiones: restricción "No puede acceder a cuentas por cobrar" → bloqueado
 *   — auxiliar_contable, contador_general, administrador_campus → tienen
 *     RECEIVABLES.READ → pasan
 *   Consistente con RECEIVABLES.READ en semáforo de riesgo (misma sensibilidad).
 *
 * Tests:
 *   PPG-01  asistente   → 403 en alias  /api/planes-pago
 *   PPG-02  admisiones  → 403 en alias  /api/planes-pago
 *   PPG-03  administrador_campus → 200 + array en alias  (regresión)
 *   PPG-04  asistente   → 403 en canonical /api/planes-pago/:campusId
 *   PPG-05  admisiones  → 403 en canonical /api/planes-pago/:campusId
 *   PPG-06  administrador_campus → 200 + array en canonical (regresión)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "planes-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAsistente   = makeToken("asistente");
const tokenAdmisiones  = makeToken("admisiones");
const tokenAdminCampus = makeToken("administrador_campus"); // tiene RECEIVABLES.READ

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

describe("PPG — Guard RECEIVABLES.READ en planes de pago", () => {

  // ── GET /api/planes-pago (alias, misc.ts) ─────────────────────────────────

  describe("GET /api/planes-pago — alias sin campusId (misc.ts)", () => {

    it("PPG-01: asistente (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/planes-pago`, { headers: H(tokenAsistente) });
      expect(r.status).toBe(403);
    });

    it("PPG-02: admisiones (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/planes-pago`, { headers: H(tokenAdmisiones) });
      expect(r.status).toBe(403);
    });

    it("PPG-03: administrador_campus (con RECEIVABLES.READ) → 200 + array con planes (regresión)", async () => {
      const r    = await fetch(`${BASE}/api/planes-pago`, { headers: H(tokenAdminCampus) });
      const body = await r.json().catch(() => null);
      expect(r.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      // Si hay planes en el campus, verificar estructura
      if (body.length > 0) {
        expect(body[0]).toHaveProperty("installments");
        expect(body[0]).toHaveProperty("total_adeudo_centavos");
        expect(Array.isArray(body[0].installments)).toBe(true);
      }
    });

  });

  // ── GET /api/planes-pago/:campusId (canonical, misc.ts) ──────────────────

  describe("GET /api/planes-pago/:campusId — canonical con campusId (misc.ts)", () => {

    it("PPG-04: asistente (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/planes-pago/${CAMPUS_ID}`, { headers: H(tokenAsistente) });
      expect(r.status).toBe(403);
    });

    it("PPG-05: admisiones (sin RECEIVABLES.READ) → 403", async () => {
      const r = await fetch(`${BASE}/api/planes-pago/${CAMPUS_ID}`, { headers: H(tokenAdmisiones) });
      expect(r.status).toBe(403);
    });

    it("PPG-06: administrador_campus (con RECEIVABLES.READ) → 200 + array con planes (regresión)", async () => {
      const r    = await fetch(`${BASE}/api/planes-pago/${CAMPUS_ID}`, { headers: H(tokenAdminCampus) });
      const body = await r.json().catch(() => null);
      expect(r.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      if (body.length > 0) {
        expect(body[0]).toHaveProperty("installments");
        expect(body[0]).toHaveProperty("total_adeudo_centavos");
        expect(Array.isArray(body[0].installments)).toBe(true);
      }
    });

  });

});
