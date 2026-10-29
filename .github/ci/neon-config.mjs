// Sólo se precarga en CI. No cambia el transporte de la aplicación publicada.
import { createRequire } from "node:module";
import { neonConfig } from "@neondatabase/serverless";

if (process.env.APP_ENV !== "test" || process.env.CI !== "true") {
  throw new Error("El adaptador de PostgreSQL desechable sólo se permite en CI de pruebas.");
}
const database = new URL(process.env.DATABASE_URL);
if (database.hostname !== "127.0.0.1" || database.pathname !== "/edupay_ci") {
  throw new Error("El adaptador sólo permite la base local edupay_ci.");
}
// tsx/Vitest pueden resolver las exportaciones ESM o CommonJS del mismo SDK.
const require = createRequire(import.meta.url);
for (const config of [neonConfig, require("@neondatabase/serverless").neonConfig]) {
  config.wsProxy = () => "127.0.0.1:54330/v2";
  config.useSecureWebSocket = false;
  config.forceDisablePgSSL = true;
  // El servicio usa trust: no adelantar un mensaje de contraseña que no pidió.
  config.pipelineConnect = false;
}
