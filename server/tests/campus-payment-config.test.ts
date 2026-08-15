/**
 * CPC — campus_payment_config tabla y constraint UNIQUE(campus_id)
 *
 * Pruebas:
 *   CPC-01  Tabla existe con todas las columnas esperadas
 *   CPC-02  INSERT básico funciona y devuelve defaults correctos
 *   CPC-03  Segundo INSERT para el mismo campus_id viola UNIQUE → error pg 23505
 *   CPC-04  UPDATE (upsert) sobre la misma fila sí funciona — no duplica
 *   CPC-05  Aislamiento: campus distintos admiten filas independientes
 *   CPC-06  ON DELETE CASCADE: borrar el campus elimina la config de pago
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── fixtures ─────────────────────────────────────────────────────────────────
let tenantId:  number;
let campusA:   number;
let campusB:   number;
let configId:  number;

beforeAll(async () => {
  const ten = await pool.query<{ id: number }>(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ('Tenant CPC012', 'CPC012RFC001X') RETURNING id`,
  );
  tenantId = ten.rows[0].id;

  const [cA, cB] = await Promise.all([
    pool.query<{ id: number }>(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus CPC-A') RETURNING id`,
      [tenantId],
    ),
    pool.query<{ id: number }>(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus CPC-B') RETURNING id`,
      [tenantId],
    ),
  ]);
  campusA = cA.rows[0].id;
  campusB = cB.rows[0].id;
});

afterAll(async () => {
  // Orden inverso de FK; campus_payment_config se borra por CASCADE al borrar campuses
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("campus_payment_config — tabla y constraint UNIQUE", () => {
  it("CPC-01: tabla existe con todas las columnas esperadas", async () => {
    const res = await pool.query<{ column_name: string; data_type: string; column_default: string | null; is_nullable: string }>(
      `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'campus_payment_config'
       ORDER BY ordinal_position`,
    );
    const cols = res.rows.map((r) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("campus_id");
    expect(cols).toContain("tenant_id");
    expect(cols).toContain("payment_provider");
    expect(cols).toContain("stripe_account_id");
    expect(cols).toContain("charges_enabled");
    expect(cols).toContain("payouts_enabled");
    expect(cols).toContain("details_submitted");
    expect(cols).toContain("created_at");
    expect(cols).toContain("updated_at");

    // payment_provider tiene default 'stripe'
    const provRow = res.rows.find((r) => r.column_name === "payment_provider");
    expect(provRow?.column_default).toContain("stripe");

    // booleanos por defecto false
    for (const boolCol of ["charges_enabled", "payouts_enabled", "details_submitted"]) {
      const row = res.rows.find((r) => r.column_name === boolCol);
      expect(row?.column_default).toMatch(/false/i);
    }

    // stripe_account_id es nullable
    const acctRow = res.rows.find((r) => r.column_name === "stripe_account_id");
    expect(acctRow?.is_nullable).toBe("YES");
  });

  it("CPC-02: INSERT básico devuelve defaults correctos", async () => {
    const res = await pool.query<{
      id: number;
      payment_provider: string;
      stripe_account_id: string | null;
      charges_enabled: boolean;
      payouts_enabled: boolean;
      details_submitted: boolean;
    }>(
      `INSERT INTO campus_payment_config (campus_id, tenant_id)
       VALUES ($1, $2)
       RETURNING id, payment_provider, stripe_account_id,
                 charges_enabled, payouts_enabled, details_submitted`,
      [campusA, tenantId],
    );
    const row = res.rows[0];
    configId = row.id;

    expect(row.payment_provider).toBe("stripe");
    expect(row.stripe_account_id).toBeNull();
    expect(row.charges_enabled).toBe(false);
    expect(row.payouts_enabled).toBe(false);
    expect(row.details_submitted).toBe(false);
  });

  it("CPC-03: segundo INSERT para el mismo campus_id viola UNIQUE (pg 23505)", async () => {
    await expect(
      pool.query(
        `INSERT INTO campus_payment_config (campus_id, tenant_id) VALUES ($1, $2)`,
        [campusA, tenantId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("CPC-04: UPDATE sobre la fila existente no duplica — ON CONFLICT DO UPDATE", async () => {
    const res = await pool.query<{ id: number; stripe_account_id: string; charges_enabled: boolean }>(
      `INSERT INTO campus_payment_config (campus_id, tenant_id, stripe_account_id, charges_enabled)
       VALUES ($1, $2, 'acct_test_CPC012', true)
       ON CONFLICT (campus_id) DO UPDATE
         SET stripe_account_id = EXCLUDED.stripe_account_id,
             charges_enabled   = EXCLUDED.charges_enabled,
             updated_at        = NOW()
       RETURNING id, stripe_account_id, charges_enabled`,
      [campusA, tenantId],
    );
    const row = res.rows[0];

    // Mismo id — no creó una fila nueva
    expect(row.id).toBe(configId);
    expect(row.stripe_account_id).toBe("acct_test_CPC012");
    expect(row.charges_enabled).toBe(true);

    // Verificar en DB que solo hay UNA fila para campusA
    const count = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM campus_payment_config WHERE campus_id = $1`,
      [campusA],
    );
    expect(Number(count.rows[0].cnt)).toBe(1);
  });

  it("CPC-05: campuses distintos admiten filas independientes", async () => {
    await pool.query(
      `INSERT INTO campus_payment_config (campus_id, tenant_id) VALUES ($1, $2)`,
      [campusB, tenantId],
    );
    const count = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM campus_payment_config WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(Number(count.rows[0].cnt)).toBe(2); // campusA + campusB
  });

  it("CPC-06: ON DELETE CASCADE — borrar campus elimina su config de pago", async () => {
    // Creamos un campus efímero solo para este test
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus CPC-Ephemeral') RETURNING id`,
      [tenantId],
    );
    const ephId = rows[0].id;
    await pool.query(
      `INSERT INTO campus_payment_config (campus_id, tenant_id) VALUES ($1, $2)`,
      [ephId, tenantId],
    );

    // Confirmar que la config existe
    const before = await pool.query(
      `SELECT id FROM campus_payment_config WHERE campus_id = $1`,
      [ephId],
    );
    expect(before.rowCount).toBe(1);

    // Borrar el campus → cascade
    await pool.query(`DELETE FROM campuses WHERE id = $1`, [ephId]);

    // La config debe haber desaparecido
    const after = await pool.query(
      `SELECT id FROM campus_payment_config WHERE campus_id = $1`,
      [ephId],
    );
    expect(after.rowCount).toBe(0);
  });
});
