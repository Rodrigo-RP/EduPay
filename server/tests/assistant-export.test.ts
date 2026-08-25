/**
 * assistant-export.test.ts — N3: exportación desde el asistente
 *
 * EXP-01..EXP-08  detectExportIntent reconoce cada uno de los 8 reportes (unit)
 * EXP-09          detecta formato pdf explícito
 * EXP-10          detecta formato excel explícito
 * EXP-11          formato por defecto es excel cuando no se especifica
 * EXP-12          extrae ciclo_escolar del mensaje
 * EXP-13          extrae nivel educativo del mensaje
 * EXP-14          sin trigger de exportación → null (no confunde con navegación)
 * EXP-15          reporte no reconocido con trigger → null
 * EXP-16..EXP-23  magic bytes XLSX reales de los 8 endpoints de exportación
 */

import { describe, it, expect, beforeAll } from "vitest";
import { detectExportIntent }              from "../assistant-knowledge";
import { pool }                            from "../db";
import jwt                                 from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ─── Setup de credenciales para tests de integración ─────────────────────────
// No se incluye `id` en el JWT para evitar el rollback silencioso del audit_log
// cuando el user_id ficticio viola la FK en la tabla users (ver memory: audit-log-fk-rollback).
let contadorToken: string;

beforeAll(async () => {
  // Obtener directamente un campus existente — evita el error cuando el primer
  // tenant no tiene campus asociado (patrón de otros tests como rpt08).
  const { rows } = await pool.query(
    "SELECT id, tenant_id FROM campuses WHERE tenant_id IS NOT NULL LIMIT 1"
  );
  const campusId: number  = rows[0].id;
  const tenantId: number  = rows[0].tenant_id;

  contadorToken = jwt.sign(
    { role: "contador_general", tenant_id: tenantId, campus_id: campusId },
    JWT_SECRET
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Bloque 1 — Tests unitarios de detectExportIntent (sin DB, sin servidor)
// ══════════════════════════════════════════════════════════════════════════════

describe("detectExportIntent — reconocimiento de los 8 reportes", () => {

  it("EXP-01: RPT-01 financiero — 'exportar reporte financiero'", () => {
    const r = detectExportIntent("exportar el reporte financiero del campus");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/financiero/exportar");
    expect(r!.format).toBe("excel");
  });

  it("EXP-02: RPT-02 estudiantes — 'descargar padron de alumnos'", () => {
    const r = detectExportIntent("descargar el padron de alumnos inscritos");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/estudiantes/exportar");
  });

  it("EXP-03: RPT-03 cobranza — 'exportar reporte de cobranza'", () => {
    const r = detectExportIntent("exportar reporte de cobranza");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/cobranza/exportar");
  });

  it("EXP-04: RPT-04 admisiones — 'descargar reporte de admisiones'", () => {
    const r = detectExportIntent("descargar el reporte de admisiones en excel");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/admisiones/exportar");
  });

  it("EXP-05: RPT-05 consejo — 'exportar reporte del consejo directivo'", () => {
    const r = detectExportIntent("exportar reporte del consejo directivo");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/consejo/exportar");
  });

  it("EXP-06: RPT-06 contable — 'descargar reporte contable'", () => {
    const r = detectExportIntent("descargar el reporte contable");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/contable/exportar");
  });

  it("EXP-07: RPT-07 antigüedad — 'exportar antigüedad de saldos'", () => {
    const r = detectExportIntent("exportar antigüedad de saldos");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/antiguedad-saldos/exportar");
  });

  it("EXP-08: RPT-08 riesgo — 'exportar reporte de riesgo de cobranza'", () => {
    const r = detectExportIntent("exportar reporte de riesgo de cobranza");
    expect(r).not.toBeNull();
    expect(r!.endpoint).toBe("/api/reportes/riesgo/exportar");
  });
});

describe("detectExportIntent — formato y filtros", () => {

  it("EXP-09: formato pdf explícito", () => {
    const r = detectExportIntent("exportar reporte de riesgo en pdf");
    expect(r!.format).toBe("pdf");
    expect(r!.suggestedFilename).toMatch(/\.pdf$/);
    // todos los endpoints usan "formato" (nombre unificado)
    expect(r!.body["formato"]).toBe("pdf");
  });

  it("EXP-10: formato excel explícito", () => {
    const r = detectExportIntent("exportar reporte financiero en excel");
    expect(r!.format).toBe("excel");
    expect(r!.suggestedFilename).toMatch(/\.xlsx$/);
    // todos los endpoints usan "formato" (nombre unificado)
    expect(r!.body["formato"]).toBe("excel");
  });

  it("EXP-11: default a excel cuando el formato no se especifica", () => {
    const r = detectExportIntent("exportar cartera vencida");
    expect(r).not.toBeNull();
    expect(r!.format).toBe("excel");
    expect(r!.body["formato"]).toBe("excel");
  });

  it("EXP-12: extrae ciclo_escolar del mensaje", () => {
    const r = detectExportIntent("exportar reporte financiero del ciclo 2025-2026");
    expect(r).not.toBeNull();
    expect(r!.body["ciclo"]).toBe("2025-2026");
  });

  it("EXP-13: extrae nivel educativo del mensaje", () => {
    const r = detectExportIntent("exportar reporte de estudiantes de primaria");
    expect(r).not.toBeNull();
    expect(r!.body["nivel"]).toBe("Primaria");
  });

  it("EXP-14: sin trigger de exportación → null (no confunde con intención de navegación)", () => {
    const r = detectExportIntent("quiero ver el reporte de riesgo");
    expect(r).toBeNull();
  });

  it("EXP-15: reporte no reconocido aunque haya trigger → null", () => {
    const r = detectExportIntent("exportar el estado del tiempo de mañana");
    expect(r).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bloque 2 — Integración: magic bytes XLSX de los 8 endpoints de exportación
// ══════════════════════════════════════════════════════════════════════════════
// Verifica que cada endpoint devuelve 200 y un blob con firma XLSX (PK\x03\x04).
// Los tests no crean fixtures propios: un XLSX vacío sigue siendo un XLSX válido.

const XLSX_MAGIC = "PK"; // bytes 0x50 0x4B

async function fetchExport(path: string, body: Record<string, string>, token: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("magic bytes XLSX — 8 endpoints de exportación", () => {

  it("EXP-16: RPT-01 /api/reportes/financiero/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/financiero/exportar", { formato: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });

  it("EXP-17: RPT-02 /api/reportes/estudiantes/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/estudiantes/exportar", { formato: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });

  it("EXP-18: RPT-03 /api/reportes/cobranza/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/cobranza/exportar", { formato: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });

  it("EXP-19: RPT-04 /api/reportes/admisiones/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/admisiones/exportar", { formato: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });

  it("EXP-20: RPT-05 /api/reportes/consejo/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/consejo/exportar", { format: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });

  it("EXP-21: RPT-06 /api/reportes/contable/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/contable/exportar", { format: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });

  it("EXP-22: RPT-07 /api/reportes/antiguedad-saldos/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/antiguedad-saldos/exportar", { format: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });

  it("EXP-23: RPT-08 /api/reportes/riesgo/exportar → XLSX", async () => {
    const res = await fetchExport("/api/reportes/riesgo/exportar", { format: "excel" }, contadorToken);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("ascii")).toBe(XLSX_MAGIC);
  });
});
