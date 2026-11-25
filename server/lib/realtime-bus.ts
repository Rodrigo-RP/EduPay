/**
 * server/lib/realtime-bus.ts
 *
 * Aviso genérico de "algo cambió" entre instancias de Cloud Run y procesos (Job de sincronización) usando
 * LISTEN/NOTIFY de PostgreSQL. No usa tablas ni migraciones y NO transporta datos: solo el id de la escuela y el origen,
 * así que no puede filtrar información. Cada instancia escucha el canal y avisa a SUS navegadores conectados por
 * WebSocket; el navegador recarga las consultas activas (ver client/src/lib/data-changed.ts).
 *
 * Alcance: cualquier escritura que pase por la API (POST, PUT, PATCH, DELETE con respuesta 2xx) y las corridas
 * aplicadas de la sincronización con el Dashboard. Los cambios hechos directo en la base no avisan.
 */
import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";

export const REALTIME_CHANNEL = "edupay_data_changed";

export interface DataChange {
  /** null = todas las escuelas (p. ej. un webhook sin sesión). */
  tenantId: number | null;
  source: "api" | "sync";
}

interface Queryable { query: (sql: string, params?: unknown[]) => Promise<unknown> }

export function encodeChange(change: DataChange): string {
  return JSON.stringify({ t: change.tenantId, s: change.source });
}

export function decodeChange(payload: string | undefined | null): DataChange | null {
  try {
    const raw = JSON.parse(String(payload ?? ""));
    const t = raw?.t;
    if (t !== null && !(Number.isInteger(t) && t > 0)) return null;
    return { tenantId: t, source: raw?.s === "sync" ? "sync" : "api" };
  } catch {
    return null;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Rutas que escriben pero no cambian datos que el usuario vea: sesión, asistente y vistas previas.
const IGNORED = /^\/api\/(auth\/|assistant\/)|\/preview\/?$/;

export function shouldNotifyRequest(method: string, path: string, status: number): boolean {
  return MUTATING.has(method.toUpperCase()) && status >= 200 && status < 300 && path.startsWith("/api/") && !IGNORED.test(path);
}

/** Publica un aviso. Nunca lanza: un fallo del aviso no debe romper la operación que lo originó. */
export async function publishDataChange(db: Queryable, change: DataChange): Promise<void> {
  try {
    await db.query("SELECT pg_notify($1, $2)", [REALTIME_CHANNEL, encodeChange(change)]);
  } catch (err) {
    console.warn("[realtime] no se pudo publicar el aviso:", (err as Error)?.message);
  }
}

/** Agrupa avisos de ráfagas (p. ej. una importación) para no inundar el canal: uno por escuela cada `windowMs`. */
export function createCoalescedPublisher(db: Queryable, windowMs = 250) {
  const pending = new Map<string, DataChange>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const batch = Array.from(pending.values());
    pending.clear();
    for (const change of batch) void publishDataChange(db, change);
  };
  return (change: DataChange) => {
    pending.set(`${change.tenantId ?? "all"}:${change.source}`, change);
    if (!timer) {
      timer = setTimeout(flush, windowMs);
      timer.unref?.();
    }
  };
}

/** Middleware: tras una escritura exitosa de la API, avisa que hubo cambios en la escuela de quien la hizo. */
export function dataChangeMiddleware(publish: (change: DataChange) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (MUTATING.has(req.method)) {
      res.on("finish", () => {
        const path = (req.originalUrl || req.url || "").split("?")[0];
        if (!shouldNotifyRequest(req.method, path, res.statusCode)) return;
        const actor = req as any;
        const tenant = Number(actor.user?.tenant_id ?? actor.guardian?.tenant_id);
        publish({ tenantId: Number.isInteger(tenant) && tenant > 0 ? tenant : null, source: "api" });
      });
    }
    next();
  };
}

type ListenerPool = Pick<Pool, "connect">;

/**
 * Mantiene UNA conexión dedicada escuchando el canal (LISTEN necesita una sesión permanente, no sirve el pool normal).
 * Si se cae, reintenta con espera creciente; una consulta `SELECT 1` cada minuto detecta conexiones muertas.
 */
export function startRealtimeListener(pool: ListenerPool, onChange: (change: DataChange) => void) {
  let stopped = false;
  let delay = 1000;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let current: import("pg").PoolClient | null = null;

  // La conexión tiene un LISTEN activo: siempre se destruye al soltarla, nunca vuelve al pool.
  const drop = () => {
    if (keepalive) { clearInterval(keepalive); keepalive = null; }
    const client = current;
    current = null;
    if (client) {
      client.removeAllListeners("notification");
      client.removeAllListeners("error");
      try { client.release(true); } catch { /* ya liberada */ }
    }
  };

  const schedule = () => {
    if (stopped || retry) return;
    retry = setTimeout(() => { retry = null; void connect(); }, delay);
    retry.unref?.();
    delay = Math.min(delay * 2, 30_000);
  };

  const connect = async () => {
    if (stopped) return;
    try {
      const client = await pool.connect();
      current = client;
      client.on("notification", (msg) => {
        if (msg?.channel !== REALTIME_CHANNEL) return;
        const change = decodeChange(msg.payload);
        if (change) onChange(change);
      });
      client.on("error", () => { drop(); schedule(); });
      await client.query(`LISTEN ${REALTIME_CHANNEL}`);
      delay = 1000;
      keepalive = setInterval(() => {
        current?.query("SELECT 1").catch(() => { drop(); schedule(); });
      }, 60_000);
      keepalive.unref?.();
    } catch (err) {
      console.warn("[realtime] no se pudo escuchar el canal:", (err as Error)?.message);
      drop();
      schedule();
    }
  };

  void connect();
  return {
    stop() {
      stopped = true;
      if (retry) { clearTimeout(retry); retry = null; }
      drop();
    },
  };
}
