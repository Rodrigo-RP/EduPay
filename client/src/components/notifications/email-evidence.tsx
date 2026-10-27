import type { EmailEvidenceCounts, EmailRecipientEvidence } from "@shared/email-evidence";

const fields = [
  ["provider_sent_at","email.sent","Aceptación informada por evento"],
  ["delivered_at","email.delivered","Entrega al servidor de correo confirmada"],
  ["bounced_at","email.bounced","Rebote confirmado"],
  ["complained_at","email.complained","Queja confirmada"],
] as const;
function proofFor(evidence: EmailRecipientEvidence, field: typeof fields[number][0], type: string) {
  const date = evidence[field];
  return date && Number.isFinite(new Date(date).getTime()) &&
    evidence.provider_events?.find(e=>e.type===type && !!e.id &&
      new Date(e.occurred_at).getTime()===new Date(date).getTime());
}
export function hasVerifiedEmailState(state: string, evidence: EmailRecipientEvidence): boolean {
  const required = ({entregado:fields[1],rebotado:fields[2],queja:fields[3]} as Record<string,typeof fields[number]>)[state];
  return !required || !!proofFor(evidence,required[0],required[1]);
}
export function RecipientEventEvidence({evidence}: {evidence:EmailRecipientEvidence}) {
  const proofs = fields.filter(([field,type])=>proofFor(evidence,field,type));
  return <div className="mt-2 space-y-1 text-xs text-slate-600">
    {!proofs.length && <p>Sin eventos verificados de entrega. Aceptado no significa entregado.</p>}
    {proofs.map(([field,type,label])=>{
      const event = proofFor(evidence,field,type);
      return <p key={field} className={type==="email.bounced"||type==="email.complained"?"font-semibold text-rose-800":""}>
        {label}: {new Date(evidence[field]!).toLocaleString("es-MX")} · Evento firmado <span className="break-all font-mono">{event && event.id}</span>
      </p>;
    })}
    {(evidence.bounced_at||evidence.complained_at) && <p>La incidencia se conserva; no se realiza ningún reenvío automático.</p>}
  </div>;
}
export function EmailEvidenceSummary({evidence,compact=false}: {evidence?:EmailEvidenceCounts;compact?:boolean}) {
  if (!evidence) return <p className="text-xs text-slate-600">Cifras de evidencia no disponibles. No se sustituyen por estimaciones.</p>;
  return <section aria-label="Hechos del proveedor" className="space-y-2">
    <dl className={`grid gap-2 ${compact?"grid-cols-2":"grid-cols-2 sm:grid-cols-4"}`}>
      {([["aceptados","Aceptaciones con ID"],["entregados","Entregas firmadas"],["rebotados","Rebotes firmados"],["quejas","Quejas firmadas"]] as const)
        .map(([key,label])=><div key={key} className="rounded-lg border border-stone-200 bg-white p-3">
          <dt className="text-xs text-slate-600">{label}</dt><dd className="font-mono text-xl text-slate-900">{evidence[key]}</dd>
        </div>)}
    </dl>
    <p className="text-xs text-slate-600">Hechos distintos, no sumables: una queja no borra una entrega o un rebote. Sin evento firmado no se afirma entrega ni se calcula tasa de entrega.</p>
  </section>;
}
