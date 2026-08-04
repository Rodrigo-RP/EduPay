/**
 * /pagar/:token — Ruta pública de acceso mágico para tutores.
 * Canjea el token con el backend, guarda el JWT y redirige al portal de pago.
 */
import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { GraduationCap, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "loading" | "success" | "expired" | "error";

export default function MagicLinkRedirect() {
  const { token } = useParams<{ token: string }>();
  const [, navigate]   = useLocation();
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); return; }

    fetch(`/api/auth/magic/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 410) { setState("expired"); setMessage(data.message); }
          else { setState("error"); setMessage(data.message || "Error desconocido"); }
          return;
        }
        // Guardar JWT y datos del tutor — mismas claves que guardian-login en use-auth.tsx
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_type", "guardian");
        localStorage.setItem("auth_user", JSON.stringify(data.guardian));
        setState("success");
        // Hard-reload para que AuthProvider (montado en la raíz) re-lea localStorage.
        // navigate() de wouter NO remonta AuthProvider, por lo que el guardian
        // nunca aparecería en el contexto de autenticación.
        setTimeout(() => { window.location.href = "/portal-3clics"; }, 800);
      })
      .catch(() => { setState("error"); setMessage("Error de conexión"); });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
        {/* Logo */}
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <GraduationCap className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">Portal de Pagos</h1>
        <p className="text-sm text-slate-500 mb-6">Instituto JFR</p>

        {state === "loading" && (
          <div className="space-y-3">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
            <p className="text-slate-600 font-medium">Verificando tu acceso…</p>
            <p className="text-xs text-slate-400">Solo toma un momento</p>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-3">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-slate-700 font-semibold">¡Acceso confirmado!</p>
            <p className="text-xs text-slate-400">Redirigiendo al portal de pagos…</p>
          </div>
        )}

        {state === "expired" && (
          <div className="space-y-4">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
            <div>
              <p className="font-semibold text-slate-800">Liga expirada o usada</p>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                {message || "Esta liga de acceso ya fue utilizada o ha expirado (72 horas)."}
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <p className="font-medium mb-1">¿Qué puedo hacer?</p>
              <p>Solicita una nueva liga al plantel — el administrador puede generarla en menos de un minuto.</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/login")}
            >
              Iniciar sesión con contraseña
            </Button>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <div>
              <p className="font-semibold text-slate-800">Liga inválida</p>
              <p className="text-sm text-slate-600 mt-1">
                {message || "No se pudo verificar esta liga. Solicita una nueva al plantel."}
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/login")}
            >
              Iniciar sesión
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
