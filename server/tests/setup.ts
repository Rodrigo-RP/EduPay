/**
 * Archivo de setup global de Vitest — se ejecuta antes de CADA archivo de test.
 *
 * Resetea los tres rate-limiters (admin, payment, login) antes de cada archivo
 * para evitar que la acumulación entre archivos (todos corren en el mismo proceso
 * con la misma MemoryStore) cause 429 en archivos posteriores.
 */
import {
  resetApiAuthRateLimitStore,
  resetPaymentRateLimitStore,
  resetLoginRateLimitStore,
} from "../security-middleware";

resetApiAuthRateLimitStore();
resetPaymentRateLimitStore();
resetLoginRateLimitStore();
