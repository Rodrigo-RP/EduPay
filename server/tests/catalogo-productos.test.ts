/**
 * CF-22 — Catálogo de Productos (tabla `products`)
 *
 * Dominio distinto de `concepts`: productos tienen precios por nivel académico
 * (KINDER / PRIMARIA / SECUNDARIA / BACHILLERATO) y metadata SAT para CFDI.
 *
 * CAT-01  GET sin token → 401
 * CAT-02  GET con asistente (sin PRODUCTS.READ) → 403
 * CAT-03  GET con administrador_campus → 200, lista vacía para campus nuevo
 * CAT-04  POST sin token → 401
 * CAT-05  POST con asistente (sin PRODUCTS.CONFIGURE) → 403, DB intacta
 * CAT-06  POST campos obligatorios faltantes → 400
 * CAT-07  POST categoría inválida → 400
 * CAT-08  POST administrador_campus → 201, persiste en DB con precios por nivel
 * CAT-09  GET tras POST → lista incluye el producto creado
 * CAT-10  PUT administrador_campus → 200, campos actualizados en DB
 * CAT-11  PATCH toggle activo → 200, DB refleja el cambio
 * CAT-12  DELETE administrador_campus → 200, registro eliminado de DB
 * CAT-13  GET / PUT / DELETE de otro campus (mismo tenant) → 403 o 404 (aislamiento)
 * CAT-14  POST código duplicado en mismo campus → 409
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── helpers ───────────────────────────────────────────────────────────────────
async function apiFetch(method: string, path: string, token?: string, body?: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const GET    = (p: string, t?: string)              => apiFetch("GET",    p, t);
const POST   = (p: string, t?: string, b?: object)  => apiFetch("POST",   p, t, b);
const PUT    = (p: string, t?: string, b?: object)  => apiFetch("PUT",    p, t, b);
const PATCH  = (p: string, t?: string, b?: object)  => apiFetch("PATCH",  p, t, b);
const DELETE = (p: string, t?: string)              => apiFetch("DELETE", p, t);

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let campusOtroId: number;   // para probar aislamiento

let tokenAsistente:   string;
let tokenAdminCampus: string;
let tokenAdminOtro:   string;

let createdProductId: number;

const PRODUCTO_BASE = {
  codigo:              "TEST-001",
  nombre:              "Colegiatura Test",
  descripcion:         "Producto de prueba",
  categoria:           "COLEGIATURAS",
  unidad_medida:       "SERVICIO",
  clave_sat:           "80101500",
  activo:              true,
  precio_kinder:       350000,
  precio_primaria:     450000,
  precio_secundaria:   550000,
  precio_bachillerato: 650000,
};

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CAT ${ts}`, `CAT${ts}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const c1Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CAT ${ts}`, tenantId],
  );
  campusId = (c1Row.rows[0] as any).id;

  const c2Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CAT Alt ${ts}`, tenantId],
  );
  campusOtroId = (c2Row.rows[0] as any).id;

  const insertUser = async (cId: number, role: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
      [cId, tenantId, `${role}.cat.${ts}.${cId}@test.mx`, `User ${role} ${ts}`, role],
    );
    return (r.rows[0] as any).id as number;
  };

  const idAsistente   = await insertUser(campusId,     "asistente");
  const idAdmin       = await insertUser(campusId,     "administrador_campus");
  const idAdminOtro   = await insertUser(campusOtroId, "administrador_campus");

  const tok = (id: number, role: string, cId: number) =>
    jwt.sign({ id, role, campus_id: cId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });

  tokenAsistente   = tok(idAsistente, "asistente",           campusId);
  tokenAdminCampus = tok(idAdmin,     "administrador_campus", campusId);
  tokenAdminOtro   = tok(idAdminOtro, "administrador_campus", campusOtroId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM products WHERE campus_id IN ($1,$2)`, [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE campus_id IN ($1,$2)`, [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`,        [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`,                [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-22 — GET /api/products", () => {
  it("CAT-01: sin token → 401", async () => {
    const { status } = await GET("/api/products");
    expect(status).toBe(401);
  });

  it("CAT-02: asistente (sin PRODUCTS.READ) → 403", async () => {
    const { status } = await GET("/api/products", tokenAsistente);
    expect(status).toBe(403);
  });

  it("CAT-03: administrador_campus → 200, lista vacía para campus nuevo", async () => {
    const { status, body } = await GET("/api/products", tokenAdminCampus);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // No productos creados aún para este campus
    const mios = (body as any[]).filter((p: any) => p.campus_id === campusId);
    expect(mios.length).toBe(0);
  });
});

describe("CF-22 — POST /api/products", () => {
  it("CAT-04: sin token → 401", async () => {
    const { status } = await POST("/api/products");
    expect(status).toBe(401);
  });

  it("CAT-05: asistente (sin PRODUCTS.CONFIGURE) → 403, DB intacta", async () => {
    const { status } = await POST("/api/products", tokenAsistente, PRODUCTO_BASE);
    expect(status).toBe(403);
    const r = await pool.query(`SELECT id FROM products WHERE campus_id=$1`, [campusId]);
    expect(r.rows.length).toBe(0);
  });

  it("CAT-06: sin campos obligatorios → 400", async () => {
    const { status } = await POST("/api/products", tokenAdminCampus, { nombre: "Solo nombre" });
    expect(status).toBe(400);
  });

  it("CAT-07: categoría inválida → 400", async () => {
    const { status } = await POST("/api/products", tokenAdminCampus, {
      ...PRODUCTO_BASE, categoria: "CATEGORIA_INEXISTENTE"
    });
    expect(status).toBe(400);
  });

  it("CAT-08: administrador_campus → 201, persiste en DB con 4 precios por nivel", async () => {
    const { status, body } = await POST("/api/products", tokenAdminCampus, PRODUCTO_BASE);
    expect(status).toBe(201);
    expect((body as any).id).toBeDefined();
    createdProductId = (body as any).id;

    // Verificación directa en DB
    const r = await pool.query(`SELECT * FROM products WHERE id=$1`, [createdProductId]);
    expect(r.rows.length).toBe(1);
    const row = r.rows[0] as any;
    expect(row.campus_id).toBe(campusId);
    expect(row.tenant_id).toBe(tenantId);
    expect(row.codigo).toBe("TEST-001");
    expect(row.nombre).toBe("Colegiatura Test");
    expect(row.categoria).toBe("COLEGIATURAS");
    expect(Number(row.precio_kinder)).toBe(350000);
    expect(Number(row.precio_primaria)).toBe(450000);
    expect(Number(row.precio_secundaria)).toBe(550000);
    expect(Number(row.precio_bachillerato)).toBe(650000);
    expect(row.activo).toBe(true);
  });

  it("CAT-09: GET tras POST → lista incluye el producto creado", async () => {
    const { status, body } = await GET("/api/products", tokenAdminCampus);
    expect(status).toBe(200);
    const found = (body as any[]).find((p: any) => p.id === createdProductId);
    expect(found).toBeDefined();
    expect(found.nombre).toBe("Colegiatura Test");
  });

  it("CAT-14: código duplicado en mismo campus → 409", async () => {
    const { status } = await POST("/api/products", tokenAdminCampus, {
      ...PRODUCTO_BASE, codigo: "TEST-001" // mismo código
    });
    expect(status).toBe(409);
  });
});

describe("CF-22 — PUT /api/products/:id", () => {
  it("CAT-10: administrador_campus → 200, campos actualizados en DB", async () => {
    const { status, body } = await PUT(
      `/api/products/${createdProductId}`,
      tokenAdminCampus,
      { nombre: "Colegiatura Test Actualizada", precio_kinder: 380000 },
    );
    expect(status).toBe(200);
    expect((body as any).nombre).toBe("Colegiatura Test Actualizada");

    // Verificar en DB
    const r = await pool.query(`SELECT nombre, precio_kinder FROM products WHERE id=$1`, [createdProductId]);
    expect((r.rows[0] as any).nombre).toBe("Colegiatura Test Actualizada");
    expect(Number((r.rows[0] as any).precio_kinder)).toBe(380000);
  });
});

describe("CF-22 — PATCH /api/products/:id (toggle activo)", () => {
  it("CAT-11: toggle activo false → 200, DB refleja el cambio", async () => {
    const { status, body } = await PATCH(
      `/api/products/${createdProductId}`,
      tokenAdminCampus,
      { activo: false },
    );
    expect(status).toBe(200);
    expect((body as any).activo).toBe(false);

    const r = await pool.query(`SELECT activo FROM products WHERE id=$1`, [createdProductId]);
    expect((r.rows[0] as any).activo).toBe(false);
  });
});

describe("CF-22 — Aislamiento de campus", () => {
  it("CAT-13: admin de otro campus no puede ver productos del primero", async () => {
    // Admin del campusOtro solo ve sus propios productos (campusOtro tiene 0)
    const { status, body } = await GET("/api/products", tokenAdminOtro);
    expect(status).toBe(200);
    const ajenos = (body as any[]).filter((p: any) => p.campus_id === campusId);
    expect(ajenos.length).toBe(0);
  });

  it("CAT-13b: PUT de producto del primer campus con token de otro → 404", async () => {
    const { status } = await PUT(
      `/api/products/${createdProductId}`,
      tokenAdminOtro,
      { nombre: "Hack" },
    );
    expect(status).toBe(404);
  });

  it("CAT-13c: DELETE de producto del primer campus con token de otro → 404", async () => {
    const { status } = await DELETE(`/api/products/${createdProductId}`, tokenAdminOtro);
    expect(status).toBe(404);
  });
});

describe("CF-22 — DELETE /api/products/:id", () => {
  it("CAT-12: administrador_campus → 200, registro eliminado de DB", async () => {
    const { status, body } = await DELETE(`/api/products/${createdProductId}`, tokenAdminCampus);
    expect(status).toBe(200);
    expect((body as any).deleted).toBe(true);

    // Verificar eliminación en DB
    const r = await pool.query(`SELECT id FROM products WHERE id=$1`, [createdProductId]);
    expect(r.rows.length).toBe(0);
  });

  it("CAT-12b: DELETE de producto inexistente → 404", async () => {
    const { status } = await DELETE(`/api/products/999999999`, tokenAdminCampus);
    expect(status).toBe(404);
  });
});
