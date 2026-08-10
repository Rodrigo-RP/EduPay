/**
 * Tarea #128 — POST /api/charges/generate con product_id
 *
 * CGP-01  product_id PRIMARIA → charge creado con precio_primaria (verificado en DB)
 * CGP-02  product_id KINDER   → charge creado con precio_kinder   (verificado en DB)
 * CGP-03  product_id con precio 0 para el nivel del alumno → 422
 * CGP-04  product_id de otro campus → 403
 * CGP-05  product_id + monto_manual juntos → precio del catálogo gana (monto_manual ignorado, verificado en DB)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
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
const POST = (p: string, t?: string, b?: object) => apiFetch("POST", p, t, b);

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId:      number;
let campusId:      number;
let campusOtroId:  number;

let tokenAdmin:    string;   // administrador_campus del campus principal
let tokenAdminOtro: string;  // administrador_campus del campus ajeno

let productId:         number;   // precio_kinder=350000, precio_primaria=450000, precio_secundaria=550000, precio_bachillerato=650000
let productSinKinder:  number;   // precio_kinder=0 → 422 para alumnos KINDER
let productOtro:       number;   // campus ajeno

let studentKinderId:  number;    // grado 'K2'        → KINDER
let studentPrimariaId: number;   // grado '3° PRIMARIA' → PRIMARIA

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  // Tenant
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CGP ${ts}`, `CGP${ts}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  // Campuses
  const c1Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CGP ${ts}`, tenantId],
  );
  campusId = (c1Row.rows[0] as any).id;

  const c2Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CGP Alt ${ts}`, tenantId],
  );
  campusOtroId = (c2Row.rows[0] as any).id;

  // Users
  const insertUser = async (cId: number, role: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
      [cId, tenantId, `${role}.cgp.${ts}.${cId}@test.mx`, `User CGP ${ts}`, role],
    );
    return (r.rows[0] as any).id as number;
  };
  const idAdmin     = await insertUser(campusId,    "administrador_campus");
  const idAdminOtro = await insertUser(campusOtroId,"administrador_campus");

  const tok = (id: number, role: string, cId: number) =>
    jwt.sign({ id, role, campus_id: cId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });

  tokenAdmin     = tok(idAdmin,     "administrador_campus", campusId);
  tokenAdminOtro = tok(idAdminOtro, "administrador_campus", campusOtroId);

  // Producto A — 4 precios configurados
  const p1Row = await pool.query(
    `INSERT INTO products (campus_id, tenant_id, codigo, nombre, categoria, unidad_medida, activo,
       precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato)
     VALUES ($1,$2,'CGP-001','Colegiatura CGP','COLEGIATURAS','SERVICIO',true,
       350000,450000,550000,650000) RETURNING id`,
    [campusId, tenantId],
  );
  productId = (p1Row.rows[0] as any).id;

  // Producto B — precio_kinder=0 (nivel sin precio)
  const p2Row = await pool.query(
    `INSERT INTO products (campus_id, tenant_id, codigo, nombre, categoria, unidad_medida, activo,
       precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato)
     VALUES ($1,$2,'CGP-002','Sin Kinder CGP','COLEGIATURAS','SERVICIO',true,
       0,450000,550000,650000) RETURNING id`,
    [campusId, tenantId],
  );
  productSinKinder = (p2Row.rows[0] as any).id;

  // Producto C — campus ajeno
  const p3Row = await pool.query(
    `INSERT INTO products (campus_id, tenant_id, codigo, nombre, categoria, unidad_medida, activo,
       precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato)
     VALUES ($1,$2,'CGP-003','Producto Otro Campus','COLEGIATURAS','SERVICIO',true,
       300000,400000,500000,600000) RETURNING id`,
    [campusOtroId, tenantId],
  );
  productOtro = (p3Row.rows[0] as any).id;

  // Alumnos activos en campus principal
  const sK = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo,
       grado, status)
     VALUES ($1,$2,'Alumno','Kinder CGP','Alumno Kinder CGP','K2','activo') RETURNING id`,
    [campusId, tenantId],
  );
  studentKinderId = (sK.rows[0] as any).id;

  const sP = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo,
       grado, status)
     VALUES ($1,$2,'Alumno','Primaria CGP','Alumno Primaria CGP','3° PRIMARIA','activo') RETURNING id`,
    [campusId, tenantId],
  );
  studentPrimariaId = (sP.rows[0] as any).id;
});

afterAll(async () => {
  // Limpiar charges generados por los tests
  await pool.query(
    `DELETE FROM charges WHERE student_id IN ($1,$2)`,
    [studentKinderId, studentPrimariaId],
  ).catch(() => {});
  await pool.query(
    `DELETE FROM students WHERE id IN ($1,$2)`,
    [studentKinderId, studentPrimariaId],
  ).catch(() => {});
  await pool.query(
    `DELETE FROM products WHERE campus_id IN ($1,$2)`,
    [campusId, campusOtroId],
  ).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE campus_id IN ($1,$2)`, [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`,        [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`,                [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Tarea #128 — POST /api/charges/generate con product_id", () => {

  it("CGP-01: product_id + nivel PRIMARIA → charge creado con precio_primaria=450000 (verificado en DB)", async () => {
    // Limpia charges previos de este alumno para que sea determinista
    await pool.query(`DELETE FROM charges WHERE student_id=$1`, [studentPrimariaId]);

    const { status, body } = await POST(
      "/api/charges/generate",
      tokenAdmin,
      {
        product_id:        productId,
        nivel_academico:   "PRIMARIA",
        fecha_emision:     "2026-08-10",
        fecha_vencimiento: "2026-09-10",
      },
    );

    expect(status).toBe(201);
    expect(body.charges_created).toBe(1);
    expect(body.summary[0].base_amount).toBe(450000);

    // Verificación en DB
    const dbRow = await pool.query(
      `SELECT monto_base_centavos FROM charges WHERE student_id=$1 ORDER BY id DESC LIMIT 1`,
      [studentPrimariaId],
    );
    expect(dbRow.rows.length).toBe(1);
    expect(Number((dbRow.rows[0] as any).monto_base_centavos)).toBe(450000);
  });

  it("CGP-02: product_id + nivel KINDER → charge creado con precio_kinder=350000 (verificado en DB)", async () => {
    await pool.query(`DELETE FROM charges WHERE student_id=$1`, [studentKinderId]);

    const { status, body } = await POST(
      "/api/charges/generate",
      tokenAdmin,
      {
        product_id:        productId,
        nivel_academico:   "KINDER",
        fecha_emision:     "2026-08-10",
        fecha_vencimiento: "2026-09-10",
      },
    );

    expect(status).toBe(201);
    expect(body.charges_created).toBe(1);
    expect(body.summary[0].base_amount).toBe(350000);

    const dbRow = await pool.query(
      `SELECT monto_base_centavos FROM charges WHERE student_id=$1 ORDER BY id DESC LIMIT 1`,
      [studentKinderId],
    );
    expect(dbRow.rows.length).toBe(1);
    expect(Number((dbRow.rows[0] as any).monto_base_centavos)).toBe(350000);
  });

  it("CGP-03: product_id con precio_kinder=0 + alumno KINDER → 422 (nivel sin precio configurado)", async () => {
    const { status, body } = await POST(
      "/api/charges/generate",
      tokenAdmin,
      {
        product_id:        productSinKinder,
        nivel_academico:   "KINDER",
        fecha_emision:     "2026-08-10",
        fecha_vencimiento: "2026-09-10",
      },
    );

    expect(status).toBe(422);
    expect(body.nivel).toBe("KINDER");

    // Confirmar que no se creó ningún charge en DB
    const dbRow = await pool.query(
      `SELECT id FROM charges WHERE student_id=$1 AND monto_base_centavos=0 ORDER BY id DESC LIMIT 1`,
      [studentKinderId],
    );
    expect(dbRow.rows.length).toBe(0);
  });

  it("CGP-04: product_id de otro campus → 403", async () => {
    const { status } = await POST(
      "/api/charges/generate",
      tokenAdmin,         // token del campus A
      {
        product_id:        productOtro,  // producto del campus B
        nivel_academico:   "PRIMARIA",
        fecha_emision:     "2026-08-10",
        fecha_vencimiento: "2026-09-10",
      },
    );

    expect(status).toBe(403);
  });

  it("CGP-05: product_id + monto_manual juntos → precio del catálogo gana (monto_manual=999999 ignorado), verificado en DB", async () => {
    await pool.query(`DELETE FROM charges WHERE student_id=$1`, [studentPrimariaId]);

    const { status, body } = await POST(
      "/api/charges/generate",
      tokenAdmin,
      {
        product_id:            productId,
        nivel_academico:       "PRIMARIA",
        fecha_emision:         "2026-08-10",
        fecha_vencimiento:     "2026-09-10",
        monto_manual:          999999,   // debe ser ignorado
      },
    );

    // El endpoint debe responder 201 con el precio del catálogo, no 999999
    expect(status).toBe(201);
    expect(body.summary[0].base_amount).toBe(450000);
    expect(body.summary[0].base_amount).not.toBe(999999);

    const dbRow = await pool.query(
      `SELECT monto_base_centavos FROM charges WHERE student_id=$1 ORDER BY id DESC LIMIT 1`,
      [studentPrimariaId],
    );
    expect(Number((dbRow.rows[0] as any).monto_base_centavos)).toBe(450000);
    expect(Number((dbRow.rows[0] as any).monto_base_centavos)).not.toBe(999999);
  });

});
