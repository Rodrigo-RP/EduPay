/**
 * Cliente del puente `puenteEduPayLectura` (repo Dashboard-Refereence, functions/PUENTE_EDUPAY.md).
 *
 * Solo lectura por HTTP: EduPay nunca usa el SDK de Firestore ni escribe en Firebase. La llamada va con un ID token
 * de Google de la cuenta de servicio de EduPay, con audiencia = URL de la función. El token sale de:
 *  1. `EDUPAY_BRIDGE_SA_KEY` (JSON de la cuenta de servicio) si EduPay corre fuera de Google Cloud; o
 *  2. el servidor de metadatos, si corre en Cloud Run con esa cuenta de servicio como identidad.
 * Sin dependencias nuevas: la firma RS256 usa `node:crypto`.
 */
import { createSign } from "node:crypto";
import { z } from "zod";
import type { BridgePayload } from "./firebase-bridge-plan";

export class BridgeError extends Error {
  constructor(public code: "config" | "token" | "http" | "payload", message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

export interface ServiceAccountKey { client_email: string; private_key: string; token_uri?: string }

export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new BridgeError("config", "EDUPAY_BRIDGE_SA_KEY no es JSON válido."); }
  if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
    throw new BridgeError("config", "EDUPAY_BRIDGE_SA_KEY debe traer client_email y private_key.");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri };
}

/** ID token de Google para una cuenta de servicio con llave JSON (flujo JWT bearer con `target_audience`). */
export async function idTokenFromServiceAccount(key: ServiceAccountKey, audience: string, fetchImpl: FetchLike, now = () => Date.now()): Promise<string> {
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const iat = Math.floor(now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: key.client_email, sub: key.client_email, aud: tokenUri, iat, exp: iat + 300, target_audience: audience,
  }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
  const res = await fetchImpl(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }).toString(),
  });
  if (!res.ok) throw new BridgeError("token", `Google rechazó la solicitud de token (HTTP ${res.status}).`);
  const idToken = (await res.json() as any)?.id_token;
  if (typeof idToken !== "string" || !idToken) throw new BridgeError("token", "Google no devolvió id_token.");
  return idToken;
}

/** ID token de la cuenta de servicio con la que corre el servicio (Cloud Run), vía servidor de metadatos. */
export async function idTokenFromMetadata(audience: string, fetchImpl: FetchLike): Promise<string> {
  const res = await fetchImpl(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
    { headers: { "Metadata-Flavor": "Google" } },
  ).catch(() => { throw new BridgeError("token", "No hay servidor de metadatos de Google; define EDUPAY_BRIDGE_SA_KEY."); });
  if (!res.ok) throw new BridgeError("token", `El servidor de metadatos respondió HTTP ${res.status}.`);
  const token = (await res.text()).trim();
  if (!token) throw new BridgeError("token", "El servidor de metadatos devolvió un token vacío.");
  return token;
}

const nullableText = z.string().nullish().transform((v) => v ?? null);
const payloadSchema = z.object({
  generadoEn: z.string(),
  escuelas: z.array(z.string()),
  alumnos: z.array(z.object({
    uid: z.string().min(1), estado: z.enum(["activo", "baja"]), idEscuela: nullableText, nivel: nullableText, grado: nullableText,
    grupo: nullableText, turno: nullableText, nombre: nullableText, primerApellido: nullableText, segundoApellido: nullableText,
  }).passthrough()),
  tutores: z.array(z.object({
    uid: z.string().min(1), estado: z.enum(["activo", "baja"]), rol: nullableText, idEscuela: nullableText, nombre: nullableText,
    primerApellido: nullableText, segundoApellido: nullableText, email: nullableText, telefono: nullableText, telefonoCasa: nullableText,
  }).passthrough()),
  vinculos: z.array(z.object({
    tutorUid: z.string().min(1), alumnoUid: z.string().min(1), declaradoPorTutor: z.boolean(), declaradoPorAlumno: z.boolean(),
  }).passthrough()),
}).passthrough();

export interface BridgeClientOptions {
  /** URL de la función, sin query. Se usa también como audiencia del token. */
  url: string;
  saKeyJson?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  getIdToken?: (audience: string) => Promise<string>;
}

export function bridgeOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): BridgeClientOptions {
  const url = (env.EDUPAY_BRIDGE_URL ?? "").trim();
  if (!url) throw new BridgeError("config", "Falta EDUPAY_BRIDGE_URL (URL de puenteEduPayLectura).");
  return { url, saKeyJson: env.EDUPAY_BRIDGE_SA_KEY || undefined };
}

export async function fetchBridgePayload(opts: BridgeClientOptions, idEscuela?: string): Promise<BridgePayload> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  let base: URL;
  try { base = new URL(opts.url); } catch { throw new BridgeError("config", "EDUPAY_BRIDGE_URL no es una URL válida."); }
  if (base.protocol !== "https:") throw new BridgeError("config", "EDUPAY_BRIDGE_URL debe ser https.");
  const audience = `${base.origin}${base.pathname}`;

  const idToken = opts.getIdToken
    ? await opts.getIdToken(audience)
    : opts.saKeyJson
      ? await idTokenFromServiceAccount(parseServiceAccountKey(opts.saKeyJson), audience, fetchImpl)
      : await idTokenFromMetadata(audience, fetchImpl);

  const target = new URL(audience);
  if (idEscuela) target.searchParams.set("idEscuela", idEscuela);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let res;
  try {
    res = await fetchImpl(target.toString(), { method: "GET", headers: { authorization: `Bearer ${idToken}` }, signal: controller.signal });
  } catch {
    throw new BridgeError("http", "No se pudo contactar al puente (red o tiempo de espera).");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new BridgeError("http", `El puente respondió HTTP ${res.status}.`);
  const parsed = payloadSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new BridgeError("payload", "La respuesta del puente no tiene la forma del contrato (PUENTE_EDUPAY.md).");
  return parsed.data as unknown as BridgePayload;
}
