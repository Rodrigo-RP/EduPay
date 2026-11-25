import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

vi.mock("../db", () => ({ db: {}, pool: { query: vi.fn() } }));

import { wsManager } from "../websocket-manager";

const sock = (tenant: number | undefined, open = true) =>
  ({
    readyState: open ? WebSocket.OPEN : WebSocket.CLOSED,
    send: vi.fn(),
    user: tenant === undefined ? undefined : { id: 1, tenant_id: tenant, campus_id: 1, role: "asistente", email: "x@example.invalid" },
  }) as any;

describe("Aviso de cambios por WebSocket", () => {
  it("solo recibe quien tiene sesión de esa escuela, sin datos en el mensaje", () => {
    const a = sock(7), b = sock(8), sinSesion = sock(undefined), cerrada = sock(7, false);
    (wsManager as any).clients = new Map([[1, [a]], [2, [b]], [3, [sinSesion]], [4, [cerrada]]]);
    wsManager.broadcastDataChanged(7);
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(a.send.mock.calls[0][0])).toEqual({ type: "data_changed", metadata: { timestamp: expect.any(String) } });
    for (const s of [b, sinSesion, cerrada]) expect(s.send).not.toHaveBeenCalled();
  });

  it("tenantId nulo avisa a todas las escuelas con sesión", () => {
    const a = sock(7), b = sock(8), sinSesion = sock(undefined);
    (wsManager as any).clients = new Map([[1, [a]], [2, [b]], [3, [sinSesion]]]);
    wsManager.broadcastDataChanged(null);
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(sinSesion.send).not.toHaveBeenCalled();
  });

  it("una conexión que falla al enviar no impide avisar a las demás", () => {
    const rota = sock(7);
    rota.send.mockImplementation(() => { throw new Error("socket roto"); });
    const buena = sock(7);
    (wsManager as any).clients = new Map([[1, [rota]], [2, [buena]]]);
    expect(() => wsManager.broadcastDataChanged(7)).not.toThrow();
    expect(buena.send).toHaveBeenCalledTimes(1);
  });
});
