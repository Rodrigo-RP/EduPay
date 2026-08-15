/**
 * server/tests/santander-parser.test.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Pruebas unitarias del parser Santander CFDI-ECB.
 *
 * Diseño: se llama directamente a parseFromXml() con fixtures XML construidos
 * a partir de la estructura del CFDI con addenda EstadoDeCuentaBancario v1.0.
 * Todos los valores de texto son 100% sintéticos: números de cuenta, IdMovtos,
 * fechas, importes y descripciones son inventados y no corresponden a ninguna
 * cuenta o transacción real.
 *
 * SAN-01  ABONOs extraídos correctamente (DEPOSITO y ABONO TRANSFERENCIA SPEI)
 * SAN-02  CARGOs descartados silenciosamente — no aparecen en transactions ni errors
 * SAN-03  metadata: banco=Santander, periodo, total_abonos_centavos correctos
 * SAN-04  IdMovto se mapea a referencia
 * SAN-05  XML sin addenda ECB lanza Error (no devuelve ParseResult vacío)
 * SAN-06  Movimiento con fecha inválida → errors[], el resto sigue parseando
 * SAN-07  Movimiento con importe inválido → errors[], el resto sigue parseando
 * SAN-08  Todos los movimientos son CARGO → transactions vacío, sin errors
 */

import { describe, it, expect } from "vitest";
import { parseFromXml } from "../lib/bank-parsers/santander-parser";

// ── Helpers ───────────────────────────────────────────────────────────────────

function movimiento(
  id: string,
  fecha: string,
  descripcion: string,
  importe: string,
): string {
  return `<Santander:MovimientoECB IdMovto="${id}" fecha="${fecha}" descripcion="${descripcion}" importe="${importe}" monMov="MXN" />`;
}

/** Envuelve movimientos en la estructura CFDI+ECB mínima — todos los valores sintéticos */
function buildXml(movimientos: string[], periodo = "2026-03-31"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Addenda>
    <Santander:addendaECB xmlns:Santander="http://www.santander.com.mx/schemas/xsd/addendaECB">
      <Santander:EstadoDeCuentaBancario version="1.0" numeroCuenta="99887700001" nombreCliente="CLIENTE PRUEBA S.A." periodo="${periodo}">
        <Santander:Movimientos>
          ${movimientos.join("\n          ")}
        </Santander:Movimientos>
      </Santander:EstadoDeCuentaBancario>
    </Santander:addendaECB>
  </cfdi:Addenda>
</cfdi:Comprobante>`;
}

// ── Fixtures — todos los valores son ficticios ────────────────────────────────
//
// IdMovtos, fechas, importes, descripciones y número de cuenta son sintéticos.
// El formato de las descripciones refleja los tipos de movimiento reales
// (necesario para que isAbono() clasifique correctamente), pero los valores
// numéricos y secuencias de ID no corresponden a ninguna transacción real.

const MOV_DEPOSITO    = movimiento("0000000003", "2026-03-10", "DEPOSITO EN EFECTIVO ATM",     "3000.00");
const MOV_SPEI        = movimiento("0000000007", "2026-03-10", "ABONO TRANSFERENCIA SPEI",     "2000.00");
const MOV_CARGO_RENTA = movimiento("0000000001", "2026-03-01", "ADMINISTRACION RENTA",         "0.50");
const MOV_CARGO_IVA   = movimiento("0000000002", "2026-03-01", "I V A POR COMISION",           "0.08");
const MOV_CARGO_TARJ1 = movimiento("0000000004", "2026-03-10", "CARGO PAGO TARJETA CREDITO",   "1200.00");
const MOV_CARGO_TARJ2 = movimiento("0000000005", "2026-03-10", "CARGO PAGO TARJETA CREDITO",   "500.00");
const MOV_CARGO_TARJ3 = movimiento("0000000006", "2026-03-10", "CARGO PAGO TARJETA CREDITO",   "800.00");
const MOV_CARGO_TARJ4 = movimiento("0000000008", "2026-03-10", "CARGO PAGO TARJETA CREDITO",   "600.00");

const ALL_MOVS = [
  MOV_CARGO_RENTA, MOV_CARGO_IVA,
  MOV_DEPOSITO, MOV_CARGO_TARJ1, MOV_CARGO_TARJ2, MOV_CARGO_TARJ3,
  MOV_SPEI, MOV_CARGO_TARJ4,
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SantanderParser — parseFromXml", () => {

  it("SAN-01 ABONOs extraídos: DEPOSITO y ABONO TRANSFERENCIA SPEI", () => {
    const result = parseFromXml(buildXml(ALL_MOVS));

    expect(result.transactions).toHaveLength(2);

    const deposito = result.transactions.find(t => t.descripcion.includes("DEPOSITO"));
    expect(deposito).toBeDefined();
    expect(deposito!.fecha).toBe("2026-03-10");
    expect(deposito!.monto_centavos).toBe(300_000);  // 3000.00
    expect(deposito!.tipo).toBe("credito");

    const spei = result.transactions.find(t => t.descripcion.includes("SPEI"));
    expect(spei).toBeDefined();
    expect(spei!.monto_centavos).toBe(200_000);  // 2000.00
    expect(spei!.tipo).toBe("credito");

    expect(result.errors).toHaveLength(0);
  });

  it("SAN-02 CARGOs descartados silenciosamente — no están en transactions ni en errors", () => {
    const result = parseFromXml(buildXml(ALL_MOVS));

    expect(result.transactions).toHaveLength(2);

    const cargos = result.transactions.filter(
      t => t.descripcion.includes("CARGO") ||
           t.descripcion.includes("ADMINISTRACION") ||
           t.descripcion.includes("IVA")
    );
    expect(cargos).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("SAN-03 metadata: banco, periodo_fin y total_abonos_centavos correctos", () => {
    const result = parseFromXml(buildXml(ALL_MOVS, "2026-03-31"));

    expect(result.metadata.banco).toBe("Santander");
    expect(result.metadata.periodo_fin).toBe("2026-03-31");
    expect(result.metadata.periodo_inicio).toBe("2026-03-10");
    expect(result.metadata.total_abonos_centavos).toBe(300_000 + 200_000);
  });

  it("SAN-04 IdMovto se mapea a referencia", () => {
    const result = parseFromXml(buildXml([MOV_DEPOSITO, MOV_SPEI]));

    const dep  = result.transactions.find(t => t.descripcion.includes("DEPOSITO"))!;
    const spei = result.transactions.find(t => t.descripcion.includes("SPEI"))!;

    expect(dep.referencia).toBe("0000000003");
    expect(spei.referencia).toBe("0000000007");
    expect(dep.clabe_ordenante).toBeNull();
    expect(spei.nombre_ordenante).toBeNull();
  });

  it("SAN-05 XML sin addenda ECB lanza Error", () => {
    const xmlSinECB = `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante Version="4.0" />`;
    expect(() => parseFromXml(xmlSinECB)).toThrow(/ECB/i);
  });

  it("SAN-06 fecha inválida → errors[], el resto de movimientos sigue parseando", () => {
    const movFechaInvalida = movimiento("0000009999", "not-a-date", "DEPOSITO EXTRA", "100.00");
    const xml = buildXml([MOV_DEPOSITO, movFechaInvalida, MOV_SPEI]);
    const result = parseFromXml(xml);

    expect(result.transactions).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].razon).toMatch(/[Ff]echa/);
  });

  it("SAN-07 importe inválido → errors[], el resto sigue parseando", () => {
    const movImporteInvalido = movimiento("0000009998", "2026-03-15", "ABONO DEVOLUCION", "N/A");
    const xml = buildXml([MOV_DEPOSITO, movImporteInvalido]);
    const result = parseFromXml(xml);

    expect(result.transactions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].razon).toMatch(/[Ii]mporte/);
  });

  it("SAN-08 todos los movimientos son CARGO → transactions vacío, sin errors", () => {
    const xml = buildXml([
      MOV_CARGO_RENTA, MOV_CARGO_IVA, MOV_CARGO_TARJ1,
      MOV_CARGO_TARJ2, MOV_CARGO_TARJ3, MOV_CARGO_TARJ4,
    ]);
    const result = parseFromXml(xml);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.metadata.total_abonos_centavos).toBe(0);
  });

});
