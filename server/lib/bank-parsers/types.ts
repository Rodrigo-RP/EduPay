/**
 * server/lib/bank-parsers/types.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Contratos compartidos entre todos los parsers de estado de cuenta bancario.
 * Los parsers concretos (BBVAParser, SantanderParser…) implementan
 * BankStatementParser y devuelven ParseResult.
 */

// ── Transacción ya normalizada ────────────────────────────────────────────────

export interface ParsedTransaction {
  fecha:            string;        // ISO "YYYY-MM-DD"
  descripcion:      string;        // texto normalizado
  monto_centavos:   number;        // entero positivo — solo abonos/depósitos
  tipo:             "credito";     // literal: el parser solo extrae depósitos
  referencia:       string | null;
  clabe_ordenante:  string | null; // 18 dígitos, solo SPEI recibido
  nombre_ordenante: string | null; // solo SPEI recibido
}

// ── Error de parseo a nivel de bloque individual ──────────────────────────────

export interface ParseError {
  linea_inicio: number;   // índice de línea en la lista de líneas extraídas
  texto:        string;   // primeros ~80 chars del bloque (para debug)
  razon:        string;   // "fecha no parseable", "monto ambiguo", etc.
}

// ── Resultado completo devuelto por parse() ───────────────────────────────────

export interface ParseResult {
  transactions: ParsedTransaction[];
  errors:       ParseError[];
  metadata: {
    banco:                 "BBVA" | "Santander";
    periodo_inicio:        string | null;  // ISO — primera fecha en transactions
    periodo_fin:           string | null;  // ISO — última fecha en transactions
    total_abonos_centavos: number;         // suma de montos extraídos
  };
}

// ── Contrato que cada parser debe implementar ─────────────────────────────────

export interface BankStatementParser {
  banco: "BBVA" | "Santander";
  /**
   * Extrae transacciones de abono del archivo bancario.
   * @throws Error si el archivo no corresponde al formato esperado del banco.
   * Los errores por bloque individual van en ParseResult.errors, NO lanzan.
   */
  parse(fileBuffer: Buffer): Promise<ParseResult>;
}

// ── Tipos internos expuestos para pruebas unitarias ───────────────────────────

export interface TextItem { str: string; x: number; }
export interface TextLine { y: number; pageNum: number; parts: TextItem[]; }
