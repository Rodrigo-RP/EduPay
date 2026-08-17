/**
 * restore-vitest-fixtures.ts
 * Restaura tenant_id=29 y campus_id=48 en el DB de desarrollo/test.
 * Estos IDs son usados por ~28 archivos de test con JWTs sintéticos hardcodeados.
 * Se ejecuta una sola vez cuando el seed E2E (TRUNCATE RESTART IDENTITY CASCADE)
 * ha borrado esos registros.
 */
import { pool } from "../db";

async function main() {
  console.log("🔧 Restaurando fixtures de vitest (tenant 29, campus 48)...");

  // Tenant 29
  const rt = await pool.query(`
    INSERT INTO tenants (id, nombre_legal, rfc)
    VALUES (29, 'Instituto JFR (Vitest Fixtures)', 'IJF950101AA0')
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `);
  console.log(rt.rowCount === 1 ? "  ✅ Tenant 29 insertado" : "  ℹ️  Tenant 29 ya existía");

  // Campus 48
  const rc = await pool.query(`
    INSERT INTO campuses (id, tenant_id, nombre, clave_sep)
    VALUES (48, 29, 'Campus Norte (Vitest Fixtures)', '09DPR0048V')
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `);
  console.log(rc.rowCount === 1 ? "  ✅ Campus 48 insertado" : "  ℹ️  Campus 48 ya existía");

  // Avanzar secuencias para que futuros INSERTs automáticos no colisionen
  await pool.query(`
    SELECT setval('tenants_id_seq', GREATEST((SELECT MAX(id) FROM tenants) + 1, 50))
  `);
  await pool.query(`
    SELECT setval('campuses_id_seq', GREATEST((SELECT MAX(id) FROM campuses) + 1, 50))
  `);

  // Verificación
  const vt = await pool.query("SELECT id, nombre_legal FROM tenants WHERE id = 29");
  const vc = await pool.query("SELECT id, tenant_id, nombre FROM campuses WHERE id = 48");
  const seqT = await pool.query("SELECT last_value FROM tenants_id_seq");
  const seqC = await pool.query("SELECT last_value FROM campuses_id_seq");

  console.log("  tenant 29:", JSON.stringify(vt.rows[0]));
  console.log("  campus 48:", JSON.stringify(vc.rows[0]));
  console.log(`  seq tenants=${seqT.rows[0].last_value} | campuses=${seqC.rows[0].last_value}`);
  console.log("✅ Listo.");

  await pool.end();
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
