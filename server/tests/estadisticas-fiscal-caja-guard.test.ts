/**
 * EFC — Estadísticas Fiscal/Caja Guard
 *
 * GET /api/fiscal/estadisticas-sat        → FISCAL.READ
 * GET /api/caja/estadisticas-conciliacion → PAYMENTS.READ
 *
 * Riesgo reproducido:
 *   asistente → HTTP 200 en ambos endpoints sin guard de rol.
 *   estadisticas-sat:          {total_cfdis:1, emitidos:1, cancelados:0, pac:"Facturama", ...}
 *   estadisticas-conciliacion: {total_transacciones:53, monto_total:1501106, ...}
 *
 * Datos expuestos: agregados puros (conteos y sumas), sin nombres ni montos por familia.
 * El guard aplica por consistencia de módulo, no por severidad de PII.
 *
 * Guards elegidos:
 *   FISCAL.READ    — todos los demás endpoints de misc.ts que tocan invoices/fiscal usan este permiso.
 *   PAYMENTS.READ  — misma tabla (bank_transactions), mismo módulo que movimientos-banco
 *                    y conciliacion/transacciones ya corregidos.
 *
 * Matriz de permisos relevante:
 *   FISCAL.READ:   contador_general ✓, administrador_campus ✓; asistente ✗, admisiones ✗, auxiliar_contable ✗
 *   PAYMENTS.READ: administrador_campus ✓, contador_general ✓, auxiliar_contable ✓, asistente ✓; admisiones ✗
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE   = "http://localhost:5000";
const SECRET = process.env.JWT_SECRET ?? "fallback-secret-key";

function makeToken(role: string) {
  return jwt.sign(
    { id: 80, email: "efc-guard@jfr.edu.mx", role, tenant_id: 29, campus_id: 48 },
    SECRET,
    { expiresIn: "10m" }
  );
}

describe("EFC — /api/fiscal/estadisticas-sat requiere FISCAL.READ", () => {
  const ENDPOINT = "/api/fiscal/estadisticas-sat";

  // EFC-01: rol sin FISCAL.READ → 403
  it("EFC-01: asistente → 403", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("asistente")}` },
    });
    expect(res.status).toBe(403);
  });

  // EFC-02: admisiones → 403
  it("EFC-02: admisiones → 403", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("admisiones")}` },
    });
    expect(res.status).toBe(403);
  });

  // EFC-03: rol con FISCAL.READ → 200 (control positivo)
  it("EFC-03: contador_general → 200", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("contador_general")}` },
    });
    expect(res.status).toBe(200);
  });

  // EFC-04: control positivo adicional
  it("EFC-04: administrador_campus → 200", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("administrador_campus")}` },
    });
    expect(res.status).toBe(200);
  });

  // EFC-05: sin token → 401
  it("EFC-05: sin token → 401", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`);
    expect(res.status).toBe(401);
  });
});

describe("EFC — /api/caja/estadisticas-conciliacion requiere PAYMENTS.READ", () => {
  const ENDPOINT = "/api/caja/estadisticas-conciliacion";

  // EFC-06: admisiones no tiene PAYMENTS.READ → 403
  it("EFC-06: admisiones → 403", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("admisiones")}` },
    });
    expect(res.status).toBe(403);
  });

  // EFC-07: roles con PAYMENTS.READ → 200 (control positivo)
  it("EFC-07: asistente → 200", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("asistente")}` },
    });
    expect(res.status).toBe(200);
  });

  it("EFC-08: auxiliar_contable → 200", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("auxiliar_contable")}` },
    });
    expect(res.status).toBe(200);
  });

  it("EFC-09: administrador_campus → 200", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, {
      headers: { Authorization: `Bearer ${makeToken("administrador_campus")}` },
    });
    expect(res.status).toBe(200);
  });

  // EFC-10: sin token → 401
  it("EFC-10: sin token → 401", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`);
    expect(res.status).toBe(401);
  });
});
