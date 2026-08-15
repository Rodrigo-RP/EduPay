/**
 * Vitest global setup — se ejecuta antes de cada archivo de test.
 *
 * Llama a POST /api/test/reset-rate-limits en el servidor Express para limpiar
 * los tres stores de rate-limiting en memoria. Sin este reset, corridas
 * consecutivas de la suite saturan el límite (50 req/5 min) y tests que
 * esperan 401/403 reciben 429 en su lugar.
 *
 * El endpoint solo existe fuera de NODE_ENV=production (devuelve 404 en prod).
 */
import { beforeAll } from "vitest";

const BASE = "http://localhost:5000";

beforeAll(async () => {
  try {
    await fetch(`${BASE}/api/test/reset-rate-limits`, { method: "POST" });
  } catch {
    // Si el servidor no está corriendo todavía, ignorar silenciosamente.
    // Los tests que necesiten el servidor fallarán por su cuenta.
  }
});
