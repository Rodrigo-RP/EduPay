/**
 * e2e/07-endpoints-criticos.spec.ts
 * Módulo: Endpoints críticos de la API
 * Capa: Playwright (E2E) – smoke tests de API
 *
 * Verifica que ningún endpoint crítico devuelva 500 en condiciones normales.
 * Estos tests son la "capa 0": si alguno falla, el módulo completo está caído.
 *
 * NOTA: No valida lógica de negocio (eso es responsabilidad de Vitest).
 *       Solo verifica que el servidor responde y el status no es 5xx.
 */
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5000";

interface EndpointCheck {
  method: "GET" | "POST";
  path: string;
  label: string;
  body?: Record<string, unknown>;
  /** Status codes aceptables (default: cualquiera < 500) */
  acceptedStatuses?: number[];
}

const ENDPOINTS: EndpointCheck[] = [
  // Auth
  {
    method: "POST",
    path: "/api/auth/login",
    label: "Login admin",
    body: { email: "admin.campus@jfr.edu.mx", password: "Demo2025!" },
    acceptedStatuses: [200, 401],
  },
  {
    method: "POST",
    path: "/api/auth/guardian-login",
    label: "Login guardian",
    body: { email: "noexiste@test.com", password: "wrongpass" },
    acceptedStatuses: [200, 401, 404],
  },
  // Health / misc
  {
    method: "GET",
    path: "/api/health",
    label: "Health check",
    acceptedStatuses: [200, 404], // puede no existir; lo que no debe ser es 500
  },
  // Rutas protegidas (sin token → 401, no 500)
  { method: "GET", path: "/api/students", label: "GET /api/students sin auth" },
  { method: "GET", path: "/api/charges", label: "GET /api/charges sin auth" },
  { method: "GET", path: "/api/payments", label: "GET /api/payments sin auth" },
  { method: "GET", path: "/api/families", label: "GET /api/families sin auth" },
  { method: "GET", path: "/api/becas", label: "GET /api/becas sin auth" },
  { method: "GET", path: "/api/caja/movimientos-banco", label: "GET /api/caja/movimientos-banco sin auth" },
  { method: "GET", path: "/api/riesgo/semaforo/48", label: "GET /api/riesgo/semaforo sin auth" },
  { method: "GET", path: "/api/notifications", label: "GET /api/notifications sin auth" },
];

test.describe("Smoke – Endpoints críticos", () => {
  for (const ep of ENDPOINTS) {
    test(`${ep.method} ${ep.path} (${ep.label})`, async ({ request }) => {
      const fn = ep.method === "GET" ? request.get : request.post;
      const res = await fn.call(request, `${BASE}${ep.path}`, {
        data: ep.body,
        headers: { "Content-Type": "application/json" },
        failOnStatusCode: false,
      });

      const allowed = ep.acceptedStatuses ?? [];
      const status = res.status();

      if (allowed.length > 0) {
        expect(
          allowed,
          `${ep.label}: status ${status} no está en lista aceptada ${allowed}`
        ).toContain(status);
      } else {
        // Sin lista explícita: cualquier status < 500 es aceptable
        expect(status, `${ep.label}: error de servidor ${status}`).toBeLessThan(500);
      }
    });
  }
});
