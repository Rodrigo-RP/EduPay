import { describe, expect, it } from "vitest";
import { normalizeGuardianEmail, normalizeGuardianMobile } from "../lib/guardian-contact";
import { prepareRecipients } from "../lib/email/recipients";
import { readEmailConfig } from "../lib/email/config";

describe("Contacto opcional sin conexión a base ni proveedor", () => {
  it.each([undefined, null, "", "   "])("ausencia de correo (%s) es NULL", value => {
    expect(normalizeGuardianEmail(value)).toBeNull();
  });
  it("valida y normaliza un correo capturado", () => {
    expect(normalizeGuardianEmail(" TUTOR@EXAMPLE.TEST ")).toBe("tutor@example.test");
    expect(() => normalizeGuardianEmail("invalido")).toThrow("no es válido");
  });
  it("normaliza celular mexicano y permite ausencia para el secundario", () => {
    expect(normalizeGuardianMobile("55 1234 5678")).toBe("+525512345678");
    expect(normalizeGuardianMobile(null)).toBeNull();
    expect(() => normalizeGuardianMobile("123")).toThrow("diez dígitos");
  });
  it("notificaciones conserva sin correo como omitido, no enviado", () => {
    const result = prepareRecipients([{ id: 1, nombre: "Prueba", guardianId: 1, email: null }], readEmailConfig({ APP_ENV: "test" }));
    expect(result).toEqual([expect.objectContaining({ email: null, estado: "omitido", motivo: "sin correo" })]);
    expect(result.filter(r => r.estado === "pendiente")).toHaveLength(0);
  });
});
