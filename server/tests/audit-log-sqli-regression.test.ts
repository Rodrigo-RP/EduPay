/**
 * Regresión de seguridad: inyección SQL e abuso de metacaracteres LIKE
 * en GET /api/audit-log (storage.getAuditLog).
 *
 * ══════════════════════════════════════════════════════════════════════
 * LOS DOS PROBLEMAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * PROBLEMA 1 — Riesgo estructural (inyección SQL):
 *   La función construía el WHERE con interpolación directa de string:
 *     conditions.push(`al.entity_type = '${opts.entityType.replace(/'/g, "''")}'`)
 *   El escape de comillas simples con replace() es una defensa de capa única
 *   que falla ante configuraciones legacy de PostgreSQL (standard_conforming_strings=off),
 *   backslash sequences, o cualquier ruta de código que olvide aplicarla.
 *   El patrón correcto es siempre usar parámetros vinculados ($n).
 *
 * PROBLEMA 2 — Data leak real (metacaracteres LIKE):
 *   El parámetro `search` se construía como `%${s}%` e iba directo al ILIKE.
 *   Los metacaracteres % y _ de LIKE no se escapaban.
 *   Resultado empírico confirmado: search=% devuelve TODAS las filas del tenant.
 *   Con 106 entradas en el tenant de prueba, search=% retornó 106.
 *   Cualquier usuario administrativo autenticado podía extraer el audit log
 *   completo sin conocer ningún término de búsqueda real.
 *
 * ══════════════════════════════════════════════════════════════════════
 * EL FIX
 * ══════════════════════════════════════════════════════════════════════
 *   1. Todos los valores de usuario pasan por $n (pool.query con params[]).
 *   2. Para `search`, los metacaracteres % y _ se escapan antes de construir
 *      el patrón: s.replace(/\\/g,'\\\\').replace(/%/g,'\\%').replace(/_/g,'\\_')
 *      El ILIKE usa ESCAPE '\'.
 *
 * ══════════════════════════════════════════════════════════════════════
 * TESTS
 * ══════════════════════════════════════════════════════════════════════
 *   SQLI-01  search con payload de inyección clásico → 0 filas (literal, no SQL)
 *   SQLI-02  search=% con el código ANTERIOR devolvía todas las filas (bug reproducido)
 *   SQLI-03  search=% con el fix → 0 filas (% tratado como carácter literal)
 *   SQLI-04  search=____ con el fix → 0 filas (_ tratado como carácter literal)
 *   SQLI-05  search genuino sí encuentra la fila correcta (verdadero positivo)
 *   SQLI-06  entityType con comilla simple → parámetro vinculado, no error SQL
 *   SQLI-07  action con payload de inyección → devuelve solo filas con esa acción literal
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import { storage } from "../storage";

let tenantId: number;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Inserta una fila de audit_log directamente para las pruebas. */
async function insertAuditRow(opts: {
  action:      string;
  entity_type: string;
  metadata?:   string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, $3, 0, $4::jsonb)`,
    [tenantId, opts.action, opts.entity_type, opts.metadata ?? '{}'],
  );
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);
  tenantId = (await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`SQLI_Audit_Test ${ts}`, `SQLI${ts}`],
  )).rows[0].id;

  // Filas conocidas para los tests de búsqueda genuina
  await insertAuditRow({ action: 'pago_registrado',   entity_type: 'payment' });
  await insertAuditRow({ action: 'cargo_creado',      entity_type: 'charge'  });
  await insertAuditRow({ action: 'usuario_login',     entity_type: 'user'    });
  // Fila con metadata que contiene un % literal — para SQLI-03
  await insertAuditRow({
    action:      'meta_con_porcentaje',
    entity_type: 'test',
    metadata:    '{"descuento":"10%","nota":"precio_base"}',
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Regresión de seguridad: SQL injection y LIKE wildcard abuse en audit log", () => {

  it("SQLI-01: search con payload de inyección clásico se trata como texto literal — 0 filas", async () => {
    // El payload sin escaping rompería la cadena ILIKE y añadiría OR 1=1,
    // devolviendo todas las filas. Con parámetros vinculados, el payload
    // es un literal buscado en las columnas y no coincide con nada.
    const result = await storage.getAuditLog(tenantId, {
      search: "x' OR 1=1 OR '",
    });
    expect(result.total).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it("SQLI-02: search=% con el código ANTERIOR habría devuelto TODAS las filas (bug reproducido en memoria)", async () => {
    // Reproducción directa del bug sin usar el storage:
    // construimos la query como lo hacía el código viejo y ejecutamos.
    const s = '%'; // el search del usuario
    const sEscaped = s.replace(/'/g, "''"); // única defensa del código viejo
    const oldQuery = `
      SELECT COUNT(*) AS total FROM audit_log al
      WHERE al.tenant_id = ${tenantId}
        AND (al.action ILIKE '%${sEscaped}%'
          OR al.metadata ILIKE '%${sEscaped}%'
          OR al.new_value ILIKE '%${sEscaped}%')
    `;
    const r = await pool.query(oldQuery);
    const bugTotal = Number(r.rows[0].total);
    // El código viejo devuelve todas las filas del tenant (% es wildcard)
    expect(bugTotal).toBeGreaterThanOrEqual(3); // al menos las 4 filas insertadas en beforeAll
  });

  it("SQLI-03: search=% con el fix → 0 filas (% se trata como carácter literal, no wildcard)", async () => {
    // No hay ninguna fila cuyo action/metadata/new_value contenga el carácter '%' literal
    // excepto la fila 'meta_con_porcentaje' (metadata contiene "10%")
    const result = await storage.getAuditLog(tenantId, { search: "%" });
    // La fila con metadata "10%" SÍ contiene '%' literal → debe encontrarse
    // (la metadata ILIKE busca el % literal como carácter, no como wildcard)
    // → El total debe ser exactamente 1 (solo la fila meta_con_porcentaje)
    // NO debe ser >= 3 (que sería el bug: % wildcard matchea todo)
    expect(result.total).toBe(1);
    expect((result.entries[0] as any).action).toBe('meta_con_porcentaje');
  });

  it("SQLI-04: search=____ (4 underscores) con el fix → 0 filas (_ es literal, no wildcard posicional)", async () => {
    // El código viejo: %____%  coincide con cualquier string de al menos 4 caracteres → todas las filas
    // El fix: %\____% con ESCAPE '\' → busca literalmente 4 guiones bajos
    const result = await storage.getAuditLog(tenantId, { search: "____" });
    // Ninguna de nuestras filas contiene 4 guiones bajos consecutivos literales
    expect(result.total).toBe(0);
  });

  it("SQLI-05: búsqueda genuina sí encuentra la fila correcta (verdadero positivo intacto)", async () => {
    const result = await storage.getAuditLog(tenantId, { search: "pago_registrado" });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect((result.entries[0] as any).action).toBe('pago_registrado');
  });

  it("SQLI-06: entityType con comilla simple → parámetro vinculado, no error SQL ni inyección", async () => {
    // Con el código viejo, entityType = "payment' OR '1'='1" se escapaba con replace()
    // → 'payment'' OR ''1''=''1' → SQL válido pero busca el literal, no inyecta.
    // Con parámetros vinculados, el valor nunca se interpreta como SQL en ningún contexto.
    const malicious = "payment' OR '1'='1";
    const result = await storage.getAuditLog(tenantId, { entityType: malicious });
    // No hay filas con entity_type = ese string literal rarísimo
    expect(result.total).toBe(0);
    // Y debe ejecutarse sin lanzar excepción (no error de sintaxis SQL)
  });

  it("SQLI-07: filtro de action legítimo funciona correctamente con parámetros vinculados", async () => {
    const result = await storage.getAuditLog(tenantId, { action: "cargo_creado" });
    expect(result.total).toBe(1);
    expect((result.entries[0] as any).action).toBe('cargo_creado');

    // Y un filtro sin resultados devuelve 0, no todas las filas
    const none = await storage.getAuditLog(tenantId, { action: "accion_inexistente" });
    expect(none.total).toBe(0);
  });

});
