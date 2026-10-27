import { emailAllowed } from "./config";
import { configFingerprint } from "./service";
import type { EmailContent, EmailConfig, EmailProvider, ProviderResult, EmailState } from "./types";

export interface ClaimedEmail {
  id: string; claimId: string; tenantId: number; campusId: number;
  to: string; providerKey: string; content: EmailContent; configFingerprint: string;
  retries: number; firstAttemptAt: number;
}
export interface WorkerUpdate {
  estado: EmailState; code: string | null; retryAt?: number; retries: number;
  providerMessageId?: string; acceptedAt?: number; motivo?: string;
  pauseUntil?: number; pauseReason?: string;
  clearFirstAttemptAt?: boolean;
}
export interface EmailWorkerRepository {
  claim(): Promise<ClaimedEmail | null>;
  stillEligible(claim: ClaimedEmail): Promise<boolean>;
  finish(claim: ClaimedEmail, update: WorkerUpdate): Promise<void>;
}
export function resultUpdate(result: ProviderResult, claim: ClaimedEmail, now: number): WorkerUpdate {
  const base={retries:claim.retries,code:null as string|null,pauseUntil:result.pauseMs?now+result.pauseMs:undefined};
  if (result.kind==="accepted") return {...base,estado:"aceptado",providerMessageId:result.messageId,acceptedAt:now};
  if (result.kind==="daily_quota" || result.kind==="monthly_quota") {
    const d=new Date(now);
    const until=result.kind==="daily_quota"
      ? Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1)
      : Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);
    return {...base,estado:"pendiente",code:result.code,retryAt:Math.max(until,base.pauseUntil??0),
      pauseUntil:Math.max(until,base.pauseUntil??0),pauseReason:result.code,
      clearFirstAttemptAt:claim.retries===0};
  }
  if (result.kind==="uncertain") return {...base,estado:"incierto",code:result.code};
  if (result.kind==="transient") {
    // Never replay outside Resend's idempotency window, including long Retry-After.
    const retryAt=Math.max(now+Math.pow(2,claim.retries)*10_000,base.pauseUntil??0);
    if (retryAt-claim.firstAttemptAt>=23*60*60_000)
      return {...base,estado:"incierto",code:"VENTANA_IDEMPOTENCIA_AGOTADA"};
    if (claim.retries>=3) return {...base,estado:"error",code:"REINTENTOS_AGOTADOS"};
    return {...base,estado:"pendiente",code:result.code,retries:claim.retries+1,retryAt};
  }
  return {...base,estado:"error",code:result.code};
}

/** One explicit tick only. No startup hook, interval or CLI auto-execution. */
export async function processEmailOnce(repo: EmailWorkerRepository, provider: EmailProvider,
  config: EmailConfig, now=()=>Date.now()): Promise<boolean> {
  if (!config.configured || config.environment==="unknown") return false;
  const claim=await repo.claim();
  if (!claim) return false;
  if (claim.configFingerprint!==configFingerprint(config)) {
    await repo.finish(claim,{estado:"error",code:"CONFIGURACION_CAMBIO",retries:claim.retries});
    return true;
  }
  if (!emailAllowed(claim.to,config) || !await repo.stillEligible(claim)) {
    await repo.finish(claim,{estado:"omitido",code:null,retries:claim.retries,motivo:
      !emailAllowed(claim.to,config)?"no autorizado en este entorno":"destinatario dejó de ser elegible"});
    return true;
  }
  // A process crash after this point leaves a lease. Recovery marks it uncertain,
  // never pending. A lost acceptance commit is likewise not automatically resent.
  let result:ProviderResult;
  try {
    result=await provider.send({...claim.content,to:claim.to,idempotencyKey:claim.providerKey});
  } catch { result={kind:"uncertain",code:"RESPUESTA_DESCONOCIDA"}; }
  if (result.kind==="accepted" && !result.messageId)
    result={kind:"uncertain",code:"RESPUESTA_SIN_EVIDENCIA"};
  await repo.finish(claim,resultUpdate(result,claim,now()));
  return true;
}
