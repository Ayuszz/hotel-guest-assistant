import { log } from "../logger";
import { LLMError, type LLMProvider, type ModelTurn, type RespondInput } from "./provider";

/** Tries providers in order; any LLMError moves to the next one. */
export class ChainProvider implements LLMProvider {
  readonly name: string;
  constructor(private providers: LLMProvider[]) {
    if (!providers.length) throw new LLMError("ChainProvider needs at least one provider");
    this.name = providers.map((p) => p.name).join(" > ");
  }

  async respond(input: RespondInput): Promise<ModelTurn> {
    let last: LLMError | undefined;
    for (const [i, p] of this.providers.entries()) {
      try {
        const t = await p.respond(input);
        if (i > 0) log("warn", "llm.fallback_provider_used", { provider: p.name });
        return t;
      } catch (e) {
        last = e instanceof LLMError ? e : new LLMError(`${p.name} failed: ${(e as Error).message}`, e);
        if (i < this.providers.length - 1) log("warn", "llm.provider_retry", { failed: p.name, next: this.providers[i + 1].name, error: last.message.slice(0, 160) });
      }
    }
    throw last!;
  }
}
