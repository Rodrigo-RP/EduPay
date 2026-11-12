import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { Client } from "pg";
import { PROD_MIGRATION_LOCK_KEY } from "../server/lib/migration-production";

/**
 * Verifica `db:migrate:prod` contra un servidor PostgreSQL DESECHABLE.
 * Nunca debe apuntar a una base real: crea y elimina sus propias bases.
 *
 *   VERIFY_ADMIN_URL=postgresql://usuario:clave@127.0.0.1:5432/postgres npm run db:migrate:prod:verify
 *
 * El usuario necesita permiso para crear bases y roles (superusuario del contenedor).
 */
const adminRaw = process.env.VERIFY_ADMIN_URL;
if (!adminRaw) throw new Error("VERIFY_ADMIN_URL es obligatoria (servidor desechable en 127.0.0.1).");
const adminUrl = new URL(adminRaw);
if (!["127.0.0.1", "localhost"].includes(adminUrl.hostname)) {
  throw new Error("VERIFY_ADMIN_URL debe apuntar a un servidor local desechable.");
}

const suffix = crypto.randomBytes(3).toString("hex");
const role = `mp_app_${suffix}`;
const rolePassword = crypto.randomBytes(12).toString("hex");
const created: string[] = [];
const results: Array<{ id: string; ok: boolean; detail: string }> = [];

function urlFor(database: string, user?: string, password?: string): string {
  const url = new URL(adminRaw as string);
  url.pathname = `/${database}`;
  if (user) { url.username = user; url.password = password ?? ""; }
  return url.toString();
}

async function admin<T>(database: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: urlFor(database) });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function newDatabase(label: string, setup?: (client: Client) => Promise<void>): Promise<string> {
  const name = `mp_${label}_${suffix}`;
  await admin("postgres", c => c.query(`CREATE DATABASE "${name}"`));
  created.push(name);
  if (setup) await admin(name, setup);
  return name;
}

function run(database: string, args: string[], user?: string, password?: string) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate-prod.ts", ...args], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_OPTIONS: "", APP_ENV: "production", DATABASE_URL: urlFor(database, user, password) },
    encoding: "utf8",
    timeout: 120000,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const count = (database: string, sql: string) => admin(database, async c => Number((await c.query(sql)).rows[0].n));
const publicTables = (database: string) => count(database, "SELECT COUNT(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relkind IN ('r','p')");
const hasDrizzleSchema = (database: string) => count(database, "SELECT COUNT(*)::int AS n FROM pg_namespace WHERE nspname='drizzle'");
const ledgerRows = (database: string) => count(database, "SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations");

function check(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "OK   " : "FALLA"} ${id} · ${detail}`);
}

try {
  const version = await admin("postgres", async c => (await c.query("SHOW server_version")).rows[0].server_version);
  console.log(`Servidor desechable: PostgreSQL ${version}`);

  // U4 · simulacro: no escribe nada.
  { const db = await newDatabase("u4");
    const r = run(db, []);
    check("U4", r.status === 0 && r.out.includes("Simulacro") && r.out.includes("Pendientes (9)")
      && (await publicTables(db)) === 0 && (await hasDrizzleSchema(db)) === 0,
      "el simulacro lista 9 pendientes y no crea tablas ni el esquema drizzle"); }

  // U1 · base vacía, U2 · repetir.
  { const db = await newDatabase("u1");
    const r1 = run(db, ["--apply", `--confirm=${db}`]);
    const tables = await count(db, "SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename IN ('external_identities','firebase_students','firebase_campus_map')");
    check("U1", r1.status === 0 && (await ledgerRows(db)) === 9 && tables === 3 && (await publicTables(db)) > 50,
      `aplica las 9 migraciones (${await publicTables(db)} tablas, historial ${await ledgerRows(db)})`);
    const r2 = run(db, ["--apply", `--confirm=${db}`]);
    check("U2", r2.status === 0 && r2.out.includes("Pendientes: ninguna") && (await ledgerRows(db)) === 9,
      "repetir no cambia nada: 0 pendientes, historial sigue en 9"); }

  // U5 · tablas sin historial.
  { const db = await newDatabase("u5", c => c.query("CREATE TABLE sobrante (id int)").then(() => undefined));
    const r = run(db, ["--apply", `--confirm=${db}`]);
    check("U5", r.status === 1 && r.out.includes("Baseline adoption required") && (await hasDrizzleSchema(db)) === 0,
      "base con tablas y sin historial: aborta sin DDL"); }

  // U6 · historial con otra línea base.
  { const db = await newDatabase("u6", async c => {
      await c.query("CREATE SCHEMA drizzle");
      await c.query("CREATE TABLE drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)");
      await c.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('otro', 1)");
    });
    const r = run(db, ["--apply", `--confirm=${db}`]);
    check("U6", r.status === 1 && r.out.includes("Ledger incompatible") && (await publicTables(db)) === 0,
      "historial incompatible: aborta sin DDL"); }

  // U7 · marcador de pruebas.
  for (const marker of ["edupay:test", "edupay:demo"]) {
    const db = await newDatabase(`u7${marker.endsWith("test") ? "t" : "d"}`, async c => { await c.query(`COMMENT ON DATABASE "mp_u7${marker.endsWith("test") ? "t" : "d"}_${suffix}" IS '${marker}'`); });
    const r = run(db, ["--apply", `--confirm=${db}`]);
    check(`U7 (${marker})`, r.status === 1 && r.out.includes("pruebas o demo") && (await publicTables(db)) === 0,
      "base marcada: aborta sin DDL"); }

  // U8 · confirmación.
  { const db = await newDatabase("u8");
    const sin = run(db, ["--apply"]);
    const mal = run(db, ["--apply", "--confirm=otra_base"]);
    check("U8", sin.status === 1 && mal.status === 1 && sin.out.includes("--confirm") && (await publicTables(db)) === 0,
      "sin --confirm o con otro nombre: aborta sin DDL"); }

  // U10 · fallo a la mitad y recuperación.
  { const db = await newDatabase("u10", c => c.query("CREATE VIEW public.firebase_campus_map AS SELECT 1 AS x").then(() => undefined));
    const r = run(db, ["--apply", `--confirm=${db}`]);
    const tras = { tablas: await publicTables(db), historial: await ledgerRows(db) };
    check("U10", r.status === 1 && tras.tablas === 0 && tras.historial === 0,
      `una migración falla: todo se deshace (${tras.tablas} tablas, ${tras.historial} filas de historial)`);
    await admin(db, c => c.query("DROP VIEW public.firebase_campus_map").then(() => undefined));
    const r2 = run(db, ["--apply", `--confirm=${db}`]);
    check("U10b", r2.status === 0 && (await ledgerRows(db)) === 9, "tras corregir la causa, el mismo comando termina bien"); }

  // U11 · concurrencia.
  { const db = await newDatabase("u11");
    const holder = new Client({ connectionString: urlFor(db) });
    await holder.connect();
    try {
      await holder.query("SELECT pg_advisory_lock($1)", [PROD_MIGRATION_LOCK_KEY]);
      const r = run(db, ["--apply", `--confirm=${db}`]);
      check("U11", r.status === 1 && r.out.includes("otra migración") && (await publicTables(db)) === 0,
        "con el candado tomado, la segunda ejecución se rechaza sin DDL");
    } finally { await holder.end(); } }

  // U12 · usuario que no es dueño, como edupay_app.
  { const db = await newDatabase("u12", async c => { await c.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${rolePassword}'`); });
    const sin = run(db, ["--apply", `--confirm=${db}`], role, rolePassword);
    check("U12a", sin.status === 1 && sin.out.includes("permission denied") && (await publicTables(db)) === 0,
      "sin permisos: falla con 'permission denied' y sin cambios");
    await admin(db, async c => {
      await c.query(`GRANT ALL ON DATABASE "${db}" TO "${role}"`);
      await c.query(`GRANT ALL ON SCHEMA public TO "${role}"`);
    });
    const con = run(db, ["--apply", `--confirm=${db}`], role, rolePassword);
    const duenos = await admin(db, async c => (await c.query("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname='public'")).rows.map(r => r.tableowner));
    check("U12b", con.status === 0 && duenos.length === 1 && duenos[0] === role && (await ledgerRows(db)) === 9,
      "con GRANT sobre la base y sobre public: aplica y el usuario queda dueño de las tablas"); }
} finally {
  for (const name of created) {
    await admin("postgres", c => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)).catch(() => undefined);
  }
  await admin("postgres", c => c.query(`DROP ROLE IF EXISTS "${role}"`)).catch(() => undefined);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} comprobaciones correctas`);
if (failed.length) { console.error(`Fallaron: ${failed.map(f => f.id).join(", ")}`); process.exitCode = 1; }
