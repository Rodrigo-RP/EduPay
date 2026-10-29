import { readFileSync, writeFileSync } from "node:fs";

// Ejecutar sobre la copia de instalación, no sobre el lockfile para publicar cambios.
// Sólo cambia el transporte; conserva versiones, integridades y demás metadatos.
const filename = "package-lock.json";
const lock = JSON.parse(readFileSync(filename, "utf8"));
const internalRegistry = "http://package-firewall.replit.internal/npm/";
let replaced = 0;
for (const entry of Object.values(lock.packages)) {
  if (entry.resolved?.startsWith(internalRegistry)) {
    entry.resolved = entry.resolved.replace(internalRegistry, "https://registry.npmjs.org/");
    replaced++;
  }
}
if (replaced > 0) {
  writeFileSync(filename, JSON.stringify(lock, null, 2) + "\n");
}
console.log(`URLs públicas en la copia de instalación: ${replaced}`);
