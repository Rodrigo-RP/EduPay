import fs from "node:fs";
const r = JSON.parse(fs.readFileSync(new URL("./resultados.json", import.meta.url), "utf8"));
const strip = (t) => (t || "").replace(/\u001b\[[0-9;]*m/g, "");
const filas = [];
const walk = (s) => {
  for (const sp of s.specs || []) for (const t of sp.tests) {
    const res = t.results[0];
    const ann = (t.annotations || []).map((a) => `${a.type}: ${a.description}`).join("; ");
    const errs = (res.errors || (res.error ? [res.error] : [])).map((e) => strip(e.message).split("\n").filter((l) => l.trim()).slice(0, 3).join(" | ").slice(0, 260));
    filas.push({ ok: res.status === "passed", titulo: sp.title, errs, ann });
  }
  for (const c of s.suites || []) walk(c);
};
r.suites.forEach(walk);
const falla = filas.filter((f) => !f.ok);
console.log(`total ${filas.length}, pasan ${filas.length - falla.length}, fallan ${falla.length}`);
for (const f of falla) console.log(`\nFALLA: ${f.titulo}\n   ${f.errs.join("\n   ")}${f.ann ? "\n   anotaciones: " + f.ann : ""}`);
console.log("\nANOTACIONES de pruebas que pasan:");
for (const f of filas.filter((x) => x.ok && x.ann)) console.log(`- ${f.titulo}: ${f.ann}`);
