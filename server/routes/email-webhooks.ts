import express, { type Express, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";
import { WEBHOOK_MAX_BODY_BYTES, type EmailWebhookRepository } from "../lib/email/webhook-types";
import type { WebhookVerifier } from "../lib/email/webhook-signature";

export const RESEND_WEBHOOK_PATH = "/api/notifications/webhooks/resend";
function respond(res: Response, status: number, code: string) {
  return res.status(status).type("application/json").send(JSON.stringify({code}));
}

/** Mount before express.json. No inflate, JSON reserialization or body logging. */
export function resendWebhookBody(): RequestHandler[] {
  const limiter = rateLimit({
    windowMs:60_000,limit:60,standardHeaders:true,legacyHeaders:false,
    handler:(_req,res)=>{ respond(res,429,"EMAIL_WEBHOOK_LIMITE"); },
  });
  const raw = express.raw({type:()=>true,limit:WEBHOOK_MAX_BODY_BYTES,inflate:false});
  return [limiter,(req,res,next)=>raw(req,res,error=>{
    if (error) { respond(res,error.status===413?413:415,"EMAIL_WEBHOOK_CUERPO_RECHAZADO"); return; }
    next();
  })];
}

/** Provider signature is authentication here, not an administrator's JWT. */
export function registerResendWebhookRoute(app: Express, repository: EmailWebhookRepository,
  verifier: WebhookVerifier | null): void {
  app.post(RESEND_WEBHOOK_PATH,async (req,res)=>{
    if (!Buffer.isBuffer(req.body)) return respond(res,400,"EMAIL_WEBHOOK_CUERPO_ORIGINAL_REQUERIDO");
    if (req.body.length>WEBHOOK_MAX_BODY_BYTES) return respond(res,413,"EMAIL_WEBHOOK_CUERPO_RECHAZADO");
    let receiptId: string;
    try { receiptId=await repository.saveRaw(req.body); }
    catch { return respond(res,503,"EMAIL_WEBHOOK_RECEPCION_NO_DISPONIBLE"); }
    if (!verifier) return respond(res,503,"EMAIL_WEBHOOK_NO_CONFIGURADO");
    let event: ReturnType<WebhookVerifier>;
    try { event=verifier(req.body,req.headers); }
    catch { return respond(res,400,"EMAIL_WEBHOOK_FIRMA_INVALIDA"); }
    try {
      await repository.enqueue({...event,receiptId,payloadHash:createHash("sha256").update(req.body).digest("hex")});
    } catch { return respond(res,503,"EMAIL_WEBHOOK_PERSISTENCIA_NO_DISPONIBLE"); }
    // Durable receipt + verified queue committed. No processing in this request.
    return respond(res,200,"EMAIL_WEBHOOK_REGISTRADO");
  });
}
