import { useEffect, useState, type ReactNode } from "react";
import { fetchLoginDecision, goToDashboard, type LoginDecision } from "@/lib/sso-only";

/**
 * Envuelve las pantallas de inicio de sesión propio. Con SSO_ONLY activo no se muestran: la persona se manda al Dashboard
 * (salvo la ruta de acceso de emergencia del superadministrador, si el servidor la habilita).
 */
export default function LoginGate({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<LoginDecision | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchLoginDecision(window.location.pathname).then((d) => {
      if (!alive) return;
      setDecision(d);
      if (d.kind === "redirect") goToDashboard(d.url);
    });
    return () => { alive = false; };
  }, []);

  if (!decision) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Cargando" />
      </div>
    );
  }
  if (decision.kind === "normal" || decision.kind === "emergency") return <>{children}</>;

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6" data-testid="sso-only-screen">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-xl font-semibold text-slate-900">Entra desde el Dashboard</h1>
        {decision.kind === "redirect" ? (
          <>
            <p className="text-slate-600 text-sm">EduPay ya no tiene inicio de sesión propio. Te llevamos al Dashboard…</p>
            <a className="text-blue-600 underline text-sm" href={decision.url}>Ir al Dashboard</a>
          </>
        ) : (
          <p className="text-slate-600 text-sm">EduPay ya no tiene inicio de sesión propio. Abre el Dashboard de tu escuela para entrar.</p>
        )}
      </div>
    </main>
  );
}
