/**
 * setupFiles de Vitest — se ejecuta en el proceso de test ANTES de cada archivo.
 *
 * Parchea globalThis.fetch para incluir el header X-Test-Bypass en TODOS los
 * requests de la suite. El servidor lo usa como señal para omitir el rate-limit
 * (solo cuando NODE_ENV !== 'production').
 *
 * El browser real (en dev) nunca envía este header → rate limit activo para
 * tráfico real. En producción NODE_ENV==='production' anula la condición.
 */

const BYPASS_HEADER = "x-test-bypass";
const BYPASS_VALUE  = "vitest-internal";

const _origFetch = globalThis.fetch;

globalThis.fetch = function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers((init?.headers as HeadersInit) || {});
  headers.set(BYPASS_HEADER, BYPASS_VALUE);
  return _origFetch(input, { ...init, headers });
};
