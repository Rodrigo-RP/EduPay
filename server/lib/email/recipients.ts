import { z } from "zod/v4";
import { emailAllowed } from "./config";
import type { Candidate, EmailConfig, Recipient } from "./types";

export function prepareRecipients(candidates: Candidate[], config: EmailConfig): Recipient[] {
  const result: Recipient[] = [];
  const byEmail = new Map<string, Recipient>();
  const noAddress = new Set<string>();
  for (const candidate of candidates) {
    const raw = candidate.email?.trim().toLowerCase() ?? "";
    const valid = z.string().email().max(254).safeParse(raw).success;
    const email = valid ? raw : null;
    // Invalid raw strings are not reflected back or stored.
    const reason = !raw ? "sin correo" : !valid ? "correo inválido"
      : !emailAllowed(raw, config) ? "no autorizado en este entorno" : null;
    let recipient = email ? byEmail.get(email) : undefined;
    const missingKey = `${candidate.id}:${candidate.guardianId ?? "sin-tutor"}`;
    if (!email && noAddress.has(missingKey)) continue;
    if (!recipient) {
      recipient = { email, estado: reason ? "omitido" : "pendiente", motivo: reason, studentIds: [], guardianIds: [] };
      result.push(recipient);
      if (email) byEmail.set(email, recipient); else noAddress.add(missingKey);
    }
    if (!recipient.studentIds.includes(candidate.id)) recipient.studentIds.push(candidate.id);
    if (candidate.guardianId && !recipient.guardianIds.includes(candidate.guardianId)) recipient.guardianIds.push(candidate.guardianId);
  }
  return result.map(r => ({ ...r, studentIds: r.studentIds.sort((a, b) => a - b), guardianIds: r.guardianIds.sort((a, b) => a - b) }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
