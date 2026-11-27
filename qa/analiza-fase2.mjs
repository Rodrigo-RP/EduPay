import fs from "node:fs";
const d = JSON.parse(fs.readFileSync(new URL("./matriz-fase2b.json", import.meta.url), "utf8"));
const roles = Object.keys(d);
const corto = { super_admin: "SA", administrador_general: "AG", administrador_campus: "AC", contador_general: "CG", auxiliar_contable: "AX", admisiones: "AD", asistente: "AS" };
const rutas = Object.keys(d[roles[0]].pantallas);
const norm = (p) => (p || "").replace(/\/$/, "") || "/";
const RUIDO = /onboarding-status|excepciones\/count| 429$/;
const COMUN = /^\/api\/(auth\/|institutional-info|notifications\/email\/config|assistant\/|payment-config\/presets|profile)/;

function clasifica(rol, ruta) {
  const r = d[rol], p = r.pantallas[ruta];
  const enMenu = r.menu.map(norm).includes(norm(ruta));
  if (p.fallaNavegacion) return { c: "N", enMenu, det: p.fallaNavegacion };
  const redirige = norm(p.urlFinal) !== norm(ruta);
  const propios = p.apiError.filter((e) => !RUIDO.test(e));
  const err403 = propios.filter((e) => / 40[13]$/.test(e));
  const err5xx = propios.filter((e) => / 5\d\d$/.test(e));
  const otros = propios.filter((e) => / 4\d\d$/.test(e) && !/ 40[13]$/.test(e));
  const rota = propios.length || p.mensajeError;
  let c;
  if (redirige) c = "R"; else if (rota) c = enMenu ? "X" : "x"; else c = enMenu ? "O" : "o";
  const datos = (p.apiOk || []).filter((a) => !COMUN.test(a));
  return { c, enMenu, redirige, err403, err5xx, otros, propios, msg: p.mensajeError, urlFinal: p.urlFinal, datos, titulo: p.titulo, nRuido429: p.apiError.filter((e) => / 429$/.test(e)).length };
}
const T = {}; for (const ruta of rutas) { T[ruta] = {}; for (const rol of roles) T[ruta][rol] = clasifica(rol, ruta); }

let md = "## Matriz rol por pantalla (filtrada)\n\nLeyenda: `O` carga sin errores y tiene enlace; `o` carga sin errores y no tiene enlace (accesible por URL); `X` tiene enlace pero la pantalla falla por sus propias llamadas (403, 5xx, otro 4xx) o muestra un mensaje de error; `x` falla y no tiene enlace (el servidor la bloquea); `R` redirige; `N` falló la navegación. Se ignoran como ruido las llamadas `onboarding-status` (403 por diseño para roles sin `settings.configure`), `excepciones/count` (idem) y los 429.\n\n";
md += `| Ruta | ${roles.map((r) => corto[r]).join(" | ")} |\n|---|${roles.map(() => "---").join("|")}|\n`;
for (const ruta of rutas) md += `| ${ruta} | ${roles.map((r) => T[ruta][r].c).join(" | ")} |\n`;

md += "\n## Enlaces visibles cuyas pantallas fallan (X)\n\n| Rol | Ruta | Llamadas propias con error | Mensaje en pantalla |\n|---|---|---|---|\n";
for (const ruta of rutas) for (const rol of roles) { const t = T[ruta][rol]; if (t.c === "X") md += `| ${corto[rol]} | ${ruta} | ${t.propios.join("; ") || "-"} | ${t.msg || "-"} |\n`; }

md += "\n## Roles restringidos que cargan datos en pantallas SIN enlace en el menú (o)\n\nSolo CG, AX, AD y AS. Un `o` aquí significa que la pantalla se abre por URL y no recibió ningún 403 propio.\n\n| Rol | Ruta | Datos cargados (GET con 2xx) |\n|---|---|---|\n";
let alguno = false;
for (const ruta of rutas) for (const rol of ["contador_general", "auxiliar_contable", "admisiones", "asistente"]) { const t = T[ruta][rol]; if (t.c === "o") { alguno = true; md += `| ${corto[rol]} | ${ruta} | ${t.datos.join(", ") || "(ninguno)"} |\n`; } }
if (!alguno) md += "| - | - | Ninguno |\n";

md += "\n## Pantallas con enlace donde el rol SÍ carga datos (O) para roles restringidos\n\n| Rol | Ruta | Datos cargados |\n|---|---|---|\n";
for (const ruta of rutas) for (const rol of ["contador_general", "auxiliar_contable", "admisiones", "asistente"]) { const t = T[ruta][rol]; if (t.c === "O") md += `| ${corto[rol]} | ${ruta} | ${t.datos.join(", ") || "(ninguno)"} |\n`; }

md += "\n## Datos que un rol carga aunque no debería (cruce con permisos de módulo)\n\nLlamadas GET exitosas de roles restringidos a datos financieros y de personal:\n\n";
const sensibles = /(receivables|caja|admin\/charges|dashboard\/contador|admin\/dashboard|crm\/prospects|payments|charges|reportes|riesgo|users|scholarships|families|students|audit)/;
const filas = [];
for (const ruta of rutas) for (const rol of ["contador_general", "auxiliar_contable", "admisiones", "asistente"]) {
  const t = T[ruta][rol]; const s = t.datos.filter((a) => sensibles.test(a)); if (s.length) filas.push(`- ${corto[rol]} en ${ruta}: ${s.join(", ")}`);
}
md += filas.length ? filas.join("\n") : "Ninguna.";

md += "\n\n## 5xx y redirecciones\n\n";
const cinco = [], redir = [];
for (const ruta of rutas) for (const rol of roles) { const t = T[ruta][rol]; if (t.err5xx?.length) cinco.push(`- ${corto[rol]} ${ruta}: ${t.err5xx.join("; ")}`); if (t.c === "R") redir.push(`- ${corto[rol]}: ${ruta} a ${t.urlFinal}`); }
md += `5xx: ${cinco.length ? "\n" + cinco.join("\n") : "ninguno"}\n\nRedirecciones: ${redir.length ? "\n" + redir.join("\n") : "ninguna"}\n`;

md += "\n## Llamadas con error propias, agrupadas por endpoint y rol\n\n";
const porEnd = {};
for (const ruta of rutas) for (const rol of roles) for (const e of T[ruta][rol].propios || []) { const k = e.replace(/ \d+$/, ""); const st = e.match(/ (\d+)$/)[1]; (porEnd[k] ||= { st, roles: new Set(), rutas: new Set() }); porEnd[k].roles.add(corto[rol]); porEnd[k].rutas.add(ruta); }
md += "| Endpoint | HTTP | Roles | Pantallas |\n|---|---|---|---|\n";
for (const [k, v] of Object.entries(porEnd).sort()) md += `| ${k} | ${v.st} | ${[...v.roles].join(", ")} | ${[...v.rutas].slice(0, 6).join(", ")}${v.rutas.size > 6 ? "..." : ""} |\n`;

md += "\n## Menú por rol\n\n";
for (const rol of roles) md += `- ${corto[rol]} (${d[rol].menu.length}): ${d[rol].menu.map((h) => `${h} [${d[rol].etiquetas[h] || ""}]`).join(", ")}\n`;

fs.writeFileSync(new URL("./matriz-fase2b.md", import.meta.url), md);
console.log(md);
