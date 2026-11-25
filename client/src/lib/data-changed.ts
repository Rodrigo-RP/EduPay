/**
 * Aviso genérico de cambios (WebSocket `data_changed`): recarga las consultas activas.
 *
 * - Las consultas que rellenan un formulario se excluyen con `meta: { realtime: false }` para no pisar lo que se está escribiendo.
 * - Se agrupa en una ventana corta: una ráfaga de avisos provoca una sola recarga.
 */
import type { QueryClient } from "@tanstack/react-query";

export const DATA_CHANGED_DEBOUNCE_MS = 800;

export function refreshActiveData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: (query) => query.meta?.realtime !== false });
}

export function createDataChangedHandler(queryClient: QueryClient, delayMs = DATA_CHANGED_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    notify() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void refreshActiveData(queryClient);
      }, delayMs);
    },
    cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
    },
  };
}
