import { describe,it,expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailEvidenceSummary,RecipientEventEvidence,hasVerifiedEmailState } from "../../client/src/components/notifications/email-evidence";
import type { EmailRecipientEvidence } from "@shared/email-evidence";

const at="2026-01-01T00:00:00Z";
const proof:EmailRecipientEvidence={
  delivered_at:at,bounced_at:at,complained_at:at,provider_sent_at:at,
  provider_events:["sent","delivered","bounced","complained"].map(type=>({id:`verified-${type}`,type:`email.${type}`,occurred_at:at})),
};
describe("Fase B: UI aislada, sin servidor ni consultas",()=>{
  it("sin evento conserva aceptación y no afirma entrega",()=>{
    const html=renderToStaticMarkup(<RecipientEventEvidence evidence={{}}/>);
    expect(html).toContain("Aceptado no significa entregado");
    expect(html).not.toContain("Entrega al servidor de correo confirmada");
    expect(hasVerifiedEmailState("aceptado",{})).toBe(true);
    expect(hasVerifiedEmailState("entregado",{})).toBe(false);
  });
  it.each(["entregado","rebotado","queja"])("fecha sola no autoriza badge %s",state=>{
    expect(hasVerifiedEmailState(state,{delivered_at:at,bounced_at:at,complained_at:at})).toBe(false);
    expect(hasVerifiedEmailState(state,proof)).toBe(true);
  });
  it("entrega, rebote y queja permanecen simultáneamente visibles con ids/fechas",()=>{
    const html=renderToStaticMarkup(<RecipientEventEvidence evidence={proof}/>);
    for(const text of ["Entrega al servidor de correo confirmada","Rebote confirmado","Queja confirmada",
      "verified-delivered","verified-bounced","verified-complained","no se realiza ningún reenvío automático"])
      expect(html).toContain(text);
  });
  it("email.sent muestra aceptación informada pero no entrega",()=>{
    const html=renderToStaticMarkup(<RecipientEventEvidence evidence={{provider_sent_at:at,
      provider_events:[{id:"event",type:"email.sent",occurred_at:at}]}}/>);
    expect(html).toContain("Aceptación informada por evento");expect(html).not.toContain("Entrega al servidor de correo confirmada");
  });
  it("un id de otro tipo o con fecha distinta no confirma entrega",()=>{
    expect(hasVerifiedEmailState("entregado",{delivered_at:at,provider_events:[
      {id:"event",type:"email.sent",occurred_at:at}]})).toBe(false);
    expect(hasVerifiedEmailState("entregado",{delivered_at:at,provider_events:[
      {id:"event",type:"email.delivered",occurred_at:"2026-01-02T00:00:00Z"}]})).toBe(false);
  });
  it("conteos de hechos son distintos y no se convierten en porcentaje",()=>{
    const html=renderToStaticMarkup(<EmailEvidenceSummary evidence={{aceptados:4,entregados:3,rebotados:2,quejas:1}}/>);
    for(const label of ["Aceptaciones con ID","Entregas firmadas","Rebotes firmados","Quejas firmadas","no sumables"])
      expect(html).toContain(label);
    expect(html).not.toContain("%");expect(html).toContain("no se afirma entrega ni se calcula tasa de entrega");
  });
  it("sin cifras del backend no inventa cero ni muestra éxito",()=>{
    const html=renderToStaticMarkup(<EmailEvidenceSummary/>);
    expect(html).toContain("Cifras de evidencia no disponibles");expect(html).not.toContain("<dd");
  });
  it("escapa texto del id de evidencia y no renderiza HTML del proveedor",()=>{
    const html=renderToStaticMarkup(<RecipientEventEvidence evidence={{delivered_at:at,provider_events:[
      {id:'<script>alert("x")</script>',type:"email.delivered",occurred_at:at}]}}/>);
    expect(html).not.toContain("<script>");expect(html).toContain("&lt;script&gt;");
  });
});
