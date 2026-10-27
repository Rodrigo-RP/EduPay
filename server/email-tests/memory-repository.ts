import { randomUUID } from "node:crypto";
import type { EmailRepository, Intent, Selection } from "../lib/email/repository";
import { EmailError, emptyCounts, type Candidate, type EmailScope } from "../lib/email/types";
import type { ClaimedEmail, EmailWorkerRepository, WorkerUpdate } from "../lib/email/worker";
import { digest } from "../lib/email/identity";

// Models atomic uniqueness/claim operations synchronously before an await.
// It is NOT a substitute for PostgreSQL lock/constraint validation.
export class MemoryEmailRepository implements EmailRepository,EmailWorkerRepository {
  clock=Date.UTC(2026,9,26,12);
  gate=0;
  notice:string|null=null;
  allowedScopes=new Set(["1:10"]);
  candidatesData:Candidate[]=[
    {id:1,nombre:"Alumno A",email:"owner@example.test",guardianId:1},
    {id:2,nombre:"Alumno B",email:" OWNER@example.test ",guardianId:1},
    {id:3,nombre:"Alumno C",email:null,guardianId:null},
  ];
  intents=new Map<string,Intent>();
  keys=new Map<string,string>();
  batches=new Map<string,any>();
  records=new Map<string,any>();
  events:any[]=[];
  async assertScope(s:EmailScope) {
    if (!this.allowedScopes.has(`${s.tenantId}:${s.campusId}`)) throw new EmailError(403,"EMAIL_SCOPE_DENEGADO","Campus no autorizado");
  }
  async candidates(s:EmailScope,q:Selection) {
    await this.assertScope(s);
    const rows=this.candidatesData.filter(c=>q.modo==="masivo"||q.estudiantesIds.includes(c.id));
    if(q.modo==="individual"&&q.estudiantesIds.some(id=>!rows.some(r=>r.id===id)))
      throw new EmailError(403,"EMAIL_SELECCION_DENEGADA","Selección no autorizada");
    return structuredClone(rows);
  }
  async prepare(i:Intent) {
    const key=`${i.tenantId}:${i.campusId}:${i.canonicalKey}`;
    const old=this.keys.get(key);
    if(old) {
      const existing=this.intents.get(old)!;
      const b=Array.from(this.batches.values()).find(b=>b.intentId===old);
      if(b) return {intent:structuredClone(existing),batchId:b.id};
      if(digest(existing.snapshot)===digest(i.snapshot)&&existing.configFingerprint===i.configFingerprint) {
        existing.expiresAt=i.expiresAt; return {intent:structuredClone(existing),batchId:null};
      }
      this.intents.delete(old);
    }
    this.keys.set(key,i.id); this.intents.set(i.id,structuredClone(i));
    return {intent:structuredClone(i),batchId:null};
  }
  async intent(s:EmailScope,id:string) {
    const i=this.intents.get(id);
    return i&&i.tenantId===s.tenantId&&i.campusId===s.campusId?structuredClone(i):null;
  }
  async batchForIntent(s:EmailScope,id:string) {
    return Array.from(this.batches.values()).find(b=>b.intentId===id&&b.tenantId===s.tenantId&&b.campusId===s.campusId)?.id??null;
  }
  async confirm(s:EmailScope,i:Intent) {
    const existing=Array.from(this.batches.values()).find(b=>b.intentId===i.id);
    if(existing)return {batchId:existing.id,reused:true};
    if(!this.intents.has(i.id))throw new EmailError(409,"EMAIL_PREVIEW_CHANGED","Vista previa cambió");
    const id=randomUUID();
    this.batches.set(id,{id,intentId:i.id,tenantId:s.tenantId,campusId:s.campusId});
    for(const r of i.snapshot) {
      const rid=randomUUID();
      this.records.set(rid,{...structuredClone(r),id:rid,email:r.email,batchId:id,tenantId:s.tenantId,campusId:s.campusId,
        content:i.content,configFingerprint:i.configFingerprint,providerKey:`edupay/${rid}`,retries:0,next:0,claimId:null,
        provider_message_id:null,accepted_at:null,enviado_en:null,firstAttemptAt:null});
    }
    return {batchId:id,reused:false};
  }
  counts(rows:any[]) {
    const counts=emptyCounts();
    for(const r of rows) {
      if(["aceptado","entregado","rebotado","queja"].includes(r.estado)&&!(r.provider_message_id&&r.accepted_at&&r.enviado_en))continue;
      if(r.estado in counts){counts[r.estado as keyof typeof counts]++;counts.total++;}
    }
    return counts;
  }
  async batch(s:EmailScope,id:string) {
    const b=this.batches.get(id);
    if(!b||b.tenantId!==s.tenantId||b.campusId!==s.campusId)return null;
    const rows=Array.from(this.records.values()).filter(r=>r.batchId===id);
    return {id,counts:this.counts(rows),recipients:structuredClone(rows),notice:this.notice,workerEnabled:false};
  }
  async history(s:EmailScope) {
    return Promise.all(Array.from(this.batches.values()).filter(b=>b.tenantId===s.tenantId&&b.campusId===s.campusId).map(b=>this.batch(s,b.id)));
  }
  async stats(s:EmailScope) {
    return this.counts(Array.from(this.records.values()).filter(r=>r.tenantId===s.tenantId&&r.campusId===s.campusId));
  }
  async resolve(s:EmailScope,id:string) {
    const r=this.records.get(id);
    if(!r||r.tenantId!==s.tenantId||r.campusId!==s.campusId||r.estado!=="incierto")return false;
    r.estado="error";this.events.push({actor:s.userId,code:"CIERRE_MANUAL_SIN_REENVIO"});return true;
  }
  async claim():Promise<ClaimedEmail|null> {
    for(const r of Array.from(this.records.values()))if(r.estado==="enviando"&&r.lease<this.clock)r.estado="incierto";
    if(this.gate>this.clock)return null;
    const r=Array.from(this.records.values()).find(r=>r.estado==="pendiente"&&r.next<=this.clock);
    if(!r)return null;
    r.estado="enviando";r.claimId=randomUUID();r.firstAttemptAt??=this.clock;r.lease=this.clock+120_000;
    this.gate=this.clock+1000;
    return {id:r.id,claimId:r.claimId,tenantId:r.tenantId,campusId:r.campusId,to:r.email,content:r.content,
      configFingerprint:r.configFingerprint,providerKey:r.providerKey,retries:r.retries,firstAttemptAt:r.firstAttemptAt};
  }
  async stillEligible(c:ClaimedEmail) {return this.records.has(c.id);}
  async finish(c:ClaimedEmail,u:WorkerUpdate) {
    const r=this.records.get(c.id);
    if(r.claimId!==c.claimId||!["enviando","incierto"].includes(r.estado))return;
    r.estado=u.estado;r.retries=u.retries;r.next=u.retryAt??r.next;r.error_code=u.code;r.motivo=u.motivo??r.motivo;
    r.provider_message_id=u.providerMessageId??null;r.accepted_at=u.acceptedAt??null;r.enviado_en=u.acceptedAt??null;
    if(u.clearFirstAttemptAt)r.firstAttemptAt=null;
    if(u.pauseUntil)this.gate=Math.max(this.gate,u.pauseUntil);
    if(u.pauseReason)this.notice=u.pauseReason;
    this.events.push({id:c.id,...u});
  }
}
