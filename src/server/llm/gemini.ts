import { GoogleGenAI, Type, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { log } from "../logger";
import { LLMError, withTimeout, type LLMProvider, type ModelTurn, type RespondInput } from "./provider";
import { RESPOND_SYSTEM, respondUser } from "./prompts";
import { sanitizeTurn } from "./sanitize";
export { sanitizeTurn };

/** Per-model-attempt timeout. Free-tier models can stall; a stall moves on to the next model. */
const ATTEMPT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 9000);
/** Stop starting new attempts after this much total time. Keeps us inside the route's maxDuration. */
const TOTAL_BUDGET_MS = Number(process.env.LLM_TOTAL_BUDGET_MS ?? 24000);

const schema = {
  type: Type.OBJECT,
  properties: {
    intent: { type: Type.STRING, enum: ["knowledge", "availability", "greeting", "unsupported"] },
    slots: {
      type: Type.OBJECT,
      properties: {
        checkIn: { type: Type.STRING, nullable: true },
        checkOut: { type: Type.STRING, nullable: true },
        adults: { type: Type.INTEGER, nullable: true },
      },
    },
    topics: { type: Type.ARRAY, items: { type: Type.STRING } },
    answer: { type: Type.STRING },
    grounded: { type: Type.BOOLEAN },
    sources: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["intent", "slots", "topics", "answer", "grounded", "sources"],
};

export type Generate = (params: GenerateContentParameters) => Promise<GenerateContentResponse>;

/** API errors worth retrying on the next model: overloaded, rate-limited, retired model, or our own timeout. */
const RETRYABLE = /"code":\s*(503|429|404)|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|high demand|no longer available|timed out/i;

export function parseModelChain(primary?: string, fallbacks?: string): string[] {
  const list = [primary ?? "gemini-3.1-flash-lite", ...(fallbacks ?? "gemini-3-flash-preview,gemini-flash-lite-latest,gemini-3.6-flash").split(",")]
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

export class GeminiProvider implements LLMProvider {
  readonly name: string;
  private generate: Generate;
  private models: string[];

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    models: string[] = parseModelChain(process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODELS),
    generate?: Generate,
  ) {
    if (!apiKey && !generate) throw new LLMError("GEMINI_API_KEY is not set");
    const ai = generate ? undefined : new GoogleGenAI({ apiKey });
    this.generate = generate ?? ((p) => ai!.models.generateContent(p));
    this.models = models;
    this.name = `gemini:${models[0]}`;
  }

  async respond(input: RespondInput): Promise<ModelTurn> {
    const started = Date.now();
    const user = respondUser(input);
    let lastErr: LLMError | undefined;
    for (const [i, model] of this.models.entries()) {
      if (i > 0 && Date.now() - started > TOTAL_BUDGET_MS) break;
      try {
        const res = await withTimeout(
          this.generate({
            model,
            contents: user,
            config: { systemInstruction: RESPOND_SYSTEM, responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
          }),
          ATTEMPT_TIMEOUT_MS,
          `respond[${model}]`,
        );
        if (i > 0) log("warn", "llm.fallback_model_used", { model, ms: Date.now() - started });
        const text = res.text;
        if (!text) throw new LLMError(`respond[${model}] returned empty response`);
        try {
          return sanitizeTurn(JSON.parse(text));
        } catch (e) {
          if (e instanceof LLMError) throw e;
          throw new LLMError(`respond[${model}] returned malformed JSON`, e);
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        lastErr = e instanceof LLMError ? e : new LLMError(`respond[${model}] request failed: ${msg}`, e);
        if (!RETRYABLE.test(msg) || i === this.models.length - 1) throw lastErr;
        log("warn", "llm.model_retry", { failed: model, next: this.models[i + 1], error: msg.slice(0, 160) });
      }
    }
    throw lastErr ?? new LLMError("respond: no model attempted");
  }
}
