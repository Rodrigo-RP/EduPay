/**
 * server/lib/bank-parsers/index.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Factory de parsers de estado de cuenta bancario.
 * Agregar un nuevo banco = crear su clase e incluirla en el switch.
 */

import { BBVAParser } from "./bbva-parser.js";
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
      // Pendiente: los PDFs de Santander México (Compart MFFPDF) renderizan
      // texto como image masks — necesita OCR o exportación CSV/Excel del portal.
      // No falla silenciosamente: lanza explícitamente para que el endpoint
      // devuelva 400 con mensaje accionable al operador.
      throw new Error(
        "Santander aún no está soportado. " +
        "Descarga el estado de cuenta en formato CSV o Excel desde el portal de Santander " +
        "y usa el endpoint /api/conciliacion/importar."
      );

    default:
      throw new Error(
        `Banco "${banco}" no reconocido. Valores válidos: BBVA.`
      );
  }
}

// Re-exportar tipos para consumidores
export type { BankStatementParser, ParseResult, ParsedTransaction, ParseError } from "./types.js";
