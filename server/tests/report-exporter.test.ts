/**
 * report-exporter.test.ts
 * Tests del módulo server/lib/report-exporter.ts en aislamiento completo.
 * No conecta ningún endpoint HTTP — prueba la librería directamente.
 *
 * Cobertura:
 *   EXP — exportReport() produce Buffer válido (Excel y PDF)
 *   FMT — formatCellValue() con cada FormatType
 *   META — contentTypeFor() y filenameFor()
 */

import { describe, it, expect } from "vitest";
import {
  exportReport,
  formatCellValue,
  contentTypeFor,
  filenameFor,
  type ReportColumn,
  type ReportExportRequest,
} from "../lib/report-exporter";

// ── Fixtures de datos de ejemplo ──────────────────────────────────────────────

const COLUMNS: ReportColumn[] = [
  { key: "alumno",   header: "Alumno",          format: "string",       align: "left"  },
  { key: "monto",    header: "Monto",            format: "currency_mxn", align: "right" },
  { key: "pct",      header: "% Pagado",         format: "percentage",   align: "right" },
  { key: "fecha",    header: "Fecha",            format: "date",         align: "center"},
  { key: "cantidad", header: "Núm. Pagos",       format: "integer",      align: "right" },
  { key: "nivel",    header: "Nivel educativo",  format: "string",       align: "left"  },
];

const ROWS = [
  { alumno: "Sofía Ramírez",  monto: 80000,  pct: 100,  fecha: "2026-01-15", cantidad: 1, nivel: "Primaria" },
  { alumno: "Carlos López",   monto: 150000, pct: 66.7, fecha: "2026-02-03", cantidad: 2, nivel: "Secundaria" },
  { alumno: "Ana Martínez",   monto: 0,      pct: 0,    fecha: "2026-03-01", cantidad: 0, nivel: "Preescolar" },
  { alumno: "Pedro Fuentes",  monto: 240000, pct: 85.5, fecha: "2026-04-20", cantidad: 3, nivel: "Bachillerato" },
  { alumno: "Lucía Torres",   monto: 45000,  pct: 50,   fecha: null,         cantidad: 1, nivel: "Primaria" },
];

const FILTERS = { Ciclo: "2025-2026", Nivel: "Todos", Campus: "San Patricio" };

function makeRequest(format: "excel" | "pdf"): ReportExportRequest {
  return {
    title: "Reporte de Cobranza",
    subtitle: "Período: enero – abril 2026",
    columns: COLUMNS,
    rows: ROWS,
    appliedFilters: FILTERS,
    format,
    filename: "cobranza-2026",
    generatedBy: "test-suite",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXP — exportReport() — validez del Buffer
// ─────────────────────────────────────────────────────────────────────────────

describe("EXP — exportReport() produce Buffer válido", () => {
  it("EXP-01: formato excel → Buffer no vacío con magic bytes de ZIP (.xlsx)", async () => {
    const buf = await exportReport(makeRequest("excel"));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    // .xlsx es un ZIP: magic bytes PK\x03\x04
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
  }, 15000);

  it("EXP-02: formato pdf → Buffer no vacío con magic bytes PDF (%PDF)", async () => {
    const buf = await exportReport(makeRequest("pdf"));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    const header = buf.slice(0, 4).toString("ascii");
    expect(header).toBe("%PDF");
  }, 15000);

  it("EXP-03: excel con 0 filas → Buffer válido (solo encabezados)", async () => {
    const buf = await exportReport({
      ...makeRequest("excel"),
      rows: [],
      appliedFilters: {},
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  }, 15000);

  it("EXP-04: pdf con 0 filas → Buffer válido (encabezados + footer vacío)", async () => {
    const buf = await exportReport({
      ...makeRequest("pdf"),
      rows: [],
      appliedFilters: {},
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    const header = buf.slice(0, 4).toString("ascii");
    expect(header).toBe("%PDF");
  }, 15000);

  it("EXP-05: excel sin filtros → Buffer válido", async () => {
    const buf = await exportReport({
      ...makeRequest("excel"),
      appliedFilters: {},
      subtitle: undefined,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf[0]).toBe(0x50);
  }, 15000);

  it("EXP-06: pdf > 5 columnas → Buffer válido (orientación landscape)", async () => {
    // 6 columnas → landscape
    const buf = await exportReport(makeRequest("pdf"));
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  }, 15000);

  it("EXP-07: pdf ≤ 5 columnas → Buffer válido (orientación portrait)", async () => {
    const buf = await exportReport({
      ...makeRequest("pdf"),
      columns: COLUMNS.slice(0, 4), // 4 columnas → portrait
    });
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  }, 15000);

  it("EXP-08: formato desconocido → lanza Error", async () => {
    await expect(
      exportReport({ ...makeRequest("excel"), format: "csv" as never })
    ).rejects.toThrow("Formato no soportado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FMT — formatCellValue()
// ─────────────────────────────────────────────────────────────────────────────

describe("FMT — formatCellValue() — formateo correcto por tipo", () => {
  // currency_mxn: divide entre 100
  describe("FMT-01..06: currency_mxn (centavos → pesos MXN)", () => {
    it("FMT-01: 80000 centavos → $800.00", () => {
      expect(formatCellValue(80000, "currency_mxn")).toBe("$800.00");
    });

    it("FMT-02: 150000 centavos → $1,500.00 (separador de miles)", () => {
      expect(formatCellValue(150000, "currency_mxn")).toBe("$1,500.00");
    });

    it("FMT-03: 0 centavos → $0.00", () => {
      expect(formatCellValue(0, "currency_mxn")).toBe("$0.00");
    });

    it("FMT-04: 1 centavo → $0.01 (redondeo correcto)", () => {
      expect(formatCellValue(1, "currency_mxn")).toBe("$0.01");
    });

    it("FMT-05: 1000000 centavos → $10,000.00", () => {
      expect(formatCellValue(1000000, "currency_mxn")).toBe("$10,000.00");
    });

    it("FMT-06: valor string numérico → mismo resultado que número (conversión implícita)", () => {
      expect(formatCellValue("80000", "currency_mxn")).toBe("$800.00");
    });
  });

  // percentage
  describe("FMT-07..09: percentage", () => {
    it("FMT-07: 100 → 100.0%", () => {
      expect(formatCellValue(100, "percentage")).toBe("100.0%");
    });

    it("FMT-08: 66.7 → 66.7%", () => {
      expect(formatCellValue(66.7, "percentage")).toBe("66.7%");
    });

    it("FMT-09: 0 → 0.0%", () => {
      expect(formatCellValue(0, "percentage")).toBe("0.0%");
    });
  });

  // date
  describe("FMT-10..12: date", () => {
    it("FMT-10: string ISO → DD/MM/YYYY", () => {
      expect(formatCellValue("2026-01-15", "date")).toBe("15/01/2026");
    });

    it("FMT-11: objeto Date → DD/MM/YYYY", () => {
      expect(formatCellValue(new Date("2026-04-20"), "date")).toBe("20/04/2026");
    });

    it("FMT-12: valor nulo/undefined → cadena vacía", () => {
      expect(formatCellValue(null, "date")).toBe("");
      expect(formatCellValue(undefined, "date")).toBe("");
    });
  });

  // integer
  describe("FMT-13..15: integer", () => {
    it("FMT-13: 1234 → formateado con separador de miles", () => {
      expect(formatCellValue(1234, "integer")).toMatch(/1[.,]?234/);
    });

    it("FMT-14: 3.7 → redondea a 4", () => {
      expect(formatCellValue(3.7, "integer")).toMatch(/4/);
    });

    it("FMT-15: 0 → 0", () => {
      expect(formatCellValue(0, "integer")).toMatch(/^0$/);
    });
  });

  // string (default)
  describe("FMT-16..18: string / sin formato", () => {
    it("FMT-16: sin formato → toString del valor", () => {
      expect(formatCellValue("Primaria")).toBe("Primaria");
    });

    it("FMT-17: número sin formato → string del número", () => {
      expect(formatCellValue(42)).toBe("42");
    });

    it("FMT-18: null sin formato → cadena vacía", () => {
      expect(formatCellValue(null)).toBe("");
      expect(formatCellValue(undefined)).toBe("");
      expect(formatCellValue("")).toBe("");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// META — contentTypeFor() y filenameFor()
// ─────────────────────────────────────────────────────────────────────────────

describe("META — contentTypeFor() y filenameFor()", () => {
  describe("META-01..02: contentTypeFor()", () => {
    it("META-01: excel → application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", () => {
      expect(contentTypeFor("excel")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    });

    it("META-02: pdf → application/pdf", () => {
      expect(contentTypeFor("pdf")).toBe("application/pdf");
    });
  });

  describe("META-03..08: filenameFor()", () => {
    it("META-03: nombre limpio + excel → nombre.xlsx", () => {
      expect(filenameFor("cobranza-2026", "excel")).toBe("cobranza-2026.xlsx");
    });

    it("META-04: nombre limpio + pdf → nombre.pdf", () => {
      expect(filenameFor("cobranza-2026", "pdf")).toBe("cobranza-2026.pdf");
    });

    it("META-05: nombre con acentos → diacríticos eliminados, extensión correcta", () => {
      const result = filenameFor("Reporte Antigüedad", "pdf");
      expect(result).not.toMatch(/[áéíóúüñÁÉÍÓÚÜÑ]/);
      expect(result).toMatch(/\.pdf$/);
    });

    it("META-06: nombre con espacios → guiones bajos", () => {
      const result = filenameFor("reporte financiero", "excel");
      expect(result).not.toContain(" ");
      expect(result).toMatch(/\.xlsx$/);
    });

    it("META-07: nombre con caracteres especiales → sanitizado", () => {
      const result = filenameFor("reporte/consejo (2026)", "pdf");
      expect(result).not.toMatch(/[/()]/);
      expect(result).toMatch(/\.pdf$/);
    });

    it("META-08: guiones bajos múltiples consecutivos → colapsados", () => {
      const result = filenameFor("reporte   múltiple", "excel");
      expect(result).not.toMatch(/__+/);
    });
  });
});
