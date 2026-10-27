export interface EmailEvidenceCounts {
  aceptados: number;
  entregados: number;
  rebotados: number;
  quejas: number;
  suprimidos: number;
  fallidos: number;
  demorados: number;
}
export interface EmailProviderEvent {
  id: string;
  type: string;
  occurred_at: string;
  bounce_type?: string | null;
  bounce_sub_type?: string | null;
  failed_reason?: string | null;
}
export interface EmailRecipientEvidence {
  delivered_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  suppressed_at?: string | null;
  failed_at?: string | null;
  delayed_at?: string | null;
  provider_events?: EmailProviderEvent[];
}
