import { createHash } from "node:crypto";
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value!==null&&typeof value==="object")return Object.fromEntries(
    Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])]),
  );
  return value;
}
// PostgreSQL JSONB does not preserve object key ordering.
export function digest(value:unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
