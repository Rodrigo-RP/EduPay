import { createHash,randomUUID } from "node:crypto";
import {
  isEmailEventType,WEBHOOK_LEASE_MS,WEBHOOK_MAX_BODY_BYTES,WEBHOOK_RAW_MAX_BYTES,
  WEBHOOK_RAW_MAX_ROWS,WEBHOOK_RAW_TTL_HOURS,
  type EmailEventClaim,type EmailWebhookRepository,type VerifiedEmailEvent,
} from "../lib/email/webhook-types";
import { stateAfterEmailEvent } from "../lib/email/webhook-worker";

// Explicit test-only persistence. Never imports a driver or an application module.
export class MemoryWebhookRepository implements EmailWebhookRepository {
  raw=new Map<string,{payload:Buffer;expires:number;hash:string}>();
  events=new Map<string,VerifiedEmailEvent & {status:string;claimId:string|null;until:number;
    next:number;recipientId:string|null;tenantId:number|null;campusId:number|null;errorCode?:string|null}>();
  recipients=new Map<string,{id:string;tenantId:number;campusId:number;messageId:string;
    estado:any;accepted:boolean;scopeValid:boolean;reason?:string;errorCode?:string}>();
  clock=Date.now();
  failRaw=false;failEnqueue=false;failProcess=false;
  actions:string[]=[];
  async saveRaw(payload:Buffer) {
    this.actions.push("raw");
    if(this.failRaw)throw new Error("simulated raw failure");
    if(payload.length>WEBHOOK_MAX_BODY_BYTES)throw new Error("body limit");
    for(const [id,r] of Array.from(this.raw))if(r.expires<=this.clock)this.raw.delete(id);
    const bytes=Array.from(this.raw.values()).reduce((sum,r)=>sum+r.payload.length,0);
    if(this.raw.size>=WEBHOOK_RAW_MAX_ROWS||bytes+payload.length>WEBHOOK_RAW_MAX_BYTES)throw new Error("capacity");
    const id=randomUUID();
    this.raw.set(id,{payload:Buffer.from(payload),expires:this.clock+WEBHOOK_RAW_TTL_HOURS*3600_000,
      hash:createHash("sha256").update(payload).digest("hex")});
    return id;
  }
  async enqueue(event:VerifiedEmailEvent) {
    this.actions.push("enqueue");
    if(this.failEnqueue)throw new Error("simulated durable failure");
    if(!this.events.has(event.eventId))this.events.set(event.eventId,{...event,status:"pendiente",
      claimId:null,until:0,next:0,recipientId:null,tenantId:null,campusId:null});
  }
  async pruneRaw() {
    for(const [id,r] of Array.from(this.raw))if(r.expires<=this.clock)this.raw.delete(id);
  }
  async claim() {
    const event=Array.from(this.events.values()).find(e=>
      (["pendiente","sin_correlacion"].includes(e.status)&&e.next<=this.clock)||
      (e.status==="procesando"&&e.until<=this.clock));
    if(!event)return null;
    event.status="procesando";event.claimId=randomUUID();event.until=this.clock+WEBHOOK_LEASE_MS;
    return {...event,claimId:event.claimId};
  }
  async process(claim:EmailEventClaim) {
    const event=this.events.get(claim.eventId);
    if(!event||event.claimId!==claim.claimId||event.status!=="procesando"||event.until<=this.clock)return;
    if(this.failProcess)throw new Error("simulated crash before commit");
    event.status="revision";event.errorCode="EVENTO_INCOMPLETO";
    const complete=event.eventType==="email.failed" ? !!event.details?.failedReason :
      event.eventType==="email.bounced" ? !!event.details?.bounceType && !!event.details?.bounceSubType : true;
    if(!isEmailEventType(event.eventType)){event.status="no_procesado";event.errorCode="EVENTO_NO_PROCESADO";}
    else if(complete&&event.messageId&&event.occurredAt) {
      const rows=Array.from(this.recipients.values()).filter(r=>r.messageId===event.messageId);
      if(!rows.length){event.status="sin_correlacion";event.errorCode="ESPERANDO_ACEPTACION";}
      else if(rows.length!==1)event.errorCode="CORRELACION_AMBIGUA";
      else {
        const r=rows[0];
        if(!r.scopeValid||r.tenantId<=0||r.campusId<=0)event.errorCode="ALCANCE_INCONSISTENTE";
        else if(!r.accepted||!["aceptado","entregado","rebotado","queja","error"].includes(r.estado)){
          event.status="sin_correlacion";event.errorCode="ESPERANDO_ACEPTACION";
        } else {
          r.estado=stateAfterEmailEvent(r.estado,event.eventType);
          if(event.eventType==="email.failed"&&r.estado==="error")r.errorCode=event.details?.failedReason;
          if(event.eventType==="email.suppressed"&&r.estado==="rebotado")r.reason="suprimido por el proveedor";
          event.status="procesado";event.errorCode=null;
          event.recipientId=r.id;event.tenantId=r.tenantId;event.campusId=r.campusId;
        }
      }
    }
    event.claimId=null;event.until=0;event.next=this.clock+60_000;
  }
}
