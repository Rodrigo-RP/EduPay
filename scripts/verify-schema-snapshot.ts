import fs from "node:fs/promises";

function readArg(name: string): string | undefined {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1];
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

const beforePath = readArg("--before");
const afterPath = readArg("--after");
if (!beforePath || !afterPath) throw new Error("Uso: db:verify-baseline --before=... --after=...");

const [before, after] = await Promise.all([
  fs.readFile(beforePath, "utf8").then(JSON.parse),
  fs.readFile(afterPath, "utf8").then(JSON.parse),
]);
const normalize = (value: any) => JSON.stringify(value);
for (const key of ["relations", "columns", "constraints", "indexes", "counts"]) {
  if (normalize(before[key]) !== normalize(after[key])) {
    throw new Error(`El snapshot cambió en ${key}; el baseline no fue no-op`);
  }
}
console.log("[db:verify-baseline] Catálogo, restricciones, índices y conteos sin cambios");