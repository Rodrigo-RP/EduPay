import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard } from "lucide-react";
import { fetchDashboardUrl } from "@/lib/dashboard-link";

/**
 * Botón para volver al Dashboard. Lo ven todos los usuarios (personal y tutores) y solo cuando el SSO está activo
 * y el servidor informa la URL del Dashboard. No cierra la sesión de EduPay: solo navega; la sesión por inactividad sigue su curso.
 */
export default function BackToDashboardButton({ className = "" }: { className?: string }) {
  const { data: url } = useQuery<string | null>({
    queryKey: ["dashboard-link"],
    queryFn: fetchDashboardUrl,
    staleTime: Infinity,
    retry: false,
  });
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
