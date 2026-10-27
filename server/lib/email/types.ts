export const EMAIL_STATES = [
  "pendiente", "enviando", "aceptado", "entregado", "rebotado",
  "queja", "error", "incierto", "omitido",
] as const;
export type EmailState = typeof EMAIL_STATES[number];
export type EmailTipo = "RECORDATORIO_VENCIMIENTO" | "AVISO_MORA" | "CARGO_EMITIDO";
export interface EmailScope { tenantId: number; campusId: number; userId: number }
export interface EmailContent { subject: string; html: string; text: string }
export interface Candidate { id: number; nombre: string; email: string | null; guardianId: number | null }
export interface Recipient {
  email: string | null;
  estado: "pendiente" | "omitido";
  motivo: string | null;
  studentIds: number[];
  guardianIds: number[];
}
export interface EmailConfig {
  configured: boolean;
  environment: "production" | "development" | "test" | "unknown";
  apiKey: string;
  from: string;
  allowed: Set<string>;
}
export type ProviderResult =
  | { kind: "accepted"; messageId: string; pauseMs?: number }
  | { kind: "error" | "uncertain" | "transient" | "daily_quota" | "monthly_quota"; code: string; pauseMs?: number };
export interface EmailProvider {
  send(input: EmailContent & { to: string; idempotencyKey: string }): Promise<ProviderResult>;
}
export class EmailError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function emptyCounts(): Record<EmailState | "total", number> {
  return Object.fromEntries([...EMAIL_STATES, "total"].map(k => [k, 0])) as Record<EmailState | "total", number>;
}
