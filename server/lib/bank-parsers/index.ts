/**
 * server/lib/bank-parsers/index.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Factory de parsers de estado de cuenta bancario.
 * Agregar un nuevo banco = crear su clase e incluirla en el switch.
 */

import { BBVAParser }      from "./bbva-parser.js";
import { SantanderParser } from "./santander-parser.js";
import type { BankStatementParser } from "./types.js";

export type BancoSoportado = "BBVA" | "Santander";

/**
 * Devuelve el parser correspondiente al banco indicado.
 * @throws Error con mensaje claro si el banco aún no está soportado.
 */
export function getParser(banco: string): BankStatementParser {
  switch (banco.toUpperCase()) {
    case "BBVA":
      return new BBVAParser();

    case "SANTANDER":
      // El estado de cuenta de Santander México se descarga del portal como un
      // CFDI 4.0 (.xml) con addenda EstadoDeCuentaBancario — NO como PDF.
      // El SantanderParser extrae los <MovimientoECB> del addenda.
      return new SantanderParser();

    default:
      throw new Error(
        `Banco "${banco}" no reconocido. Valores válidos: BBVA, Santander.`
      );
  }
}

// Re-exportar tipos para consumidores
export type { BankStatementParser, ParseResult, ParsedTransaction, ParseError } from "./types.js";
