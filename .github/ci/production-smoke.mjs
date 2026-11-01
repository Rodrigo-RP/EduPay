import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5000";
const database = new URL(process.env.DATABASE_URL);
assert.equal(process.env.CI, "true");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/edupay_ci");
database.pathname = "/edupay_production_smoke_ci";
const child = spawn("npm", ["run", "start"], {
  detached: true,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: database.href,
    APP_ENV: "production",
    NODE_ENV: "production",
    ALLOW_DEMO_SEED: "false",
    NODE_OPTIONS: `--import=${path.resolve(".github/ci/production-neon-config.mjs")}`,
  },
});
let browser;
const root = path.resolve("dist/public");
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  }))).flat();
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    assert.equal(child.exitCode, null, "npm run start terminó antes de servir la página");
    try {
      const response = await fetch(base);
      if (response.status === 200) { ready = true; break; }
    } catch { /* El proceso aún no abrió el puerto; la espera es acotada. */ }
    await delay(500);
  }
  assert.ok(ready, "El servidor de producción no abrió en 30 segundos");
  let bytes = 0;
  let gzipBytes = 0;
  const outputs = await files(root);
  for (const file of outputs) {
    const url = new URL(path.relative(root, file).split(path.sep).join("/"), `${base}/`);
    const response = await fetch(url);
    assert.equal(response.status, 200, url.href);
    const expected = await readFile(file);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected, `Recurso incorrecto: ${url.href}`);
    bytes += expected.length;
    gzipBytes += gzipSync(expected).length;
    console.log(`[production:resource] 200 ${url.pathname} ${expected.length} bytes`);
  }
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  // Analiza el HTML realmente servido, sin ejecutarlo. Los scripts añadidos
  // después por SDKs no son scripts declarados por nuestro documento HTML.
  const htmlResponse = await fetch(base);
  assert.equal(htmlResponse.status, 200);
  const externalScripts = await page.evaluate(({ html, url }) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const baseHref = document.querySelector("base[href]")?.getAttribute("href");
    const resolutionBase = new URL(baseHref || url, url);
    return Array.from(document.querySelectorAll("script[src]"))
      .map(script => new URL(script.getAttribute("src"), resolutionBase))
      .filter(source => source.origin !== new URL(url).origin)
      .map(source => source.href);
  }, { html: await htmlResponse.text(), url: htmlResponse.url });
  assert.deepEqual(externalScripts, [], "El HTML servido declara scripts externos");
  console.log("[production:html] Cero scripts de dominios externos en el HTML servido.");
  const failures = [];
  const resourceTypes = new Set(["document", "script", "stylesheet", "image", "font", "media"]);
  page.on("pageerror", error => failures.push(`JavaScript: ${error.message}`));
  page.on("requestfailed", request => {
    if (resourceTypes.has(request.resourceType())) {
      failures.push(`${request.url()}: ${request.failure()?.errorText}`);
    }
  });
  page.on("response", response => {
    if (resourceTypes.has(response.request().resourceType())) {
      console.log(`[production:browser] ${response.status()} ${response.url()}`);
      if (response.status() !== 200) failures.push(`${response.status()} ${response.url()}`);
    }
  });
  const main = await page.goto(base, { waitUntil: "load" });
  assert.equal(main?.status(), 200);
  await page.locator("#root > *").first().waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  assert.ok((await page.locator("#root").innerText()).trim(), "React no mostró contenido");
  assert.deepEqual(failures, [], "Recursos de producción fallidos");
  console.log(`[production:size] cliente=${bytes} bytes; gzip=${gzipBytes} bytes; archivos=${outputs.length}; servidor=${(await stat("dist/index.js")).size} bytes`);
  console.log("[production:smoke] npm run start, página, React y recursos: aprobados.");
} finally {
  await browser?.close();
  try { process.kill(-child.pid, "SIGTERM"); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
  if (child.exitCode === null) {
    await new Promise(resolve => child.once("exit", resolve));
  }
}
