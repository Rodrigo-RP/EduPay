import { z } from "zod";
import type { EmailConfig, EmailContent, EmailProvider, ProviderResult } from "./types";

// Direct REST adapter: no SDK automatic retries; ambiguity is handled by our ledger.
// Docs reviewed: resend.com/docs/api-reference/{introduction,errors,emails/send-email}
// and /dashboard/emails/idempotency-keys (24h retention; 256-character maximum).
export class ResendEmailProvider implements EmailProvider {
  constructor(private config: EmailConfig, private transport: typeof fetch = fetch) {
    if (config.environment === "test" || process.env.APP_ENV === "test")
      throw new Error("El adaptador real está prohibido en test");
    if (!config.configured || !["development", "production"].includes(config.environment))
      throw new Error("Correo no configurado");
  }
  async send(input: EmailContent & { to: string; idempotencyKey: string }): Promise<ProviderResult> {
    const { emailAllowed } = await import("./config");
    if (!emailAllowed(input.to, this.config)) return { kind: "error", code: "DESTINATARIO_NO_AUTORIZADO" };
    if (!input.idempotencyKey || input.idempotencyKey.length > 256)
      return { kind: "error", code: "CLAVE_IDEMPOTENCIA_INVALIDA" };
    try {
      const response = await this.transport("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json",
          "User-Agent": "EduPay-email/1.0", "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({ from: this.config.from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
        signal: AbortSignal.timeout(15_000),
      });
      const raw: any = await response.json().catch(() => null);
      const retry = response.headers.get("retry-after");
      const retryMs = retry ? (/^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
      const reset = Number(response.headers.get("ratelimit-reset") ?? 0) * 1000;
      const limited = response.headers.get("ratelimit-remaining") === "0";
      const pauseMs = Math.max(0, Number.isFinite(retryMs) ? retryMs : 0, limited && Number.isFinite(reset) ? reset : 0);
      if (response.ok) {
        const id = z.string().uuid().safeParse(raw?.id);
        return id.success ? { kind: "accepted", messageId: id.data, pauseMs } : { kind: "uncertain", code: "RESPUESTA_SIN_EVIDENCIA", pauseMs };
      }
      // Never persist provider messages: they can echo recipient, key or content.
      if (raw?.name === "daily_quota_exceeded") return { kind: "daily_quota", code: "CUOTA_DIARIA_AGOTADA", pauseMs };
      if (raw?.name === "monthly_quota_exceeded") return { kind: "monthly_quota", code: "CUOTA_MENSUAL_AGOTADA", pauseMs };
      if (response.status === 429 || raw?.name === "concurrent_idempotent_requests")
        return { kind: "transient", code: "LIMITE_TEMPORAL", pauseMs: Math.max(pauseMs, 1000) };
      if (response.status >= 500)
        return { kind: "transient", code: "PROVEEDOR_TEMPORAL", pauseMs };
      return { kind: "error", code: `PROVEEDOR_HTTP_${response.status}`, pauseMs };
    } catch {
      return { kind: "uncertain", code: "RESPUESTA_DESCONOCIDA" };
    }
  }
}
