import fs from "node:fs/promises";

const files = [
  "package.json",
  "scripts/post-merge.sh",
  "drizzle.config.ts",
  "replit.md",
  "shared/refeerence-migration.ts",
];
for (const file of files) {
  const content = await fs.readFile(file, "utf8");
  if (content.includes("drizzle-kit push")) {
    throw new Error(`Referencia operativa prohibida a drizzle-kit push en ${file}`);
  }
}
const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
if (packageJson.scripts?.["db:push"] !== "tsx scripts/reject-db-push.ts") {
  throw new Error("db:push debe permanecer fail-closed");
}
const config = await fs.readFile("drizzle.config.ts", "utf8");
if (!config.includes('schema: "./drizzle/physical/schema.ts"')) {
  throw new Error("Drizzle debe generar migraciones desde el manifiesto físico");
}
const baseline = await fs.readFile("drizzle/migrations/0000_baseline.sql", "utf8");
for (const futureTable of ["platform_profiles", "platform_subscriptions"]) {
  if (baseline.includes(futureTable)) {
    throw new Error(`El baseline no debe crear la tabla futura ${futureTable}`);
  }
}
console.log("[check:migration-policy] Política de migraciones versionadas OK");