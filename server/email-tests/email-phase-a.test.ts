import { describe,it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readEmailConfig } from "../lib/email/config";
import { ResendEmailProvider } from "../lib/email/resend-provider";
import { prepareRecipients } from "../lib/email/recipients";
import { renderEmail,escapeEmailHtml } from "../lib/email/templates";
import { EmailService,configFingerprint } from "../lib/email/service";
import { processEmailOnce,resultUpdate } from "../lib/email/worker";
import { SimulatedEmailProvider } from "../lib/email/simulated-provider";
import { registerEmailNotificationRoutes } from "../routes/email-notifications";
import { PgEmailRepository,scopedCandidateSql } from "../lib/email/pg-repository";
import { PgEmailWorkerRepository,claimEmailSql } from "../lib/email/pg-worker";
import { digest } from "../lib/email/identity";
import { MemoryEmailRepository } from "./memory-repository";
import type { EmailConfig,EmailScope,ProviderResult } from "../lib/email/types";

const scope:EmailScope={tenantId:1,campusId:10,userId:7};
const selection={tipo:"CARGO_EMITIDO",canal:"EMAIL",modo:"masivo"};
const configured=():EmailConfig=>readEmailConfig({
  APP_ENV:"test",RESEND_API_KEY:`re_${"x".repeat(20)}`,EMAIL_FROM:"School <school@example.test>",
  EMAIL_ALLOWED_RECIPIENTS:"owner@example.test",
});
function fixture(config:EmailConfig=configured()) {
  const repo=new MemoryEmailRepository();
  const service=new EmailService(repo,()=>config,()=>repo.clock);
  return {repo,service,config};
}
async function batch(f=fixture()) {
  const p=await f.service.preview(scope,selection);
  const b=await f.service.confirm(scope,p.intentId);
  return {...f,p,b};
}
// In-process request harness: registered production handlers, no sockets, no main app,
// no auth DB. Authentication identity is deliberately injected, not bypassed in app code.
function server(f=fixture(),user:any={id:7,tenant_id:1,campus_id:10},permission:boolean|((action:string)=>boolean)=true) {
  const routes=new Map<string,any[]>();
  const app:any={get:(p:string,...h:any[])=>routes.set(`GET ${p}`,h),post:(p:string,...h:any[])=>routes.set(`POST ${p}`,h)};
  registerEmailNotificationRoutes(app,{service:f.service,authenticate:(req:any,_res,next)=>{req.user=user;next();},
    can:(_user,action)=>typeof permission==="function"?permission(action):permission});
  return {
    ...f,
    async request(method:string,path:string,body:any={},params:any={}) {
      const handlers=routes.get(`${method} ${path}`)!;
      const req:any={body,query:{},params,user:undefined};
      const response:any={statusCode:200,body:null,status(n:number){this.statusCode=n;return this;},
        type(v:string){this.contentType=v;return this;},send(v:string){this.body=JSON.parse(v);return this;},
        json:vi.fn(function(this:any,v:any){this.body=v;return this;})};
      const call=async(i:number):Promise<void>=>{
        const h=handlers[i];
        let following:Promise<void>|undefined;
        if(h)await h(req,response,()=>{following=call(i+1);});
        if(following)await following;
      };
      await call(0);
      return response;
    },
  };
}

describe("Configuración y red aislada",()=>{
  it.each([undefined,"","staging","PRODUCTION"])("entorno %s no habilita producción",APP_ENV=>{
    expect(readEmailConfig({APP_ENV,RESEND_API_KEY:`re_${"x".repeat(20)}`,EMAIL_FROM:"a@example.test"}).configured).toBe(false);
  });
  it.each(["RESEND_API_KEY","EMAIL_FROM"])("sin %s: 503 y cero filas incluso intenciones",async key=>{
    const cfg={APP_ENV:"test",RESEND_API_KEY:`re_${"x".repeat(20)}`,EMAIL_FROM:"a@example.test",[key]:""};
    const f=fixture(readEmailConfig(cfg));
    const s=server(f);
    expect((await s.request("POST","/api/notifications/email/preview",selection)).statusCode).toBe(503);
    expect(f.repo.intents.size+f.repo.batches.size+f.repo.records.size).toBe(0);
    const r=await s.request("POST","/api/notifications/email/confirm",{intentId:randomUUID(),canal:"EMAIL"});
    expect(r.statusCode).toBe(503);expect(r.body.code).toBe("EMAIL_NO_CONFIGURADO");
  });
  it("valida allowlist y remitente con Zod sin reflejar secretos",()=>{
    const cfg=readEmailConfig({APP_ENV:"development",RESEND_API_KEY:`re_${"x".repeat(20)}`,EMAIL_FROM:"bad\nfrom",EMAIL_ALLOWED_RECIPIENTS:"not-mail"});
    expect(cfg.configured).toBe(false);expect(cfg.apiKey).toBe("");expect(cfg.from).toBe("");
  });
  it("APP_ENV=test rechaza adaptador real incluso con configuración de producción",()=>{
    expect(()=>new ResendEmailProvider({...configured(),environment:"production"})).toThrow("prohibido en test");
  });
  it("el fetch global y PostgreSQL no pueden usarse en estas pruebas",async()=>{
    expect(()=>fetch("https://api.resend.com/emails")).toThrow("Fetch saliente prohibido");
    await expect(import("../db")).rejects.toThrow();
  });
  it("API de configuración sólo informa disponibilidad, no Secrets",async()=>{
    const r=await server().request("GET","/api/notifications/email/config");
    expect(r.body).toEqual({configured:true,code:undefined,workerEnabled:false,canProcess:true});
    expect(JSON.stringify(r.body)).not.toMatch(/from|allowed|apiKey|owner@/);
  });
  it("destinatarios no pasan por res.json capturado por el logger global",async()=>{
    const r=await server().request("POST","/api/notifications/email/preview",selection);
    expect(r.statusCode).toBe(200);expect(r.body.recipients[0]).toBeTruthy();
    expect(r.contentType).toBe("application/json");
    expect(r.json).not.toHaveBeenCalled();
  });
});

describe("Destinatarios y confirmación",()=>{
  it("JSONB con claves reordenadas conserva identidad y confirmación",async()=>{
    expect(digest([{a:1,b:2}])).toBe(digest([{b:2,a:1}]));
    const f=fixture();const p=await f.service.preview(scope,selection);
    const i=f.repo.intents.get(p.intentId)!;
    i.snapshot=i.snapshot.map(r=>Object.fromEntries(Object.entries(r).reverse()) as any);
    expect((await f.service.confirm(scope,p.intentId)).batchId).toBeTruthy();
  });
  it("normaliza y deduplica familias; falta de correo se omite",async()=>{
    const {p}=await batch();
    expect(p.summary).toEqual({total:2,validos:1,omitidos:1});
    expect(p.recipients.find(r=>r.email)?.studentIds).toEqual([1,2]);
    expect(p.recipients.find(r=>!r.email)?.motivo).toBe("sin correo");
  });
  it("correo inválido no se inventa ni se refleja el valor original",()=>{
    const rows=prepareRecipients([{id:1,nombre:"X",email:"bad@<script>",guardianId:1}],configured());
    expect(rows[0]).toMatchObject({email:null,estado:"omitido",motivo:"correo inválido"});
    expect(JSON.stringify(rows)).not.toContain("script");
  });
  it("lista vacía en test significa nadie",async()=>{
    const cfg=configured();cfg.allowed.clear();
    const {p}=await batch(fixture(cfg));
    expect(p.summary.validos).toBe(0);
    expect(p.recipients.find(r=>r.email)?.motivo).toBe("no autorizado en este entorno");
  });
  it("development sólo permite la lista; producción ignora lista",()=>{
    const cfg=configured();cfg.environment="development";cfg.allowed.clear();
    const c=[{id:1,nombre:"A",email:"other@example.test",guardianId:1}];
    expect(prepareRecipients(c,cfg)[0].estado).toBe("omitido");
    expect(prepareRecipients(c,{...cfg,environment:"production"})[0].estado).toBe("pendiente");
  });
  it("individual vacío nunca cae en masivo",async()=>{
    await expect(fixture().service.preview(scope,{...selection,modo:"individual",estudiantesIds:[]})).rejects.toMatchObject({status:422});
  });
  it("otro alumno o IDs fuera del alcance no se aceptan",async()=>{
    await expect(fixture().service.preview(scope,{...selection,modo:"individual",estudiantesIds:[999]})).rejects.toMatchObject({status:403});
  });
  it("confirma otra vez destinatarios; cambios exigen nueva vista previa",async()=>{
    const f=fixture();const p=await f.service.preview(scope,selection);
    f.repo.candidatesData[0].email="new@example.test";
    await expect(f.service.confirm(scope,p.intentId)).rejects.toMatchObject({code:"EMAIL_PREVIEW_CHANGED"});
    const updated=await f.service.preview(scope,selection);
    expect(updated.intentId).not.toBe(p.intentId);
    expect((await f.service.confirm(scope,updated.intentId)).batchId).toBeTruthy();
    expect(f.repo.batches.size).toBe(1);
  });
  it("la vista previa vence y puede renovarse sin crear lotes",async()=>{
    const f=fixture();const p=await f.service.preview(scope,selection);
    f.repo.clock+=16*60_000;
    await expect(f.service.confirm(scope,p.intentId)).rejects.toMatchObject({code:"EMAIL_PREVIEW_EXPIRED"});
    await f.service.preview(scope,selection);
    expect((await f.service.confirm(scope,p.intentId)).batchId).toBeTruthy();
  });
  it("cambio de remitente/configuración invalida la confirmación",async()=>{
    const f=fixture();const p=await f.service.preview(scope,selection);f.config.from="other@example.test";
    await expect(f.service.confirm(scope,p.intentId)).rejects.toMatchObject({code:"EMAIL_PREVIEW_CHANGED"});
  });
  it("dos pestañas/peticiones y doble clic recuperan un solo lote",async()=>{
    const f=fixture();
    const [a,b]=await Promise.all([f.service.preview(scope,selection),f.service.preview(scope,selection)]);
    expect(a.intentId).toBe(b.intentId);
    const results=await Promise.all(Array.from({length:20},()=>f.service.confirm(scope,a.intentId)));
    expect(new Set(results.map(r=>r.batchId)).size).toBe(1);
    expect(f.repo.batches.size).toBe(1);expect(f.repo.records.size).toBe(2);
  });
  it("orden y duplicados de selección individual conservan la misma intención",async()=>{
    const f=fixture();
    const a=await f.service.preview(scope,{...selection,modo:"individual",estudiantesIds:[2,1,2]});
    const b=await f.service.preview(scope,{...selection,modo:"individual",estudiantesIds:[1,2]});
    expect(a.intentId).toBe(b.intentId);expect(a.summary.validos).toBe(1);
  });
  it("protección local permanece después de 24 horas",async()=>{
    const f=await batch();f.repo.clock+=48*60*60_000;
    const p=await f.service.preview(scope,selection);
    expect((await f.service.confirm(scope,p.intentId)).batchId).toBe(f.b.batchId);
  });
  it("envío deliberado nuevo requiere referencia explícita y nueva confirmación",async()=>{
    const f=await batch();
    for(const r of f.repo.records.values())if(r.estado==="pendiente")r.estado="error";
    const p=await f.service.preview(scope,{...selection,resendOf:f.b.batchId});
    expect(f.repo.batches.size).toBe(1);
    expect((await f.service.confirm(scope,p.intentId)).batchId).not.toBe(f.b.batchId);
  });
  it("no permite preparar reenvío de un lote incierto o activo",async()=>{
    const f=await batch();
    await expect(f.service.preview(scope,{...selection,resendOf:f.b.batchId})).rejects.toMatchObject({status:409});
    for(const r of f.repo.records.values())if(r.estado==="pendiente")r.estado="incierto";
    await expect(f.service.preview(scope,{...selection,resendOf:f.b.batchId})).rejects.toMatchObject({status:409});
  });
});

describe("Worker con proveedor simulado",()=>{
  async function tick(f:Awaited<ReturnType<typeof batch>>,results:ProviderResult[]) {
    const provider=new SimulatedEmailProvider(results);
    await processEmailOnce(f.repo,provider,f.config,()=>f.repo.clock);
    return provider;
  }
  it("aceptación guarda ID y ambas fechas sólo tras respuesta con evidencia",async()=>{
    const f=await batch();const r=[...f.repo.records.values()].find(r=>r.estado==="pendiente");
    expect(r.enviado_en).toBeNull();
    await tick(f,[{kind:"accepted",messageId:randomUUID()}]);
    expect(r.estado).toBe("aceptado");expect(r.provider_message_id).toBeTruthy();expect(r.enviado_en).toBe(r.accepted_at);
    expect((await f.service.stats(scope)).entregado).toBe(0);
  });
  it("rechazo 4xx guarda error sin evidencia ni fecha de envío",async()=>{
    const f=await batch();await tick(f,[{kind:"error",code:"PROVEEDOR_HTTP_403"}]);
    const r=[...f.repo.records.values()].find(r=>r.email);
    expect(r).toMatchObject({estado:"error",error_code:"PROVEEDOR_HTTP_403",provider_message_id:null,enviado_en:null});
  });
  it("timeout pasa a incierto y no se reclama otra vez",async()=>{
    const f=await batch();const p=await tick(f,[{kind:"uncertain",code:"RESPUESTA_DESCONOCIDA"}]);
    f.repo.clock+=999_999;await processEmailOnce(f.repo,p,f.config,()=>f.repo.clock);
    expect(p.calls).toHaveLength(1);expect((await f.service.stats(scope)).incierto).toBe(1);
  });
  it("falta de ID en aceptación es incierto",async()=>{
    const f=await batch();await tick(f,[{kind:"accepted",messageId:""}]);
    expect((await f.service.stats(scope)).incierto).toBe(1);
  });
  it("reclamo abandonado se recupera como incierto, nunca pendiente",async()=>{
    const f=await batch();await f.repo.claim();f.repo.clock+=121_000;
    await tick(f,[]);
    expect((await f.service.stats(scope)).incierto).toBe(1);
  });
  it("caída tras aceptación antes de persistir no genera reenvío",async()=>{
    const f=await batch();const finish=f.repo.finish.bind(f.repo);
    f.repo.finish=async()=>{throw new Error("simulated commit loss");};
    const p=new SimulatedEmailProvider([{kind:"accepted",messageId:randomUUID()}]);
    await expect(processEmailOnce(f.repo,p,f.config,()=>f.repo.clock)).rejects.toThrow("commit loss");
    f.repo.finish=finish;f.repo.clock+=121_000;await processEmailOnce(f.repo,p,f.config,()=>f.repo.clock);
    expect(p.calls).toHaveLength(1);expect((await f.service.stats(scope)).incierto).toBe(1);
  });
  it("concurrencia de 20 workers: un ganador por destinatario",async()=>{
    const f=await batch();const p=new SimulatedEmailProvider([{kind:"accepted",messageId:randomUUID()}]);
    await Promise.all(Array.from({length:20},()=>processEmailOnce(f.repo,p,f.config,()=>f.repo.clock)));
    expect(p.calls).toHaveLength(1);
  });
  it("gate compartido entre lotes impide superar el ritmo global",async()=>{
    const f=await batch();
    const p=await f.service.preview(scope,{...selection,tipo:"AVISO_MORA"});await f.service.confirm(scope,p.intentId);
    const provider=new SimulatedEmailProvider([{kind:"accepted",messageId:randomUUID()},{kind:"accepted",messageId:randomUUID()}]);
    await Promise.all([processEmailOnce(f.repo,provider,f.config,()=>f.repo.clock),processEmailOnce(f.repo,provider,f.config,()=>f.repo.clock)]);
    expect(provider.calls).toHaveLength(1);
    f.repo.clock+=1000;await processEmailOnce(f.repo,provider,f.config,()=>f.repo.clock);
    expect(provider.calls).toHaveLength(2);
  });
  it("gate también se comparte entre instituciones, no por tenant",async()=>{
    const f=await batch();f.repo.allowedScopes.add("2:20");
    const other={tenantId:2,campusId:20,userId:8};
    const preview=await f.service.preview(other,selection);await f.service.confirm(other,preview.intentId);
    const p=new SimulatedEmailProvider([{kind:"accepted",messageId:randomUUID()}]);
    await Promise.all(Array.from({length:10},()=>processEmailOnce(f.repo,p,f.config,()=>f.repo.clock)));
    expect(p.calls).toHaveLength(1);
    expect((await f.service.stats(scope)).total).toBe(2);
    expect((await f.service.stats(other)).total).toBe(2);
  });
  it("sólo tres reintentos transitorios con espera creciente y misma clave/cuerpo",async()=>{
    const f=await batch();
    const p=new SimulatedEmailProvider(Array.from({length:4},()=>({kind:"transient",code:"PROVEEDOR_TEMPORAL"})));
    const waits:number[]=[];
    for(let i=0;i<4;i++){
      await processEmailOnce(f.repo,p,f.config,()=>f.repo.clock);
      const r=[...f.repo.records.values()].find(r=>r.email);
      if(i<3){waits.push(r.next-f.repo.clock);f.repo.clock=r.next;}
    }
    expect(waits).toEqual([10_000,20_000,40_000]);
    expect(p.calls).toHaveLength(4);expect(new Set(p.calls.map(c=>JSON.stringify(c))).size).toBe(1);
    expect((await f.service.stats(scope)).error).toBe(1);
  });
  it("Retry-After se respeta y no permite replay después de ventana segura",async()=>{
    const f=await batch();await tick(f,[{kind:"transient",code:"LIMITE_TEMPORAL",pauseMs:90_000}]);
    const r=[...f.repo.records.values()].find(r=>r.email);
    expect(r.next-f.repo.clock).toBe(90_000);
    const claim={firstAttemptAt:f.repo.clock-23*60*60_000,retries:0} as any;
    expect(resultUpdate({kind:"transient",code:"X"},claim,f.repo.clock).estado).toBe("incierto");
  });
  it.each(["daily_quota","monthly_quota"] as const)("%s conserva pendientes y aviso compartido",async kind=>{
    const f=await batch();await tick(f,[{kind,code:kind==="daily_quota"?"CUOTA_DIARIA_AGOTADA":"CUOTA_MENSUAL_AGOTADA"}]);
    expect((await f.service.stats(scope)).pendiente).toBe(1);
    expect(f.repo.gate).toBeGreaterThan(f.repo.clock);
    expect((await f.service.batch(scope,f.b.batchId)).notice).toContain("CUOTA");
  });
  it("rechazo por cuota sin intentos ambiguos puede esperar al siguiente día",async()=>{
    const f=await batch();f.repo.clock=Date.UTC(2026,9,26,0,1);
    await tick(f,[{kind:"daily_quota",code:"CUOTA_DIARIA_AGOTADA"}]);
    const r=Array.from(f.repo.records.values()).find(r=>r.email);
    expect(r.firstAttemptAt).toBeNull();expect(r.estado).toBe("pendiente");
    f.repo.clock=f.repo.gate;
    await tick(f,[{kind:"accepted",messageId:randomUUID()}]);
    expect(r.estado).toBe("aceptado");
  });
  it("allowlist se revalida en worker y no envía al quitar autorización",async()=>{
    const f=await batch();f.config.allowed.clear();const p=await tick(f,[]);
    expect(p.calls).toHaveLength(0);expect((await f.service.stats(scope)).omitido).toBe(2);
  });
  it("configuración cambió: no usa un cuerpo distinto con misma clave",async()=>{
    const f=await batch();f.config.from="changed@example.test";const p=await tick(f,[]);
    expect(p.calls).toHaveLength(0);expect((await f.service.stats(scope)).error).toBe(1);
  });
  it("familia dejó de ser elegible tras confirmar: no se llama al proveedor",async()=>{
    const f=await batch();f.repo.stillEligible=async()=>false;
    const p=await tick(f,[]);expect(p.calls).toHaveLength(0);
    expect((await f.service.stats(scope)).omitido).toBe(2);
  });
  it("sin configuración no reclama ni hace red",async()=>{
    const f=await batch();f.config.configured=false;
    expect(await processEmailOnce(f.repo,new SimulatedEmailProvider([]),f.config)).toBe(false);
    expect((await f.service.stats(scope)).pendiente).toBe(1);
  });
  it("cierre manual se audita y nunca devuelve pendiente",async()=>{
    const f=await batch();await tick(f,[{kind:"uncertain",code:"TIMEOUT"}]);
    const r=[...f.repo.records.values()].find(r=>r.estado==="incierto");
    await f.service.resolve(scope,r.id);
    expect(r.estado).toBe("error");expect(f.repo.events.at(-1)).toMatchObject({actor:scope.userId});
  });
});

describe("Rutas, alcance y estadísticas",()=>{
  it.each(["SMS","WHATSAPP"])("rechaza %s con 422 en preview, confirm y alias heredado",async canal=>{
    const s=server();
    for(const path of ["/api/notifications/email/preview","/api/notifications/email/confirm","/api/notifications/send"])
      expect((await s.request("POST",path,{...selection,canal})).statusCode).toBe(422);
    expect(s.repo.records.size+s.repo.intents.size).toBe(0);
  });
  it("alias EMAIL retirado: 410 sin insert",async()=>{
    const s=server();const r=await s.request("POST","/api/notifications/send",selection);
    expect(r.statusCode).toBe(410);expect(s.repo.records.size).toBe(0);
  });
  it("errores internos no exponen consultas, remitente ni direcciones",async()=>{
    const f=fixture();f.repo.prepare=async()=>{throw new Error("internal select key sender@example.test");};
    const r=await server(f).request("POST","/api/notifications/email/preview",selection);
    expect(r.statusCode).toBe(500);
    expect(r.body).toEqual({code:"EMAIL_ERROR_INTERNO",message:"No se pudo completar la operación de correo"});
  });
  it("sin permiso: 403 en consulta y envío",async()=>{
    const s=server(fixture(),{id:7,tenant_id:1,campus_id:10},false);
    expect((await s.request("GET","/api/notifications/email/history")).statusCode).toBe(403);
    expect((await s.request("POST","/api/notifications/email/preview",selection)).statusCode).toBe(403);
  });
  it("READ no concede PROCESS y la pantalla recibe esa capacidad",async()=>{
    const s=server(fixture(),{id:7,tenant_id:1,campus_id:10},action=>action==="read");
    const cfg=await s.request("GET","/api/notifications/email/config");
    expect(cfg.body.canProcess).toBe(false);
    expect((await s.request("POST","/api/notifications/email/preview",selection)).statusCode).toBe(403);
  });
  it.each([{id:7,tenant_id:2,campus_id:10},{id:7,tenant_id:1,campus_id:20},{id:7,tenant_id:1}])("deniega contexto %o",async user=>{
    expect((await server(fixture(),user).request("GET","/api/notifications/email/stats")).statusCode).toBe(403);
  });
  it("lotes, intenciones y resolución por ID ajeno no exponen datos",async()=>{
    const f=await batch();const other={...scope,campusId:20};
    await expect(f.service.batch(other,f.b.batchId)).rejects.toMatchObject({status:404});
    await expect(f.service.confirm(other,f.p.intentId)).rejects.toMatchObject({status:404});
    await expect(f.service.resolve(other,[...f.repo.records.keys()][0])).rejects.toMatchObject({status:409});
    expect(await f.service.history(other)).toEqual([]);
  });
  it("creación HTTP: 202 con lote, no éxito de envío",async()=>{
    const s=server();const p=await s.request("POST","/api/notifications/email/preview",selection);
    const b=await s.request("POST","/api/notifications/email/confirm",{intentId:p.body.intentId,canal:"EMAIL"});
    expect(b.statusCode).toBe(202);expect(b.body.batchId).toBeTruthy();expect(b.body.success).toBeUndefined();
  });
  it("estadísticas ignoran históricos y aceptado sin evidencia",async()=>{
    const f=await batch();
    f.repo.records.set("fake",{tenantId:1,campusId:10,estado:"enviado"});
    f.repo.records.set("fake2",{tenantId:1,campusId:10,estado:"aceptado"});
    const c=await f.service.stats(scope);
    expect(c.total).toBe(2);expect(c.aceptado).toBe(0);expect(c).not.toHaveProperty("tasaEntrega");
    expect(c.total).toBe(Object.entries(c).filter(([k])=>k!=="total").reduce((a,[,v])=>a+v,0));
  });
  it("plantillas no contienen URLs, CURP, RFC, tokens ni datos variables",()=>{
    const html=renderEmail("AVISO_MORA");
    expect(JSON.stringify(html)).not.toMatch(/https?:|CURP|RFC|token/i);
    expect(escapeEmailHtml('<img src=x onerror="x">&\'')).toBe("&lt;img src=x onerror=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("Adaptador REST sin red (transport simulado)",()=>{
  function provider(response:Response|Error) {
    vi.stubEnv("APP_ENV","development");
    return new ResendEmailProvider({...configured(),environment:"development"},vi.fn(async()=>{if(response instanceof Error)throw response;return response;}) as any);
  }
  const input={...renderEmail("CARGO_EMITIDO"),to:"owner@example.test",idempotencyKey:"stable-key"};
  it("guarda sólo id exitoso y envía header de idempotencia",async()=>{
    vi.stubEnv("APP_ENV","development");
    const id=randomUUID();const transport=vi.fn(async()=>new Response(JSON.stringify({id}),{status:200}));
    const p=new ResendEmailProvider({...configured(),environment:"development"},transport as any);
    expect(await p.send(input)).toMatchObject({kind:"accepted",messageId:id});
    expect((transport.mock.calls[0] as any)[1].headers["Idempotency-Key"]).toBe("stable-key");
  });
  it("403 no refleja mensaje potencialmente sensible",async()=>{
    const result=await provider(new Response(JSON.stringify({message:"secret@example.test"}),{status:403})).send(input);
    expect(result).toMatchObject({kind:"error",code:"PROVEEDOR_HTTP_403"});expect(JSON.stringify(result)).not.toContain("secret");
  });
  it.each([["daily_quota_exceeded","daily_quota"],["rate_limit_exceeded","transient"],["monthly_quota_exceeded","monthly_quota"]])("distingue 429 %s",async(name,kind)=>{
    expect(await provider(new Response(JSON.stringify({name}),{status:429,headers:{"retry-after":"60"}})).send(input)).toMatchObject({kind});
  });
  it("red o respuesta perdida nunca equivale a rechazo seguro",async()=>{
    expect(await provider(new Error("timeout")).send(input)).toMatchObject({kind:"uncertain"});
  });
  it("200 sin ID queda incierto",async()=>{
    expect(await provider(new Response("{}",{status:200})).send(input)).toMatchObject({kind:"uncertain"});
  });
  it("5xx explícito es transitorio y Retry-After se conserva",async()=>{
    expect(await provider(new Response("{}",{status:503,headers:{"retry-after":"4"}})).send(input)).toMatchObject({kind:"transient",pauseMs:4000});
  });
});

describe("Contratos SQL de producción sin conexión",()=>{
  it("migración generada sólo añade las cinco tablas nuevas y sus restricciones",()=>{
    const sql=readFileSync(new URL("../../drizzle/migrations/0003_email_notifications_phase_a.sql",import.meta.url),"utf8");
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(5);
    expect(sql).not.toMatch(/\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b\s+(TABLE|INTO|FROM|notifications|students|charges)/i);
    expect(sql).not.toMatch(/ALTER TABLE "(?!email_)/);
    expect(sql.indexOf('CONSTRAINT "email_intents_id_scope_unique" UNIQUE')).toBeGreaterThan(-1);
    expect(sql.indexOf('CONSTRAINT "email_intents_id_scope_unique" UNIQUE')).toBeLessThan(sql.indexOf('ADD CONSTRAINT "email_batches_intent_scope_fk"'));
    expect(sql).toContain('"enviado_en" IS NOT NULL');
  });
  it("query de candidatos valida campus/tenant en campus, alumnos, tutores y cargos",()=>{
    for(const clause of ["ca.tenant_id = $1","s.campus_id = $2","s.tenant_id = $1","g.campus_id = $2","g.tenant_id = $1","c.tenant_id = $1"])
      expect(scopedCandidateSql).toContain(clause);
  });
  it("claim usa FOR UPDATE SKIP LOCKED y pending exclusivamente",()=>{
    expect(claimEmailSql).toContain("FOR UPDATE OF r SKIP LOCKED");
    expect(claimEmailSql).toContain("r.estado='pendiente'");
  });
  it("Pg repo scoped ID usa ambos campos, sin DB real",async()=>{
    const db:any={query:vi.fn(async()=>({rows:[]}))};
    expect(await new PgEmailRepository(db).intent(scope,randomUUID())).toBeNull();
    expect(db.query.mock.calls[0][0]).toContain("tenant_id=$2 AND campus_id=$3");
  });
  it("finish persiste ID, fechas y resultado en una sola transacción",async()=>{
    const sql:string[]=[];const params:any[]=[];
    const c={query:async(q:string,p?:any[])=>{sql.push(q);params.push(p);return {rows:q.includes("RETURNING id")?[{id:"x"}]:[]};},release:vi.fn()};
    const db:any={connect:async()=>c};
    const claim:any={id:"r",tenantId:1,campusId:10,claimId:"c"};
    await new PgEmailWorkerRepository(db).finish(claim,{estado:"aceptado",code:null,retries:0,providerMessageId:"provider-id",acceptedAt:1000});
    expect(sql[0]).toBe("BEGIN");expect(sql.at(-1)).toBe("COMMIT");expect(c.release).toHaveBeenCalled();
    expect(sql[1]).toContain("FOR UPDATE");
    expect(sql[2]).toContain("enviado_en=$7");expect(params[2][5]).toBe("provider-id");
  });
  it("ningún arranque ni modificación de Aprobaciones desde email runtime",()=>{
    const runtime=readFileSync(new URL("../lib/email/runtime.ts",import.meta.url),"utf8");
    expect(runtime).not.toMatch(/setInterval|processEmailOnce|ResendEmailProvider/);
    const route=readFileSync(new URL("../routes/email-notifications.ts",import.meta.url),"utf8");
    expect(route).not.toContain("/approvals/");
  });
});
