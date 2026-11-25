import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { registerStaffSocket, closeInactiveStaffSockets, staffRealtimeGeneration } from "../lib/staff-realtime";

// Conexiones en vivo de quien se desactiva: el servicio las cierra aunque la baja la haya decidido otro proceso.
const socket = () => ({ readyState: WebSocket.OPEN, close: vi.fn(), once: vi.fn() }) as any;
const farFuture = () => Date.now() + 3_600_000;

describe("Cierre de conexiones en vivo de usuarios desactivados", () => {
  it("cierra con 4001 solo las conexiones de quien ya no está activo", async () => {
    const baja = socket(); const bajaOtraPestana = socket(); const activo = socket();
    expect(registerStaffSocket(9001, baja, farFuture(), staffRealtimeGeneration(9001))).toBe(true);
    expect(registerStaffSocket(9001, bajaOtraPestana, farFuture(), staffRealtimeGeneration(9001))).toBe(true);
    expect(registerStaffSocket(9002, activo, farFuture(), staffRealtimeGeneration(9002))).toBe(true);

    const asked: number[][] = [];
    const closed = await closeInactiveStaffSockets(async (ids) => { asked.push(ids); return ids.filter((id) => id === 9001); });

    expect(closed).toBe(1);
    expect(asked[0]).toEqual(expect.arrayContaining([9001, 9002]));
    expect(baja.close).toHaveBeenCalledWith(4001, "Sesión terminada");
    expect(bajaOtraPestana.close).toHaveBeenCalledWith(4001, "Sesión terminada");
    expect(activo.close).not.toHaveBeenCalled();
  });

  it("sin conexiones abiertas no consulta nada", async () => {
    // Se desactiva también al usuario que quedaba con conexión (9002) para dejar el registro vacío.
    await closeInactiveStaffSockets(async (ids) => ids);
    const findInactive = vi.fn(async () => []);
    expect(await closeInactiveStaffSockets(findInactive)).toBe(0);
    expect(findInactive).not.toHaveBeenCalled();
  });
});
