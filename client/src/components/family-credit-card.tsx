import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export interface FamilyCreditItem {
  id: string | number; origen?: string; descripcion: string; monto_centavos: number;
  credito_ids?: number[];
  cargos?: { id: number; concepto: string; pendiente_centavos: number }[];
  familias?: { id: number; nombre: string }[];
  saldo_a_favor_centavos?: number;
  alumno?: string | null;
}
const money = (n: number) => `$${(n / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

export function FamilyCreditCard({ item, canApply = false }: { item: FamilyCreditItem; canApply?: boolean }) {
  const [charge, setCharge] = useState(String(item.cargos?.[0]?.id ?? ""));
  const [family, setFamily] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const orphan = item.origen === "orphan_credit";
  const submit = async () => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/family-credits/${orphan ? "asignar-familia" : "aplicar-propuesta"}`, {
        method: "POST", headers: { "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify(orphan ? { credit_id: item.credito_ids?.[0], family_id: Number(family), justificacion: reason }
          : { credit_ids: item.credito_ids, charge_id: Number(charge),
            monto_centavos: Math.min(item.saldo_a_favor_centavos ?? item.monto_centavos,
              item.cargos?.find(c => String(c.id) === charge)?.pendiente_centavos ?? 0) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se guardó el cambio");
      toast({ title: "Saldo a favor actualizado", description: data.message });
      await queryClient.invalidateQueries({ queryKey: ["/api/conciliacion/excepciones"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/families"] });
      window.dispatchEvent(new Event("exceptions-updated"));
    } catch (error) {
      toast({ title: "No se guardó el cambio", description: error instanceof Error ? error.message : "Inténtalo de nuevo", variant: "destructive" });
    } finally { locked.current = false; setPending(false); }
  };
  const selected = item.cargos?.find(c => String(c.id) === charge);
  return <Card data-testid={`family-credit-${item.id}`}><CardContent className="p-4 space-y-3">
    <h3 className="font-semibold">{orphan ? "Saldo a favor sin familia asignada" : item.descripcion}</h3>
    {orphan && <p>Alumno: {item.alumno ?? "Sin alumno identificado"}</p>}
    {orphan ? <p>{money(item.monto_centavos)} por asignar. El dinero permanece registrado.</p> :
      <p>Aplicar {money(Math.min(item.saldo_a_favor_centavos ?? item.monto_centavos, selected?.pendiente_centavos ?? 0))} al cargo {selected?.concepto} #{selected?.id}</p>}
    {canApply && (orphan ? <>
      <label className="block">Familia
        <select aria-label="Familia del saldo a favor" className="block w-full border p-2" value={family} onChange={e => setFamily(e.target.value)}>
          <option value="">Selecciona una familia</option>
          {item.familias?.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
      </label>
      <label className="block">Motivo de asignación
        <textarea className="block w-full border p-2" value={reason} maxLength={2000} onChange={e => setReason(e.target.value)} />
      </label>
      <Button disabled={pending || !family || !reason.trim()} onClick={submit}>{pending ? "Guardando…" : "Asignar a la familia"}</Button>
    </> : <>
      <label className="block">Cargo de la familia
        <select aria-label="Cargo para aplicar saldo a favor" className="block w-full border p-2" value={charge} onChange={e => setCharge(e.target.value)}>
          {item.cargos?.map(c => <option key={c.id} value={c.id}>{c.concepto} #{c.id} · {money(c.pendiente_centavos)}</option>)}
        </select>
      </label>
      <Button disabled={pending || !charge} onClick={submit}>{pending ? "Aplicando…" : "Aplicar como sugiere"}</Button>
    </>)}
  </CardContent></Card>;
}
