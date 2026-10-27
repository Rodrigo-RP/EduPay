import type { Candidate, EmailContent, EmailScope, EmailState, EmailTipo, Recipient } from "./types";

export interface Selection {
  tipo: EmailTipo;
  modo: "masivo" | "individual";
  estudiantesIds: number[];
  resendOf: string | null;
}
export interface Intent {
  id: string; tenantId: number; campusId: number; requestedBy: number;
  canonicalKey: string; selection: Selection; snapshot: Recipient[];
  content: EmailContent; configFingerprint: string; expiresAt: string;
}
export interface EmailRepository {
  assertScope(scope: EmailScope): Promise<void>;
  candidates(scope: EmailScope, selection: Selection): Promise<Candidate[]>;
  prepare(intent: Intent): Promise<{ intent: Intent; batchId: string | null }>;
  intent(scope: EmailScope, id: string): Promise<Intent | null>;
  batchForIntent(scope: EmailScope, id: string): Promise<string | null>;
  confirm(scope: EmailScope, intent: Intent): Promise<{ batchId: string; reused: boolean }>;
  batch(scope: EmailScope, id: string): Promise<any | null>;
  history(scope: EmailScope): Promise<any[]>;
  stats(scope: EmailScope): Promise<Record<EmailState | "total", number>>;
  resolve(scope: EmailScope, id: string): Promise<boolean>;
}
export interface EmailConnection {
  query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  release(): void;
}
export interface EmailDatabase {
  query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  connect(): Promise<EmailConnection>;
}
