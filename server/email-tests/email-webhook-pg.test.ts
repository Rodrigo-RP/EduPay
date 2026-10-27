import { describe,it,expect,vi } from "vitest";
import { readFileSync } from "node:fs";
import { PgEmailWebhookRepository,claimWebhookSql,correlateEmailSql } from "../lib/email/pg-webhooks";
import { emailEvidenceCountsSql,emailEvidenceJoinSql,countEmailEvidence } from "../lib/email/evidence";
import { PgEmailRepository } from "../lib/email/pg-repository";

const event={eventId:"authenticated-event",eventType:"email.delivered",messageId:"provider-message",
  occurredAt:"2026-01-01T00:00:00Z",receiptId:"receipt",payloadHash:"hash"};
function fakeDatabase(options:{matches?:any[];owned?:boolean;failAt?:string}={}) {
  const stored={provider_event_id:event.eventId,event_type:"email.bounced",provider_message_id:event.messageId,
    occurred_at:event.occurredAt,receipt_id:event.receiptId,payload_hash:"hash"};
  const recipient={id:"r1",tenant_id:1,campus_id:10,provider_message_id:event.messageId,estado:"aceptado",
    accepted_at:"2026-01-01T00:00:00Z",enviado_en:"2026-01-01T00:00:00Z",scope_valid:true};
  const query=vi.fn(async(sql:string,_params?:any[])=>{
    if(options.failAt&&sql.includes(options.failAt))throw new Error("simulated SQL failure");
    if(sql.includes("SUM(payload_size)"))return {rows:[{rows:0,bytes:0}]};
    if(sql.includes("SELECT * FROM email_webhook_events"))return {rows:options.owned===false?[]:[stored]};
    if(sql===correlateEmailSql)return {rows:options.matches??[recipient]};
    return {rows:[]};
  });
  const connection={query,release:vi.fn()};
  const database={query,connect:async()=>connection};
  return {query,connection,database,recipient,stored,repo:new PgEmailWebhookRepository(database)};
}
describe("Fase B: contratos PostgreSQL sin conexión (SQL capturado, no ejecutado)",()=>{
  it("crudo usa transacción, capacidad serializada, TTL y cuerpo exacto; sin id confiable ni headers",async()=>{
    const f=fakeDatabase();const payload=Buffer.from("original bytes");
    await f.repo.saveRaw(payload);
    const queries=f.query.mock.calls.map(call=>call[0]);
    expect(queries[0]).toBe("BEGIN");expect(queries.at(-1)).toBe("COMMIT");
    expect(queries[1]).toContain("pg_advisory_xact_lock");
    expect(queries[2]).toContain("expires_at<=NOW()");expect(queries[2]).toContain("LIMIT 2000");
    const insert=f.query.mock.calls.find(([q])=>q.includes("INSERT INTO email_webhook_receipts"))!;
    expect(insert[0]).not.toMatch(/provider_event_id|signature|headers|tenant_id/);
    expect(insert[1]?.[1]).toBe(payload.toString("base64"));expect(insert[1]?.[4]).toBe(24);
    expect(f.connection.release).toHaveBeenCalled();
  });
  it("fallo de recepción revierte antes de confirmar",async()=>{
    const f=fakeDatabase({failAt:"INSERT INTO email_webhook_receipts"});
    await expect(f.repo.saveRaw(Buffer.from("x"))).rejects.toThrow();
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(f.query.mock.calls.some(([q])=>q==="COMMIT")).toBe(false);
  });
  it("únicamente enqueue usa el id autenticado con ON CONFLICT",async()=>{
    const f=fakeDatabase();await f.repo.enqueue(event);
    expect(f.query.mock.calls[0][0]).toContain("ON CONFLICT(provider_event_id) DO NOTHING");
    expect(f.query.mock.calls[0][1]).toEqual([event.eventId,event.eventType,event.messageId,event.occurredAt,event.receiptId,event.payloadHash]);
  });
  it("claim atómico incluye vencidos y SKIP LOCKED, sin pedir scope al payload",()=>{
    expect(claimWebhookSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimWebhookSql).toContain("claimed_until<=NOW()");
    expect(claimWebhookSql).toContain("status IN ('pendiente','sin_correlacion')");
    expect(claimWebhookSql).toContain("RETURNING *");
  });
  it("procesa hechos persistidos, no campos adulterados del claim; transacción y scope completo",async()=>{
    const f=fakeDatabase();
    await f.repo.process({...event,claimId:"claim",eventType:"email.complained",messageId:"forged"});
    const recipientUpdate=f.query.mock.calls.find(([q])=>q.startsWith("UPDATE email_notification_recipients"))!;
    expect(recipientUpdate[1]).toEqual(["r1",1,10,"rebotado",event.messageId]);
    expect(recipientUpdate[0]).toContain("tenant_id=$2 AND campus_id=$3 AND provider_message_id=$5");
    expect(recipientUpdate[0]).not.toMatch(/accepted_at=|enviado_en=/);
    const eventUpdate=f.query.mock.calls.find(([q])=>q.startsWith("UPDATE email_webhook_events"))!;
    expect(eventUpdate[1]?.slice(2)).toEqual(["procesado",null,"r1",1,10]);
    expect(f.query.mock.calls[0][0]).toBe("BEGIN");expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
  it("claim viejo/vencido no cambia ni evento ni destinatario",async()=>{
    const f=fakeDatabase({owned:false});await f.repo.process({...event,claimId:"old"});
    expect(f.query.mock.calls.map(([q])=>q)).toEqual(["BEGIN",expect.stringContaining("claimed_until>NOW()"),"COMMIT"]);
  });
  it.each(["ambiguous","scope","missing"])("correlación %s no actualiza correos",async kind=>{
    const row=fakeDatabase().recipient;
    const f=fakeDatabase({matches:kind==="ambiguous"?[row,{...row,id:"r2",tenant_id:2,campus_id:20}]:
      kind==="scope"?[{...row,scope_valid:false}]:[]});
    await f.repo.process({...event,claimId:"claim"});
    expect(f.query.mock.calls.some(([q])=>q.startsWith("UPDATE email_notification_recipients"))).toBe(false);
    const update=f.query.mock.calls.find(([q])=>q.startsWith("UPDATE email_webhook_events"))!;
    expect(update[1]?.[2]).toBe(kind==="missing"?"sin_correlacion":"revision");
    expect(update[1]?.slice(4)).toEqual([null,null,null]);
  });
  it("fallo de actualización revierte la transacción, no marca procesado",async()=>{
    const f=fakeDatabase({failAt:"UPDATE email_notification_recipients"});
    await expect(f.repo.process({...event,claimId:"claim"})).rejects.toThrow();
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(f.query.mock.calls.some(([q])=>q.startsWith("UPDATE email_webhook_events"))).toBe(false);
    expect(f.connection.release).toHaveBeenCalled();
  });
  it("correlación no elige el primer match ni confía en tags o direcciones",()=>{
    expect(correlateEmailSql).toContain("WHERE r.provider_message_id=$1");
    expect(correlateEmailSql).toContain("b.tenant_id=r.tenant_id AND b.campus_id=r.campus_id");
    expect(correlateEmailSql).toContain("ca.tenant_id=r.tenant_id");
    expect(correlateEmailSql).not.toMatch(/LIMIT 1|tags|email=/);
  });
  it("sólo evidencia procesada y correlacionada cuenta; no tablas legadas",()=>{
    for(const clause of ["e.status='procesado'","e.recipient_id=r.id","e.tenant_id=r.tenant_id",
      "e.campus_id=r.campus_id","e.provider_message_id=r.provider_message_id"])
      expect(emailEvidenceJoinSql).toContain(clause);
    expect(emailEvidenceCountsSql).toContain("r.tenant_id=$1 AND r.campus_id=$2");
    expect(emailEvidenceCountsSql).toContain("COUNT(*) FILTER (WHERE accepted AND delivered_at IS NOT NULL)");
    expect(emailEvidenceCountsSql).not.toMatch(/\bFROM notifications\b/);
  });
  it("estadísticas conservan aceptación y todos los hechos aun cuando el estado es queja",async()=>{
    const query=vi.fn(async()=>({rows:[{estado:"queja",n:1,
      evidence_aceptados:1,evidence_entregados:1,evidence_rebotados:1,evidence_quejas:1}]}));
    const counts=await new PgEmailRepository({query} as any).stats({tenantId:2,campusId:20,userId:8});
    expect(counts.queja).toBe(1);expect(counts.entregado).toBe(0);
    expect(counts.evidence).toEqual({aceptados:1,entregados:1,rebotados:1,quejas:1});
    expect(query.mock.calls[0]).toEqual([emailEvidenceCountsSql,[2,20,null]]);
    expect(counts).not.toHaveProperty("tasaEntrega");
  });
  it("fecha o estado sin evento no constituye entrega/queja/rebote",()=>{
    const c=countEmailEvidence([{estado:"entregado",n:1,evidence_aceptados:1,
      evidence_entregados:0,evidence_rebotados:0,evidence_quejas:0}]);
    expect(c.entregado).toBe(0);expect(c.evidence).toEqual({aceptados:1,entregados:0,rebotados:0,quejas:0});
  });
  it("detalle expone hechos, no crudo o firma; aplica scope a todas las lecturas",async()=>{
    const query=vi.fn(async(sql:string,_params?:any[])=>({rows:sql.startsWith("SELECT id,created_at FROM email_notification_batches WHERE id")?[{id:"batch"}]:[]}));
    const repo=new PgEmailRepository({query} as any);
    await repo.batch({tenantId:2,campusId:20,userId:8},"batch");
    const detail=query.mock.calls.find(([q])=>q.includes("proof.provider_events"))!;
    expect(detail[0]).toContain("r.batch_id=$1 AND r.tenant_id=$2 AND r.campus_id=$3");
    expect(detail[1]).toEqual(["batch",2,20]);
    expect(detail[0]).not.toMatch(/payload_base64|svix-signature|RESEND_WEBHOOK_SECRET/);
  });
  it("migración generada es aditiva, con unicidad confiable y FK de scope",()=>{
    const sql=readFileSync(new URL("../../drizzle/migrations/0004_email_notifications_phase_b.sql",import.meta.url),"utf8");
    expect(sql).toContain('"email_webhook_events"');
    expect(sql).toContain('"provider_event_id" text PRIMARY KEY NOT NULL');
    expect(sql).toContain('"email_webhook_events_recipient_scope_fk"');
    expect(sql).toContain('"email_webhook_receipts_size_check"');
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|^\s*(?:DELETE|UPDATE)\b/im);
    expect(sql.indexOf('ADD CONSTRAINT "email_recipients_id_scope_unique"')).toBeLessThan(sql.indexOf('ADD CONSTRAINT "email_webhook_events_recipient_scope_fk"'));
  });
});
