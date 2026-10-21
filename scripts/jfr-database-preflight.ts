/**
 * Inspección explícita, sólo SELECT. No importar server/index ni fixtures.
 * No imprimir URLs, hosts, usuarios ni errores que puedan incluir credenciales.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

export const queries = {
  schema: `SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('tenants','campuses','students','charges','payments')
ORDER BY table_name, ordinal_position`,
  summary: `SELECT
(SELECT count(*)::int FROM tenants) AS tenants,
(SELECT count(*)::int FROM campuses) AS campuses,
(SELECT count(*)::int FROM students) AS students,
(SELECT count(*)::int FROM charges) AS charges,
(SELECT count(*)::int FROM payments) AS payments,
(SELECT count(*)::int FROM tenants WHERE nombre_legal ~* '(vitest fixtures|e2e|demo)') AS fixture_tenants,
(SELECT count(*)::int FROM campuses WHERE nombre ~* '(vitest fixtures|e2e|demo)') AS fixture_campuses,
(SELECT count(*)::int FROM tenants WHERE nombre_legal ~* '(jfr|juan.*rulfo)') AS jfr_named_tenants,
(SELECT count(*)::int FROM campuses WHERE nombre ~* '(jfr|juan.*rulfo)') AS jfr_named_campuses`,
  marker: `SELECT CASE WHEN shobj_description(oid, 'pg_database') = 'edupay:test' THEN 'edupay:test'
WHEN shobj_description(oid, 'pg_database') = 'edupay:demo' THEN 'edupay:demo'
ELSE 'sin marcador reconocido' END AS environment_marker
FROM pg_database WHERE datname = current_database()`,
  duplicates: `WITH normalized AS (
SELECT id, tenant_id, campus_id, created_at,
NULLIF(upper(btrim(curp)), '') AS curp_key,
NULLIF(btrim(id_referencia), '') AS reference_key FROM students
), duplicate_curps AS (
SELECT tenant_id, campus_id, curp_key FROM normalized WHERE curp_key IS NOT NULL
GROUP BY tenant_id, campus_id, curp_key HAVING count(*) > 1
), duplicate_references AS (
SELECT tenant_id, campus_id, reference_key FROM normalized WHERE reference_key IS NOT NULL
GROUP BY tenant_id, campus_id, reference_key HAVING count(*) > 1
)
SELECT 'CURP' AS duplicate_type, n.id, n.tenant_id, n.campus_id, n.created_at
FROM normalized n JOIN duplicate_curps d ON n.tenant_id IS NOT DISTINCT FROM d.tenant_id
AND n.campus_id IS NOT DISTINCT FROM d.campus_id AND n.curp_key = d.curp_key
UNION ALL
SELECT 'matricula' AS duplicate_type, n.id, n.tenant_id, n.campus_id, n.created_at
FROM normalized n JOIN duplicate_references d ON n.tenant_id IS NOT DISTINCT FROM d.tenant_id
AND n.campus_id IS NOT DISTINCT FROM d.campus_id AND n.reference_key = d.reference_key
ORDER BY duplicate_type, tenant_id, campus_id, id`,
  empty: `SELECT tenant_id, campus_id, count(*)::int AS students,
count(*) FILTER (WHERE NULLIF(btrim(curp), '') IS NULL)::int AS empty_curps,
count(*) FILTER (WHERE NULLIF(btrim(id_referencia), '') IS NULL)::int AS empty_references,
count(*) FILTER (WHERE tenant_id IS NULL OR campus_id IS NULL)::int AS missing_scope
FROM students GROUP BY tenant_id, campus_id ORDER BY tenant_id, campus_id`,
};

function sameTarget(a: string, b: string): boolean {
  const left = new URL(a);
  const right = new URL(b);
  return left.hostname.replace("-pooler.", ".") === right.hostname.replace("-pooler.", ".")
    && left.pathname === right.pathname && left.port === right.port;
}

async function main(): Promise<void> {
const keys = ["DATABASE_URL", "NEON_DATABASE_URL"] as const;
const a = process.env.DATABASE_URL;
const b = process.env.NEON_DATABASE_URL;
try {
  console.log(JSON.stringify({
    configured_same_target: a && b ? sameTarget(a, b) : null,
    note: "Comparación interna de destino, no confirma qué base es producción/JFR.",
  }));
} catch { console.log('{"configured_same_target":null}'); }

for (const key of keys) {
  const url = process.env[key];
  if (!url) { console.log(JSON.stringify({ candidate: key, accessible: false })); continue; }
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
  try {
    for (const [name, sql] of Object.entries(queries)) {
      // Fail-closed incluso si alguien modifica accidentalmente el catálogo.
      if (!/^(SELECT|WITH)\b/.test(sql) || /;\s*\S/.test(sql)) throw new Error("Consulta no permitida");
      console.log(JSON.stringify({ candidate: key, query: name, sql }));
      const result = await pool.query(sql);
      console.log(JSON.stringify({
        candidate: key, query: name, rows: result.rows,
      }));
    }
  } catch (error: any) {
    const reason = /disabled/i.test(String(error?.message)) ? "endpoint deshabilitado"
      : /ENOTFOUND|getaddrinfo/i.test(String(error?.message)) ? "destino no resoluble"
      : /timeout|timed out/i.test(String(error?.message)) ? "tiempo de conexión agotado"
      : /password authentication/i.test(String(error?.message)) ? "autenticación rechazada"
      : "consulta o conexión rechazada; detalle sensible omitido";
    console.log(JSON.stringify({ candidate: key, error: reason }));
  } finally { await pool.end(); }
}
}

void main().catch(() => {
  console.error("Preflight interrumpido; detalle sensible omitido.");
  process.exitCode = 1;
});
