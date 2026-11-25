import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard } from "lucide-react";
import { fetchDashboardUrl, storedDashboardUrl } from "@/lib/dashboard-link";

/**
 * Botón para volver al Dashboard. Lo ven todos los usuarios y solo cuando se conoce la URL del Dashboard.
 * No cierra la sesión de EduPay: solo navega; la sesión por inactividad sigue su curso.
 *
 * `allowFetch`: el personal puede consultar `/api/auth/sso/config`. El portal de tutores NO (solo puede llamar a
 * `/api/guardian/*`), así que allí se usa la URL guardada al entrar por SSO.
 */
export default function BackToDashboardButton({ className = "", allowFetch = false }: { className?: string; allowFetch?: boolean }) {
  const { data: fetched } = useQuery<string | null>({
    queryKey: ["dashboard-link"],
    queryFn: fetchDashboardUrl,
    enabled: allowFetch && !storedDashboardUrl(),
    staleTime: Infinity,
    retry: false,
  });
  const url = storedDashboardUrl() ?? fetched ?? null;
  if (!url) return null;
  return (
    <a
      href={url}
      data-testid="back-to-dashboard"
      title="Volver al Dashboard"
      aria-label="Volver al Dashboard"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors ${className}`}
    >
      <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Dashboard</span>
    </a>
  );
}
