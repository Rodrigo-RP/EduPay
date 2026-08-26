#!/usr/bin/env tsx
/**
 * scripts/validate-assistant-queries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ejecuta todas las sondas SQL del asistente contra la DB real.
 * Sale con código 0 si todo pasa, código 1 si alguna sonda falla.
 *
 * Uso:
 *   npm run validate:assistant
 *   tsx scripts/validate-assistant-queries.ts
 *
 * Cuándo correrlo:
 *   - Antes de declarar que una query "funciona"
 *   - Después de cualquier cambio en assistant-actions.ts
 *   - Después de una migración de base de datos
 *   - Como paso de CI antes de desplegar
 */

import { runAllProbes } from "../server/assistant-validation";

const report = await runAllProbes();

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  EduPay — Validación de queries del asistente        ║`);
console.log(`╚══════════════════════════════════════════════════════╝\n`);
console.log(`  Sondas ejecutadas : ${report.totalProbes}`);
console.log(`  ✅ Pasaron         : ${report.passed}`);
console.log(`  ❌ Fallaron        : ${report.failed}`);
console.log(`  Tiempo total      : ${report.durationMs}ms\n`);

for (const r of report.results) {
  const icon = r.ok ? "✅" : "❌";
  console.log(`  ${icon} ${r.name.padEnd(35)} ${r.durationMs}ms`);
  if (!r.ok) {
    console.error(`     ERROR: ${r.error}`);
    console.error(`     → ${r.description}`);
  }
}

if (report.failed > 0) {
  console.error(`\n💥 ${report.failed} sonda(s) fallaron.`);
  console.error(`   Corrige las columnas en server/assistant-actions.ts y vuelve a correr.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ Todas las sondas pasaron. Las queries del asistente están sincronizadas con la DB.\n`);
  process.exit(0);
}
