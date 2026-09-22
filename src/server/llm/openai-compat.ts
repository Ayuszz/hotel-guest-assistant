import { log } from "../logger";
import { LLMError, withTimeout, type LLMProvider, type ModelTurn, type RespondInput } from "./provider";
import { RESPOND_SYSTEM, respondUser } from "./prompts";
import { sanitizeTurn } from "./sanitize";

/**
 * Provider for any OpenAI-compatible chat-completions endpoint (Cerebras, Groq, OpenAI, ...).
 * Plain fetch, no SDK. Uses JSON-schema structured output where the server supports it and
 * falls back to json_object mode if the server rejects the schema.
 */
export type OpenAICompatOptions = {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  fetchImpl?: typeof fetch;
  attemptTimeoutMs?: number;
  totalBudgetMs?: number;
};

export const TURN_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["knowledge", "availability", "greeting", "unsupported"] },
    slots: {
      type: "object",
      properties: {
        checkIn: { type: ["string", "null"] },
        checkOut: { type: ["string", "null"] },
        adults: { type: ["integer", "null"] },
      },
      required: ["checkIn", "checkOut", "adults"],
      additionalProperties: false,
    },
    topics: { type: "array", items: { type: "string" } },
    answer: { type: "string" },
    grounded: { type: "boolean" },
    sources: { type: "array", items: { type: "string" } },
  },
  required: ["intent", "slots", "topics", "answer", "grounded", "sources"],
  additionalProperties: false,
} as const;

const RETRYABLE_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

export function parseChain(primary: string | undefined, fallbacks: string | undefined, defaults: string[]): string[] {
  const list = [primary, ...(fallbacks ?? "").split(",")].map((m) => m?.trim()).filter((m): m is string => Boolean(m));
  return [...new Set(list.length ? list : defaults)];
}

export class OpenAICompatProvider implements LLMProvider {
  readonly name: string;
  private fetchImpl: typeof fetch;
  private attemptTimeoutMs: number;
  private totalBudgetMs: number;

  constructor(private opts: OpenAICompatOptions) {
    if (!opts.apiKey) throw new LLMError(`${opts.name}: API key is not set`);
    if (!opts.models.length) throw new LLMError(`${opts.name}: no models configured`);
    this.name = `${opts.name}:${opts.models[0]}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.attemptTimeoutMs = opts.attemptTimeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 9000);
    this.totalBudgetMs = opts.totalBudgetMs ?? Number(process.env.LLM_TOTAL_BUDGET_MS ?? 24000);
  }

  async respond(input: RespondInput): Promise<ModelTurn> {
    const started = Date.now();
    const messages = [
      { role: "system", content: RESPOND_SYSTEM + "\n\nRespond with a single JSON object with keys: intent, slots{checkIn,checkOut,adults}, topics, answer, grounded, sources." },
      { role: "user", content: respondUser(input) },
    ];
    let lastErr: LLMError | undefined;
    for (const [i, model] of this.opts.models.entries()) {
      if (i > 0 && Date.now() - started > this.totalBudgetMs) break;
      try {
        const text = await this.complete(model, messages);
        if (i > 0) log("warn", "llm.fallback_model_used", { provider: this.opts.name, model, ms: Date.now() - started });
        try {
          return sanitizeTurn(JSON.parse(text));
        } catch (e) {
          throw new LLMError(`${this.opts.name}[${model}] returned malformed JSON`, e);
        }
      } catch (e) {
        lastErr = e instanceof LLMError ? e : new LLMError(`${this.opts.name}[${model}] request failed: ${(e as Error).message}`, e);
        const retryable = /timed out|malformed JSON|HTTP (404|408|429|5\d\d)|fetch failed/.test(lastErr.message);
        if (!retryable || i === this.opts.models.length - 1) throw lastErr;
        log("warn", "llm.model_retry", { provider: this.opts.name, failed: model, next: this.opts.models[i + 1], error: lastErr.message.slice(0, 160) });
      }
    }
    throw lastErr ?? new LLMError(`${this.opts.name}: no model attempted`);
  }

  /** One chat-completions call. Tries strict JSON schema first, then json_object if the server rejects it. */
  private async complete(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
    const attempt = async (responseFormat: unknown): Promise<{ status: number; body: string }> => {
      const res = await withTimeout(
        this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.opts.apiKey}` },
          body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 600, response_format: responseFormat }),
        }),
        this.attemptTimeoutMs,
        `${this.opts.name}[${model}]`,
      );
      return { status: res.status, body: await res.text() };
    };

    let r = await attempt({ type: "json_schema", json_schema: { name: "assistant_turn", strict: true, schema: TURN_JSON_SCHEMA } });
    if (r.status === 400 && /response_format|json_schema|schema/i.test(r.body)) {
      r = await attempt({ type: "json_object" });
    }
    if (r.status !== 200) {
      const snippet = r.body.replace(/\s+/g, " ").slice(0, 200);
      const err = new LLMError(`${this.opts.name}[${model}] HTTP ${r.status}: ${snippet}`);
      if (!RETRYABLE_STATUS.has(r.status) && r.status !== 400) throw err;
      throw err;
    }
    let parsed: { choices?: Array<{ message?: { content?: string | null } }> };
    try {
      parsed = JSON.parse(r.body);
    } catch (e) {
      throw new LLMError(`${this.opts.name}[${model}] returned malformed JSON`, e);
    }
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) throw new LLMError(`${this.opts.name}[${model}] returned empty response`);
    return content;
  }
}

/** Cerebras free tier. Model ids per https://inference-docs.cerebras.ai/models */
export function cerebrasProvider(fetchImpl?: typeof fetch): OpenAICompatProvider {
  return new OpenAICompatProvider({
    name: "cerebras",
    baseUrl: process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1",
    apiKey: process.env.CEREBRAS_API_KEY ?? "",
    models: parseChain(process.env.CEREBRAS_MODEL, process.env.CEREBRAS_FALLBACK_MODELS, ["gpt-oss-120b", "qwen-3.8-27b"]),
    fetchImpl,
  });
}

/** Groq free tier, same wire protocol. */
export function groqProvider(fetchImpl?: typeof fetch): OpenAICompatProvider {
  return new OpenAICompatProvider({
    name: "groq",
    baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY ?? "",
    models: parseChain(process.env.GROQ_MODEL, process.env.GROQ_FALLBACK_MODELS, ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]),
    fetchImpl,
  });
}
