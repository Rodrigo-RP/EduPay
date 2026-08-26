import type { PoolClient } from "pg";

const validationSchema = "drizzle_baseline_adoption_check";

type Catalog = Record<string, unknown[]>;

function normalizeDefinition(value: unknown, schema: string): string | null {
  if (value == null) return null;
  return String(value)
    .replaceAll(`"${schema}".`, "")
    .replaceAll(`${schema}.`, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCheckDefinition(value: unknown, schema: string): string | null {
  const normalized = normalizeDefinition(value, schema);
  if (normalized == null) return null;
  return normalized
    .replace(/::(?:character varying|text|numeric|integer|boolean|date|timestamp(?: with(?:out)? time zone)?)(?:\[\])?/g, "")
    .replace(/[()]/g, "")
    .replace(/\[\]/g, "")
    .replace(/\s+/g, "");
}

async function readCatalog(client: PoolClient, schema: string): Promise<Catalog> {
  const tables = await client.query(
    `SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
      ORDER BY c.relname`,
    [schema],
  );
  const columns = await client.query(
    `SELECT table_name, ordinal_position, column_name, data_type, udt_name,
            is_nullable, character_maximum_length, numeric_precision,
            numeric_scale, datetime_precision, column_default,
            is_identity, identity_generation, is_generated, generation_expression
       FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position`,
    [schema],
  );
  const constraints = await client.query(
    `SELECT c.relname AS table_name, con.conname AS constraint_name,
            con.contype, con.convalidated,
            ARRAY(
              SELECT a.attname
                FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ord)
                JOIN pg_attribute a
                  ON a.attrelid = con.conrelid AND a.attnum = keys.attnum
               ORDER BY keys.ord
            ) AS columns,
            pg_get_constraintdef(con.oid) AS definition
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
      ORDER BY c.relname, con.conname`,
    [schema],
  );
  const indexes = await client.query(
    `SELECT t.relname AS table_name, i.relname AS index_name,
            pg_get_indexdef(i.oid) AS definition
       FROM pg_index x
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1
      ORDER BY t.relname, i.relname`,
    [schema],
  );
  const policies = await client.query(
    `SELECT tablename AS table_name, policyname, permissive, roles, cmd,
            qual, with_check
       FROM pg_policies
      WHERE schemaname = $1
      ORDER BY tablename, policyname`,
    [schema],
  );
  const enums = await client.query(
    `SELECT t.typname AS enum_name, e.enumsortorder, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1
      ORDER BY t.typname, e.enumsortorder`,
    [schema],
  );

  return {
    tables: tables.rows,
    columns: columns.rows.map((row) => ({
      ...row,
      column_default: normalizeDefinition(row.column_default, schema),
      generation_expression: normalizeDefinition(row.generation_expression, schema),
    })),
    constraints: constraints.rows.map((row) => ({
      ...row,
      definition:
        row.contype === "c"
          ? normalizeCheckDefinition(row.definition, schema)
          : normalizeDefinition(row.definition, schema),
    })),
    indexes: indexes.rows.map((row) => ({
      ...row,
      definition: normalizeDefinition(row.definition, schema),
    })),
    policies: policies.rows.map((row) => ({
      ...row,
      qual: normalizeDefinition(row.qual, schema),
      with_check: normalizeDefinition(row.with_check, schema),
    })),
    enums: enums.rows,
  };
}

function firstDifference(expected: Catalog, actual: Catalog): string {
  for (const key of Object.keys(expected)) {
    const expectedRows = expected[key];
    const actualRows = actual[key] ?? [];
    const left = JSON.stringify(expectedRows);
    const right = JSON.stringify(actualRows);
    if (left !== right) {
      const length = Math.max(expectedRows.length, actualRows.length);
      for (let index = 0; index < length; index += 1) {
        if (JSON.stringify(expectedRows[index]) !== JSON.stringify(actualRows[index])) {
          return `${key}[${index}]: baseline=${JSON.stringify(expectedRows[index])}, public=${JSON.stringify(actualRows[index])}`;
        }
      }
      return `${key}: baseline=${expectedRows.length}, public=${actualRows.length}`;
    }
  }
  return "catálogo desconocido";
}

export async function assertBaselineCompatible(
  client: PoolClient,
  originalSql: string,
): Promise<void> {
  const portableSql = originalSql.replaceAll('"public".', `"${validationSchema}".`);
  const statements = portableSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "edupay:drizzle-baseline-adoption",
  ]);
  await client.query(`DROP SCHEMA IF EXISTS "${validationSchema}" CASCADE`);
  await client.query(`CREATE SCHEMA "${validationSchema}"`);
  await client.query(`SET LOCAL search_path TO "${validationSchema}"`);
  for (const [index, statement] of statements.entries()) {
    try {
      await client.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`El baseline no es ejecutable (sentencia ${index + 1}): ${message}`);
    }
  }
  await client.query("SET LOCAL search_path TO public");

  const [expected, actual] = await Promise.all([
    readCatalog(client, validationSchema),
    readCatalog(client, "public"),
  ]);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `El catálogo actual no es compatible con el baseline (${firstDifference(expected, actual)})`,
    );
  }
  await client.query(`DROP SCHEMA "${validationSchema}" CASCADE`);
}