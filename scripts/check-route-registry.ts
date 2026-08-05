#!/usr/bin/env tsx
/**
 * scripts/check-route-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * §9.2 — Verificación automática del catálogo de rutas.
 *
 * Compara las rutas reales declaradas en client/src/App.tsx contra las entradas
 * de shared/route-registry.ts. Si existe una pantalla sin registro, termina con
 * código de salida 1 y un mensaje claro, convirtiendo el olvido humano en un
 * error detectable antes de llegar a producción.
 *
 * Uso:
 *   npm run check:routes
 *   tsx scripts/check-route-registry.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { APP_ROUTES } from "../shared/route-registry";

// ── Leer rutas desde App.tsx ──────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const APP_TSX_PATH = path.resolve(__dirname, "../client/src/App.tsx");

if (!fs.existsSync(APP_TSX_PATH)) {
  console.error(`[check-routes] No se encontró el archivo: ${APP_TSX_PATH}`);
  process.exit(1);
}

const appTsxContent = fs.readFileSync(APP_TSX_PATH, "utf-8");

// Extraer todos los path="..." de las declaraciones <Route path="...">
const routePathRegex = /<Route\s[^>]*path="([^"]+)"/g;
const appRoutes = new Set<string>();
let match: RegExpExecArray | null;

while ((match = routePathRegex.exec(appTsxContent)) !== null) {
  appRoutes.add(match[1]);
}

if (appRoutes.size === 0) {
  console.error("[check-routes] No se encontraron rutas en App.tsx. ¿Cambió el formato?");
  process.exit(1);
}

// ── Rutas registradas ─────────────────────────────────────────────────────────

const registeredPaths = new Set(APP_ROUTES.map((r) => r.path));

// ── Comparar ──────────────────────────────────────────────────────────────────

const missingFromRegistry: string[] = [];
const missingFromApp: string[] = [];

// Rutas en App.tsx que NO están en el registro
for (const p of appRoutes) {
  if (!registeredPaths.has(p)) {
    missingFromRegistry.push(p);
  }
}

// Entradas en el registro que NO aparecen en App.tsx (posibles rutas huérfanas)
for (const r of APP_ROUTES) {
  if (!appRoutes.has(r.path)) {
    missingFromApp.push(r.path);
  }
}

// ── Reporte ───────────────────────────────────────────────────────────────────

console.log(`\n[check-routes] Rutas en App.tsx: ${appRoutes.size}`);
console.log(`[check-routes] Entradas en route-registry.ts: ${APP_ROUTES.length}`);

let hasErrors = false;

if (missingFromRegistry.length > 0) {
  hasErrors = true;
  console.error(`\n❌ ${missingFromRegistry.length} ruta(s) en App.tsx sin entrada en shared/route-registry.ts:`);
  for (const p of missingFromRegistry) {
    console.error(`   → ${p}  (agrega una entrada en APP_ROUTES para que el asistente la conozca)`);
  }
}

if (missingFromApp.length > 0) {
  // Advertencia, no error — el registro puede incluir rutas planificadas
  console.warn(`\n⚠️  ${missingFromApp.length} entrada(s) en route-registry.ts sin ruta correspondiente en App.tsx:`);
  for (const p of missingFromApp) {
    console.warn(`   → ${p}  (¿fue eliminada o renombrada?)`);
  }
}

if (!hasErrors) {
  console.log(`\n✅ Todas las rutas de App.tsx tienen entrada en route-registry.ts`);
  console.log(`   El catálogo del asistente está sincronizado.\n`);
  process.exit(0);
} else {
  console.error(`\n💥 Corrige las rutas faltantes antes de continuar.`);
  console.error(`   Instrucción: agrega cada ruta a shared/route-registry.ts con path, label y keywords.\n`);
  process.exit(1);
}
