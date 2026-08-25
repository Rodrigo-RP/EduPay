/**
 * server/tests/calendario-eventos-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Guard CALENDAR.READ en GET /api/calendario/eventos (ambas rutas).
 *
 * Estado anterior al fix:
 *   Tarea #130 aplicó CALENDAR.CREATE a los POSTs pero dejó los GETs sin guard.
 *   Ambas rutas respondían HTTP 200 con eventos financieros del campus para
 *   cualquier usuario autenticado:
 *     GET /api/calendario/eventos/:campusId  — solo checkCampusTenant
 *     GET /api/calendario/eventos            — solo checkCampusTenant
 *
 * Evidencia empírica (antes del fix):
 *   admisiones → HTTP 200 en ambas rutas ([] vacío porque el campus demo no
 *   tiene eventos, pero el endpoint respondía sin restricción).
 *
 * Guard elegido: CALENDAR.READ
 *   Mismo módulo/acción ya definidos en #130 para los POSTs; la única omisión
 *   era no haberlo aplicado a las lecturas.
 *
 * ⚠️ NOTA IMPORTANTE — mismo patrón que DASHBOARD.READ:
 *   CALENDAR.READ está asignado a TODOS los roles definidos en la matriz
 *   (super_admin, administrador_general, administrador_campus, contador_general,
 *   auxiliar_contable, admisiones, asistente). En la práctica actual, ningún
 *   rol nombrado quedará bloqueado. El guard es correcto aplicarlo para
 *   garantizar que futuros roles nuevos sin CALENDAR.READ queden bloqueados
 *   por defecto. El test de bloqueo usa un rol inventado ('invitado') que
 *   no existe en la matriz y por tanto no hereda ningún permiso.
 *
 * Tests:
 *   CEG-01  rol 'invitado' (sin CALENDAR.READ) → 403 en canonical /:campusId
 *   CEG-02  rol 'invitado' (sin CALENDAR.READ) → 403 en alias
 *   CEG-03  administrador_campus (con CALENDAR.READ) → 200 (regresión canonical)
 *   CEG-04  admisiones (con CALENDAR.READ) → 200 (regresión alias — antes 200,
 *           sigue 200: confirmación de que el permiso universal no rompe nada)
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

const CAMPUS_ID = 48;
const TENANT_ID = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { id: 80, email: "ceg-guard@jfr.edu.mx", role,
      campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

// 'invitado' no existe en ROLE_PERMISSIONS → hasPermissionForUser devuelve false
const tokenInvitado    = makeToken("invitado");
const tokenAdminCampus = makeToken("administrador_campus");
const tokenAdmisiones  = makeToken("admisiones");

const H = (tok: string) => ({ Authorization: `Bearer ${tok}` });

describe("CEG — Guard CALENDAR.READ en GET /api/calendario/eventos", () => {

  it("CEG-01: rol 'invitado' (sin CALENDAR.READ) → 403 en canonical /:campusId", async () => {
    const r = await fetch(`${BASE}/api/calendario/eventos/${CAMPUS_ID}`, { headers: H(tokenInvitado) });
    expect(r.status).toBe(403);
  });

  it("CEG-02: rol 'invitado' (sin CALENDAR.READ) → 403 en alias", async () => {
    const r = await fetch(`${BASE}/api/calendario/eventos`, { headers: H(tokenInvitado) });
    expect(r.status).toBe(403);
  });

  it("CEG-03: administrador_campus (con CALENDAR.READ) → 200 + array en canonical (regresión)", async () => {
    const r    = await fetch(`${BASE}/api/calendario/eventos/${CAMPUS_ID}`, { headers: H(tokenAdminCampus) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("CEG-04: admisiones (con CALENDAR.READ) → 200 + array en alias (regresión — todos los roles tienen el permiso)", async () => {
    const r    = await fetch(`${BASE}/api/calendario/eventos`, { headers: H(tokenAdmisiones) });
    const body = await r.json().catch(() => null);
    expect(r.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

});
