import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RequiredTwoFactor() {
  const { logout, completeTwofa } = useAuth();
  const [enrollment, setEnrollment] = useState<{ qr_data_url: string; manual_code: string } | null>(null);
  const [confirmed, setConfirmed] = useState<{ token: string; backup_codes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function start() {
    setBusy(true); setError(""); setEnrollment(null); setCode("");
    try {
      const response = await apiRequest("/api/auth/2fa/setup", { method: "POST" });
      setEnrollment(await response.json());
    } catch { setError("No se pudo iniciar el registro. Intenta de nuevo."); }
    finally { setBusy(false); }
  }
  async function confirm(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await apiRequest("/api/auth/2fa/confirm", { method: "POST", body: JSON.stringify({ totp_code: code }) });
      setConfirmed(await response.json());
      setEnrollment(null); setCode(""); // El secreto deja de existir en el estado de la pantalla.
    } catch { setError("No se pudo confirmar. Revisa el código; si pasaron 10 minutos, genera un QR nuevo."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen grid place-items-center bg-slate-50 p-4">
    <section className="w-full max-w-lg space-y-4 rounded-lg border bg-white p-6">
      <h1 className="text-xl font-semibold">Configura la autenticación de dos factores</h1>
      {!confirmed ? <>
        <p>Es obligatoria para todo el personal. Usa una aplicación autenticadora antes de entrar a EduPay.</p>
        <Button onClick={start} disabled={busy}>{enrollment ? "Generar un QR nuevo" : "Comenzar registro"}</Button>
        {enrollment && <form onSubmit={confirm} className="space-y-4">
          <img src={enrollment.qr_data_url} alt="QR privado para registrar tu autenticador" className="mx-auto w-52" />
          <p>Si estás en el mismo celular, copia este código en tu aplicación autenticadora:</p>
          <code className="block break-all rounded bg-slate-100 p-3 select-all" data-testid="totp-manual-code">{enrollment.manual_code}</code>
          <p className="text-sm text-slate-600">Este registro vence en 10 minutos. Un QR nuevo reemplaza al anterior.</p>
          <Label htmlFor="enrollment-code">Código de 6 dígitos de tu autenticador</Label>
          <Input id="enrollment-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} />
          <Button type="submit" disabled={busy || code.length !== 6}>Confirmar dos factores</Button>
        </form>}
      </> : <>
        <h2 className="font-semibold">Guarda tus 10 códigos de respaldo</h2>
        <p>Se muestran una sola vez. Cada uno sirve para un solo inicio de sesión si no tienes tu autenticador. Guárdalos en un lugar seguro.</p>
        <ul className="space-y-2 font-mono text-sm select-all">{confirmed.backup_codes.map(value => <li key={value}>{value}</li>)}</ul>
        <Label className="flex gap-2 items-center"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />Ya guardé mis códigos</Label>
        <Button disabled={!saved} onClick={() => { completeTwofa(confirmed.token); setConfirmed(null); }}>Continuar a EduPay</Button>
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <Button variant="outline" onClick={logout} disabled={busy}>Cerrar sesión</Button>
    </section>
  </main>;
}
