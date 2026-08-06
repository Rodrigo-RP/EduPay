#!/usr/bin/env tsx
/**
 * scripts/audit-report.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera el reporte de auditoría estandarizado del Protocolo §5.
 *
 * Uso:
 *   npm run audit:report [-- --modulo=<nombre>]
 *
 * Ejecuta en orden:
 *   1. Vitest (lógica aislada)
 *   2. Playwright E2E (flujos reales)
 *   3. Validación de queries del asistente
 *   4. Check de rutas registradas
 *
 * Imprime el reporte en el formato exacto que exige el protocolo.
 * Sale con código 1 si CUALQUIER paso falla.
 */

import { execSync, ExecSyncOptions } from "child_process";
import * as readline from "readline";

const modulo = process.argv.find((a) => a.startsWith("--modulo="))?.split("=")[1] ?? "Completo";
const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface StepResult {
  name: string;
  command: string;
  output: string;
  passed: boolean;
}

function run(label: string, cmd: string): StepResult {
  const opts: ExecSyncOptions = { encoding: "utf8", stdio: "pipe" };
  try {
    const output = execSync(cmd, opts) as unknown as string;
    return { name: label, command: cmd, output: output.trim(), passed: true };
  } catch (err: any) {
    const output = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
    return { name: label, command: cmd, output: output || err.message, passed: false };
  }
}

// ─── Ejecutar pasos ───────────────────────────────────────────────────────────

console.log(`\n🔍 Iniciando auditoría: módulo "${modulo}" — ${timestamp}\n`);

const steps: StepResult[] = [
  run("Vitest – pruebas unitarias", "npm test 2>&1"),
  run("Playwright – flujos E2E", "npx playwright test --reporter=list 2>&1"),
  run("Validación queries asistente", "npm run validate:assistant 2>&1"),
  run("Check rutas registradas §9", "npm run check:routes 2>&1"),
];

// ─── Calcular resumen ─────────────────────────────────────────────────────────

const passed = steps.filter((s) => s.passed);
const failed = steps.filter((s) => !s.passed);

// ─── Imprimir reporte en formato protocolo §5 ────────────────────────────────

const SEP = "─".repeat(72);

console.log(`\n${SEP}`);
console.log(`REPORTE DE AUDITORÍA — ${timestamp}`);
console.log(SEP);
console.log(`Módulo probado: ${modulo}`);
console.log(SEP);

for (const step of steps) {
  console.log(`\n▸ ${step.name}`);
  console.log(`  Comando ejecutado: ${step.command}`);
  console.log(`  Resultado: ${step.passed ? "✅ PASÓ" : "❌ FALLÓ"}`);
  if (!step.passed) {
    console.log(`  Salida completa:`);
    step.output.split("\n").forEach((l) => console.log(`    ${l}`));
  }
}

console.log(`\n${SEP}`);
console.log(`Casos que pasaron   (${passed.length}): ${passed.map((s) => s.name).join(", ") || "ninguno"}`);
console.log(`Casos que fallaron  (${failed.length}): ${failed.map((s) => s.name).join(", ") || "ninguno"}`);
console.log(`\nFunciones NO probadas: ver docs/qa/matriz-de-pruebas.md columna "Última prueba".`);
console.log(SEP);
console.log(`\nNOTA DEL PROTOCOLO §7: Este reporte cubre ${steps.length} pasos automatizados.`);
console.log(`Si la suite no alcanza un módulo, se indica explícitamente arriba.`);
console.log(`Una afirmación sin evidencia ejecutada NO cuenta como auditoría.\n`);

process.exit(failed.length > 0 ? 1 : 0);
