import type { Response } from "express";

export class ClosedLedgerRecordError extends Error {
  readonly status = 409;
  readonly code = "LEDGER_RECORD_CLOSED";

  constructor() {
    super("Este registro está cerrado; usa una reversa para corregirlo");
    this.name = "ClosedLedgerRecordError";
  }
}

// Include the public terminology and the persisted Spanish ledger states.
// Reversed/cancelled records are terminal too: correcting them must not rewrite history.
const CLOSED_STATES = new Set([
  "aplicado", "completado", "pagado", "exitoso", "cancelado", "reversado", "fallido",
]);

/** Call under the same row lock/transaction as the mutation, never on a stale read. */
export function assertMutable(record: { estado?: string | null; status?: string | null }): void {
  if ([record.estado, record.status].some(state => state != null && CLOSED_STATES.has(state))) {
    throw new ClosedLedgerRecordError();
  }
}

export function sendClosedLedgerError(res: Response, error: unknown): boolean {
  if (!(error instanceof ClosedLedgerRecordError)) return false;
  res.status(error.status).json({ code: error.code, message: error.message });
  return true;
}
