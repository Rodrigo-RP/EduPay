import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  REALTIME_CHANNEL, createCoalescedPublisher, dataChangeMiddleware, decodeChange, encodeChange, publishDataChange,
  shouldNotifyRequest, startRealtimeListener,
} from "../lib/realtime-bus";

describe("Aviso genérico de cambios: codificación", () => {
  it("el aviso solo lleva escuela y origen, y se decodifica de forma estricta", () => {
    const payload = encodeChange({ tenantId: 7, source: "api" });
    expect(JSON.parse(payload)).toEqual({ t: 7, s: "api" });
    expect(decodeChange(payload)).toEqual({ tenantId: 7, source: "api" });
    expect(decodeChange(encodeChange({ tenantId: null, source: "sync" }))).toEqual({ tenantId: null, source: "sync" });
  });

  it("descarta avisos mal formados", () => {
    for (const bad of ["", "no es json", "{}", '{"t":"7"}', '{"t":0}', '{"t":-1}', '{"t":1.5}', undefined, null]) {
      expect(decodeChange(bad as any), String(bad)).toBeNull();
    }
  });
});

describe("Qué escrituras avisan", () => {
  it("avisan las escrituras exitosas de la API (crear, actualizar, eliminar)", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) expect(shouldNotifyRequest(m, "/api/students", 200)).toBe(true);
    expect(shouldNotifyRequest("POST", "/api/charges", 201)).toBe(true);
    expect(shouldNotifyRequest("DELETE", "/api/users/5", 204)).toBe(true);
  });

  it("no avisan lecturas, errores, sesión, asistente ni vistas previas", () => {
    expect(shouldNotifyRequest("GET", "/api/students", 200)).toBe(false);
    expect(shouldNotifyRequest("POST", "/api/students", 400)).toBe(false);
    expect(shouldNotifyRequest("POST", "/api/students", 500)).toBe(false);
    expect(shouldNotifyRequest("POST", "/api/auth/sso/renew", 200)).toBe(false);
    expect(shouldNotifyRequest("POST", "/api/auth/login", 200)).toBe(false);
    expect(shouldNotifyRequest("POST", "/api/assistant/chat", 200)).toBe(false);
    expect(shouldNotifyRequest("POST", "/api/notifications/email/preview", 200)).toBe(false);
    expect(shouldNotifyRequest("POST", "/ws/realtime", 200)).toBe(false);
  });
});

describe("Publicación", () => {
  it("usa pg_notify con el canal y el aviso, y nunca lanza si la base falla", async () => {
    const query = vi.fn(async () => ({}));
    await publishDataChange({ query }, { tenantId: 3, source: "sync" });
    expect(query).toHaveBeenCalledWith("SELECT pg_notify($1, $2)", [REALTIME_CHANNEL, encodeChange({ tenantId: 3, source: "sync" })]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(publishDataChange({ query: async () => { throw new Error("caída"); } }, { tenantId: 3, source: "api" })).resolves.toBeUndefined();
    warn.mockRestore();
  });

  describe("agrupación de ráfagas", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("una ráfaga de escrituras de la misma escuela produce un solo aviso; escuelas distintas, uno cada una", async () => {
      const query = vi.fn(async () => ({}));
      const publish = createCoalescedPublisher({ query }, 250);
      for (let i = 0; i < 20; i++) publish({ tenantId: 1, source: "api" });
      publish({ tenantId: 2, source: "api" });
      expect(query).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);
      expect(query).toHaveBeenCalledTimes(2);
      publish({ tenantId: 1, source: "api" });
      await vi.advanceTimersByTimeAsync(300);
      expect(query).toHaveBeenCalledTimes(3);
    });
  });
});

function fakeReq(method: string, url: string, extra: Record<string, unknown> = {}) {
  const res = new EventEmitter() as any;
  res.statusCode = 200;
  return { req: { method, originalUrl: url, url, ...extra } as any, res };
}

describe("Middleware de la API", () => {
  it("al terminar una escritura exitosa publica el aviso de la escuela de quien la hizo", () => {
    const publish = vi.fn();
    const { req, res } = fakeReq("PUT", "/api/students/9?x=1", { user: { tenant_id: 7 } });
    const next = vi.fn();
    dataChangeMiddleware(publish)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled(); // espera a que la respuesta termine
    res.emit("finish");
    expect(publish).toHaveBeenCalledWith({ tenantId: 7, source: "api" });
  });

  it("usa la escuela del tutor y, sin sesión (webhook), avisa a todas", () => {
    const publish = vi.fn();
    let { req, res } = fakeReq("POST", "/api/guardian/pay", { guardian: { tenant_id: 4 } });
    dataChangeMiddleware(publish)(req, res, vi.fn()); res.emit("finish");
    ({ req, res } = fakeReq("POST", "/api/webhooks/stripe"));
    dataChangeMiddleware(publish)(req, res, vi.fn()); res.emit("finish");
    expect(publish.mock.calls).toEqual([[{ tenantId: 4, source: "api" }], [{ tenantId: null, source: "api" }]]);
  });

  it("no avisa lecturas ni respuestas con error", () => {
    const publish = vi.fn();
    let { req, res } = fakeReq("GET", "/api/students");
    dataChangeMiddleware(publish)(req, res, vi.fn()); res.emit("finish");
    ({ req, res } = fakeReq("POST", "/api/students", { user: { tenant_id: 7 } }));
    res.statusCode = 403;
    dataChangeMiddleware(publish)(req, res, vi.fn()); res.emit("finish");
    expect(publish).not.toHaveBeenCalled();
  });
});

function fakeListenerPool() {
  const clients: any[] = [];
  const pool = {
    connect: vi.fn(async () => {
      const client: any = new EventEmitter();
      client.query = vi.fn(async () => ({}));
      client.release = vi.fn();
      clients.push(client);
      return client;
    }),
  };
  return { pool: pool as any, clients };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("Escucha del canal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("escucha el canal y entrega solo avisos válidos de ese canal", async () => {
    const { pool, clients } = fakeListenerPool();
    const seen: unknown[] = [];
    const listener = startRealtimeListener(pool, (c) => seen.push(c));
    await flush();
    expect(clients[0].query).toHaveBeenCalledWith(`LISTEN ${REALTIME_CHANNEL}`);
    clients[0].emit("notification", { channel: REALTIME_CHANNEL, payload: encodeChange({ tenantId: 7, source: "api" }) });
    clients[0].emit("notification", { channel: "otro_canal", payload: encodeChange({ tenantId: 8, source: "api" }) });
    clients[0].emit("notification", { channel: REALTIME_CHANNEL, payload: "basura" });
    expect(seen).toEqual([{ tenantId: 7, source: "api" }]);
    listener.stop();
  });

  it("si la conexión falla, la destruye y reconecta con espera", async () => {
    const { pool, clients } = fakeListenerPool();
    const seen: unknown[] = [];
    const listener = startRealtimeListener(pool, (c) => seen.push(c));
    await flush();
    clients[0].emit("error", new Error("conexión perdida"));
    expect(clients[0].release).toHaveBeenCalledWith(true); // destruida, no devuelta al pool con un LISTEN activo
    await vi.advanceTimersByTimeAsync(1100);
    await flush();
    expect(clients).toHaveLength(2);
    clients[1].emit("notification", { channel: REALTIME_CHANNEL, payload: encodeChange({ tenantId: null, source: "sync" }) });
    expect(seen).toEqual([{ tenantId: null, source: "sync" }]);
    listener.stop();
  });

  it("si no puede conectar, reintenta; al detenerse libera la conexión y no vuelve a conectar", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, clients } = fakeListenerPool();
    pool.connect.mockRejectedValueOnce(new Error("sin base"));
    const listener = startRealtimeListener(pool, () => {});
    await flush();
    expect(clients).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1100);
    await flush();
    expect(clients).toHaveLength(1);
    listener.stop();
    expect(clients[0].release).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(clients).toHaveLength(1);
    warn.mockRestore();
  });
});
