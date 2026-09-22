import { ChainProvider } from "./chain";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { cerebrasProvider, groqProvider } from "./openai-compat";
import type { LLMProvider } from "./provider";
import { log } from "../logger";

let cached: LLMProvider | undefined;

/**
 * Builds the provider chain from env.
 * LLM_PROVIDER: comma-separated order, e.g. "cerebras,gemini" (default), "groq", "mock".
 * A provider is skipped when its key is missing. With no keys at all, the offline mock is used.
 */
export function getProvider(): LLMProvider {
  if (cached) return cached;
  const order = (process.env.LLM_PROVIDER ?? "cerebras,groq,gemini").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const providers: LLMProvider[] = [];
  for (const p of order) {
    if (p === "mock") providers.push(new MockProvider());
    else if (p === "cerebras" && process.env.CEREBRAS_API_KEY) providers.push(cerebrasProvider());
    else if (p === "groq" && process.env.GROQ_API_KEY) providers.push(groqProvider());
    else if (p === "gemini" && process.env.GEMINI_API_KEY) providers.push(new GeminiProvider());
  }
  if (providers.length === 0) {
    if (!process.env.VITEST) log("warn", "llm.mock_provider", { reason: "no provider API key set (CEREBRAS_API_KEY, GROQ_API_KEY or GEMINI_API_KEY)" });
    providers.push(new MockProvider());
  }
  cached = providers.length === 1 ? providers[0] : new ChainProvider(providers);
  if (!process.env.VITEST) log("info", "llm.provider", { chain: cached.name });
  return cached;
}

export function resetProvider(): void {
  cached = undefined;
}
