/** Catálogo físico, sin datos, propietarios ni valores actuales de secuencias.
 * No se normalizan casts, tipos, CHECK NOT VALID, nombres ni definiciones.
 */
const queries = {
  schemas: "SELECT nspname AS schema_name FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1",
  relations: "SELECT n.nspname AS schema_name, c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY 1,2",
  columns: "SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS name, a.attnum AS position, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null, pg_get_expr(d.adbin,d.adrelid) AS default_value, a.attidentity AS identity_kind, a.attgenerated AS generated_kind, co.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,4",
  constraints: "SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid) AS definition, con.convalidated AS validated, con.condeferrable AS deferrable, con.condeferred AS deferred FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace LEFT JOIN pg_class c ON c.oid=con.conrelid WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1,2,3",
  indexes: "SELECT schemaname AS schema_name, tablename AS table_name, indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema' ORDER BY 1,2,3",
  types: "SELECT n.nspname AS schema_name, t.typname AS name, t.typtype AS kind, CASE WHEN t.typbasetype<>0 THEN format_type(t.typbasetype,t.typtypmod) END AS base_type, t.typnotnull AS not_null, t.typdefault AS default_value, (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS enum_values FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND t.typrelid=0 AND t.typelem=0 ORDER BY 1,2",
  sequences: "SELECT n.nspname AS schema_name, c.relname AS name, format_type(s.seqtypid,NULL) AS type, s.seqstart::text, s.seqincrement::text, s.seqmax::text, s.seqmin::text, s.seqcache::text, s.seqcycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1,2",
  functions: "SELECT n.nspname AS schema_name, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND p.prokind IN ('f','p') ORDER BY 1,2,3",
  triggers: "SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition, t.tgenabled AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND NOT t.tgisinternal ORDER BY 1,2,3",
  policies: "SELECT schemaname AS schema_name, tablename AS table_name, policyname AS name, permissive, roles::text, cmd, qual, with_check FROM pg_policies WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema' ORDER BY 1,2,3",
  views: "SELECT n.nspname AS schema_name, c.relname AS name, pg_get_viewdef(c.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('v','m') ORDER BY 1,2",
  extensions: "SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema_name FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1",
};

// En LIKE, "_" es comodín: pg_% también ocultaría un esquema de usuario
// llamado pgcustomer. Sólo se excluye el prefijo reservado literal "pg_".
export const CATALOG_QUERIES = Object.fromEntries(
  Object.entries(queries).map(([name, sql]) => [name, sql.replaceAll("NOT LIKE 'pg_%'", "!~ '^pg_'")]),
);

export type SchemaCatalog = Record<string, unknown[]>;
type Reader = { query(sql: string): Promise<{ rows: unknown[] }> };

export async function readSchemaCatalog(reader: Reader): Promise<SchemaCatalog> {
  const snapshot: SchemaCatalog = {};
  for (const [name, sql] of Object.entries(CATALOG_QUERIES)) {
    snapshot[name] = (await reader.query(sql)).rows;
  }
  return snapshot;
}

export function compareSchemaCatalog(expected: SchemaCatalog, actual: SchemaCatalog): string[] {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .filter(key => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]));
}
