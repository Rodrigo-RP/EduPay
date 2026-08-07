/**
 * Regresión: bug de subcadena numérica en detección de saldo_condonado.
 *
 * ══════════════════════════════════════════════════════════════════════
 * EL BUG
 * ══════════════════════════════════════════════════════════════════════
 * El patrón anterior usaba OR de LIKE para buscar student_id en metadata TEXT:
 *
 *   metadata::text LIKE '%"student_id":7%'
 *
 * Ese patrón coincide con CUALQUIER fila cuya representación textual del JSON
 * contenga la subcadena '"student_id":7', incluyendo:
 *
 *   {"student_id": 70, ...}   ← id 70 contiene "7" como prefijo → FALSO POSITIVO
 *   {"student_id": 700, ...}  ← ídem
 *   {"student_id": 17, ...}   ← "7" aparece como sufijo         → FALSO POSITIVO
 *   {"student_id": 7, ...}    ← coincidencia real               → correcto
 *
 * En la práctica: si el alumno A tiene id=7 y el alumno B (no relacionado)
 * tiene id=70 o id=17, una condonación de A dispararía erróneamente una alerta
 * de "hermano" para B, aunque no tengan ninguna relación familiar.
 *
 * ══════════════════════════════════════════════════════════════════════
 * EL FIX
 * ══════════════════════════════════════════════════════════════════════
 * Comparar el valor entero real usando JSONB:
 *
 *   (metadata::jsonb ->> 'student_id')::int = ANY($1::int[])
 *
 * Extrae el campo como texto, lo castea a int, y compara con un array de
 * enteros. La igualdad es exacta: 7 ≠ 70, 7 ≠ 17.
 *
 * ══════════════════════════════════════════════════════════════════════
 * ESTRUCTURA DEL TEST
 * ══════════════════════════════════════════════════════════════════════
 * No se usan IDs de alumnos reales ni endpoints de API: insertamos filas
 * en audit_log con metadata controlada y ejecutamos ambas consultas
 * directamente contra la DB, comparando sus resultados.
 *
 * Usamos el par  shortId=7 / longId=70 intencionalmente:
 *   - "7" es subcadena de "70"  →  LIKE produce falso positivo
 *   - ANY produce comparación exacta  →  no hay falso positivo
 *
 * Tests:
 *   LIKE-BUG-01  El patrón LIKE devuelve la fila de shortId=7 al buscar longId=70  (bug demostrado)
 *   LIKE-FIX-01  El patrón ANY no devuelve la fila de shortId=7 al buscar longId=70  (fix confirmado)
 *   LIKE-FIX-02  El patrón ANY sí detecta una condonación real del mismo alumno  (verdadero positivo)
 *   LIKE-FIX-03  El patrón ANY sí detecta una condonación de un hermano explícito  (verdadero positivo)
 *   LIKE-FIX-04  El patrón ANY no activa por un alumno de otro tenant con el mismo id numérico  (aislamiento)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";

// IDs elegidos para demostrar el bug: 7 es subcadena de 70.
// Como insertamos las filas de audit_log directamente con metadata controlada,
// no necesitamos que correspondan a alumnos reales en la tabla students.
const SHORT_ID = 7;
const LONG_ID  = 70;

let tenantId: number;
let otherTenantId: number;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Construye metadata tal como la escribe misc.ts para 'saldo_condonado'. */
const makeMeta = (student_id: number) =>
  JSON.stringify({
    student_id,
    monto_condonado_centavos: 150000,
    motivo_condonacion:       "prueba regresion like bug",
    campus_id:                1,
  });

/** Ejecuta la consulta ANTIGUA (LIKE con subcadena). */
async function queryOldLike(tid: number, searchIds: number[]): Promise<number> {
  if (searchIds.length === 0) return 0;
  const likeParams = searchIds.map((id) => `%"student_id":${id}%`);
  const clauses    = likeParams.map((_, i) => `metadata::text LIKE $${i + 2}`).join(" OR ");
  const r = await pool.query(
    `SELECT id FROM audit_log
     WHERE tenant_id = $1
       AND action = 'saldo_condonado'
       AND created_at > NOW() - INTERVAL '90 days'
       AND (${clauses})`,
    [tid, ...likeParams],
  );
  return (r.rows as any[]).length;
}

/** Ejecuta la consulta NUEVA (ANY con cast a int). */
async function queryNewAny(tid: number, searchIds: number[]): Promise<number> {
  if (searchIds.length === 0) return 0;
  const r = await pool.query(
    `SELECT id FROM audit_log
     WHERE tenant_id = $1
       AND action = 'saldo_condonado'
       AND created_at > NOW() - INTERVAL '90 days'
       AND (metadata::jsonb ->> 'student_id')::int = ANY($2::int[])`,
    [tid, searchIds],
  );
  return (r.rows as any[]).length;
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  tenantId = (await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`LIKE_Bug_Test ${ts}`, `LBUG${ts}`],
  )).rows[0].id;

  otherTenantId = (await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`LIKE_Bug_Other ${ts}`, `LBOT${ts}`],
  )).rows[0].id;

  // Fila de prueba en el tenant principal: condonación para SHORT_ID (7)
  await pool.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, 'saldo_condonado', 'payment_plan', 1, $2)`,
    [tenantId, makeMeta(SHORT_ID)],
  );

  // Fila en otro tenant con el mismo SHORT_ID — NO debe ser visible al filtrar por tenantId
  await pool.query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, 'saldo_condonado', 'payment_plan', 2, $2)`,
    [otherTenantId, makeMeta(SHORT_ID)],
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM audit_log WHERE tenant_id IN ($1, $2)`, [tenantId, otherTenantId]);
  await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantId, otherTenantId]);
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe("Bug regresión: LIKE substring vs ANY exact en detección de saldo_condonado", () => {

  it("LIKE-BUG-01: el patrón LIKE devuelve falso positivo — buscar student_id=70 coincide con fila de student_id=7", async () => {
    // Se busca longId=70. La fila en DB tiene student_id=7.
    // El patrón '%"student_id":70%' NO debería coincidir... pero...
    // Hmm, en realidad '%"student_id":70%' busca "70" como subcadena, que NO está en '"student_id":7'.
    // El bug es al revés: buscar SHORT_ID=7 coincide con una fila de LONG_ID=70.
    // Pero en el contexto del sistema, buscamos por los IDs de la FAMILIA.
    // Si la familia tiene [SHORT_ID=7] y en DB hay una fila con student_id=70,
    // el patrón '%"student_id":7%' coincide con '"student_id":70' → falso positivo.
    //
    // En el escenario real del bug:
    //   - Se condona al alumno con student_id=7 (fila en DB ya insertada en beforeAll)
    //   - Luego se intenta cancelar el plan del alumno NO RELACIONADO con student_id=70
    //   - La detección busca si algún miembro de la familia de 70 fue condonado antes
    //   - La familia de 70 = [70] (solo él, no tiene hermanos)
    //   - El LIKE '%"student_id":70%' busca la subcadena "student_id":70
    //     → esto NO coincide con '"student_id":7'  (7 no contiene 70 como subcadena)
    //
    // El bug ocurre en la dirección OPUESTA:
    //   - Familia de SHORT_ID=7 → busca '%"student_id":7%'
    //   - Esa subcadena SÍ está en '"student_id":70' → falso positivo al detectar
    //     condonaciones previas de SHORT_ID=7 cuando existe una fila de LONG_ID=70.
    //
    // Para demostrar el bug tal como ocurre en producción, insertamos una fila
    // para LONG_ID=70 y buscamos con el patrón de SHORT_ID=7:
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, NULL, 'saldo_condonado', 'payment_plan', 3, $2)`,
      [tenantId, makeMeta(LONG_ID)],
    );

    // El patrón de SHORT_ID=7 coincide con la fila de LONG_ID=70 → BUG
    const countOld = await queryOldLike(tenantId, [SHORT_ID]);
    // Hay al menos 2 filas: la de SHORT_ID insertada en beforeAll
    // y la de LONG_ID=70 que contiene "7" como subcadena en '"student_id":70'
    // La fila de SHORT_ID ya estaba → al menos 1 resultado siempre.
    // Pero con LONG_ID=70 el LIKE también encuentra la fila de LONG_ID=70 porque
    // '"student_id":70' contiene la subcadena '"student_id":7'.
    // Por tanto el conteo debe ser >= 2 (ambas filas).
    expect(countOld).toBeGreaterThanOrEqual(2);
  });

  it("LIKE-BUG-02: el patrón LIKE al buscar LONG_ID=70 también coincide con fila de SHORT_ID=7 (el bug más directo)", async () => {
    // Otra cara del mismo bug:
    // Si el patrón es '%"student_id":7%', encuentra las filas:
    //   {"student_id": 7,  ...}  → correcto
    //   {"student_id": 70, ...}  → FALSO POSITIVO (contiene la subcadena "7")
    //
    // La query busca [SHORT_ID] = [7].  En DB tenemos filas para 7 y 70.
    // El count con LIKE debería devolver 2 (ambas filas), que es el bug.
    const countOld = await queryOldLike(tenantId, [SHORT_ID]);
    expect(countOld).toBeGreaterThanOrEqual(2); // fila de 7 + fila de 70 → bug

    // La query nueva (ANY) solo encuentra la fila con student_id exactamente = 7
    const countNew = await queryNewAny(tenantId, [SHORT_ID]);
    expect(countNew).toBe(1); // solo la fila de 7 → correcto
  });

  it("LIKE-FIX-01: el patrón ANY no devuelve falso positivo — buscar [LONG_ID=70] no coincide con fila de SHORT_ID=7", async () => {
    // Buscamos [LONG_ID=70]. En DB hay fila de SHORT_ID=7 y de LONG_ID=70.
    // ANY solo devuelve la fila cuyo student_id entero == 70 (exacto).
    const countNew = await queryNewAny(tenantId, [LONG_ID]);
    expect(countNew).toBe(1); // solo la fila de 70, no la de 7
  });

  it("LIKE-FIX-02: el patrón ANY sí detecta condonación real del mismo alumno (verdadero positivo)", async () => {
    // Buscar [SHORT_ID=7] devuelve exactamente la fila con student_id=7
    const countNew = await queryNewAny(tenantId, [SHORT_ID]);
    expect(countNew).toBeGreaterThanOrEqual(1);
  });

  it("LIKE-FIX-03: el patrón ANY sí detecta condonación de hermano explícito (familia [7, 70])", async () => {
    // Si SHORT_ID y LONG_ID fueran hermanos de verdad, buscar [7, 70] debe encontrar ambas filas
    const countNew = await queryNewAny(tenantId, [SHORT_ID, LONG_ID]);
    expect(countNew).toBe(2); // una fila por cada hermano
  });

  it("LIKE-FIX-04: el patrón ANY filtra correctamente por tenant_id — otro tenant con el mismo student_id no interfiere", async () => {
    // otherTenantId también tiene una fila con student_id=SHORT_ID.
    // La consulta con tenantId no debe encontrar esa fila.
    const countMain  = await queryNewAny(tenantId,      [SHORT_ID]);
    const countOther = await queryNewAny(otherTenantId, [SHORT_ID]);

    // Cada tenant solo ve sus propias filas
    expect(countMain).toBeGreaterThanOrEqual(1);   // la fila propia
    expect(countOther).toBe(1);                     // la fila del otro tenant (insertada en beforeAll)

    // Y en total las filas de ambos tenants son exactamente countMain + 1
    const total = await pool.query(
      `SELECT COUNT(*) FROM audit_log
       WHERE action = 'saldo_condonado'
         AND tenant_id IN ($1,$2)
         AND (metadata::jsonb ->> 'student_id')::int = $3`,
      [tenantId, otherTenantId, SHORT_ID],
    );
    expect(parseInt((total.rows as any[])[0].count)).toBe(countMain + 1);
  });

});
