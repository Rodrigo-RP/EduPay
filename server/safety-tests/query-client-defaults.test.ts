import { describe, expect, it } from "vitest";
import { queryClient, QUERY_STALE_MS } from "../../client/src/lib/queryClient";

describe("Caché de consultas del cliente", () => {
  it("los datos se refrescan: caducan a los 30 s y se recargan al volver a la pestaña", () => {
    const q = queryClient.getDefaultOptions().queries!;
    expect(QUERY_STALE_MS).toBe(30_000);
    expect(q.staleTime).toBe(30_000);
    expect(q.refetchOnWindowFocus).toBe(true);
    expect(q.retry).toBe(false);
  });
});
