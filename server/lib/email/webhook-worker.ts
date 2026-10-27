import type { EmailState } from "./types";
import type { EmailWebhookRepository } from "./webhook-types";

/** Incidents are sticky facts, regardless of timestamp or arrival order. */
export function stateAfterEmailEvent(current: EmailState, type: string): EmailState {
  const states:Record<string,EmailState> = {
    "email.complained":"queja","email.bounced":"rebotado","email.suppressed":"rebotado",
    "email.failed":"error","email.delivered":"entregado",
  };
  const priority:Partial<Record<EmailState,number>> = {aceptado:0,entregado:1,error:2,rebotado:3,queja:4};
  const proposed=states[type];
  return proposed && (priority[proposed]??-1)>(priority[current]??-1) ? proposed : current;
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
