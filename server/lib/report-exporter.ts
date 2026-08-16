/**
 * report-exporter.ts
 * Módulo de exportación unificada: recibe datos tabulares + metadata
 * y produce Excel (.xlsx vía exceljs) o PDF (vía pdfkit).
 *
 * Reemplaza las implementaciones dispersas en:
 *   guardian.ts:136-309  — Excel/HTML-pseudo-PDF financiero
 *   guardian.ts:527-585  — Excel cargos
 *   admin.ts:869-883     — Excel estudiantes
 *   payments.ts:1128-1137 — Excel genérico
 */

import { createRequire } from "module";
const esmRequire = createRequire(import.meta.url);

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type FormatType =
  | "currency_mxn"   // centavos → $X,XXX.XX
  | "percentage"     // número → XX.X%
  | "date"           // Date|string → DD/MM/YYYY
  | "integer"        // número → X,XXX
  | "string";        // toString()

export type ExportFormat = "excel" | "pdf";

export interface ReportColumn {
  /** Nombre del campo en cada fila */
  key: string;
  /** Encabezado visible en Excel/PDF */
  header: string;
  /**
   * Ancho de columna.
   * Excel: número de caracteres (default: header.length + 6).
   * PDF: peso proporcional relativo al resto de columnas (default: max(header.length * 7, 60)).
   */
  width?: number;
  format?: FormatType;
  align?: "left" | "right" | "center";
}

export interface ReportExportRequest {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** Descripción legible de los filtros activos, ej. { Ciclo: "2025-2026", Nivel: "Primaria" } */
  appliedFilters: Record<string, string>;
  format: ExportFormat;
  filename: string;
  /** Usuario que generó el reporte (para Metadatos) */
  generatedBy?: string;
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

/**
 * Formatea un valor de celda según su tipo.
 * Exportado para facilitar tests unitarios en aislamiento.
 */
export function formatCellValue(val: unknown, fmt?: FormatType): string {
  if (val === null || val === undefined || val === "") return "";

  switch (fmt) {
    case "currency_mxn": {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      const pesos = num / 100;
      const [intPart, decPart] = pesos.toFixed(2).split(".");
      const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return `$${intFmt}.${decPart}`;
    }
    case "percentage": {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      return `${num.toFixed(1)}%`;
    }
    case "date": {
      const d = val instanceof Date ? val : new Date(String(val));
      if (isNaN(d.getTime())) return String(val);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}/${d.getFullYear()}`;
    }
    case "integer": {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      return Math.round(num).toLocaleString("es-MX");
    }
    default:
      return String(val);
  }
}

/**
 * Retorna valor numérico para currency_mxn e integer (para Excel numFmt).
 * Todo lo demás va como string ya formateado.
 */
function numericCellValue(val: unknown, fmt?: FormatType): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  if (fmt === "currency_mxn") {
    const n = Number(val);
    return isNaN(n) ? undefined : n / 100;
  }
  if (fmt === "integer") {
    const n = Number(val);
    return isNaN(n) ? undefined : Math.round(n);
  }
  return undefined;
}

function defaultAlign(fmt?: FormatType): "left" | "right" | "center" {
  return fmt && fmt !== "string" ? "right" : "left";
}

// ─── Constantes de estilo ─────────────────────────────────────────────────────

const BLUE_HEX = "1565C0";        // azul institucional
const BLUE_ARGB = `FF${BLUE_HEX}`;
const WHITE_ARGB = "FFFFFFFF";
const ALT_ROW_ARGB = "FFEFF4FF";  // azul muy claro para filas alternas
const BORDER_GRAY = "FFE0E0E0";

const PDF_BLUE: [number, number, number] = [21, 101, 192];
const PDF_LIGHT_BLUE = "#EFF4FF";
const PDF_DARK_GRAY = "#333333";
const PDF_MED_GRAY = "#666666";

const PAGE_MARGIN = 40;
const ROW_H = 18;
const HEADER_ROW_H = 22;

// ─── EXCEL ────────────────────────────────────────────────────────────────────

async function buildExcel(req: ReportExportRequest): Promise<Buffer> {
  const ExcelJS = esmRequire("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = req.generatedBy ?? "EduPay";
  wb.created = new Date();

  // ── Hoja: Reporte ──────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Reporte");
  const numCols = req.columns.length;

  // Fila 1: título institucional (celdas unidas)
  ws.mergeCells(1, 1, 1, numCols);
  const titleCell = ws.getRow(1).getCell(1);
  titleCell.value = req.title + (req.subtitle ? ` — ${req.subtitle}` : "");
  titleCell.font = { bold: true, size: 14, color: { argb: BLUE_ARGB } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  // Fila 2: filtros aplicados (celdas unidas)
  ws.mergeCells(2, 1, 2, numCols);
  const filterEntries = Object.entries(req.appliedFilters);
  const filterStr =
    filterEntries.length > 0
      ? "Filtros: " + filterEntries.map(([k, v]) => `${k}: ${v}`).join(" · ")
      : "Sin filtros aplicados";
  const filterCell = ws.getRow(2).getCell(1);
  filterCell.value = filterStr;
  filterCell.font = { italic: true, size: 10, color: { argb: "FF555555" } };
  filterCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(2).height = 18;

  // Fila 3: separador en blanco
  ws.getRow(3).height = 6;

  // Fila 4: encabezados de columna (fondo azul)
  const headerRow = ws.getRow(4);
  headerRow.height = 22;
  req.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: WHITE_ARGB }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_ARGB } };
    cell.alignment = {
      horizontal: col.align ?? defaultAlign(col.format),
      vertical: "middle",
    };
    cell.border = { bottom: { style: "thin", color: { argb: BLUE_ARGB } } };
  });

  // Anchos de columna
  ws.columns = req.columns.map((col) => ({
    key: col.key,
    width: col.width ?? Math.max(col.header.length + 6, 12),
  }));

  // Datos desde fila 5
  req.rows.forEach((row, ri) => {
    const values = req.columns.map((col) => {
      const raw = row[col.key];
      const num = numericCellValue(raw, col.format);
      return num !== undefined ? num : formatCellValue(raw, col.format);
    });

    const wsRow = ws.addRow(values);
    wsRow.height = 18;

    // Fila alterna
    if (ri % 2 === 1) {
      wsRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_ARGB } };
      });
    }

    // Alineación y numFmt por celda
    req.columns.forEach((col, ci) => {
      const cell = wsRow.getCell(ci + 1);
      cell.alignment = { horizontal: col.align ?? defaultAlign(col.format) };
      if (col.format === "currency_mxn") cell.numFmt = '"$"#,##0.00';
      else if (col.format === "integer") cell.numFmt = "#,##0";
    });

    // Borde inferior ligero
    wsRow.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: BORDER_GRAY } } };
    });
  });

  // Congelar las 4 filas de encabezado
  ws.views = [{ state: "frozen", ySplit: 4, xSplit: 0 }];

  // Auto-filtro en fila de encabezados
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: numCols } };

  // ── Hoja: Metadatos ────────────────────────────────────────────────────────
  const wsMeta = wb.addWorksheet("Metadatos");
  const metaData: [string, string][] = [
    ["Campo", "Valor"],
    ["Título", req.title],
    ["Subtítulo", req.subtitle ?? ""],
    ["Fecha de generación", new Date().toLocaleString("es-MX")],
    ["Generado por", req.generatedBy ?? "EduPay"],
    ["Total de filas", String(req.rows.length)],
    ["", ""],
    ["Filtros aplicados", ""],
    ...filterEntries.map(([k, v]): [string, string] => [k, v]),
  ];
  metaData.forEach((r, i) => {
    const mRow = wsMeta.addRow(r);
    if (i === 0 || r[0] === "" || r[1] === "") mRow.font = { bold: true };
  });
  wsMeta.columns = [{ width: 26 }, { width: 52 }];

  return (await wb.xlsx.writeBuffer()) as Buffer;
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

/** Más de 5 columnas → orientación horizontal */
function useLandscape(cols: ReportColumn[]): boolean {
  return cols.length > 5;
}

async function buildPdf(req: ReportExportRequest): Promise<Buffer> {
  const PDFDocument = esmRequire("pdfkit");
  const landscape = useLandscape(req.columns);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      layout: landscape ? "landscape" : "portrait",
      size: "LETTER",
      margin: PAGE_MARGIN,
      bufferPages: true, // necesario para escribir footer retroactivamente
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - PAGE_MARGIN * 2;
    const pageH = doc.page.height;
    const maxDataY = pageH - PAGE_MARGIN - 28; // espacio para footer

    // Anchos de columna proporcionales al weight de cada col
    const weights = req.columns.map(
      (c) => c.width ?? Math.max(c.header.length * 7, 60)
    );
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map((w) => (w / totalW) * pageW);

    const blueStr = `rgb(${PDF_BLUE.join(",")})`;

    // ── Encabezado de página ─────────────────────────────────────────────────
    function drawPageHeader(): number {
      const y0 = PAGE_MARGIN;
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor(blueStr)
        .text(req.title, PAGE_MARGIN, y0, { width: pageW, align: "left" });

      let y = doc.y + 2;

      if (req.subtitle) {
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor(PDF_MED_GRAY)
          .text(req.subtitle, PAGE_MARGIN, y, { width: pageW });
        y = doc.y + 2;
      }

      const filterEntries = Object.entries(req.appliedFilters);
      if (filterEntries.length > 0) {
        const fs = "Filtros: " + filterEntries.map(([k, v]) => `${k}: ${v}`).join(" · ");
        doc
          .font("Helvetica-Oblique")
          .fontSize(8)
          .fillColor(PDF_MED_GRAY)
          .text(fs, PAGE_MARGIN, y, { width: pageW });
        y = doc.y + 4;
      } else {
        y += 4;
      }

      doc
        .moveTo(PAGE_MARGIN, y)
        .lineTo(PAGE_MARGIN + pageW, y)
        .strokeColor(blueStr)
        .lineWidth(1)
        .stroke();

      return y + 8;
    }

    // ── Encabezado de columnas ───────────────────────────────────────────────
    function drawColumnHeaders(y: number): number {
      // Fondo azul
      doc.rect(PAGE_MARGIN, y, pageW, HEADER_ROW_H).fill(blueStr);

      let x = PAGE_MARGIN;
      req.columns.forEach((col, i) => {
        const w = colWidths[i];
        const align = col.align ?? defaultAlign(col.format);
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#FFFFFF")
          .text(col.header, x + 3, y + 7, {
            width: w - 6,
            align,
            lineBreak: false,
          });
        x += w;
      });

      return y + HEADER_ROW_H;
    }

    // ── Footer en todas las páginas ──────────────────────────────────────────
    function drawFooters(): void {
      const range = doc.bufferedPageRange();
      const total = range.count;
      const generated = new Date().toLocaleString("es-MX");

      for (let i = 0; i < total; i++) {
        doc.switchToPage(range.start + i);
        const fy = pageH - PAGE_MARGIN + 8;
        doc
          .moveTo(PAGE_MARGIN, fy - 10)
          .lineTo(PAGE_MARGIN + pageW, fy - 10)
          .strokeColor("#CCCCCC")
          .lineWidth(0.5)
          .stroke();
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(PDF_MED_GRAY)
          .text(`Página ${i + 1} de ${total}`, PAGE_MARGIN, fy, {
            width: pageW,
            align: "right",
          });
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(PDF_MED_GRAY)
          .text(`Generado: ${generated}`, PAGE_MARGIN, fy, {
            width: pageW,
            align: "left",
          });
      }
    }

    // ── Render ───────────────────────────────────────────────────────────────
    let currentY = drawPageHeader();
    currentY = drawColumnHeaders(currentY);

    req.rows.forEach((row, ri) => {
      // Salto de página si no cabe la fila
      if (currentY + ROW_H > maxDataY) {
        doc.addPage();
        currentY = drawPageHeader();
        currentY = drawColumnHeaders(currentY);
      }

      // Fondo alterno (filas impares)
      if (ri % 2 === 1) {
        doc.rect(PAGE_MARGIN, currentY, pageW, ROW_H).fill(PDF_LIGHT_BLUE);
      }

      // Celdas
      let x = PAGE_MARGIN;
      req.columns.forEach((col, ci) => {
        const w = colWidths[ci];
        const text = formatCellValue(row[col.key], col.format);
        const align = col.align ?? defaultAlign(col.format);
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(PDF_DARK_GRAY)
          .text(text, x + 3, currentY + 5, {
            width: w - 6,
            align,
            lineBreak: false,
          });
        x += w;
      });

      // Separador de fila
      doc
        .moveTo(PAGE_MARGIN, currentY + ROW_H)
        .lineTo(PAGE_MARGIN + pageW, currentY + ROW_H)
        .strokeColor("#E0E0E0")
        .lineWidth(0.3)
        .stroke();

      currentY += ROW_H;
    });

    drawFooters();
    doc.end();
  });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Genera un Buffer listo para enviar vía res.send().
 * Usar en conjunto con contentTypeFor() y filenameFor().
 */
export async function exportReport(req: ReportExportRequest): Promise<Buffer> {
  if (req.format === "excel") return buildExcel(req);
  if (req.format === "pdf") return buildPdf(req);
  throw new Error(`Formato no soportado: ${(req as never as { format: string }).format}`);
}

/** Content-Type correcto para res.setHeader('Content-Type', ...) */
export function contentTypeFor(format: ExportFormat): string {
  return format === "excel"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/pdf";
}

/** Nombre de archivo seguro con extensión correcta */
export function filenameFor(name: string, format: ExportFormat): string {
  const ext = format === "excel" ? "xlsx" : "pdf";
  const safe = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // quitar diacríticos
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${safe}.${ext}`;
}
