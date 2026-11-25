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

/**
 * Cierra las conexiones en vivo de quien dejó de estar activo. Una baja puede decidirla otro proceso (la sincronización
 * con el Dashboard corre en un Job aparte y no alcanza estos sockets), así que el servicio revisa cada tanto a quienes
 * tienen una conexión abierta. `findInactive` devuelve, de los ids dados, los que ya no están activos.
 */
export async function closeInactiveStaffSockets(findInactive: (userIds: number[]) => Promise<number[]>): Promise<number> {
  const connected = Array.from(sockets.keys());
  if (!connected.length) return 0;
  const inactive = await findInactive(connected);
  for (const userId of inactive) {
    sockets.get(userId)?.forEach(socket => socket.close(4001, "Sesión terminada"));
    sockets.delete(userId);
  }
  return inactive.length;
}

/** Invocar sólo después de persistir el cambio de contraseña o restablecimiento. */
export function revokeStaffRealtime(userId: number): void {
  generations.set(userId, staffRealtimeGeneration(userId) + 1);
  sockets.get(userId)?.forEach(socket => socket.close(4001, "Sesión terminada"));
  sockets.delete(userId);
}
