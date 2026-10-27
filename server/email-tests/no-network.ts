import { vi, beforeEach, afterEach } from "vitest";
// Hard fail if a test accidentally imports the application's connected modules.
vi.mock("../db",()=>{throw new Error("Base real prohibida en pruebas de correo");});
vi.mock("../storage",()=>{throw new Error("Storage real prohibido en pruebas de correo");});
vi.mock("pg",()=>{throw new Error("PostgreSQL conectado prohibido");});
vi.mock("@neondatabase/serverless",()=>{throw new Error("Neon conectado prohibido");});
vi.mock("node:net",async importOriginal=>({
  ...await importOriginal<typeof import("node:net")>(),
  connect:()=>{throw new Error("Red saliente prohibida");},
  createConnection:()=>{throw new Error("Red saliente prohibida");},
}));
vi.mock("node:http",()=>({request:()=>{throw new Error("HTTP saliente prohibido");},get:()=>{throw new Error("HTTP saliente prohibido");}}));
vi.mock("node:https",()=>({request:()=>{throw new Error("HTTPS saliente prohibido");},get:()=>{throw new Error("HTTPS saliente prohibido");}}));
beforeEach(()=>{
  vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("Fetch saliente prohibido");}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
