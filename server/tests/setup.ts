/**
 * Vitest global setup — se ejecuta antes de cada archivo de test.
 *
 * Importa y llama directamente las funciones reset*RateLimitStore()
 * exportadas desde security-middleware.ts.
 * Las funciones se llaman en el proceso de Vitest; esto limpia los stores
 * cuando los tests se corren en modo integrado (mismo proceso que el servidor)
 * o documenta la intención cuando se usan con un servidor externo.
 *
 * NUNCA usar una ruta HTTP para esto — ver PROTOCOLO-AUDITORIA.md §5.
 */
import { beforeAll } from "vitest";
import {
  resetApiAuthRateLimitStore,
  resetPaymentRateLimitStore,
  resetLoginRateLimitStore,
} from "../security-middleware";

beforeAll(() => {
  resetApiAuthRateLimitStore();
  resetPaymentRateLimitStore();
  resetLoginRateLimitStore();
});
