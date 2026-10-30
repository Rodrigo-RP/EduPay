import express from "express";
import type { Server } from "node:http";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { integerWithExistingLimits } from "../../shared/zod-compat";

const database = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("../db", () => ({
  pool: { query: database.query, connect: database.connect },
  db: {},
}));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../routes/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("../routes/shared")>();
  const authenticated: express.RequestHandler = (req, _res, next) => {
    Object.assign(req, {
      user: { id: 1, role: "super_admin", tenant_id: 1, campus_id: 1 },
    });
    next();
  };
  return { ...actual, authenticateToken: authenticated, hasPermissionForUser: () => true };
});

import { registerAdminRoutes, scholarshipTypePayloadSchema } from "../routes/admin";

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Falta puerto de prueba");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

function scholarship(concepts: unknown[], percentage: unknown = 25) {
  return {
    nombre: "Beca de prueba", categoria: "academica", algoritmo: "manual",
    beneficio: { porcentaje_descuento: percentage, aplica_conceptos: concepts },
  };
}

describe("Zod 4: arreglos acotados, sin SQL", () => {
  it("una petición de 50 KB genera un solo error, responde 400 y no toca la base", async () => {
    const payload = scholarship(Array(10_000).fill(null));
    const serialized = JSON.stringify(payload);
    expect(Buffer.byteLength(serialized)).toBeGreaterThan(50_000);
    expect(Buffer.byteLength(serialized)).toBeLessThan(51_000);
    const result = scholarshipTypePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("No debe admitir más de veinte conceptos");
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({
      code: "too_big", maximum: 20, path: ["beneficio", "aplica_conceptos"],
    });
    const response = await fetch(`${origin}/api/admin/scholarship-types`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: serialized,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: result.error.issues[0].message });
    expect(database.query).not.toHaveBeenCalled();
    expect(database.connect).not.toHaveBeenCalled();
  });

  it("retiene 250 resultados grandes con un heap máximo de 64 MiB sin agotarlo", () => {
    const child = spawnSync(process.execPath, ["--max-old-space-size=64", "--input-type=module", "-e", `
      import { z } from "zod/v4";
      const schema = z.object({
        aplica_conceptos: z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional(),
      });
      const payload = { aplica_conceptos: Array(10000).fill(null) };
      const results = Array.from({ length: 250 }, () => schema.safeParse(payload));
      const issues = results.reduce((sum, result) => sum + (result.success ? 0 : result.error.issues.length), 0);
      console.log(JSON.stringify({ requests: results.length, issues }));
    `], { encoding: "utf8", timeout: 10_000 });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({ requests: 250, issues: 250 });
  });
});

describe("Compatibilidad: campos, límites y mensajes anteriores", () => {
  it.each([0, 21])("conserva el rechazo de %i conceptos", count => {
    expect(scholarshipTypePayloadSchema.safeParse(scholarship(Array(count).fill("colegiatura"))).success).toBe(false);
  });
  it.each([1, 20])("conserva la aceptación de %i conceptos", count => {
    expect(scholarshipTypePayloadSchema.safeParse(scholarship(Array(count).fill("colegiatura"))).success).toBe(true);
  });
  it.each([0, 25, 100, "25"])("conserva el porcentaje válido %s", percentage => {
    expect(scholarshipTypePayloadSchema.safeParse(scholarship(["colegiatura"], percentage)).success).toBe(true);
  });
  it.each([-1, 12.5, 100.01, 101])("conserva el rechazo del porcentaje %s", percentage => {
    expect(scholarshipTypePayloadSchema.safeParse(scholarship(["colegiatura"], percentage)).success).toBe(false);
  });
  it("conserva defaults y el recorte de espacios", () => {
    expect(scholarshipTypePayloadSchema.parse({
      nombre: " Beca ", categoria: "academica", algoritmo: "manual",
      beneficio: { porcentaje_descuento: "25" },
    })).toEqual({
      nombre: "Beca", categoria: "academica", algoritmo: "manual", activo: true,
      beneficio: { porcentaje_descuento: 25, aplica_conceptos: ["colegiatura"], vigencia_meses: 12 },
      criterios: [],
    });
  });
  it("no añade el límite de entero seguro de Zod 4 ni modifica el mensaje previo", () => {
    const schema = integerWithExistingLimits(z.number());
    expect(schema.parse(Number.MAX_SAFE_INTEGER + 1)).toBe(Number.MAX_SAFE_INTEGER + 1);
    const result = schema.safeParse(12.5);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Expected integer, received float");
  });
  it("conserva la forma permisiva de los UUID, sin admitir texto arbitrario", () => {
    const schema = z.guid({ error: "Invalid uuid" });
    expect(schema.safeParse("11111111-1111-1111-1111-111111111111").success).toBe(true);
    const result = schema.safeParse("no-es-un-identificador");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Invalid uuid");
  });
  it("conserva el mensaje español del formulario", () => {
    const result = z.string().email("Email inválido").safeParse("sin-arroba");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Email inválido");
  });
});
