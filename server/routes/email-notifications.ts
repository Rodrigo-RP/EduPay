import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import { EmailService } from "../lib/email/service";
import { EmailError, type EmailScope } from "../lib/email/types";

export interface EmailRouteDependencies {
  service: EmailService;
  authenticate: RequestHandler;
  can: (user: any, action: "read" | "process") => boolean;
}

// The existing app logger captures res.json payloads (including recipients).
// A serialized JSON string via send preserves the API contract and normal
// method/path/status logging without capturing these sensitive response bodies.
function reply(res:Response,payload:unknown) {
  return res.type("application/json").send(JSON.stringify(payload));
}

/** Dependency-injected router: tests never import db, storage or server/index. */
export function registerEmailNotificationRoutes(app: Express, deps: EmailRouteDependencies): void {
  const { service, authenticate, can } = deps;
  const guard = (action: "read" | "process", handler: (req:any,scope:EmailScope,res:any)=>Promise<any>) =>
    async (req:any,res:any) => {
      try {
        if (!can(req.user,action)) throw new EmailError(403,"EMAIL_PERMISO_DENEGADO","No tiene permiso para esta operación");
        const ctx=z.object({tenant_id:z.number().int().positive(),campus_id:z.number().int().positive(),id:z.number().int().positive()}).safeParse(req.user);
        if (!ctx.success) throw new EmailError(403,"EMAIL_SCOPE_DENEGADO","Se requiere un campus y una institución autorizados");
        const scope={tenantId:ctx.data.tenant_id,campusId:ctx.data.campus_id,userId:ctx.data.id};
        await service.authorize(scope);
        return await handler(req,scope,res);
      } catch(e) {
        if (e instanceof EmailError) return reply(res.status(e.status),{code:e.code,message:e.message});
        // No error object, provider response, address, credentials or message body in logs/API.
        return reply(res.status(500),{code:"EMAIL_ERROR_INTERNO",message:"No se pudo completar la operación de correo"});
      }
    };
  const uuid=(value:unknown) => {
    const parsed=z.string().uuid().safeParse(value);
    if (!parsed.success) throw new EmailError(422,"EMAIL_ID_INVALIDO","Identificador no válido");
    return parsed.data;
  };
  const emailChannel=(body:any) => {
    if (body?.canal && body.canal!=="EMAIL")
      throw new EmailError(422,"EMAIL_CANAL_NO_DISPONIBLE","No disponible por ahora");
  };
  app.get("/api/notifications/email/config",authenticate,guard("read",async (req,_s,res)=>reply(res,{
    ...service.config(),canProcess:can(req.user,"process"),
  })));
  const candidates=guard("read",async (req,s,res)=>reply(res,await service.candidates(s,req.query.tipo??"CARGO_EMITIDO")));
  app.get("/api/notifications/email/candidates",authenticate,candidates);
  app.get("/api/notifications/pending-students",authenticate,candidates);
  app.post("/api/notifications/email/preview",authenticate,guard("process",async (req,s,res)=>{
    emailChannel(req.body);
    reply(res,await service.preview(s,req.body));
  }));
  app.post("/api/notifications/email/confirm",authenticate,guard("process",async (req,s,res)=>{
    emailChannel(req.body);
    const data=z.object({intentId:z.string().uuid(),canal:z.literal("EMAIL")}).strict().safeParse(req.body);
    if (!data.success) throw new EmailError(422,"EMAIL_CONFIRMACION_INVALIDA","Revise la confirmación");
    reply(res.status(202),await service.confirm(s,data.data.intentId));
  }));
  app.get("/api/notifications/email/batches/:id",authenticate,guard("read",async (req,s,res)=>reply(res,await service.batch(s,uuid(req.params.id)))));
  const history=guard("read",async (_r,s,res)=>reply(res,await service.history(s)));
  const stats=guard("read",async (_r,s,res)=>reply(res,await service.stats(s)));
  app.get("/api/notifications/email/history",authenticate,history);
  app.get("/api/notifications/email/stats",authenticate,stats);
  // Old URLs remain safe for old clients; no legacy records count as real delivery.
  app.get("/api/notifications",authenticate,history);
  app.get("/api/notifications/stats",authenticate,stats);
  app.post("/api/notifications/send",authenticate,guard("process",async (req,_s,res)=>{
    emailChannel(req.body);
    service.requireConfig();
    reply(res.status(410),{code:"EMAIL_CONFIRMACION_REQUERIDA",message:"Prepare y confirme el lote en Notificaciones"});
  }));
  app.post("/api/notifications/email/recipients/:id/resolve",authenticate,guard("process",async (req,s,res)=>{
    if (!z.object({decision:z.literal("cerrar_sin_reenvio")}).strict().safeParse(req.body).success)
      throw new EmailError(422,"EMAIL_RESOLUCION_INVALIDA","Sólo se permite cerrar sin reenviar");
    reply(res,await service.resolve(s,uuid(req.params.id)));
  }));
}
