import type { EmailProvider, ProviderResult, EmailContent } from "./types";

/** No network dependency. Test-only injection; production runtime never selects it. */
export class SimulatedEmailProvider implements EmailProvider {
  readonly calls: Array<EmailContent & {to:string;idempotencyKey:string}>=[];
  constructor(private results:ProviderResult[]) {}
  async send(input:EmailContent & {to:string;idempotencyKey:string}):Promise<ProviderResult> {
    this.calls.push(structuredClone(input));
    const r=this.results.shift();
    if (!r) throw new Error("Simulador sin resultado preparado");
    return r;
  }
}
