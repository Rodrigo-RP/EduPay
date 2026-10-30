import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function TwoFactorResetButton({ userId, name }: { userId: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [challenge, setChallenge] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function confirm() {
    setBusy(true); setMessage("");
    try {
      if (!challenge) {
        const response = await apiRequest(`/api/admin/users/${userId}/2fa/reset-preview`, {
          method: "POST", body: JSON.stringify({ reason, confirmation: true }),
        });
        setChallenge((await response.json()).confirmation_token);
      } else {
        await apiRequest(`/api/admin/users/${userId}/2fa/reset`, {
          method: "POST", body: JSON.stringify({ confirmation_token: challenge, confirmation: true }),
        });
        setChallenge(""); setReason(""); setOpen(false);
        setMessage("Dos factores restablecidos. El usuario debe configurarlos al iniciar sesión.");
      }
    } catch { setMessage("No se pudo restablecer. Verifica el motivo, tus permisos y el estado de la cuenta."); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => { setMessage(""); setOpen(true); }}>Restablecer 2FA</Button>
    {message && <p role="status" className="max-w-xs text-sm">{message}</p>}
    <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setChallenge(""); } }}>
      <DialogContent>
        <DialogTitle>{challenge ? "Segunda confirmación de restablecimiento" : "Restablecer dos factores"}</DialogTitle>
        <DialogDescription>{challenge
          ? `Se cerrarán las sesiones de ${name} y perderá su autenticador y códigos de respaldo actuales. Esta acción quedará auditada.`
          : `Confirma que deseas restablecer los dos factores de ${name}. Es obligatorio registrar un motivo.`}</DialogDescription>
        {!challenge && <><Label htmlFor={`reset-2fa-reason-${userId}`}>Motivo obligatorio</Label>
          <Input id={`reset-2fa-reason-${userId}`} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => { setOpen(false); setChallenge(""); }}>Cancelar</Button>
          <Button disabled={busy || !reason.trim()} onClick={confirm}>{challenge ? "Confirmar restablecimiento" : "Primera confirmación"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
