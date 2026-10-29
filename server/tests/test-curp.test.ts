import { describe, expect, it } from "vitest";
import { uniqueTestCurp } from "../test-support/test-curp";
import { CURP_RE } from "../lib/validators";

describe("uniqueTestCurp", () => {
  it("genera 200,000 CURP distintas y válidas con la expresión oficial", () => {
    const curps = new Set<string>();
    let allValid = true;
    for (let i = 0; i < 200_000; i++) {
      const curp = uniqueTestCurp("SIAT");
      allValid = CURP_RE.test(curp) && allValid;
      curps.add(curp);
    }
    expect(curps.size).toBe(200_000);
    expect(allValid).toBe(true);
  });

  it.each(["", "ABC", "ABCD", "siat", "S1AT", "SIAT0"])(
    "rechaza el prefijo inválido %j",
    prefix => {
      expect(() => uniqueTestCurp(prefix)).toThrow(
        `Prefijo de CURP de prueba inválido: ${prefix}`,
      );
    },
  );
});
