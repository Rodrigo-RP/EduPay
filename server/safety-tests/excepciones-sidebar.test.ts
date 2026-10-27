import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

describe("Sidebar con el proveedor WebSocket real, navegador aislado", () => {
  it("actualiza y oculta el badge, conserva cifras entre mensajes y no hace polling HTTP", async () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const bundle = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { RealTimeProvider } from './client/src/components/RealTimeProvider';
          import Sidebar from './client/src/components/layout/sidebar';
          const root = createRoot(document.getElementById('root'));
          window.renderSidebar = () => root.render(
            <RealTimeProvider showStatusIndicator={false}><Sidebar /></RealTimeProvider>);
          window.renderSidebar();
        `,
        resolveDir: root, loader: "tsx",
      },
      bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
      alias: { "@": path.join(root, "client/src"), "@shared": path.join(root, "shared") },
      plugins: [{
        name: "isolated-ui-dependencies",
        setup(builder) {
          builder.onResolve({ filter: /use-auth$|use-institution$|use-toast$|training-modal$|^@tanstack\/react-query$|^wouter$/ }, args =>
            ({ path: args.path, namespace: "isolated" }));
          builder.onLoad({ filter: /.*/, namespace: "isolated" }, args => {
            let contents: string;
            if (args.path.endsWith("use-auth")) contents = `export const useAuth = () => ({user: window.testUser, logout() {}});`;
            else if (args.path.endsWith("use-institution")) contents = `export const useInstitution = () => ({ institutionName:'Pruebas', campusName:'Campus' });`;
            else if (args.path.endsWith("training-modal")) contents = `export default () => null;`;
            else if (args.path.endsWith("use-toast")) contents = `const toast = () => {}; export const useToast = () => ({toast});`;
            else if (args.path === "wouter") contents = `export const useLocation = () => ['/', () => {}];`;
            else contents = `const client = {invalidateQueries() {}}; export const useQueryClient = () => client;`;
            return { contents, loader: "js" };
          });
        },
      }],
    });
    let executablePath: string | undefined;
    try { executablePath = execFileSync("sh", ["-c", "command -v chromium || command -v chromium-browser"], { encoding: "utf8" }).trim(); }
    catch { /* En CI, usar Chromium instalado por Playwright. */ }
    const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      let requests = 0;
      await page.route("http://isolated.test/**", route => {
        if (route.request().url() !== "http://isolated.test/") requests++;
        return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
      });
      await page.goto("http://isolated.test/");
      await page.evaluate(() => {
        const w = window as any;
        w.testUser = { id: 1, role: "administrador_campus", campus_id: 9, tenant_id: 8, name: "Pruebas" };
        w.fetchCalls = 0;
        w.fetch = () => { w.fetchCalls++; throw new Error("No se permite HTTP para el conteo"); };
        localStorage.setItem("auth_token", "isolated-token");
        w.WebSocket = class {
          static OPEN = 1; static CONNECTING = 0;
          readyState = 0;
          constructor() {
            w.testSocket = this;
            setTimeout(() => { this.readyState = 1; (this as any).onopen?.(); }, 0);
          }
          send() {}
          close() { this.readyState = 3; }
        };
      });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.waitForFunction(() => (window as any).testSocket?.readyState === 1);
      const link = page.getByText("Excepciones bancarias", { exact: true }).locator("..");
      const emit = (total: number, campus = 9) => page.evaluate(({ total, campus }) => {
        (window as any).testSocket.onmessage({ data: JSON.stringify({
          type: "excepciones_count", data: { total_pendiente: total, tenant_id: 8, campus_id: campus },
        }) });
      }, { total, campus });
      await emit(4);
      await expect.poll(() => link.textContent()).toContain("4");
      await page.evaluate(() => (window as any).testSocket.onmessage({ data: '{"type":"pong"}' }));
      await expect.poll(() => link.textContent()).toContain("4");
      await emit(0);
      await expect.poll(() => link.textContent()).not.toMatch(/\d/);
      await emit(99, 90);
      await expect.poll(() => link.textContent()).not.toContain("99");
      await emit(6);
      await expect.poll(() => link.textContent()).toContain("6");
      await page.clock.install();
      await page.clock.fastForward(61000);
      expect(await page.evaluate(() => (window as any).fetchCalls)).toBe(0);
      expect(requests).toBe(0);
      await page.clock.resume();
      await page.evaluate(() => {
        const w = window as any;
        w.previousSocket = w.testSocket;
        w.testSocket.readyState = 3;
        w.testSocket.onclose({ code: 1006, reason: "interrupción" });
      });
      await page.waitForFunction(() => {
        const w = window as any;
        return w.testSocket !== w.previousSocket && w.testSocket.readyState === 1;
      });
      await emit(2);
      await expect.poll(() => link.textContent()).toContain("2");
      await page.evaluate(() => {
        const w = window as any;
        w.testUser = { ...w.testUser, id: 2, tenant_id: 80 };
        w.renderSidebar();
      });
      await expect.poll(() => link.textContent()).not.toMatch(/\d/);
    } finally { await browser.close(); }
  }, 30000);
});
