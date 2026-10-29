import { afterAll, beforeAll, expect, it, vi } from "vitest";
import express from "express";
vi.mock("../db", () => ({ db: {}, pool: { query: vi.fn() } }));
vi.mock("../storage", () => ({ storage: {} }));
import { registerUserRoutes } from "../routes/users";
import { pool } from "../db";
import { apiNotFound } from "../lib/api-not-found";
let server: any, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); registerUserRoutes(app);
  app.use("/api", apiNotFound);
  app.use((_req, res) => res.status(200).send("frontend"));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));
it("POST /api/auth/platform-login no existe: 404 sin ejecutar SQL", async () => {
  const response = await fetch(`${base}/api/auth/platform-login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ message: "Ruta no encontrada" });
  expect((await fetch(`${base}/api/profile`)).status).toBe(401);
  expect((await fetch(`${base}/una-pantalla`)).status).toBe(200);
  expect(pool.query).not.toHaveBeenCalled();
});
