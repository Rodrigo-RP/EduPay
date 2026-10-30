import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { expect, it } from "vitest";
import { registerStaffSocket, revokeStaffRealtime, staffRealtimeGeneration } from "../lib/staff-realtime";
import { changeInitialPassword } from "../lib/bootstrap";

it("cambiar la contraseña confirmada cierra inmediatamente un WebSocket real", async () => {
  const http = createServer();
  const wss = new WebSocketServer({ server: http });
  http.listen(0, "127.0.0.1"); await once(http, "listening");
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
  const connected = once(wss, "connection");
  const browser = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    const [socket] = await connected;
    await once(browser, "open");
    expect(registerStaffSocket(9001, socket, Date.now() + 60000, staffRealtimeGeneration(9001))).toBe(true);
    const closed = once(browser, "close");
    const client = { query: async (sql: string) => ({ rows: sql.startsWith("UPDATE") ? [{ id: 9001 }] : [] }), release() {} };
    await changeInitialPassword({ connect: async () => client }, { id: 9001, campusId: 1, tenantId: 1 }, "old-test-hash", "new-test-hash");
    const [code] = await closed;
    expect(code).toBe(4001);
    expect(socket.readyState).not.toBe(WebSocket.OPEN);
  } finally {
    browser.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>(resolve => http.close(() => resolve()));
  }
});

it("un reset durante la autenticación pendiente impide registrar la conexión antigua", () => {
  const generation = staffRealtimeGeneration(9002);
  revokeStaffRealtime(9002);
  let closed = false;
  // Objeto del protocolo usado sólo para comprobar la generación sin abrir una conexión.
  expect(staffRealtimeGeneration(9002)).not.toBe(generation);
  const socket = new WebSocket(null, undefined, { autoPong: true });
  socket.close = () => { closed = true; };
  expect(registerStaffSocket(9002, socket, Date.now() + 60000, generation)).toBe(false);
  expect(closed).toBe(true);
});
