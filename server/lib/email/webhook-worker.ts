import type { EmailState } from "./types";
import type { EmailWebhookRepository } from "./webhook-types";

/** Incidents are sticky facts, regardless of timestamp or arrival order. */
export function stateAfterEmailEvent(current: EmailState, type: string): EmailState {
  if (current === "queja" || type === "email.complained") return "queja";
  if (current === "rebotado" || type === "email.bounced") return "rebotado";
  if (current === "entregado" || type === "email.delivered") return "entregado";
  // A late email.sent records a separate fact; it cannot downgrade anything.
  return current;
}

// Explicit, single tick. Registration/import never starts a worker or a timer.
// Exceptions leave a durable lease that another tick reclaims after expiry.
export async function processEmailWebhookOnce(repository: EmailWebhookRepository): Promise<boolean> {
  await repository.pruneRaw();
  const claim = await repository.claim();
  if (!claim) return false;
  await repository.process(claim);
  return true;
}
