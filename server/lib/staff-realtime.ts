import { WebSocket } from "ws";

const sockets = new Map<number, Set<WebSocket>>();
const generations = new Map<number, number>();
export const staffRealtimeGeneration = (userId: number) => generations.get(userId) ?? 0;

/** La generación cierra la carrera entre una autenticación WS pendiente y un reset. */
export function registerStaffSocket(userId: number, socket: WebSocket, expiresAt: number, generation: number): boolean {
  if (generation !== staffRealtimeGeneration(userId) || expiresAt <= Date.now() || socket.readyState !== WebSocket.OPEN) {
    socket.close(4001, "Sesión terminada"); return false;
  }
  const group = sockets.get(userId) ?? new Set<WebSocket>();
  group.add(socket); sockets.set(userId, group);
  const timer = setTimeout(() => socket.close(4001, "Sesión terminada"), expiresAt - Date.now());
  timer.unref();
  socket.once("close", () => {
    clearTimeout(timer); group.delete(socket);
    if (!group.size && sockets.get(userId) === group) sockets.delete(userId);
  });
  return true;
}

/** Invocar sólo después de persistir el cambio de contraseña o restablecimiento. */
export function revokeStaffRealtime(userId: number): void {
  generations.set(userId, staffRealtimeGeneration(userId) + 1);
  sockets.get(userId)?.forEach(socket => socket.close(4001, "Sesión terminada"));
  sockets.delete(userId);
}
