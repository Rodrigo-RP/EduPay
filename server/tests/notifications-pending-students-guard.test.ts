/**
 * server/tests/notifications-pending-students-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard RECEIVABLES.READ en GET /api/notifications/pending-students.
 *
 * Estado anterior al fix:
 *   Solo authenticateToken — cualquier usuario autenticado obtenía HTTP 200
 *   con la lista de alumnos con cargos pendientes del campus, incluyendo:
 *   nombre del alumno, email y teléfono del guardian responsable de pago,
 *   monto_centavos, concepto, días vencido, charge_id, guardian_id.
 *
 * Evidencia empírica (antes del fix):
 *   admisiones → HTTP 200 · 33 registros con PII de contacto + datos financieros.
 *
 * Guard elegido: RECEIVABLES.READ (no PAYMENTS.READ)
 *
 *   Razonamiento:
 *   - Este endpoint produce la lista de trabajo de cobranza: familias con deuda
 *     pendiente + datos de contacto organizados para iniciar outreach (el botón
 *     "Enviar liga" en CxC consume este endpoint).
 *   - El componente de PII (email + teléfono) no es contexto informativo sino
 *     vector de acción: quien lee esta lista puede contactar a familias sobre
 *     su deuda sin autorización institucional.
 *   - RECEIVABLES.READ ya protege el mismo dominio (semáforo, planes de pago,
 *     family balance). Consistencia deliberada.
 *   - PAYMENTS.READ dejaría pasar a 'asistente' (tiene PAYMENTS.READ pero no
 *     RECEIVABLES.READ) — incorrecto: un asistente responde preguntas, no
 *     gestiona cobranza.
 *
 * Roles bloqueados: admisiones, asistente, super_admin (no tiene RECEIVABLES.READ).
 * Roles que pasan: auxiliar_contable, contador_general, administrador_campus,
 *   administrador_general.
 *
 * Tests:
 *   NPS-G-01  admisiones (sin RECEIVABLES.READ) → 403
 *   NPS-G-02  asistente  (sin RECEIVABLES.READ) → 403
 *             (distingue de PAYMENTS.READ, donde asistente pasaría)
 *   NPS-G-03  auxiliar_contable (con RECEIVABLES.READ) → 200 + array (regresión)
 *   NPS-G-04  administrador_campus (con RECEIVABLES.READ) → 200 + array (regresión)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "nps-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

const tokenAdmisiones       = makeToken("admisiones");
const tokenAsistente        = makeToken("asistente");
const tokenAuxiliarContable = makeToken("auxiliar_contable");
const tokenAdminCampus      = makeToken("administrador_campus");

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });
const URL = `${BASE}/api/notifications/pending-students`;

describe("NPS-G — Guard RECEIVABLES.READ en GET /api/notifications/pending-students", () => {

  it("NPS-G-01: admisiones (sin RECEIVABLES.READ) → 403", async () => {
    const r = await fetch(URL, { headers: H(tokenAdmisiones) });
    expect(r.status).toBe(403);
  });

  it("NPS-G-02: asistente (sin RECEIVABLES.READ) → 403 (verifica que no basta PAYMENTS.READ)", async () => {
    const r = await fetch(URL, { headers: H(tokenAsistente) });
    expect(r.status).toBe(403);
  });

  it("NPS-G-03: auxiliar_contable (con RECEIVABLES.READ) → 200 + array (regresión)", async () => {
    const r    = await fetch(URL, { headers: H(tokenAuxiliarContable) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("NPS-G-04: administrador_campus (con RECEIVABLES.READ) → 200 + array (regresión)", async () => {
    const r    = await fetch(URL, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

});
