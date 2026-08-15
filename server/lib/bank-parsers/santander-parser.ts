/**
 * server/lib/bank-parsers/santander-parser.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Parser de estados de cuenta Santander México en formato CFDI 4.0 con Addenda
 * EstadoDeCuentaBancario (ECB).
 *
 * Santander emite el estado de cuenta como un CFDI timbrado que incluye una
 * <cfdi:Addenda> con todos los movimientos del periodo en nodos:
 *
 *   <Santander:MovimientoECB
 *     IdMovto="0000000001"
 *     fecha="2026-03-10"
 *     descripcion="DEPOSITO EN EFECTIVO ATM"
 *     importe="3000.00"
 *     monMov="MXN" />
 *
 * Los importes son siempre positivos. La dirección (abono / cargo) se infiere
 * de palabras clave en `descripcion`. Solo se importan los ABONOS (créditos).
 *
 * Formato confirmado con estado de cuenta real de Santander México (2026-05).
 */

import type {
  BankStatementParser,
  ParseResult,
  ParsedTransaction,
  ParseError,
} from "./types.js";

// ── Palabras clave para clasificar movimientos ────────────────────────────────
//
// WHITELIST de abonos: si la descripción empieza con alguno de estos prefijos
// (case-insensitive) → es un crédito a la cuenta.
// Todo lo que no coincida se trata como CARGO y se descarta silenciosamente.
//
// Validado con movimientos reales del estado de cuenta de mayo 2026:
//   "DEPOSITO EN EFECTIVO ATM"   → ABONO ✓
//   "ABONO TRANSFERENCIA SPEI"   → ABONO ✓
//   "CARGO PAGO TARJETA CREDITO" → CARGO  (descartado)
//   "ADMINISTRACION RENTA"       → CARGO  (descartado)
//   "I V A POR COMISION"         → CARGO  (descartado)

const ABONO_PREFIXES: string[] = [
  "ABONO",
  "DEPOSITO",
  "SPEI RECIBIDO",
  "TRANSFERENCIA RECIBIDA",
  "PAGO RECIBIDO",
  "LIQUIDACION",
  "RENDIMIENTO",
  "INTERES ACREDITADO",
  "NOTA DE CREDITO",
  "DEVOLUCION",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extrae el valor de un atributo XML de una cadena de atributos. */
function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(attrs);
  return m ? m[1] : null;
}

/** Convierte importe string "1,234.56" → centavos enteros. */
function parseCentavos(s: string): number {
  return Math.round(parseFloat(s.replace(/,/g, "")) * 100);
}

function isAbono(descripcion: string): boolean {
  const upper = descripcion.toUpperCase().trim();
  return ABONO_PREFIXES.some(p => upper.startsWith(p));
}

// ── Core de parseo — exportado para pruebas unitarias ─────────────────────────

/**
 * Parsea los movimientos del addenda ECB a partir del texto XML ya decodificado.
 * Se puede llamar directamente en tests pasando una cadena XML de fixture.
 */
export function parseFromXml(xml: string): ParseResult {
  // ── Validación mínima de estructura ──────────────────────────────────────
  if (!xml.includes("MovimientoECB")) {
    throw new Error(
      "El archivo no contiene movimientos ECB de Santander. " +
      "Verifica que sea el CFDI de estado de cuenta (Addenda EstadoDeCuentaBancario)."
    );
  }

  // ── Metadata del encabezado ───────────────────────────────────────────────
  const ecbMatch = /<Santander:EstadoDeCuentaBancario\s+([^>]+)>/i.exec(xml);
  const ecbAttrs   = ecbMatch?.[1] ?? "";
  const periodoRaw = attr(ecbAttrs, "periodo");  // "2026-05-31"
  // El periodo del addenda es el último día del período — lo usamos como fin.
  const periodo_fin = periodoRaw ?? null;

  const transactions: ParsedTransaction[] = [];
  const errors:       ParseError[]        = [];
  let   lineIdx = 0;

  // ── Extracción de movimientos ─────────────────────────────────────────────
  // [^>]*? — captura cualquier contenido excepto '>'; evita el problema de
  // [^/]+ que cortaría valores con slash (ej. "N/A", URLs en atributos).
  const movRE = /<Santander:MovimientoECB\b([^>]*?)\/>/gi;
  let match: RegExpExecArray | null;

  while ((match = movRE.exec(xml)) !== null) {
    const attrsStr   = match[1];
    const idMovto    = attr(attrsStr, "IdMovto");
    const fecha      = attr(attrsStr, "fecha");       // ISO "YYYY-MM-DD"
    const descripcion = attr(attrsStr, "descripcion") ?? "";
    const importeStr  = attr(attrsStr, "importe")     ?? "";
    const currentIdx  = lineIdx++;

    // Validaciones de campo
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errors.push({
        linea_inicio: currentIdx,
        texto:        match[0].slice(0, 80),
        razon:        `Fecha inválida o ausente: "${fecha}"`,
      });
      continue;
    }
    if (!importeStr || isNaN(parseFloat(importeStr))) {
      errors.push({
        linea_inicio: currentIdx,
        texto:        match[0].slice(0, 80),
        razon:        `Importe inválido o ausente: "${importeStr}"`,
      });
      continue;
    }

    // Clasificación: solo importamos ABONOs
    if (!isAbono(descripcion)) continue;

    const monto_centavos = parseCentavos(importeStr);

    transactions.push({
      fecha,
      descripcion,
      monto_centavos,
      tipo:            "credito",
      referencia:      idMovto ?? null,  // IdMovto como referencia única del movimiento
      clabe_ordenante: null,             // ECB no expone CLABE del ordenante
      nombre_ordenante: null,
    });
  }

  // ── Periodo ───────────────────────────────────────────────────────────────
  const fechas = transactions.map(t => t.fecha).sort();
  const periodo_inicio = fechas[0] ?? null;

  return {
    transactions,
    errors,
    metadata: {
      banco:                 "Santander",
      periodo_inicio,
      periodo_fin,
      total_abonos_centavos: transactions.reduce((s, t) => s + t.monto_centavos, 0),
    },
  };
}

// ── SantanderParser ───────────────────────────────────────────────────────────

export class SantanderParser implements BankStatementParser {
  readonly banco = "Santander" as const;

  async parse(buffer: Buffer): Promise<ParseResult> {
    const xml = buffer.toString("utf-8").trim();

    if (!xml.startsWith("<?xml") && !xml.startsWith("<cfdi:")) {
      throw new Error(
        "El archivo no parece ser un XML válido. " +
        "Descarga el CFDI de estado de cuenta desde el portal de Santander (.xml)."
      );
    }

    return parseFromXml(xml);
  }
}
