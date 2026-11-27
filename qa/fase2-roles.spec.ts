/**
 * QA fase 2: matriz de roles contra pantallas, con navegador. Solo registra lo observado (no afirma diseño);
 * el análisis lo hace analiza-fase2.mjs. Base desechable edupay_ci.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { staffApiLogin, ADMIN_PASSWORD } from "../e2e/helpers/auth";

const SALIDA = new URL("./matriz-fase2b.json", import.meta.url);
const ROLES: Record<string, string> = {
  super_admin: "superadmin@edupay.mx",
  administrador_general: "directora@jfr.edu.mx",
  administrador_campus: "admin.campus@jfr.edu.mx",
  contador_general: "contador@jfr.edu.mx",
  auxiliar_contable: "caja@jfr.edu.mx",
  admisiones: "admisiones@jfr.edu.mx",
  asistente: "qa.asistente@qa.test",
};
const RUTAS = [
  "/", "/admin", "/dashboard-admisiones", "/dashboard-caja", "/estudiantes", "/familias", "/usuarios", "/cargos", "/pagos",
  "/cuentas-por-cobrar", "/catalogo-productos", "/becas", "/notificaciones", "/reportes", "/configuracion", "/configuracion-inicial",
  "/configuracion-pagos-completa", "/emision-cargos", "/asignacion-precios", "/importacion-datos", "/caja-conciliacion", "/fiscal-contable",
  "/reportes-financieros", "/reportes-admisiones", "/aprobaciones", "/historial", "/profile", "/comandos-contador", "/semaforo-riesgo",
  "/planes-pago", "/calendario-financiero", "/reporte-consejo", "/reporte-antiguedad-saldos", "/reporte-riesgo", "/excepciones-conciliacion",
];
const PATRON_ERROR = /no se pudieron cargar|sin permisos?|no tienes permisos?|acceso denegado|error al cargar|algo sali[oó] mal|application error/i;

const resultado: Record<string, any> = fs.existsSync(SALIDA) ? JSON.parse(fs.readFileSync(SALIDA, "utf8")) : {};

for (const [rol, email] of Object.entries(ROLES)) {
  test(`matriz de roles: ${rol}`, async ({ browser, request }) => {
    test.setTimeout(420_000);
    const login = await staffApiLogin(request, email, ADMIN_PASSWORD);
    expect(login.status()).toBe(200);
    const { token, user } = await login.json();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    await ctx.addInitScript(([t, u]) => {
      localStorage.setItem("auth_token", t as string); localStorage.setItem("auth_type", "user"); localStorage.setItem("auth_user", u as string);
    }, [token, JSON.stringify(user)]);
    const page = await ctx.newPage();

    // Menú visible
    await page.goto("/");
    await page.waitForSelector("aside, nav", { timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const menu: string[] = await page.$$eval("aside a[href]", (as) => Array.from(new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || ""))));
    const etiquetas: Record<string, string> = await page.$$eval("aside a[href]", (as) => Object.fromEntries(as.map((a) => [(a as HTMLAnchorElement).getAttribute("href") || "", (a.textContent || "").trim().slice(0, 40)])));

    const pantallas: Record<string, any> = {};
    for (const ruta of RUTAS) {
      const apiErr: string[] = []; const apiOk: string[] = []; const consola: string[] = [];
      const onResp = (r: any) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) { if (r.status() >= 400) apiErr.push(`${r.request().method()} ${u.pathname} ${r.status()}`); else if (r.request().method() === "GET") apiOk.push(u.pathname); } };
      const onConsole = (m: any) => { if (m.type() === "error") consola.push(m.text().slice(0, 120)); };
      const onPageErr = (e: Error) => consola.push("pageerror: " + e.message.slice(0, 120));
      page.on("response", onResp); page.on("console", onConsole); page.on("pageerror", onPageErr);
      try {
        await page.goto(ruta, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
        await page.waitForTimeout(2200);
        const texto: string = await page.evaluate(() => document.body.innerText || "");
        const m = texto.match(PATRON_ERROR);
        const titulo = await page.evaluate(() => (document.querySelector("main h1, h1, main h2") as HTMLElement | null)?.innerText?.trim().slice(0, 60) || "");
        pantallas[ruta] = {
          urlFinal: new URL(page.url()).pathname, titulo, longitudTexto: texto.length,
          mensajeError: m ? texto.slice(Math.max(0, (m.index || 0) - 10), (m.index || 0) + 70).replace(/\s+/g, " ") : "",
          apiError: Array.from(new Set(apiErr)), apiOk: Array.from(new Set(apiOk)), consolaErrores: Array.from(new Set(consola)).slice(0, 3),
        };
      } catch (e: any) {
        pantallas[ruta] = { fallaNavegacion: String(e.message).slice(0, 120) };
      }
      page.off("response", onResp); page.off("console", onConsole); page.off("pageerror", onPageErr);
    }
    resultado[rol] = { email, menu, etiquetas, pantallas };
    fs.writeFileSync(SALIDA, JSON.stringify(resultado, null, 1));
    await ctx.close();
  });
}
