import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Method = "stripe" | "efectivo" | "transferencia_escuela";
interface Refund {
  id: number; credit_id: number; monto_centavos: number; method: Method; status: string;
  motivo: string; return_status: string; incident: string | null; fecha: string;
  stripe_refund_id: string | null; clave_rastreo: string | null; verificacion: string;
}
interface Credit { id: number; amount_centavos: string; status: string; familia: string | null }
const labels: Record<Method, string> = { stripe: "Stripe", efectivo: "Efectivo", transferencia_escuela: "Transferencia de la escuela" };
const states: Record<string, string> = { preparada: "Por confirmar", pendiente: "Esperando confirmación de Stripe",
  requiere_accion: "Stripe necesita información", exitosa: "Confirmada", fallida: "No se completó", rechazada: "No aceptada por Stripe" };
const money = (amount: number) => `$${(amount / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/admin/credit-refunds${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "No se pudo consultar la devolución");
  return result;
}
export function CreditRefundsPanel() {
  const { toast } = useToast();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<Credit | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [prepared, setPrepared] = useState<Refund | null>(null);
  const [retry, setRetry] = useState<Refund | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [totp, setTotp] = useState("");
  const [tracking, setTracking] = useState("");
  const [date, setDate] = useState("");
  const [checked, setChecked] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const lock = useRef(false);
  const { data, error, refetch } = useQuery({
    queryKey: ["/api/admin/credit-refunds"],
    queryFn: () => request<{ credits: Credit[]; refunds: Refund[] }>(""),
  });
  function reset() {
    setSelected(null); setPrepared(null); setRetry(null); setMethod(null);
    setTotp(""); setTracking(""); setDate(""); setChecked(false); setDelivered(false);
  }
  function fail(error: unknown) {
    toast({ title: "La devolución no se completó", description: error instanceof Error ? error.message : "Actualiza y revisa su estado", variant: "destructive" });
  }
  async function choose(credit: Credit) {
    reset(); setSelected(credit); setAmount(String(Number(credit.amount_centavos) / 100)); setReason("");
    setOptionsLoading(true);
    try {
      const options = await request<{ methods: Method[] }>(`/${credit.id}/opciones`);
      setMethod(options.methods[0] ?? null);
    } catch (error) { fail(error); }
    finally { setOptionsLoading(false); }
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (!prepared && !retry) {
        const result = await request<Refund>("/preparar", {
          credit_id: selected?.id, monto_centavos: Math.round(Number(amount) * 100), method, motivo: reason,
        });
        setPrepared(result); setChecked(false);
        await refetch();
      } else {
        await request(retry ? "/reintentar" : "/confirmar", {
          refund_id: retry?.id ?? prepared?.id, totp, confirmacion: checked,
          ...(method && method !== "stripe" ? { dinero_entregado: delivered } : {}),
          ...(method === "transferencia_escuela" ? { clave_rastreo: tracking, fecha: date } : {}),
        });
        reset();
        await refetch();
        await cache.invalidateQueries({ queryKey: ["/api/conciliacion/excepciones"] });
        await cache.invalidateQueries({ queryKey: ["/api/families"] });
        window.dispatchEvent(new Event("exceptions-updated"));
        toast({ title: "Estado de la devolución actualizado", description: "Consulta el registro para conocer su confirmación." });
      }
    } catch (error) { fail(error); await refetch(); }
    finally { lock.current = false; setBusy(false); setTotp(""); }
  }
  const confirmation = Boolean(prepared || retry);
  return <Card id="devoluciones" className="mb-6">
    <CardHeader><CardTitle>Devoluciones de saldo a favor</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p>Stripe se confirma por su aviso firmado. Efectivo y transferencias se muestran como “Registrada por la escuela”, sin verificación bancaria.</p>
      {error && <p role="alert">No se pudieron cargar las devoluciones. <Button onClick={() => refetch()}>Reintentar</Button></p>}
      {data?.credits.map(credit => <div key={credit.id} className="flex items-center justify-between gap-3 border-b py-2">
        <p>{credit.familia ?? "Sin familia asignada"} · Crédito #{credit.id} · {money(Number(credit.amount_centavos))}
          {credit.status === "en_devolucion" && " · En devolución"}</p>
        <Button disabled={credit.status !== "activo" || busy} onClick={() => choose(credit)}>Devolver</Button>
      </div>)}
      {data?.refunds.length === 0 && <p>No hay devoluciones registradas.</p>}
      {data?.refunds.map(row => <div key={row.id} className="rounded border p-3 space-y-1" data-testid={`refund-${row.id}`}>
        <p>#{row.id} · {money(row.monto_centavos)} · {labels[row.method]} · {states[row.status] ?? row.status}</p>
        <p>{row.fecha} · {row.motivo}</p><p>{row.verificacion}</p>
        {row.stripe_refund_id && <p>Reembolso Stripe: {row.stripe_refund_id}</p>}
        {row.clave_rastreo && <p>Rastreo SPEI: {row.clave_rastreo}</p>}
        {row.incident && <p role="status">{row.incident}</p>}
        {row.status === "preparada" && <Button onClick={() => {
          reset(); setPrepared(row); setMethod(row.method);
        }}>Revisar y confirmar</Button>}
        {row.incident && ((row.status === "pendiente" && !row.stripe_refund_id) ||
          ["pendiente", "fallido", "esperando_fondos"].includes(row.return_status)) &&
          <Button onClick={() => { reset(); setRetry(row); }}>Reintentar con la misma referencia</Button>}
      </div>)}
    </CardContent>
    <Dialog open={Boolean(selected || prepared || retry)} onOpenChange={open => { if (!open && !busy) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{confirmation ? "Segunda confirmación" : "Preparar devolución"}</DialogTitle>
          <DialogDescription>No compartas datos bancarios del padre. La devolución requiere tu código actual de autenticación.</DialogDescription>
        </DialogHeader>
        {!confirmation ? <>
          {optionsLoading ? <p>Cargando método permitido…</p> : <p>Método: {method ? labels[method] : "No disponible; revisa la incidencia antes de devolver"}</p>}
          <label>Monto en pesos<Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>Motivo<textarea className="w-full border p-2" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        </> : <>
          <p>{retry ? "Reintentar la misma devolución" : `${money(prepared!.monto_centavos)} · ${labels[prepared!.method]}`}</p>
          {prepared && <p>Motivo: {prepared.motivo}</p>}
          <label className="block"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> Confirmo nuevamente esta operación</label>
          {!retry && method !== "stripe" && <label className="block"><input type="checkbox" checked={delivered} onChange={e => setDelivered(e.target.checked)} /> Declaro que ya entregué o transferí este dinero</label>}
          {!retry && method === "transferencia_escuela" && <>
            <label>Clave de rastreo SPEI<Input value={tracking} maxLength={100} onChange={e => setTracking(e.target.value)} /></label>
            <label>Fecha de la transferencia<Input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          </>}
          <label>Código de autenticación vigente<Input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ""))} /></label>
        </>}
        <Button disabled={busy || (!confirmation ? !method || !reason.trim() || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 :
          !checked || totp.length !== 6 || (!retry && method !== "stripe" && !delivered) ||
          (!retry && method === "transferencia_escuela" && (!tracking.trim() || !date)))} onClick={submit}>
          {busy ? "Guardando…" : confirmation ? "Confirmar devolución" : "Revisar devolución"}
        </Button>
      </DialogContent>
    </Dialog>
  </Card>;
}
