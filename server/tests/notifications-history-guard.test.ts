/**
 * NHG — Notifications History Guard
 *
 * GET /api/notifications        → RECEIVABLES.READ
 * GET /api/notifications/stats  → RECEIVABLES.READ
 *
 * Riesgo reproducido: admisiones (HTTP 200) veía historial de notificaciones
 * con emails reales de tutores, nombres de alumnos, mensajes íntegros del campus
 * completo. No estaba acotado por user_id — era tenant-wide.
 *
 * Guard elegido: RECEIVABLES.READ — consistente con /api/notifications/pending-students,
 * semáforo y planes de pago (mismo dominio de cobranza activa).
 * asistente (tiene PAYMENTS.READ pero no RECEIVABLES.READ) queda bloqueado,
 * igual que en el guard de pending-students.
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const SECRET = process.env.JWT_SECRET ?? "fallback-secret-key";

function makeToken(role: string) {
  return jwt.sign(
    { id: 80, email: "nhg-guard@jfr.edu.mx", role,
      tenant_id: 29, campus_id: 48 },
    SECRET,
    { expiresIn: "10m" }
  );
}

// Roles que tienen RECEIVABLES.READ (según matriz de permisos)
const ALLOWED_ROLES = ["administrador_campus", "contador_general", "auxiliar_contable"];
// Roles bloqueados: no tienen RECEIVABLES.READ
const BLOCKED_ROLES = ["admisiones", "asistente"];

const ENDPOINTS = [
  "/api/notifications",
  "/api/notifications/stats",
];

describe("NHG — GET /api/notifications y /stats requieren RECEIVABLES.READ", () => {

  // ── NHG-01 / NHG-03: roles sin RECEIVABLES.READ → 403 ─────────────────────
  for (const rol of BLOCKED_ROLES) {
    for (const endpoint of ENDPOINTS) {
      it(`NHG-BLK: ${rol} → ${endpoint} devuelve 403`, async () => {
        const res = await fetch(`${BASE}${endpoint}`, {
          headers: { Authorization: `Bearer ${makeToken(rol)}` },
        });
        expect(res.status).toBe(403);
      });
    }
  }

  // ── NHG-02 / NHG-04: roles con RECEIVABLES.READ → 200 ────────────────────
  for (const rol of ALLOWED_ROLES) {
    for (const endpoint of ENDPOINTS) {
      it(`NHG-OK: ${rol} → ${endpoint} devuelve 200`, async () => {
        const res = await fetch(`${BASE}${endpoint}`, {
          headers: { Authorization: `Bearer ${makeToken(rol)}` },
        });
        expect(res.status).toBe(200);
      });
    }
  }

  // ── NHG-05: sin token → 401 ────────────────────────────────────────────────
  for (const endpoint of ENDPOINTS) {
    it(`NHG-UNAUTH: sin token → ${endpoint} devuelve 401`, async () => {
      const res = await fetch(`${BASE}${endpoint}`);
      expect(res.status).toBe(401);
    });
  }
});
