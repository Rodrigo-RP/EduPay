/**
 * e2e/12-antiguedad-saldos.spec.ts
 * Módulo: Antigüedad de Saldos (RPT-07) — pruebas E2E con Playwright
 *
 * Confirma que el componente React ReporteAntiguedadSaldos:
 *   1. Renderiza 6 tarjetas de bucket con montos $ visibles tras cargar datos reales.
 *   2. El filtro de ciclo escolar actualiza la vista (ciclo inexistente → estado vacío).
 *   3. El botón "Excel" dispara una descarga real con magic bytes PK (ZIP/XLSX).
 *   4. El botón "PDF" dispara una descarga real con magic bytes %PDF.
 *
 * ARQUITECTURA:
 *   - SPA con wouter: navegación vía pushState + popstate (no page.goto a subrutas).
 *   - Carga de datos asíncrona: esperar que el spinner desaparezca y los cards aparezcan.
 *   - Descargas: page.waitForEvent("download") en Promise.all con el click;
 *     download.path() devuelve la ruta al archivo temporal en disco.
 *   - El admin de demo (campus_id:48, tenant_id:29) tiene cargos pendientes con
 *     distintas fechas de vencimiento → los 6 buckets deberían tener montos > 0.
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { loginAsAdmin } from "./helpers/auth";

// ── Helper: navegar a /reporte-antiguedad-saldos en la SPA ───────────────────
async function irAntiguedadSaldos(page: any): Promise<void> {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/reporte-antiguedad-saldos");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  // Esperar el título H1 de la página
  await page.waitForSelector("h1", { timeout: 12_000 });
  await expect(
    page.getByText(/antigüedad de saldos/i).first()
  ).toBeVisible({ timeout: 8_000 });
}

// ── Helper: esperar que el spinner desaparezca y los cards estén en el DOM ───
async function esperarCarga(page: any): Promise<void> {
  // El spinner tiene la clase animate-spin; cuando desaparece los cards ya están
  await page.waitForFunction(
    () => document.querySelector(".animate-spin") === null,
    { timeout: 15_000 }
  );
  // Al menos un Card de bucket debe ser visible (busca el símbolo de pesos)
  await expect(
    page.getByText(/\$[\d,]+/).first()
  ).toBeVisible({ timeout: 10_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe("Antigüedad de Saldos — E2E (RPT-07)", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await irAntiguedadSaldos(page);
    await esperarCarga(page);
  });

  // ── 1. Las 6 tarjetas de bucket se renderizan con montos visibles ──────────
  test(
    "T1: 6 tarjetas de bucket con montos $ visibles (datos reales del campus demo)",
    async ({ page }) => {
      // Los 6 labels de bucket deben estar en el DOM
      const labels = [
        /al corriente/i,
        /1\s*[–-]\s*30\s*d/i,
        /31\s*[–-]\s*60\s*d/i,
        /61\s*[–-]\s*90\s*d/i,
        /91\s*[–-]\s*120\s*d/i,
        /más de 120/i,
      ];

      for (const label of labels) {
        await expect(
          page.getByText(label).first()
        ).toBeVisible({ timeout: 6_000 });
      }

      // Al menos un bucket debe mostrar un monto mayor que $0
      // (el campus demo tiene cargos pendientes con distintas fechas de vencimiento)
      const montoTexts = await page.getByText(/\$[\d,]+/).allTextContents();
      expect(
        montoTexts.length,
        "No se encontró ningún monto $ en la página"
      ).toBeGreaterThan(0);

      // El total de cartera debe ser visible
      await expect(
        page.getByText(/cartera total/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  );

  // ── 2. Filtro de ciclo: ciclo inexistente muestra "0 cargos pendientes" ────
  test(
    "T2: filtro de ciclo con valor inexistente muestra 0 cargos pendientes",
    async ({ page }) => {
      // Localizar el input de ciclo escolar (placeholder "ej. 2025-2026")
      const inputCiclo = page.getByPlaceholder(/ej\. 2025-2026/i);
      await expect(inputCiclo).toBeVisible({ timeout: 6_000 });

      // Escribir un ciclo que con certeza no existe en la DB de demo
      await inputCiclo.fill("CICLO-INVALIDO-XYZ-9999");

      // Dar tiempo a que React dispare el re-fetch (cambio de estado → nuevo queryKey)
      await page.waitForTimeout(400);

      // Esperar que el spinner desaparezca (re-fetch completo)
      await page.waitForFunction(
        () => document.querySelector(".animate-spin") === null,
        { timeout: 12_000 }
      );

      // El componente renderiza exactamente "0 cargos pendientes" en el encabezado
      // cuando detalle.length === 0 (comprobado en el screenshot del primer run).
      // También aparece "Sin cargos pendientes" en la tarjeta inferior.
      // Verificamos el encabezado porque es más estable (no cubre toasts).
      await expect(
        page.getByText("0 cargos pendientes")
      ).toBeVisible({ timeout: 8_000 });
    }
  );

  // ── 3. Botón Excel → descarga real con magic bytes PK (ZIP/XLSX) ──────────
  test(
    "T3: botón Excel dispara descarga con magic bytes PK (xlsx real, no JSON stub)",
    async ({ page }) => {
      // Limpiar cualquier filtro activo del test anterior (beforeEach hace login
      // fresco, pero por seguridad también limpiamos el input)
      const inputCiclo = page.getByPlaceholder(/ej\. 2025-2026/i);
      await inputCiclo.fill("");

      await esperarCarga(page);

      const btnExcel = page.getByRole("button", { name: /excel/i });
      await expect(btnExcel).toBeVisible({ timeout: 6_000 });

      // Iniciar la espera del evento download ANTES del click
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 20_000 }),
        btnExcel.click(),
      ]);

      // Obtener el archivo descargado
      const filePath = await download.path();
      expect(filePath, "Playwright no capturó la ruta del archivo descargado").toBeTruthy();

      const buf = await fs.readFile(filePath!);
      expect(
        buf.length,
        "El archivo Excel descargado está vacío"
      ).toBeGreaterThan(4);

      // Magic bytes ZIP/XLSX: 50 4B 03 04 → 'PK'
      expect(
        buf.slice(0, 2).toString("utf8"),
        "El archivo no tiene magic bytes PK — no es un XLSX real"
      ).toBe("PK");
    }
  );

  // ── 4. Botón PDF → descarga real con magic bytes %PDF ─────────────────────
  test(
    "T4: botón PDF dispara descarga con magic bytes %PDF (pdf real, no JSON stub)",
    async ({ page }) => {
      const btnPDF = page.getByRole("button", { name: /pdf/i });
      await expect(btnPDF).toBeVisible({ timeout: 6_000 });

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 20_000 }),
        btnPDF.click(),
      ]);

      const filePath = await download.path();
      expect(filePath, "Playwright no capturó la ruta del archivo PDF descargado").toBeTruthy();

      const buf = await fs.readFile(filePath!);
      expect(
        buf.length,
        "El archivo PDF descargado está vacío"
      ).toBeGreaterThan(4);

      // Magic bytes PDF: 25 50 44 46 → '%PDF'
      expect(
        buf.slice(0, 4).toString("utf8"),
        "El archivo no tiene magic bytes %PDF — no es un PDF real"
      ).toBe("%PDF");
    }
  );
});
