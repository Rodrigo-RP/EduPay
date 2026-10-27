import { describe,it,expect,vi } from "vitest";
import { randomBytes,randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import express from "express";
import { readFileSync } from "node:fs";
import { Webhook } from "svix";
import { createResendWebhookVerifier } from "../lib/email/webhook-signature";
import { registerResendWebhookRoute,resendWebhookRateLimit,resendWebhookBodyError,RESEND_WEBHOOK_PATH } from "../routes/email-webhooks";
import { processEmailWebhookOnce,stateAfterEmailEvent } from "../lib/email/webhook-worker";
import { WEBHOOK_RAW_MAX_ROWS,WEBHOOK_RAW_MAX_BYTES,WEBHOOK_MAX_BODY_BYTES,WEBHOOK_LEASE_MS } from "../lib/email/webhook-types";
import { MemoryWebhookRepository } from "./webhook-memory-repository";

const messageId=randomUUID();
function resendWebhookBody() {
  const raw=express.raw({type:()=>true,limit:"64kb",inflate:false});
  return [resendWebhookRateLimit(),((req:any,res:any,next:any)=>raw(req,res,error=>
    error?resendWebhookBodyError(error,req,res,next):next()))] as const;
}
function fixture() {
  const secret=`whsec_${randomBytes(32).toString("base64")}`;
  const signer=new Webhook(secret);
  const verify=createResendWebhookVerifier({RESEND_WEBHOOK_SECRET:secret})!;
  const repo=new MemoryWebhookRepository();
  repo.recipients.set("r1",{id:"r1",tenantId:1,campusId:10,messageId,estado:"aceptado",accepted:true,scopeValid:true});
  let handler:any;
  registerResendWebhookRoute({post:(_p:string,h:any)=>{handler=h;}} as any,repo,(body,headers)=>{
    repo.actions.push("verify");return verify(body,headers);
  });
  function signed(type="email.delivered",eventId=randomUUID(),options:{at?:Date;body?:string;emailId?:string;data?:any}={}) {
    const at=options.at??new Date();
    const body=Buffer.from(options.body??JSON.stringify({type,created_at:at.toISOString(),
      data:{email_id:options.emailId??messageId,
        ...(type==="email.bounced"?{bounce:{type:"Permanent",subType:"General"}}:{}),
        ...(type==="email.failed"?{failed:{reason:"reached_daily_quota"}}:{}),...options.data}}));
    return {body,headers:{"svix-id":eventId,"svix-timestamp":String(Math.floor(at.getTime()/1000)),
      "svix-signature":signer.sign(eventId,at,body)}};
  }
  async function request(input= signed()) {
    const response:any={statusCode:200,body:null,status(n:number){this.statusCode=n;return this;},
      type(){return this;},send(text:string){this.body=JSON.parse(text);repo.actions.push("ack");return this;}};
    await handler(input,response);
    return response;
  }
  return {secret,repo,signed,request,verify};
}

describe("Fase B: recepción firmada aislada",()=>{
  it("guarda crudo → verifica → persiste → 200; no procesa en la petición",async()=>{
    const f=fixture();const request=f.signed();
    const response=await f.request(request);
    expect(response.statusCode).toBe(200);expect(f.repo.actions).toEqual(["raw","verify","enqueue","ack"]);
    expect(f.repo.raw.values().next().value?.payload).toEqual(request.body);
    expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
    expect([...f.repo.events.values()][0].status).toBe("pendiente");
  });
  it("firma inválida conserva sólo recepción no confiable y no reserva id",async()=>{
    const f=fixture();const good=f.signed();const bad={...good,headers:{...good.headers,"svix-signature":"v1,invalid"}};
    expect((await f.request(bad)).statusCode).toBe(400);
    expect(f.repo.raw.size).toBe(1);expect(f.repo.events.size).toBe(0);
    expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
    expect((await f.request(good)).statusCode).toBe(200);
    await processEmailWebhookOnce(f.repo);
    expect(f.repo.events.size).toBe(1);expect(f.repo.recipients.get("r1")!.estado).toBe("entregado");
  });
  it.each([-301,301])("rechaza replay/timestamp fuera de tolerancia (%s segundos)",async delta=>{
    const f=fixture();
    expect((await f.request(f.signed("email.delivered",randomUUID(),{at:new Date(Date.now()+delta*1000)}))).statusCode).toBe(400);
    expect(f.repo.events.size).toBe(0);
  });
  it("rechaza body modificado y no permite JSON reserializado",async()=>{
    const f=fixture();const req=f.signed();
    expect((await f.request({...req,body:Buffer.from(req.body.toString()+" ")})).statusCode).toBe(400);
    expect((await f.request({...req,body:JSON.parse(req.body.toString())})).statusCode).toBe(400);
    expect(f.repo.events.size).toBe(0);
  });
  it.each(["svix-id","svix-timestamp","svix-signature"])("rechaza header ausente %s sin reservar id",async header=>{
    const f=fixture();const req:any=f.signed();delete req.headers[header];
    expect((await f.request(req)).statusCode).toBe(400);expect(f.repo.events.size).toBe(0);
  });
  it("secret ausente/malformado no lanza ni revela valores",async()=>{
    for(const value of [undefined,"","wrong","whsec_x",`whsec_${"*".repeat(40)}`])
      expect(createResendWebhookVerifier({RESEND_WEBHOOK_SECRET:value})).toBeNull();
    const f=fixture();let handler:any;
    registerResendWebhookRoute({post:(_p:string,h:any)=>{handler=h;}} as any,f.repo,null);
    const response:any={statusCode:0,status(n:number){this.statusCode=n;return this;},type(){return this;},
      send(text:string){this.text=text;return this;}};
    await handler(f.signed(),response);
    expect(response.statusCode).toBe(503);expect(response.text).not.toContain(f.secret);
    expect(f.repo.events.size).toBe(0);expect(f.repo.raw.size).toBe(0);expect(f.repo.actions).toEqual([]);
  });
  it("rotación: admite una firma válida entre varias con la librería oficial",async()=>{
    const f=fixture();const req=f.signed();
    req.headers["svix-signature"]=`v1,invalid ${req.headers["svix-signature"]}`;
    expect((await f.request(req)).statusCode).toBe(200);
  });
  it("fallo del crudo: 503 antes de verificar",async()=>{
    const f=fixture();f.repo.failRaw=true;
    expect((await f.request()).statusCode).toBe(503);
    expect(f.repo.actions).toEqual(["raw","ack"]);expect(f.repo.events.size).toBe(0);
  });
  it("fallo al persistir evento: 503, nunca confirmación; reintento funciona",async()=>{
    const f=fixture();const req=f.signed();f.repo.failEnqueue=true;
    expect((await f.request(req)).statusCode).toBe(503);expect(f.repo.events.size).toBe(0);
    f.repo.failEnqueue=false;expect((await f.request(req)).statusCode).toBe(200);
    expect(f.repo.events.size).toBe(1);
  });
  it("rechazos no registran ni devuelven secret, firma, cuerpo o destinatarios",async()=>{
    const f=fixture();const logs=["log","warn","error"].map(method=>vi.spyOn(console,method as "log").mockImplementation(()=>{}));
    try {
      const req=f.signed("email.delivered",randomUUID(),{data:{to:["fixture-only@example.test"]}});
      const response=await f.request({...req,headers:{...req.headers,"svix-signature":"v1,invalid"}});
      f.repo.failEnqueue=true;const unavailable=await f.request(req);
      expect(logs.flatMap(spy=>spy.mock.calls)).toEqual([]);
      const output=JSON.stringify([response.body,unavailable.body]);
      for(const value of [f.secret,req.headers["svix-signature"],req.body.toString(),"fixture-only@example.test"])
        expect(output).not.toContain(value);
    } finally {logs.forEach(spy=>spy.mockRestore());}
  });
  it("duplicados concurrentes: un evento, veinte recepciones y una aplicación",async()=>{
    const f=fixture();const req=f.signed();
    expect((await Promise.all(Array.from({length:20},()=>f.request(req)))).every(r=>r.statusCode===200)).toBe(true);
    expect(f.repo.raw.size).toBe(20);expect(f.repo.events.size).toBe(1);
    const claims=await Promise.all(Array.from({length:20},()=>f.repo.claim()));
    expect(claims.filter(Boolean)).toHaveLength(1);
    await f.repo.process(claims.find(Boolean)!);
    expect(f.repo.recipients.get("r1")!.estado).toBe("entregado");
    expect(await processEmailWebhookOnce(f.repo)).toBe(false);
  });
  it("no devuelve 200 antes de resolver la persistencia durable",async()=>{
    const f=fixture();let resolve!:()=>void;
    const original=f.repo.enqueue.bind(f.repo);
    f.repo.enqueue=async event=>{await new Promise<void>(r=>{resolve=r;});await original(event);};
    let answered=false;const pending=f.request().then(r=>{answered=true;return r;});
    await vi.waitFor(()=>expect(resolve).toBeTypeOf("function"));
    expect(answered).toBe(false);resolve();expect((await pending).statusCode).toBe(200);
  });
});

describe("Fase B: transiciones y recuperación",()=>{
  it("email.failed conserva el código del proveedor y pasa a error sin reenvío",async()=>{
    const f=fixture();await f.request(f.signed("email.failed"));await processEmailWebhookOnce(f.repo);
    expect(f.repo.recipients.get("r1")).toMatchObject({estado:"error",errorCode:"reached_daily_quota"});
    expect(Array.from(f.repo.events.values())[0]).toMatchObject({status:"procesado",details:{failedReason:"reached_daily_quota"}});
    expect(await processEmailWebhookOnce(f.repo)).toBe(false);
  });
  it("email.suppressed pasa a rebotado con motivo fijo, sin inventar una entrega",async()=>{
    const f=fixture();await f.request(f.signed("email.suppressed"));await processEmailWebhookOnce(f.repo);
    expect(f.repo.recipients.get("r1")).toMatchObject({estado:"rebotado",reason:"suprimido por el proveedor"});
    expect(Array.from(f.repo.events.values()).map(e=>e.eventType)).toEqual(["email.suppressed"]);
  });
  it.each(["aceptado","entregado","error","rebotado","queja"])("demora conserva %s y guarda su hecho independiente",async state=>{
    const f=fixture();f.repo.recipients.get("r1")!.estado=state;
    await f.request(f.signed("email.delivery_delayed"));await processEmailWebhookOnce(f.repo);
    expect(f.repo.recipients.get("r1")!.estado).toBe(state);
    expect(Array.from(f.repo.events.values())[0]).toMatchObject({status:"procesado",eventType:"email.delivery_delayed"});
  });
  it.each([
    ["email.failed","email.delivered","error"],["email.delivered","email.failed","error"],
    ["email.failed","email.bounced","rebotado"],["email.bounced","email.failed","rebotado"],
    ["email.failed","email.complained","queja"],["email.complained","email.failed","queja"],
    ["email.suppressed","email.delivered","rebotado"],
  ])("precedencia %s → %s conserva %s y todos los hechos",async(first,second,state)=>{
    const f=fixture();for(const type of[first,second]){await f.request(f.signed(type));await processEmailWebhookOnce(f.repo);}
    expect(f.repo.recipients.get("r1")!.estado).toBe(state);
    expect(Array.from(f.repo.events.values()).filter(e=>e.status==="procesado")).toHaveLength(2);
  });
  it.each(["Permanent","Temporary","Transient"])("conserva bounce.type=%s y bounce.subType sin diagnósticos",async type=>{
    const f=fixture();await f.request(f.signed("email.bounced",randomUUID(),
      {data:{bounce:{type,subType:"General",message:"private fixture@example.test",diagnosticCode:["private"]}}}));
    await processEmailWebhookOnce(f.repo);
    const e=Array.from(f.repo.events.values())[0];expect(e.details).toEqual({bounceType:type,bounceSubType:"General"});
    expect(JSON.stringify(e)).not.toContain("fixture@example.test");expect(e.status).toBe("procesado");
  });
  it("un failed.reason con datos libres queda en revisión sin almacenar el texto en el evento normalizado",async()=>{
    const f=fixture();await f.request(f.signed("email.failed",randomUUID(),{data:{failed:{reason:"private fixture@example.test"}}}));
    await processEmailWebhookOnce(f.repo);expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
    const e=Array.from(f.repo.events.values())[0];expect(e.status).toBe("revision");
    expect(JSON.stringify(e)).not.toContain("fixture@example.test");
  });
  it.each([
    ["email.delivered","email.bounced","rebotado"],
    ["email.bounced","email.delivered","rebotado"],
    ["email.complained","email.delivered","queja"],
    ["email.delivered","email.complained","queja"],
    ["email.complained","email.bounced","queja"],
    ["email.bounced","email.complained","queja"],
  ])("orden %s → %s conserva %s y ambos hechos",async(first,second,state)=>{
    const f=fixture();
    await f.request(f.signed(first));await processEmailWebhookOnce(f.repo);
    await f.request(f.signed(second,randomUUID(),{body:JSON.stringify({type:second,created_at:"2025-01-01T00:00:00Z",
      data:{email_id:messageId,...(second==="email.bounced"?{bounce:{type:"Permanent",subType:"General"}}:{})}})}));
    await processEmailWebhookOnce(f.repo);
    expect(f.repo.recipients.get("r1")!.estado).toBe(state);
    expect([...f.repo.events.values()].every(e=>e.status==="procesado")).toBe(true);
  });
  it.each(["entregado","rebotado","queja"] as const)("email.sent tardío no degrada %s",state=>{
    expect(stateAfterEmailEvent(state,"email.sent")).toBe(state);
  });
  it("queja prevalece incluso con rebote y entrega anteriores",async()=>{
    const f=fixture();
    for(const type of ["email.complained","email.bounced","email.delivered"]){
      await f.request(f.signed(type));await processEmailWebhookOnce(f.repo);
    }
    expect(f.repo.recipients.get("r1")!.estado).toBe("queja");
    expect([...f.repo.events.values()].filter(e=>e.status==="procesado")).toHaveLength(3);
  });
  it("evento anterior al commit de aceptación se conserva y se reintenta",async()=>{
    const f=fixture();const recipient=f.repo.recipients.get("r1")!;f.repo.recipients.clear();
    await f.request();await processEmailWebhookOnce(f.repo);
    expect([...f.repo.events.values()][0]).toMatchObject({status:"sin_correlacion",tenantId:null});
    f.repo.recipients.set(recipient.id,recipient);f.repo.clock+=60_001;
    await processEmailWebhookOnce(f.repo);
    expect(recipient.estado).toBe("entregado");
  });
  it("id correlacionado sin evidencia de aceptación tampoco avanza",async()=>{
    const f=fixture();const r=f.repo.recipients.get("r1")!;r.accepted=false;r.estado="enviando";
    await f.request();await processEmailWebhookOnce(f.repo);
    expect(r.estado).toBe("enviando");
    r.accepted=true;r.estado="aceptado";f.repo.clock+=60_001;
    await processEmailWebhookOnce(f.repo);expect(r.estado).toBe("entregado");
  });
  it("un consumidor caído conserva el evento; otro reclama al vencer la lease",async()=>{
    const f=fixture();await f.request();const stale=await f.repo.claim();f.repo.failProcess=true;
    await expect(f.repo.process(stale!)).rejects.toThrow();
    expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
    f.repo.clock+=WEBHOOK_LEASE_MS+1;f.repo.failProcess=false;
    const fresh=await f.repo.claim();
    await f.repo.process(stale!);expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
    await f.repo.process(fresh!);expect(f.repo.recipients.get("r1")!.estado).toBe("entregado");
  });
  it("un nuevo consumidor puede continuar sobre la persistencia simulada compartida",async()=>{
    const f=fixture();await f.request();
    const newConsumer=new MemoryWebhookRepository();newConsumer.events=f.repo.events;newConsumer.recipients=f.repo.recipients;
    await processEmailWebhookOnce(newConsumer);expect(f.repo.recipients.get("r1")!.estado).toBe("entregado");
  });
  it("scope del payload no tiene autoridad y no modifica otra familia/campus",async()=>{
    const f=fixture();f.repo.recipients.set("r2",{id:"r2",tenantId:2,campusId:20,messageId:randomUUID(),estado:"aceptado",accepted:true,scopeValid:true});
    await f.request(f.signed("email.bounced",randomUUID(),{data:{tenant_id:2,campus_id:20,recipient_id:"r2",tags:{tenant_id:"2"}}}));
    await processEmailWebhookOnce(f.repo);
    expect(f.repo.recipients.get("r1")!.estado).toBe("rebotado");
    expect(f.repo.recipients.get("r2")!.estado).toBe("aceptado");
    expect([...f.repo.events.values()][0]).toMatchObject({tenantId:1,campusId:10,recipientId:"r1"});
  });
  it("correlaciona email_id, nunca el message_id RFC ni el destinatario",async()=>{
    const f=fixture();const unknown=randomUUID();
    await f.request(f.signed("email.delivered",randomUUID(),{emailId:unknown,
      data:{message_id:messageId,to:["fixture-only@example.test"]}}));
    await processEmailWebhookOnce(f.repo);
    expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
    expect([...f.repo.events.values()][0]).toMatchObject({messageId:unknown,status:"sin_correlacion"});
  });
  it.each(["ambiguous","scope"])("correlación %s conserva revisión sin modificar destinatarios",async kind=>{
    const f=fixture();
    if(kind==="ambiguous")f.repo.recipients.set("r2",{...f.repo.recipients.get("r1")!,id:"r2",tenantId:2,campusId:20});
    else f.repo.recipients.get("r1")!.scopeValid=false;
    await f.request();await processEmailWebhookOnce(f.repo);
    expect([...f.repo.recipients.values()].every(r=>r.estado==="aceptado")).toBe(true);
    expect([...f.repo.events.values()][0]).toMatchObject({status:"revision",recipientId:null,tenantId:null});
  });
  it.each(["email.sent","email.opened","email.clicked","domain.updated"])("evento fuera de alcance %s se conserva sin seguimiento",async type=>{
    const f=fixture();await f.request(f.signed(type));await processEmailWebhookOnce(f.repo);
    expect([...f.repo.events.values()][0].status).toBe("no_procesado");
    expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
  });
  it("evento firmado malformado se guarda para revisión, no como entrega",async()=>{
    const f=fixture();await f.request(f.signed("email.delivered",randomUUID(),{body:JSON.stringify({type:"email.delivered",data:{}})}));
    await processEmailWebhookOnce(f.repo);
    expect([...f.repo.events.values()][0].status).toBe("revision");
    expect(f.repo.recipients.get("r1")!.estado).toBe("aceptado");
  });
});

describe("Fase B: límites y cuerpo original",()=>{
  it("rechaza más de 64 KiB antes de guardar",async()=>{
    const f=fixture();const request=f.signed();request.body=Buffer.alloc(WEBHOOK_MAX_BODY_BYTES+1);
    expect((await f.request(request)).statusCode).toBe(413);expect(f.repo.raw.size).toBe(0);
  });
  it.each(["rows","bytes"])("capacidad acotada por %s falla cerrada, sin 200",async kind=>{
    const f=fixture();const payload=Buffer.alloc(kind==="rows"?0:WEBHOOK_MAX_BODY_BYTES);
    const amount=kind==="rows"?WEBHOOK_RAW_MAX_ROWS:WEBHOOK_RAW_MAX_BYTES/payload.length;
    for(let i=0;i<amount;i++)f.repo.raw.set(String(i),{payload,hash:"simulated",expires:f.repo.clock+1000});
    expect((await f.request()).statusCode).toBe(503);expect(f.repo.events.size).toBe(0);
  });
  it("retención elimina sólo crudos vencidos; no elimina eventos ni evidencia",async()=>{
    const f=fixture();await f.request();await processEmailWebhookOnce(f.repo);
    const firstId=[...f.repo.raw.keys()][0];f.repo.clock+=7*24*3600_000+1;
    await f.repo.saveRaw(Buffer.from("next"));
    expect(f.repo.raw.has(firstId)).toBe(false);expect(f.repo.events.size).toBe(1);
    expect(f.repo.recipients.get("r1")!.estado).toBe("entregado");
  });
  it("un tick limpia crudos vencidos aun sin eventos pendientes",async()=>{
    const f=fixture();await f.request();await processEmailWebhookOnce(f.repo);
    f.repo.clock+=7*24*3600_000+1;
    expect(await processEmailWebhookOnce(f.repo)).toBe(false);
    expect(f.repo.raw.size).toBe(0);expect(f.repo.events.size).toBe(1);
  });
  it("rate limit real del middleware: solicitud 61 del mismo origen recibe 429",async()=>{
    const [limiter]=resendWebhookBody();
    const request:any={ip:"192.0.2.10",headers:{},socket:{remoteAddress:"192.0.2.10"},method:"POST",
      app:{get:()=>false},originalUrl:RESEND_WEBHOOK_PATH};
    for(let i=0;i<61;i++){
      const status=await new Promise<number>((resolve,reject)=>{
        const response:any={statusCode:200,setHeader(){},getHeader(){return undefined;},
          status(n:number){this.statusCode=n;return this;},type(){return this;},send(){resolve(this.statusCode);return this;}};
        limiter(request,response,(error?:any)=>error?reject(error):resolve(200));
      });
      expect(status).toBe(i<60?200:429);
    }
  });
  it.each(["size","compressed"])("parser bloquea cuerpo %s antes de verificar o guardar",async kind=>{
    const body=Buffer.alloc(kind==="size"?WEBHOOK_MAX_BODY_BYTES+1:8);
    const req:any=Readable.from([body]);req.headers={"content-type":"application/json","content-length":String(body.length),
      ...(kind==="compressed"?{"content-encoding":"gzip"}:{})};req.method="POST";
    const [,raw]=resendWebhookBody();
    const result=await new Promise<number>((resolve,reject)=>{
      const response:any={statusCode:200,status(n:number){this.statusCode=n;return this;},
        type(){return this;},send(){resolve(this.statusCode);return this;}};
      raw(req,response,()=>reject(new Error("Body should be rejected")));
    });
    expect(result).toBe(kind==="size"?413:415);
  });
  it("raw middleware conserva espacios/bytes que JSON destruiría",async()=>{
    const body=Buffer.from('{  \"type\": \"email.delivered\", \"extra\":\"á\" }\\n');
    const req:any=Readable.from([body]);req.headers={"content-type":"application/json","content-length":String(body.length)};
    req.method="POST";
    const [,raw]=resendWebhookBody();
    await new Promise<void>((resolve,reject)=>raw(req,{} as any,(error:any)=>error?reject(error):resolve()));
    expect(Buffer.isBuffer(req.body)).toBe(true);expect(req.body.equals(body)).toBe(true);
  });
  it("integración registra captura antes de JSON y ruta antes de sanitizeInput",()=>{
    const index=readFileSync(new URL("../index.ts",import.meta.url),"utf8");
    const routes=readFileSync(new URL("../routes.ts",import.meta.url),"utf8");
    expect(index.indexOf('app.use("/api/notifications/webhooks/resend"')).toBeLessThan(index.indexOf("app.use(express.json"));
    expect(index).toContain('express.raw({type:()=>true,limit:"64kb",inflate:false})');
    expect(routes.indexOf("registerEmailWebhookRuntime(app,pool)")).toBeLessThan(routes.indexOf("app.use(sanitizeInput)"));
  });
  it("registra solamente el POST esperado, sin rutas o workers de prueba",()=>{
    const app:any={post:vi.fn()};registerResendWebhookRoute(app,fixture().repo,null);
    expect(app.post.mock.calls[0][0]).toBe(RESEND_WEBHOOK_PATH);
    const runtime=readFileSync(new URL("../lib/email/webhook-runtime.ts",import.meta.url),"utf8");
    expect(runtime).not.toMatch(/setInterval|setTimeout|processEmailWebhookOnce|listen\(/);
  });
});
