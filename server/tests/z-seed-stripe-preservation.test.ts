/**
 * SEED-01 — campus_payment_config sobrevive al reset de datos demo
 *
 * Regresión para el bug donde seed-demo.ts incluía campus_payment_config en su
 * TRUNCATE, borrando silenciosamente la configuración real de Stripe Connect.
 *
 * El fix usa un patrón backup/restore porque el CASCADE del TRUNCATE en
 * `campuses` alcanza campus_payment_config vía FK (campus_id → campuses.id
 * ON DELETE CASCADE), incluso si la tabla no está listada explícitamente.
 *
 * ⚠️  Prefijo "z-" intencional: garantiza que este archivo corra ÚLTIMO en el
 * suite (orden alfabético de vitest con fileParallelism:false).  El seed hace
 * TRUNCATE RESTART IDENTITY CASCADE y cambia los IDs de la DB; correrlo al
 * final evita interferir con los fixtures de otros archivos de test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { pool } from "../db";
import { seedDemoData } from "../seed-demo";

const TEST_STRIPE_ACCOUNT = "acct_test_seed_preservation";

describe("SEED-01: campus_payment_config sobrevive al seed de datos demo", () => {
  let campusNorteId: number;

  beforeAll(async () => {
    // Primer seed — garantiza estado limpio y Campus Norte existe
    const result = await seedDemoData();
    expect(
      result.success,
      `Primer seed falló: ${result.error ?? result.logs.at(-1)}`,
    ).toBe(true);

    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM campuses WHERE nombre = 'Campus Norte' LIMIT 1`,
    );
    expect(rows.length, "Campus Norte no encontrado después del primer seed").toBe(1);
    campusNorteId = rows[0].id;
  }, 90_000);

  it("SEED-01: stripe_account_id intacto tras seed completo", async () => {
    // ── 1. Insertar config de Stripe ANTES del segundo seed ─────────────────
    await pool.query(
      `INSERT INTO campus_payment_config
         (campus_id, tenant_id, stripe_account_id,
          charges_enabled, payouts_enabled, details_submitted)
       SELECT $1, tenant_id, $2, true, true, true
       FROM   campuses WHERE id = $1
       ON CONFLICT (campus_id) DO UPDATE SET
         stripe_account_id = EXCLUDED.stripe_account_id,
         charges_enabled   = true,
         payouts_enabled   = true,
         details_submitted = true`,
      [campusNorteId, TEST_STRIPE_ACCOUNT],
    );

    const { rows: antes } = await pool.query<{ stripe_account_id: string }>(
      `SELECT stripe_account_id FROM campus_payment_config WHERE campus_id = $1`,
      [campusNorteId],
    );
    expect(
      antes[0]?.stripe_account_id,
      "No se pudo insertar la config de prueba antes del seed",
    ).toBe(TEST_STRIPE_ACCOUNT);

    // ── 2. Correr el seed completo ───────────────────────────────────────────
    const result = await seedDemoData();
    expect(
      result.success,
      `Seed falló: ${result.error ?? result.logs.at(-1)}`,
    ).toBe(true);

    // ── 3. Verificar que la config de Stripe sobrevivió ─────────────────────
    const { rows: despues } = await pool.query<{
      stripe_account_id: string;
      charges_enabled:   boolean;
      payouts_enabled:   boolean;
      details_submitted: boolean;
    }>(`
      SELECT cpc.stripe_account_id,
             cpc.charges_enabled,
             cpc.payouts_enabled,
             cpc.details_submitted
      FROM   campus_payment_config cpc
      JOIN   campuses c ON c.id = cpc.campus_id
      WHERE  c.nombre = 'Campus Norte'
    `);

    expect(
      despues.length,
      "campus_payment_config no encontrada para Campus Norte tras el seed — la fila fue borrada",
    ).toBe(1);
    expect(
      despues[0].stripe_account_id,
      "stripe_account_id no coincide — la fila fue borrada y no restaurada por el seed",
    ).toBe(TEST_STRIPE_ACCOUNT);
    expect(despues[0].charges_enabled,   "charges_enabled no sobrevivió al seed").toBe(true);
    expect(despues[0].payouts_enabled,   "payouts_enabled no sobrevivió al seed").toBe(true);
    expect(despues[0].details_submitted, "details_submitted no sobrevivió al seed").toBe(true);
  }, 90_000);
});
