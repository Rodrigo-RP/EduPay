import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { integerWithExistingLimits } from "../../../shared/zod-compat";
import { renderEmail, TEMPLATE_VERSION } from "./templates";
import { prepareRecipients } from "./recipients";
import type { EmailRepository, Selection } from "./repository";
import { EmailError, type EmailConfig, type EmailScope } from "./types";
import { digest } from "./identity";

export const tipoSchema = z.enum(["RECORDATORIO_VENCIMIENTO","AVISO_MORA","CARGO_EMITIDO"]);
const selectionSchema = z.object({
  tipo: tipoSchema, canal:z.literal("EMAIL"), modo:z.enum(["masivo","individual"]),
  estudiantesIds:z.array(integerWithExistingLimits(z.number()).positive()).max(5000).optional(),
  resendOf:z.guid({ error: "Invalid uuid" }).optional(),
}).strict();
export function configFingerprint(c: EmailConfig) { return digest([c.environment,c.from]); }

export class EmailService {
  constructor(private repo: EmailRepository, private getConfig: () => EmailConfig, private now = () => Date.now()) {}
  config() { return { configured:this.getConfig().configured,code:this.getConfig().configured ? undefined : "EMAIL_NO_CONFIGURADO",workerEnabled:false }; }
  requireConfig() {
    const c = this.getConfig();
    if (!c.configured) throw new EmailError(503,"EMAIL_NO_CONFIGURADO","Correo no configurado");
    return c;
  }
  async authorize(scope: EmailScope) { await this.repo.assertScope(scope); }
  async candidates(scope: EmailScope, tipo: unknown) {
    const t = tipoSchema.safeParse(tipo);
    if (!t.success) throw new EmailError(422,"EMAIL_TIPO_INVALIDO","Tipo de notificación no válido");
    const rows = await this.repo.candidates(scope,{tipo:t.data,modo:"masivo",estudiantesIds:[],resendOf:null});
    return Array.from(new Map(rows.map(r => [r.id,{id:r.id,nombre:r.nombre,email:r.email}])).values());
  }
  async preview(scope: EmailScope, body: unknown) {
    const config = this.requireConfig(); // Before any insert, including an intention.
    const parsed = selectionSchema.safeParse(body);
    if (!parsed.success) throw new EmailError(422,"EMAIL_SOLICITUD_INVALIDA","Revise canal y selección");
    const q = parsed.data;
    if (q.modo === "individual" && !q.estudiantesIds?.length)
      throw new EmailError(422,"EMAIL_SELECCION_VACIA","Seleccione al menos un alumno");
    if (q.modo === "masivo" && q.estudiantesIds?.length)
      throw new EmailError(422,"EMAIL_SELECCION_INVALIDA","El envío masivo no acepta una selección parcial");
    if (q.resendOf) {
      const prior = await this.repo.batch(scope,q.resendOf);
      if (!prior) throw new EmailError(404,"EMAIL_LOTE_NO_ENCONTRADO","Lote no encontrado");
      if (prior.counts.incierto || prior.counts.pendiente || prior.counts.enviando)
        throw new EmailError(409,"EMAIL_LOTE_SIN_RESOLVER","Resuelva el lote anterior antes de preparar un envío nuevo");
    }
    const selection: Selection = {tipo:q.tipo,modo:q.modo,estudiantesIds:Array.from(new Set(q.estudiantesIds ?? [])).sort((a,b)=>a-b),resendOf:q.resendOf ?? null};
    const recipients = prepareRecipients(await this.repo.candidates(scope,selection),config);
    if (!recipients.length) throw new EmailError(422,"EMAIL_SIN_DESTINATARIOS","No hay alumnos con cargos elegibles");
    const content = renderEmail(q.tipo);
    // Same selection/scope/template has a persistent identity even when data or
    // configuration changes. Refreshing an unconfirmed snapshot is never a new send.
    const canonicalKey = digest([scope.tenantId,scope.campusId,selection,TEMPLATE_VERSION]);
    const prepared = await this.repo.prepare({
      id:randomUUID(),...scope,requestedBy:scope.userId,canonicalKey,selection,
      snapshot:recipients,content,configFingerprint:configFingerprint(config),
      expiresAt:new Date(this.now()+15*60_000).toISOString(),
    });
    const snapshot = prepared.intent.snapshot;
    return {intentId:prepared.intent.id,existingBatchId:prepared.batchId,expiresAt:prepared.intent.expiresAt,
      summary:{total:snapshot.length,validos:snapshot.filter(r=>r.estado==="pendiente").length,omitidos:snapshot.filter(r=>r.estado==="omitido").length},
      recipients:snapshot};
  }
  async confirm(scope: EmailScope, id: string) {
    const config = this.requireConfig();
    const intent = await this.repo.intent(scope,id);
    if (!intent) throw new EmailError(404,"EMAIL_INTENCION_NO_ENCONTRADA","Confirmación no encontrada");
    const existing = await this.repo.batchForIntent(scope,id);
    if (existing) return {batchId:existing,reused:true};
    if (Date.parse(intent.expiresAt) < this.now()) throw new EmailError(409,"EMAIL_PREVIEW_EXPIRED","La confirmación venció; prepare otra vista previa");
    const current = prepareRecipients(await this.repo.candidates(scope,intent.selection),config);
    if (digest(current)!==digest(intent.snapshot) || configFingerprint(config)!==intent.configFingerprint)
      throw new EmailError(409,"EMAIL_PREVIEW_CHANGED","Los destinatarios o la configuración cambiaron; actualice la vista previa");
    return this.repo.confirm(scope,intent);
  }
  async batch(scope:EmailScope,id:string) {
    const b=await this.repo.batch(scope,id);
    if (!b) throw new EmailError(404,"EMAIL_LOTE_NO_ENCONTRADO","Lote no encontrado");
    return b;
  }
  history(scope:EmailScope) { return this.repo.history(scope); }
  stats(scope:EmailScope) { return this.repo.stats(scope); }
  async resolve(scope:EmailScope,id:string) {
    if (!await this.repo.resolve(scope,id)) throw new EmailError(409,"EMAIL_INCIDENCIA_NO_DISPONIBLE","Incidencia no disponible para resolución");
    return {resolved:true};
  }
}
