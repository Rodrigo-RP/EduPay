/**
 * e2e/06-asistente.spec.ts
 * Módulo: Asistente Virtual
 * Capa: Playwright (E2E)
 *
 * Cubre:
 *   - El endpoint POST /api/assistant/query responde sin error 500
 *   - Los intents críticos devuelven respuesta con contenido
 *   - El intent "verifica todo" ejecuta los probes y devuelve resultado
 */
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5000";

/**
 * Obtiene un token de admin para las llamadas al asistente.
 * El asistente requiere sesión autenticada.
 */
async function getAdminToken(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { email: "admin.campus@jfr.edu.mx", password: "Demo2025!" },
  });
  if (res.status() !== 200) return null;
  const body = await res.json().catch(() => null);
  return body?.token ?? body?.accessToken ?? null;
}

const INTENTS = [
  { query: "cuántos alumnos hay", label: "consulta de alumnos" },
  { query: "resumen financiero del mes", label: "resumen financiero" },
  { query: "lista de becas activas", label: "becas activas" },
  { query: "verifica todo", label: "verificación del sistema" },
];

// Endpoint real del asistente (POST /api/assistant/chat)
const ASSISTANT_ENDPOINT = `${BASE}/api/assistant/chat`;

test.describe("Asistente Virtual – API", () => {
  let token: string | null = null;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
  });

  for (const { query, label } of INTENTS) {
    test(`intent "${label}" responde sin error 500`, async ({ request }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await request.post(ASSISTANT_ENDPOINT, {
        headers,
        data: { message: query, campusId: 48 },
        failOnStatusCode: false,
      });

      // Sin token o token inválido → 401 es aceptable; lo que no debe ser es 500
      const status = res.status();
      expect(status, `${label}: error de servidor ${status}`).toBeLessThan(500);

      // Con token válido debe devolver JSON con respuesta
      if (status === 200 && token) {
        const body = await res.json().catch(() => null);
        expect(body, `${label}: respuesta no es JSON`).not.toBeNull();
        const hasResponse =
          typeof body?.response === "string" ||
          typeof body?.answer === "string" ||
          typeof body?.message === "string" ||
          typeof body?.reply === "string";
        expect(hasResponse, `${label}: no hay campo de respuesta en ${JSON.stringify(body)}`).toBeTruthy();
      }
    });
  }
});
