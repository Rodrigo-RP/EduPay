import { pool } from "../db";

async function run() {
  const queries = [
    "ALTER TABLE payment_plans ADD COLUMN IF NOT EXISTS tipo_origen VARCHAR(20) DEFAULT 'futuro'",
    "ALTER TABLE payment_plans ADD COLUMN IF NOT EXISTS charge_ids_origen JSONB",
    "ALTER TABLE charges ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES payment_plans(id)",
  ];
  for (const q of queries) {
    try {
      await pool.query(q);
      console.log("OK:", q.slice(0, 80));
    } catch (e: any) {
      console.error("FAIL:", e.message);
    }
  }
  await pool.end();
}

run();
