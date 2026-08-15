import { pool } from "../server/db";
async function main() {
  const r1 = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'bank_transactions' ORDER BY ordinal_position`);
  console.log('=== bank_transactions ===');
  console.log(r1.rows.map((x:any) => `${x.column_name} ${x.data_type}${x.is_nullable==='YES'?' NULL':''}`).join('\n'));
  const r2 = await pool.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('family_students','guardians','families','family_payment_sources') ORDER BY table_name, ordinal_position`);
  console.log('\n=== others ===');
  console.log(r2.rows.map((x:any) => `${x.table_name}.${x.column_name} ${x.data_type}`).join('\n'));
  await pool.end();
}
main();
