/**
 * SYS — Guards SYSTEM.CONFIGURE / SYSTEM.READ / SECURITY.READ
 *
 * Cubre los 10 endpoints de system.ts que carecían de hasPermission:
 *   Destructivos (SYSTEM.CONFIGURE): optimize-database, cleanup-database, database-maintenance
 *   Lectura sistema (SYSTEM.READ):   database-performance
 *   Seguridad (SECURITY.READ):       metrics, events, scan, block-ip, enable-2fa, report
 *
 * Reproducción empírica del riesgo (antes del fix):
 *   JWT role=asistente → POST /api/admin/cleanup-database → HTTP 200 ← CONFIRMADO
 *   cleanupObsoleteData() ejecutó sin ningún rechazo.
 *
 * Tokens: minteados con JWT_SECRET sin id de usuario real (ningún endpoint hace
 * lookup de usuario ni escribe audit_log — omitir 'id' es seguro aquí).
 * Se usa un rol representativo por grupo para no saturar el rate limiter
 * /api/admin (50 req/5min). Los permisos son idénticos dentro de cada grupo.
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";

function tok(role: string) {
  return jwt.sign({ role, campus_id: 48, tenant_id: 29 }, JWT_SECRET, { expiresIn: "1h" });
}

const T = {
  asistente:     tok("asistente"),        // rol más bajo con DASHBOARD.READ — sin SYSTEM ni SECURITY
  adminCampus:   tok("administrador_campus"), // tiene SYSTEM.READ pero no SYSTEM.CONFIGURE
  adminGeneral:  tok("administrador_general"), // recibe SYSTEM.CONFIGURE con este fix
  superAdmin:    tok("super_admin"),
};

async function hit(method: string, path: string, token: string, body?: object) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── BLOQUEO: endpoints destructivos (SYSTEM.CONFIGURE) ────────────────────────
describe("SYS — BLOQUEO (403): SYSTEM.CONFIGURE — rol sin permiso", () => {
  it("SYS-01: asistente POST /api/admin/cleanup-database → 403", async () => {
    const r = await hit("POST", "/api/admin/cleanup-database", T.asistente);
    expect(r.status).toBe(403);
    const b = await r.json();
    expect(b.message).toContain("permisos");
  });

  it("SYS-02: asistente POST /api/admin/optimize-database → 403", async () => {
    const r = await hit("POST", "/api/admin/optimize-database", T.asistente);
    expect(r.status).toBe(403);
    const b = await r.json();
    expect(b.message).toContain("permisos");
  });

  it("SYS-03: asistente POST /api/admin/database-maintenance → 403", async () => {
    const r = await hit("POST", "/api/admin/database-maintenance", T.asistente);
    expect(r.status).toBe(403);
    const b = await r.json();
    expect(b.message).toContain("permisos");
  });

  it("SYS-04: administrador_campus POST /api/admin/cleanup-database → 403 (SYSTEM.READ ≠ SYSTEM.CONFIGURE)", async () => {
    // administrador_campus tiene SYSTEM.READ, NO SYSTEM.CONFIGURE → debe quedar fuera
    const r = await hit("POST", "/api/admin/cleanup-database", T.adminCampus);
    expect(r.status).toBe(403);
  });

  it("SYS-05: sin token → 401 en cleanup-database", async () => {
    const r = await hit("POST", "/api/admin/cleanup-database", "");
    expect(r.status).toBe(401);
  });
});

// ── BLOQUEO: lectura sistema (SYSTEM.READ) ────────────────────────────────────
describe("SYS — BLOQUEO (403): SYSTEM.READ — rol sin permiso", () => {
  it("SYS-06: asistente GET /api/admin/database-performance → 403", async () => {
    const r = await hit("GET", "/api/admin/database-performance", T.asistente);
    expect(r.status).toBe(403);
    const b = await r.json();
    expect(b.message).toContain("permisos");
  });
});

// ── BLOQUEO: seguridad (SECURITY.READ) ───────────────────────────────────────
describe("SYS — BLOQUEO (403): SECURITY.READ — rol sin permiso", () => {
  const eps = [
    { method: "GET",  path: "/api/security/metrics" },
    { method: "GET",  path: "/api/security/events" },
    { method: "POST", path: "/api/security/scan" },
    { method: "POST", path: "/api/security/block-ip",    body: { ipAddress: "1.2.3.4" } },
    { method: "POST", path: "/api/security/enable-2fa" },
    { method: "GET",  path: "/api/security/report" },
  ];

  for (const [i, ep] of eps.entries()) {
    it(`SYS-0${7 + i}: asistente ${ep.method} ${ep.path} → 403`, async () => {
      const r = await hit(ep.method, ep.path, T.asistente, (ep as any).body);
      expect(r.status).toBe(403);
      const b = await r.json();
      expect(b.message).toContain("permisos");
    });
  }
});

// ── CONTROL POSITIVO: SYSTEM.CONFIGURE ───────────────────────────────────────
describe("SYS — CONTROL POSITIVO (2xx): SYSTEM.CONFIGURE — super_admin y administrador_general", () => {
  it("SYS-13: super_admin POST /api/admin/cleanup-database → 200", async () => {
    const r = await hit("POST", "/api/admin/cleanup-database", T.superAdmin);
    expect(r.status).toBe(200);
    const b = await r.json();
    // cleanupObsoleteData retorna { success: true|false }; el guard es lo que verificamos.
    expect(b).toHaveProperty("success");
  });

  it("SYS-14: administrador_general POST /api/admin/cleanup-database → 200 (SYSTEM.CONFIGURE recién otorgado)", async () => {
    const r = await hit("POST", "/api/admin/cleanup-database", T.adminGeneral);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b).toHaveProperty("success");
  });
});

// ── CONTROL POSITIVO: SYSTEM.READ / SECURITY.READ ────────────────────────────
describe("SYS — CONTROL POSITIVO (2xx): SYSTEM.READ / SECURITY.READ", () => {
  it("SYS-15: administrador_campus GET /api/admin/database-performance → 200 (SYSTEM.READ — guard pasa)", async () => {
    // checkQueryPerformance puede retornar { success: false } si pg_stats no es accesible en Neon;
    // lo que verificamos es que el guard permite el paso (HTTP 200).
    const r = await hit("GET", "/api/admin/database-performance", T.adminCampus);
    expect(r.status).toBe(200);
  });

  it("SYS-16: administrador_campus GET /api/security/report → 200 (SECURITY.READ)", async () => {
    const r = await hit("GET", "/api/security/report", T.adminCampus);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.securityScore).toBeDefined();
  });

  it("SYS-17: administrador_campus GET /api/security/metrics → 200 (SECURITY.READ)", async () => {
    const r = await hit("GET", "/api/security/metrics", T.adminCampus);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.securityScore).toBeDefined();
  });
});
