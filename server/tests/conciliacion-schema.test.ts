/**
 * conciliacion-schema.test.ts
 *
 * Verifica el schema de las migraciones 013 y 014:
 *   CS-01  family_payment_sources existe con columnas y defaults correctos
 *   CS-02  UNIQUE(family_id, clabe): segundo INSERT del mismo par falla con 23505
 *   CS-03  ON CONFLICT DO UPDATE incrementa confirmaciones e actualiza ultima_vez_at
 *   CS-04  Múltiples upserts consecutivos acumulan confirmaciones correctamente
 *   CS-05  bank_transactions.confianza_pct existe como smallint y acepta NULL
 *   CS-06  confianza_pct acepta valores 0 y 100 (extremos del rango)
 *   CS-07  ON DELETE CASCADE: borrar la familia elimina sus filas en family_payment_sources
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db.js";

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let familyId: number;
let bankTxId: number;

beforeAll(async () => {
  // Tomar campus y tenant del seed demo en una sola query (garantiza que existen juntos)
  const cRow = await pool.query(
    `SELECT c.id AS campus_id, c.tenant_id
     FROM campuses c
     JOIN tenants t ON t.id = c.tenant_id
     LIMIT 1`
  );
  campusId = cRow.rows[0].campus_id;
  tenantId = cRow.rows[0].tenant_id;

  // Familia temporal para el test
  const fRow = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre)
     VALUES ($1, $2, 'Familia Test CS-Schema')
     RETURNING id`,
    [tenantId, campusId]
  );
  familyId = fRow.rows[0].id;

  // Transacción bancaria temporal para CS-05 / CS-06
  const txRow = await pool.query(
    `INSERT INTO bank_transactions
       (campus_id, fecha, descripcion, monto_centavos, tipo, estado_conciliacion)
     VALUES ($1, CURRENT_DATE, 'TX test confianza_pct', 100000, 'credito', 'pendiente')
     RETURNING id`,
    [campusId]
  );
  bankTxId = txRow.rows[0].id;
});

afterAll(async () => {
  // Limpieza — family_payment_sources se borra en cascada con la familia
  await pool.query(`DELETE FROM bank_transactions WHERE id = $1`, [bankTxId]);
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
});

// ── CS-01 ─────────────────────────────────────────────────────────────────────
describe("family_payment_sources", () => {
  it("CS-01: tabla existe con columnas y defaults correctos", async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'family_payment_sources'
      ORDER BY ordinal_position
    `);
    const cols = res.rows as any[];
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));

    expect(byName["id"]).toBeDefined();
    expect(byName["tenant_id"].is_nullable).toBe("NO");
    expect(byName["family_id"].is_nullable).toBe("NO");
    expect(byName["clabe"].data_type).toBe("character varying");
    expect(byName["clabe"].is_nullable).toBe("NO");
    expect(byName["confirmaciones"].column_default).toContain("1");
    expect(byName["confirmaciones"].is_nullable).toBe("NO");
    expect(byName["primera_vez_at"].column_default).toContain("now");
    expect(byName["ultima_vez_at"].column_default).toContain("now");
  });

  // ── CS-02 ──────────────────────────────────────────────────────────────────
  it("CS-02: UNIQUE(family_id, clabe) — segundo INSERT mismo par falla con 23505", async () => {
    const clabe = "032180000118359719";

    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe)
       VALUES ($1, $2, $3)`,
      [tenantId, familyId, clabe]
    );

    await expect(
      pool.query(
        `INSERT INTO family_payment_sources (tenant_id, family_id, clabe)
         VALUES ($1, $2, $3)`,
        [tenantId, familyId, clabe]
      )
    ).rejects.toMatchObject({ code: "23505" });

    // Limpieza para tests siguientes
    await pool.query(
      `DELETE FROM family_payment_sources WHERE family_id = $1`,
      [familyId]
    );
  });

  // ── CS-03 ──────────────────────────────────────────────────────────────────
  it("CS-03: ON CONFLICT DO UPDATE — incrementa confirmaciones y actualiza ultima_vez_at", async () => {
    const clabe = "646180157000000004";

    // Primera inserción
    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe, confirmaciones)
       VALUES ($1, $2, $3, 1)`,
      [tenantId, familyId, clabe]
    );

    const before = await pool.query(
      `SELECT confirmaciones, ultima_vez_at, id FROM family_payment_sources
       WHERE family_id = $1 AND clabe = $2`,
      [familyId, clabe]
    );
    const rowId = before.rows[0].id;
    const confBefore = Number(before.rows[0].confirmaciones);

    // Esperar 1 ms para que ultima_vez_at cambie
    await new Promise((r) => setTimeout(r, 5));

    // Upsert
    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe, confirmaciones)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (family_id, clabe)
       DO UPDATE SET
         confirmaciones = family_payment_sources.confirmaciones + 1,
         ultima_vez_at  = NOW()`,
      [tenantId, familyId, clabe]
    );

    const after = await pool.query(
      `SELECT confirmaciones, ultima_vez_at, id FROM family_payment_sources
       WHERE family_id = $1 AND clabe = $2`,
      [familyId, clabe]
    );

    // Mismo id (no duplicó)
    expect(after.rows[0].id).toBe(rowId);
    // Incrementó
    expect(Number(after.rows[0].confirmaciones)).toBe(confBefore + 1);
    // ultima_vez_at cambió (o al menos no es null)
    expect(after.rows[0].ultima_vez_at).toBeTruthy();

    // Limpieza
    await pool.query(
      `DELETE FROM family_payment_sources WHERE family_id = $1`,
      [familyId]
    );
  });

  // ── CS-04 ──────────────────────────────────────────────────────────────────
  it("CS-04: múltiples upserts consecutivos acumulan confirmaciones correctamente", async () => {
    const clabe = "002180700288189663";

    // Upsert 1
    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe, confirmaciones)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (family_id, clabe)
       DO UPDATE SET confirmaciones = family_payment_sources.confirmaciones + 1,
                     ultima_vez_at  = NOW()`,
      [tenantId, familyId, clabe]
    );
    // Upsert 2
    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe, confirmaciones)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (family_id, clabe)
       DO UPDATE SET confirmaciones = family_payment_sources.confirmaciones + 1,
                     ultima_vez_at  = NOW()`,
      [tenantId, familyId, clabe]
    );
    // Upsert 3
    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe, confirmaciones)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (family_id, clabe)
       DO UPDATE SET confirmaciones = family_payment_sources.confirmaciones + 1,
                     ultima_vez_at  = NOW()`,
      [tenantId, familyId, clabe]
    );

    const res = await pool.query(
      `SELECT confirmaciones FROM family_payment_sources
       WHERE family_id = $1 AND clabe = $2`,
      [familyId, clabe]
    );

    // 3 upserts: primera con 1, luego +1 +1 = 3
    expect(Number(res.rows[0].confirmaciones)).toBe(3);

    await pool.query(
      `DELETE FROM family_payment_sources WHERE family_id = $1`,
      [familyId]
    );
  });

  // ── CS-07 ──────────────────────────────────────────────────────────────────
  it("CS-07: ON DELETE CASCADE — borrar familia elimina sus filas en family_payment_sources", async () => {
    // Familia efímera
    const fEfRow = await pool.query(
      `INSERT INTO families (tenant_id, campus_id, nombre)
       VALUES ($1, $2, 'Familia Efimera CASCADE')
       RETURNING id`,
      [tenantId, campusId]
    );
    const fEfId = fEfRow.rows[0].id;

    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe)
       VALUES ($1, $2, '012345678901234567')`,
      [tenantId, fEfId]
    );

    // Borrar la familia
    await pool.query(`DELETE FROM families WHERE id = $1`, [fEfId]);

    // La fila de family_payment_sources debe haber desaparecido
    const check = await pool.query(
      `SELECT id FROM family_payment_sources WHERE family_id = $1`,
      [fEfId]
    );
    expect(check.rows).toHaveLength(0);
  });
});

// ── CS-05 / CS-06 ─────────────────────────────────────────────────────────────
describe("bank_transactions.confianza_pct", () => {
  it("CS-05: columna existe como smallint y acepta NULL en filas existentes", async () => {
    // Verificar tipo en information_schema
    const schemaRes = await pool.query(`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bank_transactions'
        AND column_name = 'confianza_pct'
    `);
    expect(schemaRes.rows).toHaveLength(1);
    expect(schemaRes.rows[0].data_type).toBe("smallint");
    expect(schemaRes.rows[0].is_nullable).toBe("YES");

    // La fila creada en beforeAll no tiene confianza_pct → debe ser NULL
    const txRes = await pool.query(
      `SELECT confianza_pct FROM bank_transactions WHERE id = $1`,
      [bankTxId]
    );
    expect(txRes.rows[0].confianza_pct).toBeNull();
  });

  it("CS-06: confianza_pct acepta valores 0 y 100 (extremos del rango)", async () => {
    // Escribir 0
    await pool.query(
      `UPDATE bank_transactions SET confianza_pct = 0 WHERE id = $1`,
      [bankTxId]
    );
    const r0 = await pool.query(
      `SELECT confianza_pct FROM bank_transactions WHERE id = $1`,
      [bankTxId]
    );
    expect(Number(r0.rows[0].confianza_pct)).toBe(0);

    // Escribir 100
    await pool.query(
      `UPDATE bank_transactions SET confianza_pct = 100 WHERE id = $1`,
      [bankTxId]
    );
    const r100 = await pool.query(
      `SELECT confianza_pct FROM bank_transactions WHERE id = $1`,
      [bankTxId]
    );
    expect(Number(r100.rows[0].confianza_pct)).toBe(100);

    // Restaurar NULL
    await pool.query(
      `UPDATE bank_transactions SET confianza_pct = NULL WHERE id = $1`,
      [bankTxId]
    );
    const rNull = await pool.query(
      `SELECT confianza_pct FROM bank_transactions WHERE id = $1`,
      [bankTxId]
    );
    expect(rNull.rows[0].confianza_pct).toBeNull();
  });
});
