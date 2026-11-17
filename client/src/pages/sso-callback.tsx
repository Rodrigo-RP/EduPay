/**
 * /sso — Entrada desde el Dashboard-Refereence (inicio de sesión único).
 *
 * El Dashboard redirige aquí con una aserción firmada de vida corta en el FRAGMENTO de la URL
 * (`/sso#a=<jwt>`): el fragmento no viaja al servidor ni queda en registros ni en `Referer`.
 * La aserción se lee una sola vez, se borra de la barra de direcciones y se canjea en
 * POST /api/auth/sso/exchange por una sesión de EduPay (las mismas claves de localStorage que usa
 * el inicio de sesión normal). Una aserción solo se canjea una vez, así que el canje no puede repetirse.
 */
import { useEffect, useRef, useState } from "react";
import { GraduationCap, Loader2, AlertCircle, CheckCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Phase = "loading" | "totp" | "success" | "error";

const FRIENDLY: Record<string, string> = {
  SSO_SCHOOL_NOT_ENABLED: "Tu escuela aún no está activada en EduPay.",
  SSO_NOT_LINKED: "Tu cuenta todavía no está vinculada a EduPay. Pide a tu escuela que la active.",
  SSO_ACCOUNT_DISABLED: "Tu cuenta está desactivada. Contacta al administrador de tu escuela.",
  SSO_NO_ACTIVE_FAMILY: "Tu acceso está suspendido porque no perteneces a una familia activa.",
  SSO_REPLAYED: "Este enlace ya se usó. Vuelve a entrar desde el Dashboard.",
  SSO_INVALID_ASSERTION: "El enlace de acceso no es válido o ya venció. Vuelve a entrar desde el Dashboard.",
  SSO_NOT_CONFIGURED: "El inicio de sesión único no está disponible por ahora.",
};

/** Lee la aserción del fragmento y la borra de la URL en el mismo paso. */
function takeAssertionFromHash(): string | null {
  const raw = window.location.hash.replace(/^#/, "");
  const value = new URLSearchParams(raw).get("a");
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return value && value.length >= 20 ? value : null;
}

export default function SsoCallback() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const assertionRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  async function loadDashboardUrl() {
    try {
      const res = await fetch("/api/auth/sso/config");
      const cfg = await res.json();
      if (typeof cfg?.dashboard_url === "string") setDashboardUrl(cfg.dashboard_url);
    } catch { /* el botón simplemente no aparece */ }
  }

  function fail(text: string) {
    setMessage(text);
    setPhase("error");
    void loadDashboardUrl();
  }

  async function exchange(totp?: string) {
    const assertion = assertionRef.current;
    if (!assertion) return fail(FRIENDLY.SSO_INVALID_ASSERTION);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion, ...(totp ? { totp_code: totp } : {}) }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.requires_totp) { setPhase("totp"); return; }
      if (res.ok && data.token) {
        assertionRef.current = null;
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_type", data.kind === "guardian" ? "guardian" : "user");
        localStorage.setItem("auth_user", JSON.stringify(data.kind === "guardian" ? data.guardian : data.user));
        setPhase("success");
        // Recarga completa para que AuthProvider (montado en la raíz) relea localStorage.
        setTimeout(() => { window.location.href = data.kind === "guardian" ? "/portal-3clics" : "/"; }, 600);
        return;
      }
      if (data.code === "SSO_INVALID_TOTP") { setMessage(data.message || "Código incorrecto."); setPhase("totp"); return; }
      fail(FRIENDLY[data.code] || data.message || "No se pudo completar el acceso.");
    } catch {
      fail("Error de conexión. Intenta de nuevo desde el Dashboard.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // La aserción es de un solo uso: el modo estricto de React ejecuta este efecto dos veces en desarrollo.
    if (startedRef.current) return;
    startedRef.current = true;
    assertionRef.current = takeAssertionFromHash();
    if (!assertionRef.current) { fail(FRIENDLY.SSO_INVALID_ASSERTION); return; }
    void exchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <GraduationCap className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">EduPay</h1>
        <p className="text-sm text-slate-500 mb-6">Acceso desde el Dashboard</p>

        {phase === "loading" && (
          <div className="space-y-3" role="status">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
            <p className="text-slate-600 font-medium">Verificando tu acceso…</p>
          </div>
        )}

        {phase === "totp" && (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void exchange(code.trim()); }}
          >
            <ShieldCheck className="w-12 h-12 text-blue-500 mx-auto" />
            <div>
              <p className="font-semibold text-slate-800">Verificación en dos pasos</p>
              <p className="text-sm text-slate-600 mt-1">
                Ingresa el código de 6 dígitos de tu aplicación de autenticación.
              </p>
            </div>
            <Input
              id="sso-totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Código de verificación"
              className="text-center text-lg tracking-widest"
              autoFocus
            />
            {message && <p className="text-sm text-red-600" role="alert">{message}</p>}
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? "Verificando…" : "Continuar"}
            </Button>
          </form>
        )}

        {phase === "success" && (
          <div className="space-y-3">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-slate-700 font-semibold">¡Acceso confirmado!</p>
            <p className="text-xs text-slate-400">Entrando a EduPay…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="text-sm text-slate-700 leading-relaxed" role="alert">{message}</p>
            {dashboardUrl && (
              <Button className="w-full" onClick={() => { window.location.href = dashboardUrl; }}>
                Volver al Dashboard
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
