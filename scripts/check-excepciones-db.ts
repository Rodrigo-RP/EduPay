import { pool } from "../server/db";

async function main() {
  // 1. Columnas de bank_transactions
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'bank_transactions' ORDER BY ordinal_position`
  );
  console.log("=== COLUMNAS bank_transactions ===");
  cols.rows.forEach((r: any) => console.log(`  ${r.column_name}: ${r.data_type}`));

  // 2. Datos actuales campus 48
  const bt = await pool.query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE estado_conciliacion = 'pendiente') AS pendiente,
            COUNT(*) FILTER (WHERE estado_conciliacion = 'conciliado') AS conciliado,
            COUNT(*) FILTER (WHERE estado_conciliacion = 'ignorado') AS ignorado
     FROM bank_transactions WHERE campus_id = 48`
  );
  console.log("=== bank_transactions campus 48 ===", bt.rows[0]);

  // 3. Un cargo pendiente de campus 48 para usar en tests
  const ch = await pool.query(
    `SELECT c.id, c.monto_base_centavos, c.estado, c.beca_aplicada, c.recargo_aplicado_centavos
     FROM charges c JOIN students s ON s.id = c.student_id
     WHERE s.campus_id = 48 AND c.estado = 'pendiente'
     LIMIT 5`
  );
  console.log("=== cargos pendientes campus 48 ===");
  ch.rows.forEach((r: any) => console.log(`  id=${r.id} monto_base=${r.monto_base_centavos} beca=${r.beca_aplicada} recargo=${r.recargo_aplicado_centavos}`));

  // 4. tenant_id de campus 48
  const tenant = await pool.query(`SELECT id, tenant_id FROM campuses WHERE id = 48`);
  console.log("=== campus 48 ===", tenant.rows[0]);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
