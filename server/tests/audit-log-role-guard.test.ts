/**
 * Guard de rol — GET /api/audit-log (SECURITY.READ)
 *
 * El historial de auditoría expone eventos de seguridad, cambios de configuración
 * y operaciones financieras de todos los módulos del tenant.  Un guard de rol
 * basado en MODULES.SECURITY + ACTIONS.READ protege el endpoint.
 *
 * Roles con acceso (SECURITY.READ asignado):
 *   super_admin, administrador_general, administrador_campus, contador_general
 *
 * Roles bloqueados (sin SECURITY.READ):
 *   auxiliar_contable, asistente, admisiones
 *
 * Por qué SECURITY.READ y no REPORTS.READ:
 *   - REPORTS.READ ya lo tienen admisiones y asistente → usarlo abriría la puerta.
 *   - El audit log NO es un reporte de negocio: registra logins, condonaciones,
 *     cambios de config y errores de seguridad de TODOS los módulos.
 *   - SECURITY.READ se añadió como acción nueva, sin colaterales en otros endpoints.
 *   - hasPermission() exige que el permiso exista explícitamente en el array del rol
 *     (el shortcut super_admin dispara después de encontrar el permiso, no antes).
 *
 * Tests:
 *   ALG-01  admisiones → 403
 *   ALG-02  asistente → 403
 *   ALG-03  auxiliar_contable → 403
 *   ALG-04  contador_general → 200 (acceso permitido)
 *   ALG-05  administrador_campus → 200 (acceso permitido)
 *   ALG-06  administrador_general → 200 (acceso permitido)
 *   ALG-07  sin token → 401
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// Campus y tenant del seed de demo (no necesitamos crear fixtures propios:
// solo verificamos el código HTTP que devuelve el guard, no el contenido).
const CAMPUS_ID  = 48;
const TENANT_ID  = 29;

function makeToken(role: string): string {
  return jwt.sign(
    { campus_id: CAMPUS_ID, tenant_id: TENANT_ID, role, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function getAuditLog(token?: string): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api/audit-log?limit=1`, { headers });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ═══════════════════════════════════════════════════════════════════════════════
describe("Guard de rol — GET /api/audit-log (SECURITY.READ)", () => {

  // ── Roles bloqueados ────────────────────────────────────────────────────────

  it("ALG-01: admisiones → 403 sin datos", async () => {
    const { status, body } = await getAuditLog(makeToken("admisiones"));
    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
    // Confirmar que NO filtra datos de audit (no 'entries' en body)
    expect(body.entries).toBeUndefined();
  });

  it("ALG-02: asistente → 403 sin datos", async () => {
    const { status, body } = await getAuditLog(makeToken("asistente"));
    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
    expect(body.entries).toBeUndefined();
  });

  it("ALG-03: auxiliar_contable → 403 sin datos", async () => {
    const { status, body } = await getAuditLog(makeToken("auxiliar_contable"));
    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
    expect(body.entries).toBeUndefined();
  });

  // ── Roles con acceso ────────────────────────────────────────────────────────

  it("ALG-04: contador_general → 200 con estructura válida", async () => {
    const { status, body } = await getAuditLog(makeToken("contador_general"));
    expect(status).toBe(200);
    expect(typeof body.total).toBe("number");
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("ALG-05: administrador_campus → 200 con estructura válida", async () => {
    const { status, body } = await getAuditLog(makeToken("administrador_campus"));
    expect(status).toBe(200);
    expect(typeof body.total).toBe("number");
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("ALG-06: administrador_general → 200 con estructura válida", async () => {
    const { status, body } = await getAuditLog(makeToken("administrador_general"));
    expect(status).toBe(200);
    expect(typeof body.total).toBe("number");
    expect(Array.isArray(body.entries)).toBe(true);
  });

  // ── Sin autenticación ───────────────────────────────────────────────────────

  it("ALG-07: sin token → 401", async () => {
    const { status } = await getAuditLog();
    expect(status).toBe(401);
  });

});
