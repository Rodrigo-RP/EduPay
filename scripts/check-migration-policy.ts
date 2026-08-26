import fs from "node:fs/promises";

const files = ["package.json", "scripts/post-merge.sh", "drizzle.config.ts"];
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
console.log("[check:migration-policy] Política de migraciones versionadas OK");