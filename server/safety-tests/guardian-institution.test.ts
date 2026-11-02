import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
const state = vi.hoisted(() => ({ query: vi.fn(async (sql: string, values?: number[]) => ({
  rows: sql.includes("JOIN tenants") ? values?.[1] === 7 ? [
    { nombre_legal: "Escuela del tutor", logo_url: "/logo.svg", rfc: "No debe salir", direccion_fiscal: "Privado" },
  ] : [] : [{ password_changed_at: null }],
})) }));
vi.mock("../db", () => ({ db: {}, pool: state }));
vi.mock("../storage", () => ({ storage: {} }));
import { JWT_SECRET } from "../routes/shared";
import { registerGuardianInstitutionRoute } from "../routes/guardian-institution";
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  registerGuardianInstitutionRoute(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Puerto de prueba no disponible");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
const request = (tenant = 7, type = "guardian") => fetch(`${base}/api/guardian/institutional-info?tenant_id=999&campus_id=999`, {
  headers: { Authorization: `Bearer ${jwt.sign({ id: 42, tenant_id: tenant, type, password_version: 0 }, JWT_SECRET, { expiresIn: "1h" })}` },
});
it("tutor recibe exclusivamente nombre/logo, scope de sesión y no parámetros del cliente", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ nombre_legal: "Escuela del tutor", logo_url: "/logo.svg" });
  expect(state.query.mock.calls.find(c => c[0].includes("JOIN tenants"))?.[1]).toEqual([42, 7]);
});
it("otro tenant no encuentra la institución", async () => {
  expect((await request(8)).status).toBe(404);
});
it("personal no puede usar la ruta de tutor", async () => {
  expect((await request(7, "user")).status).toBe(403);
});
