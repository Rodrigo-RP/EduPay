// Adaptador exclusivo del smoke test de producción en el PostgreSQL del runner.
// No se relaja el adaptador de pruebas ni las guardas de la app publicada.
import { createRequire } from "node:module";
import { neonConfig } from "@neondatabase/serverless";

const database = new URL(process.env.DATABASE_URL);
if (
  process.env.CI !== "true" ||
  process.env.APP_ENV !== "production" ||
  process.env.NODE_ENV !== "production" ||
  database.hostname !== "127.0.0.1" ||
  database.port !== "5432" ||
  database.username !== "ci_test" ||
  database.pathname !== "/edupay_production_smoke_ci"
) {
  throw new Error("El smoke de producción sólo permite su base desechable local de CI.");
}
const require = createRequire(import.meta.url);
for (const config of [neonConfig, require("@neondatabase/serverless").neonConfig]) {
  config.wsProxy = () => "127.0.0.1:54330/v2";
  config.useSecureWebSocket = false;
  config.forceDisablePgSSL = true;
  config.pipelineConnect = false;
}
