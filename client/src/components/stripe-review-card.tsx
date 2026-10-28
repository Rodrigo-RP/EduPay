import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export interface StripeReviewItem {
  id: number | string;
  event_id?: number;
  origen?: string;
  alumno?: string;
  concepto?: string | null;
  monto_centavos: number;
  fecha: string;
  payment_intent_id?: string;
  descripcion: string;
}

export function StripeReviewCard({ item, canResolve = false }: { item: StripeReviewItem; canResolve?: boolean }) {
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const resolve = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/conciliacion/excepciones/stripe/${item.event_id}/resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify({ accion: "resolved_manual", justificacion: reason,
          confirmacion_inicial: true, confirmacion_final: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo guardar la resolución");
      toast({ title: "Resolución guardada", description: result.message });
      setStep(0);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["/api/conciliacion/excepciones"] });
      window.dispatchEvent(new Event("exceptions-updated"));
    } catch (error: any) {
      toast({ title: "No se guardó la resolución", description: error.message, variant: "destructive" });
    } finally { setPending(false); }
  };
  return (
    <Card data-testid={`stripe-review-${item.event_id}`}>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">Cobro Stripe por revisar</h3>
        <p>{item.descripcion}</p>
        <p>Alumno: {item.alumno} · Concepto: {item.concepto ?? "Sin concepto"}</p>
        <p>Monto: ${(item.monto_centavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          {" · "}Fecha local: {item.fecha}</p>
        <p className="text-sm break-all">PaymentIntent: {item.payment_intent_id}</p>
        <p className="text-sm text-slate-600">Saldo a favor no disponible para este cobro: el mecanismo actual necesita un pago registrado.</p>
        {canResolve && <Button onClick={() => { setReason(""); setStep(1); }}>Resuelto fuera del sistema</Button>}
        <Dialog open={step > 0} onOpenChange={(open) => { if (!pending && !open) setStep(0); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{step === 1 ? "Primera confirmación" : "Confirmación final"}</DialogTitle>
              <DialogDescription>Esta acción no devuelve dinero, no registra un pago y no cambia el cargo.</DialogDescription>
            </DialogHeader>
            <p>{item.alumno} · {item.payment_intent_id}</p>
            {step === 1 ? <>
              <label htmlFor={`reason-${item.event_id}`}>Justificación obligatoria</label>
              <Textarea id={`reason-${item.event_id}`} value={reason} maxLength={2000}
                onChange={(event) => setReason(event.target.value)} />
              <Button disabled={!reason.trim()} onClick={() => setStep(2)}>Confirmar y continuar</Button>
            </> : <>
              <p>Justificación: {reason}</p>
              <p>¿Confirmas que este cobro ya se resolvió fuera de EduPay?</p>
              <Button disabled={pending} variant="outline" onClick={() => setStep(1)}>Volver</Button>
              <Button disabled={pending} onClick={resolve}>{pending ? "Guardando…" : "Confirmar resolución fuera del sistema"}</Button>
            </>}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
