import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import type { LLMProvider } from "./provider";
import { log } from "../logger";

let cached: LLMProvider | undefined;

/** Picks the provider from env. LLM_PROVIDER=mock forces the offline provider. */
export function getProvider(): LLMProvider {
  if (cached) return cached;
  const choice = process.env.LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "mock");
  if (choice === "gemini") cached = new GeminiProvider();
  else {
    if (!process.env.VITEST) log("warn", "llm.mock_provider", { reason: "GEMINI_API_KEY not set or LLM_PROVIDER=mock" });
    cached = new MockProvider();
  }
  return cached;
}

export function resetProvider(): void {
  cached = undefined;
}
