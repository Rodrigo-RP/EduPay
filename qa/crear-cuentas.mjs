// Crea las cuentas ficticias de la suite de QA en la base desechable.
// Se niega a escribir si la base no es la desechable marcada edupay:test (puerto 54318, base edupay_ci).
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));
const pg = require("pg");
const bcrypt = require("bcrypt");

const url = process.env.DATABASE_URL;
if (!url || !/127\.0\.0\.1:54318\/edupay_ci/.test(url)) {
  throw new Error("DATABASE_URL no apunta a la base desechable edupay_ci en 127.0.0.1:54318");
}
const pool = new pg.Pool({ connectionString: url });
const marker = (await pool.query("SELECT shobj_description(oid,'pg_database') AS c FROM pg_database WHERE datname = current_database()")).rows[0].c;
if (marker !== "edupay:test") throw new Error(`La base no está marcada edupay:test (marcador: ${marker})`);

const PASSWORD = "Demo2025!"; // ficticia; solo base desechable
const hash = await bcrypt.hash(PASSWORD, 10);
const q = (t, p) => pool.query(t, p);

const tenant = (await q("SELECT id FROM tenants ORDER BY id LIMIT 1")).rows[0].id;
const campuses = (await q("SELECT id, nombre FROM campuses WHERE tenant_id=$1 ORDER BY id", [tenant])).rows;
const norte = campuses.find((c) => c.nombre === "Campus Norte").id;
const sur = campuses.find((c) => c.nombre === "Campus Sur").id;

// Escuela B (otra escuela) con su campus
let tB = (await q("SELECT id FROM tenants WHERE nombre_legal=$1", ["Escuela B QA A.C."])).rows[0]?.id;
if (!tB) tB = (await q("INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id", ["Escuela B QA A.C.", "EBQ950101AA1"])).rows[0].id;
let cB = (await q("SELECT id FROM campuses WHERE tenant_id=$1 AND nombre=$2", [tB, "Campus B"])).rows[0]?.id;
if (!cB) cB = (await q("INSERT INTO campuses (tenant_id, nombre, clave_sep) VALUES ($1,$2,$3) RETURNING id", [tB, "Campus B", "09DPR9999Z"])).rows[0].id;

const nuevos = [
  // correo, nombre, rol, escuela, campus, superadmin
  ["qa.sa@qa.test", "QA Superadmin sin escuela", "super_admin", null, null, true],
  ["qa.asistente@qa.test", "QA Asistente Norte", "asistente", tenant, norte, false],
  ["qa.ac2@qa.test", "QA Admin Campus Sur", "administrador_campus", tenant, sur, false],
  ["qa.acb@qa.test", "QA Admin Campus B", "administrador_campus", tB, cB, false],
  ["qa.ag.b@qa.test", "QA Admin General B", "administrador_general", tB, cB, false],
];
for (const [email, name, role, t, c, sup] of nuevos) {
  await q(
    `INSERT INTO users (email, password_hash, name, role, tenant_id, campus_id, is_active, is_super_admin)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, is_active=true, role=EXCLUDED.role,
       tenant_id=EXCLUDED.tenant_id, campus_id=EXCLUDED.campus_id, is_super_admin=EXCLUDED.is_super_admin`,
    [email, hash, name, role, t, c, sup],
  );
}
console.table((await q("SELECT id, email, role, tenant_id, campus_id, is_super_admin FROM users ORDER BY id")).rows);
await pool.end();
