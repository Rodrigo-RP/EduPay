import { z } from "zod/v4";

/**
 * Zod 4 añade MIN/MAX_SAFE_INTEGER a .int(). EduPay conserva los límites
 * anteriores: sólo se comprueba que sea entero y después se aplican los
 * .min/.max/.positive ya existentes. No usar zod/v3 en producción.
 */
export function integerWithExistingLimits<T extends z.ZodType<number, unknown>>(schema: T): T {
  return schema.refine(Number.isInteger, {
    error: "Expected integer, received float",
  });
}
