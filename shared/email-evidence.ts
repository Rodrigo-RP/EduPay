export interface EmailEvidenceCounts {
  aceptados: number;
  entregados: number;
  rebotados: number;
  quejas: number;
}
export interface EmailProviderEvent {
  id: string;
  type: string;
  occurred_at: string;
}
export interface EmailRecipientEvidence {
  provider_sent_at?: string | null;
  delivered_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  provider_events?: EmailProviderEvent[];
}
