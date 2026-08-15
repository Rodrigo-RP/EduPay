/**
 * server/lib/bank-parsers/bbva-parser.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Parser de estados de cuenta BBVA México generados con texto nativo.
 *
 * Diseño validado empíricamente con PDFs reales (20 transacciones).
 * Ver .agents/memory/pdf-parser-validation.md para el detalle completo.
 *
 * Columnas confirmadas (coordenadas X en puntos PDF):
 *   FECHA OPER   x ≈  16       primer campo de la línea
 *   FECHA LIQ    x ≈  61
 *   DESCRIPCION  x ≈ 107
 *   REFERENCIA   x ≈ 321
 *   CARGOS       x ∈ [375, 391]   → umbral ≤ 400
 *   ABONOS       x ∈ [415, 425]   → umbral ≥ 410
 *   SALDO OP     x ∈ [470, 496]   → ignorar (x ≥ 460)
 *   SALDO LIQ    x ∈ [536, 569]   → ignorar
 *
 * Estructura de bloque SPEI RECIBIDO (5 líneas):
 *   DD/MES  DD/MES  SPEI RECIBIDO[BANCO]  MONTO          ← main line
 *   CLAVE_RASTREO Referencia XXXXXXXXXX CODIGO_BANCO     ← ref line
 *   CLABE_18_DIGITOS                                     ← CLABE
 *   NUMERO_RASTREO_LARGO                                 ← rastreo (skip)
 *   NOMBRE_ORDENANTE                                     ← nombre
 *
 * ⚠ "SPEI RECIBIDO" y el banco van sin espacio: "SPEI RECIBIDOSANTANDER"
 */

import type {
  BankStatementParser,
  ParseResult,
  ParsedTransaction,
  ParseError,
  TextItem,
  TextLine,
} from "./types.js";

// ── Constantes ────────────────────────────────────────────────────────────────

const MES_MAP: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};

/** Umbral X: cantidad a la izquierda → CARGO; a la derecha → ABONO */
const X_CARGO_MAX  = 400;
const X_ABONO_MIN  = 410;
const X_SALDO_MIN  = 460;  // saldos (ignorar)
const X_DATE1_MAX  = 30;   // primera fecha  x ≤ 30
const X_DATE2_MIN  = 50;   // segunda fecha  x ∈ [50, 80]
const X_DATE2_MAX  = 80;
const X_DESC_MIN   = 100;  // descripción    x ≥ 100

// ── Regexes ───────────────────────────────────────────────────────────────────

const DATE_RE    = /^(\d{2})\/([A-Z]{3})$/;
const MONTO_RE   = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;
const CLABE_RE   = /^\d{18}$/;
const REF_RE     = /Referencia\s+(\S+)/;
// Rastreo largo: empieza con dígitos, mezcla alfanumérico, ≥ 20 chars
const RASTREO_RE = /^\d{6,}[A-Z0-9]{4,}/;

/** Patrones de líneas que no son movimientos (pies de página, encabezados, resúmenes) */
const NON_DATA_RE: RegExp[] = [
  /^BBVA MEXICO/,
  /^Av\.\s+Paseo/,
  /^Estado de Cuenta/,
  /^PAGINA\s+\d/,
  /^No\.\s+de\s+(Cuenta|Cliente)/,
  /^La\s+GAT/,
  /^GAT\s/,
  /^Tiene\s+\d+/,
  /^Con gusto/,
  /^BBVA recibe/,
  /^Unidad\s+Especializada/,
  /^(Si|Sí)\s+desea/,
  /^Nota\s*:/,
  /^Los montos/,
  /^Para mayor/,
  /^Le informamos/,
  /^www\./,
  /^TOTAL\s+IMPORTE/i,
  /^Cuadro\s+resumen/i,
  /^Concepto\s+Cantidad/,
  /^(Saldo\s+(Anterior|Final|Promedio)|Tasa Bruta|Intereses|Manejo de|Total Comisiones|Cheques pagados|ISR Retenido|Abonos Objetados|Cargos Objetados)/,
  /^Dep[oó]sitos\s*\/\s*Abonos/,
  /^Retiros\s*\/\s*(Cargos|efectivo)/,
  /^D[ií]as del Per[ií]odo/,
  /DESCRIPCION.*CARGOS/,  // encabezado de columnas
  /^Libret[oó]n/,
  /^R\.F\.C\.\s+BBA/,
  /^\d+\s+d[ií]as\s+naturales/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNonData(text: string): boolean {
  return NON_DATA_RE.some(re => re.test(text));
}

function parseMontoCentavos(s: string): number {
  return Math.round(parseFloat(s.replace(/,/g, "")) * 100);
}

function toISO(dd: string, mes: string, year: number): string | null {
  const mm = MES_MAP[mes];
  if (!mm) return null;
  return `${year}-${mm}-${dd.padStart(2, "0")}`;
}

function lineText(line: TextLine): string {
  return line.parts.map(p => p.str).join(" ");
}

function isBlockStart(line: TextLine): boolean {
  const d1 = line.parts.find(p => p.x <= X_DATE1_MAX && DATE_RE.test(p.str));
  const d2 = line.parts.find(
    p => p.x >= X_DATE2_MIN && p.x <= X_DATE2_MAX && DATE_RE.test(p.str)
  );
  return !!(d1 && d2);
}

// ── Core de parseo — exportado para pruebas unitarias ─────────────────────────

/**
 * Convierte líneas de texto (con coordenadas X) en ParseResult.
 * Puede llamarse directamente en tests con datos de fixture sin necesitar PDF.
 *
 * @param lines  — salida de extractLines(), ya ordenadas top-to-bottom
 * @param year   — año inferido del metadata del PDF (o año actual como fallback)
 */
export function parseFromLines(lines: TextLine[], year: number): ParseResult {
  const transactions: ParsedTransaction[] = [];
  const errors: ParseError[] = [];

  // ── Agrupar líneas en bloques de transacción ──────────────────────────────
  type Block = {
    startLineIndex: number;
    mainLine:       TextLine;
    continuations:  TextLine[];
  };
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = lineText(line).trim();
    if (!text) continue;

    if (isNonData(text)) {
      // Línea de encabezado/pie — cierra el bloque actual
      currentBlock = null;
      continue;
    }

    if (isBlockStart(line)) {
      currentBlock = { startLineIndex: i, mainLine: line, continuations: [] };
      blocks.push(currentBlock);
    } else if (currentBlock) {
      currentBlock.continuations.push(line);
    }
    // líneas antes del primer bloque (encabezados de cuenta, etc.) — skip
  }

  // ── Parsear cada bloque ───────────────────────────────────────────────────
  for (const block of blocks) {
    const mainLine = block.mainLine;
    const mainText = lineText(mainLine);

    // Buscar monto — el que NO es saldo (x < X_SALDO_MIN)
    const amountPart = mainLine.parts.find(
      p => MONTO_RE.test(p.str) && p.x < X_SALDO_MIN
    );

    if (!amountPart) {
      errors.push({
        linea_inicio: block.startLineIndex,
        texto:        mainText.slice(0, 80),
        razon:        "No se encontró monto en la línea principal",
      });
      continue;
    }

    const isCargo = amountPart.x <= X_CARGO_MAX;
    const isAbono = amountPart.x >= X_ABONO_MIN;

    if (!isCargo && !isAbono) {
      errors.push({
        linea_inicio: block.startLineIndex,
        texto:        mainText.slice(0, 80),
        razon:        `Posición de monto ambigua (x=${amountPart.x}; esperado ≤${X_CARGO_MAX} o ≥${X_ABONO_MIN})`,
      });
      continue;
    }

    // Solo abonos — cargos se descartan silenciosamente (no son errores)
    if (isCargo) continue;

    // Fecha — primer campo con patrón DD/MES en la columna izquierda
    const d1 = mainLine.parts.find(p => p.x <= X_DATE1_MAX && DATE_RE.test(p.str));
    if (!d1) {
      errors.push({
        linea_inicio: block.startLineIndex,
        texto:        mainText.slice(0, 80),
        razon:        "No se encontró fecha de operación",
      });
      continue;
    }
    const [, dd, mes] = DATE_RE.exec(d1.str)!;
    const fecha = toISO(dd, mes, year);
    if (!fecha) {
      errors.push({
        linea_inicio: block.startLineIndex,
        texto:        mainText.slice(0, 80),
        razon:        `Mes no reconocido: "${mes}"`,
      });
      continue;
    }

    // Descripción — partes entre X_DESC_MIN y X_CARGO_MAX (columna DESCRIPCION)
    const descParts = mainLine.parts.filter(
      p => p.x >= X_DESC_MIN && p.x < X_CARGO_MAX - 5
    );
    const descripcion = descParts.map(p => p.str).join(" ").trim() || mainText;
    const isSpei = /SPEI RECIBIDO/.test(descripcion);

    const monto_centavos = parseMontoCentavos(amountPart.str);

    // ── Líneas de continuación ──────────────────────────────────────────────
    const contTexts = block.continuations
      .map(l => lineText(l).trim())
      .filter(Boolean);

    let referencia:       string | null = null;
    let clabe_ordenante:  string | null = null;
    let nombre_ordenante: string | null = null;

    for (const ct of contTexts) {
      // CLABE: exactamente 18 dígitos
      if (!clabe_ordenante && CLABE_RE.test(ct)) {
        clabe_ordenante = ct;
        continue;
      }

      // Referencia
      if (!referencia) {
        const m = REF_RE.exec(ct);
        if (m) {
          // Eliminar asteriscos de referencias enmascaradas
          const val = m[1].replace(/\*/g, "").trim();
          referencia = val || null;
        }
      }
    }

    // Nombre: para SPEI — última línea de continuación que parece nombre
    // (tiene letras, no es CLABE, no es rastreo, no contiene "Referencia")
    if (isSpei) {
      for (let j = contTexts.length - 1; j >= 0; j--) {
        const ct = contTexts[j];
        if (
          ct.length > 3 &&
          /[A-Za-z]/.test(ct) &&
          !CLABE_RE.test(ct) &&
          !RASTREO_RE.test(ct) &&
          !/Referencia/i.test(ct)
        ) {
          nombre_ordenante = ct;
          break;
        }
      }
    }

    transactions.push({
      fecha,
      descripcion,
      monto_centavos,
      tipo:            "credito",
      referencia,
      clabe_ordenante,
      nombre_ordenante,
    });
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  const fechas = transactions.map(t => t.fecha).sort();

  return {
    transactions,
    errors,
    metadata: {
      banco:                 "BBVA",
      periodo_inicio:        fechas[0] ?? null,
      periodo_fin:           fechas[fechas.length - 1] ?? null,
      total_abonos_centavos: transactions.reduce((s, t) => s + t.monto_centavos, 0),
    },
  };
}

// ── BBVAParser ────────────────────────────────────────────────────────────────

export class BBVAParser implements BankStatementParser {
  readonly banco = "BBVA" as const;

  async parse(pdfBuffer: Buffer): Promise<ParseResult> {
    // Importación dinámica: evita problemas de resolución .mjs en TypeScript
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdf = await loadingTask.promise;

    // ── Año desde metadata del PDF ──────────────────────────────────────────
    let year = new Date().getFullYear();
    try {
      const meta = await pdf.getMetadata();
      const cd   = (meta?.info as any)?.CreationDate as string | undefined;
      const m    = cd?.match(/D:(\d{4})/);
      if (m) year = parseInt(m[1], 10);
    } catch { /* usa año actual */ }

    // ── Extraer texto con coordenadas de todas las páginas ──────────────────
    const allLines: TextLine[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page    = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      // Agrupar items por Y (±3 px) → líneas visuales
      const lineMap = new Map<number, { y: number; parts: TextItem[] }>();

      for (const item of content.items as any[]) {
        if (!item.str?.trim()) continue;
        const x = Math.round(item.transform[4]);
        const y = Math.round(item.transform[5]);

        let matchedY: number | undefined;
        for (const ky of lineMap.keys()) {
          if (Math.abs(ky - y) <= 3) { matchedY = ky; break; }
        }
        if (matchedY !== undefined) {
          lineMap.get(matchedY)!.parts.push({ str: item.str, x });
        } else {
          lineMap.set(y, { y, parts: [{ str: item.str, x }] });
        }
      }

      // Ordenar: Y descendente (top-to-bottom), partes por X (left-to-right)
      const pageLines = Array.from(lineMap.values())
        .sort((a, b) => b.y - a.y)
        .map(l => ({
          y:       l.y,
          pageNum,
          parts:   [...l.parts].sort((a, b) => a.x - b.x),
        }));

      allLines.push(...pageLines);
    }

    if (allLines.length === 0) {
      throw new Error(
        "El PDF no contiene texto extraíble. " +
        "Verifica que el archivo no sea un PDF escaneado."
      );
    }

    return parseFromLines(allLines, year);
  }
}
