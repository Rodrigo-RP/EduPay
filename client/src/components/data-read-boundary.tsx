import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

// Consultas del barrido. Un fallo no equivale a una lista vacía o un saldo cero.
export const degradedReadPrefixes = [
  "/api/admin/dashboard", "/api/scholarships",
  "/api/admin/cargos", "/api/dashboard/comandos",
  "/api/admin/magic-link/history",
  "/api/caja/movimientos-banco", "/api/caja/estadisticas-conciliacion",
  "/api/fiscal", "/api/fiscal/estadisticas-cfdi", "/api/planes-pago", "/api/receivables", "/api/crm/prospects",
  "/api/caja", "/api/admin/charges", "/api/migration/projects",
  "/api/reportes/admisiones",
];

function isAffected(query: Query): boolean {
  const path = String(query.queryKey[0] ?? "").split("?")[0];
  const matches = degradedReadPrefixes.includes(path)
    || /^\/api\/(?:admin\/dashboard|dashboard\/comandos|planes-pago)\/\d+$/.test(path)
    || /^\/api\/students\/\d+\/estado-cuenta$/.test(path)
    || /^\/api\/admin\/magic-link\/history\/\d+$/.test(path);
  const failedOrRetrying = query.state.status === "error"
    || (query.state.fetchStatus === "fetching"
      && query.state.errorUpdatedAt > 0
      && query.state.errorUpdatedAt >= query.state.dataUpdatedAt);
  return matches && query.getObserversCount() > 0 && failedOrRetrying;
}

export default function DataReadBoundary({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const subscribe = useCallback((notify: () => void) => cache.subscribe(notify), [cache]);
  const getSnapshot = useCallback(() => cache.getAll().some(isAffected), [cache]);
  const failed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  return (
    <>
      {failed && (
        <section role="alert" className="rounded-lg border border-red-300 bg-white p-6">
          <h2 className="font-semibold">No se pudieron cargar los datos</h2>
          <p>No es posible mostrar cifras ni resultados mientras exista este error.</p>
          <Button className="mt-3" onClick={() => void client.refetchQueries({ predicate: isAffected })}>
            Reintentar
          </Button>
        </section>
      )}
      {/* Conservar observadores montados permite reintentar sin perder la consulta. */}
      <div data-testid="data-read-content" hidden={failed}>{children}</div>
    </>
  );
}
