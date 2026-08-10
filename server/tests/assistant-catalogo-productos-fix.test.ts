/**
 * Tests para los dos bugs del asistente sobre /catalogo-productos (tarea #129)
 *
 * Bug 1 — Health check consultaba `concepts` en vez de `products`:
 *   ACP-01  campus con productos pero SIN conceptos → check "Tabla de productos responde" ok=true
 *   ACP-02  campus con productos pero SIN conceptos → check "Existen productos registrados" ok=true
 *   ACP-03  campus SIN productos pero CON conceptos → check "Existen productos registrados" ok=false
 *           (confirma que ya no hay salud falsa basada en la tabla equivocada)
 *
 * Bug 2 — administrador_campus no estaba en el array roles de /catalogo-productos:
 *   ACP-04  administrador_campus + "ver precios por nivel" → matchIntent navega a /catalogo-productos
 *   ACP-05  administrador_campus + "precio kinder" → matchIntent navega a /catalogo-productos
 *   ACP-06  administrador_campus + "agregar producto" → matchIntent navega a /catalogo-productos
 *   ACP-07  asistente + "ver precios por nivel" → NO navega a /catalogo-productos (rol sin acceso)
 *
 * Verificación de keywords eliminadas (no regresión):
 *   ACP-08  "crear concepto" con administrador_campus NO aterriza en /catalogo-productos
 *           (esa keyword pertenece a la pantalla de concepts, no a products)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import { MODULE_CHECKS, CheckContext } from "../assistant-health-checks";
import { matchIntent } from "../assistant-knowledge";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Busca el bloque de health checks del moduleId indicado */
function getModuleChecks(moduleId: string) {
  const block = MODULE_CHECKS.find(m => m.moduleId === moduleId);
  if (!block) throw new Error(`moduleId '${moduleId}' no encontrado en MODULE_CHECKS`);
  return block.checks;
}

async function runCheck(moduleId: string, checkName: string, ctx: CheckContext) {
  const checks = getModuleChecks(moduleId);
  const check = checks.find(c => c.name === checkName);
  if (!check) throw new Error(`Check '${checkName}' no encontrado en módulo '${moduleId}'`);
  return check.run(ctx);
}

// ── fixtures ──────────────────────────────────────────────────────────────────
// IMPORTANTE: los dos campus usan tenants distintos para que el fallback
// tenant-level del health check no encuentre productos del otro campus.
let tenantConProductos: number;
let tenantSinProductos: number;
let campusConProductos: number;  // tenant propio, tiene productos, sin conceptos
let campusSinProductos: number;  // tenant propio, tiene conceptos, sin productos

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  // Tenant A — campus con productos
  const t1Row = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant ACP Con ${ts}`, `ACPA${ts}`],
  );
  tenantConProductos = (t1Row.rows[0] as any).id;

  const c1Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus ACP Con Productos ${ts}`, tenantConProductos],
  );
  campusConProductos = (c1Row.rows[0] as any).id;

  await pool.query(
    `INSERT INTO products (campus_id, tenant_id, codigo, nombre, categoria, unidad_medida, activo,
       precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato)
     VALUES ($1,$2,'ACP-001','Colegiatura Test ACP','COLEGIATURAS','SERVICIO',true,
       350000,450000,550000,650000)`,
    [campusConProductos, tenantConProductos],
  );

  // Tenant B — campus sin productos (solo conceptos)
  const t2Row = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant ACP Sin ${ts}`, `ACPB${ts}`],
  );
  tenantSinProductos = (t2Row.rows[0] as any).id;

  const c2Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus ACP Sin Productos ${ts}`, tenantSinProductos],
  );
  campusSinProductos = (c2Row.rows[0] as any).id;

  await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Colegiatura ACP','colegiatura','mensual',450000)`,
    [campusSinProductos, tenantSinProductos],
  );
  // Sin ningún producto en tenantSinProductos — el fallback tenant no encontrará nada
});

afterAll(async () => {
  await pool.query(`DELETE FROM products WHERE campus_id=$1`, [campusConProductos]).catch(() => {});
  await pool.query(`DELETE FROM concepts WHERE campus_id=$1`, [campusSinProductos]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`, [campusConProductos, campusSinProductos]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id IN ($1,$2)`, [tenantConProductos, tenantSinProductos]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Bug 1 — health check de catalogo-productos consulta products (no concepts)", () => {

  it("ACP-01: campus con productos → 'Tabla de productos responde' ok=true", async () => {
    const ctx: CheckContext = { tenantId: tenantConProductos, campusId: campusConProductos, userId: 0 };
    const result = await runCheck("catalogo-productos", "Tabla de productos responde", ctx);
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/producto/i);
    expect(result.detail).not.toMatch(/concepto/i);
  });

  it("ACP-02: campus con productos → 'Existen productos registrados' ok=true", async () => {
    const ctx: CheckContext = { tenantId: tenantConProductos, campusId: campusConProductos, userId: 0 };
    const result = await runCheck("catalogo-productos", "Existen productos registrados", ctx);
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/producto/i);
  });

  it("ACP-03: campus SIN productos (pero CON conceptos) → 'Existen productos registrados' ok=false — ya no hay salud falsa", async () => {
    // tenantSinProductos no tiene ningún producto → el fallback a nivel tenant tampoco encuentra nada
    const ctx: CheckContext = { tenantId: tenantSinProductos, campusId: campusSinProductos, userId: 0 };
    const result = await runCheck("catalogo-productos", "Existen productos registrados", ctx);
    // Con el bug antiguo (query a concepts), este check devolvía ok=true porque había conceptos.
    // Con la corrección (query a products), devuelve ok=false porque no hay productos.
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/No hay productos/i);
  });

});

describe("Bug 2 — administrador_campus puede navegar a /catalogo-productos", () => {

  it("ACP-04: administrador_campus + 'ver precios por nivel' → navega a /catalogo-productos", () => {
    const r = matchIntent("ver precios por nivel", "administrador_campus");
    expect(r.navigate?.route).toBe("/catalogo-productos");
  });

  it("ACP-05: administrador_campus + 'precio kinder' → navega a /catalogo-productos", () => {
    const r = matchIntent("precio kinder", "administrador_campus");
    expect(r.navigate?.route).toBe("/catalogo-productos");
  });

  it("ACP-06: administrador_campus + 'agregar producto' → navega a /catalogo-productos", () => {
    const r = matchIntent("agregar producto", "administrador_campus");
    expect(r.navigate?.route).toBe("/catalogo-productos");
  });

  it("ACP-07: asistente + 'ver precios por nivel' → NO navega a /catalogo-productos (rol sin acceso)", () => {
    const r = matchIntent("ver precios por nivel", "asistente");
    // El asistente no tiene PRODUCTS.READ, no debe recibir esa ruta
    expect(r.navigate?.route).not.toBe("/catalogo-productos");
  });

});

describe("Verificación de keywords eliminadas — no regresión", () => {

  it("ACP-08: 'crear concepto' con administrador_campus NO aterriza en /catalogo-productos", () => {
    // 'crear concepto' pertenece al dominio de concepts, no de products.
    // Fue eliminada de las keywords de /catalogo-productos.
    const r = matchIntent("quiero crear un concepto de cobro", "administrador_campus");
    // Puede navegar a otra ruta (concepts, configuracion, etc.) pero NO a /catalogo-productos
    expect(r.navigate?.route).not.toBe("/catalogo-productos");
  });

});
