import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createDataChangedHandler, refreshActiveData } from "../../client/src/lib/data-changed";

describe("Cliente: recarga por aviso de cambios", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invalida las consultas, salvo las marcadas con meta.realtime = false (formularios)", async () => {
    const qc = new QueryClient();
    const invalidated: string[] = [];
    vi.spyOn(qc, "invalidateQueries").mockImplementation(async (filters: any) => {
      for (const q of qc.getQueryCache().getAll()) if (filters.predicate(q)) invalidated.push(String(q.queryKey[0]));
    });
    qc.getQueryCache().build(qc, { queryKey: ["/api/students"] });
    qc.getQueryCache().build(qc, { queryKey: ["/api/profile"], meta: { realtime: false } });
    await refreshActiveData(qc);
    expect(invalidated).toEqual(["/api/students"]);
  });

  it("agrupa una ráfaga de avisos en una sola recarga", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    const handler = createDataChangedHandler(qc, 800);
    for (let i = 0; i < 10; i++) handler.notify();
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(900);
    expect(spy).toHaveBeenCalledTimes(1);
    handler.notify();
    await vi.advanceTimersByTimeAsync(900);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("cancel evita la recarga pendiente", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    const handler = createDataChangedHandler(qc, 800);
    handler.notify();
    handler.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy).not.toHaveBeenCalled();
  });
});
