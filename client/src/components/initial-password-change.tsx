import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InitialPasswordChange() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) { setError("Las contraseñas nuevas no coinciden."); return; }
    if (newPassword === currentPassword) { setError("La nueva contraseña debe ser distinta de la temporal."); return; }
    setPending(true);
    try {
      await apiRequest("/api/profile/password", {
        method: "PUT", body: JSON.stringify({ currentPassword, newPassword }),
      });
      // El cambio invalida todos los JWT anteriores, incluido el de este formulario.
      logout();
    } catch {
      setError("No se pudo cambiar la contraseña. Verifica la temporal y usa al menos 12 caracteres, con máximo 72 bytes.");
    } finally { setPending(false); }
  }
  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-lg border bg-white p-6">
        <h1 className="text-xl font-semibold">Cambia tu contraseña temporal</h1>
        <p>Antes de usar EduPay, elige una contraseña personal. Después volverás a iniciar sesión.</p>
        <div><Label htmlFor="initial-current">Contraseña temporal</Label>
          <Input id="initial-current" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></div>
        <div><Label htmlFor="initial-new">Nueva contraseña</Label>
          <Input id="initial-new" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></div>
        <div><Label htmlFor="initial-confirm">Confirma la nueva contraseña</Label>
          <Input id="initial-confirm" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Cambiar contraseña"}</Button>
        <Button type="button" variant="outline" onClick={logout} disabled={pending}>Cerrar sesión</Button>
      </form>
    </main>
  );
}
