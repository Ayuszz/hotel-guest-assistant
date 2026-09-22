import { GoogleGenAI, Type } from "@google/genai";
import type { Classification, HistoryTurn } from "../types";
import type { KBSection } from "../knowledge";
import { LLMError, withTimeout, type GroundedAnswer, type LLMProvider } from "./provider";
import { ANSWER_SYSTEM, CLASSIFY_SYSTEM, answerUser, classifyUser } from "./prompts";

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 15000);

const classificationSchema = {
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
  },
  required: ["intent", "slots", "topics"],
};

const answerSchema = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING },
    grounded: { type: Type.BOOLEAN },
    sources: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["answer", "grounded", "sources"],
};

export class GeminiProvider implements LLMProvider {
  readonly name: string;
  private ai: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY, private model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash") {
    if (!apiKey) throw new LLMError("GEMINI_API_KEY is not set");
    this.ai = new GoogleGenAI({ apiKey });
    this.name = `gemini:${this.model}`;
  }

  private async json<T>(system: string, user: string, schema: object, label: string): Promise<T> {
    let text: string | undefined;
    try {
      const res = await withTimeout(
        this.ai.models.generateContent({
          model: this.model,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.2,
          },
        }),
        TIMEOUT_MS,
        label,
      );
      text = res.text;
    } catch (e) {
      if (e instanceof LLMError) throw e;
      throw new LLMError(`${label} request failed: ${(e as Error).message}`, e);
    }
    if (!text) throw new LLMError(`${label} returned empty response`);
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      throw new LLMError(`${label} returned malformed JSON`, e);
    }
  }

  async classify(message: string, history: HistoryTurn[], today: string): Promise<Classification> {
    const raw = await this.json<{ intent: string; slots?: Record<string, unknown>; topics?: string[] }>(
      CLASSIFY_SYSTEM, classifyUser(message, history, today), classificationSchema, "classify",
    );
    const slots: Classification["slots"] = {};
    if (typeof raw.slots?.checkIn === "string" && raw.slots.checkIn) slots.checkIn = raw.slots.checkIn;
    if (typeof raw.slots?.checkOut === "string" && raw.slots.checkOut) slots.checkOut = raw.slots.checkOut;
    if (typeof raw.slots?.adults === "number" && raw.slots.adults > 0) slots.adults = raw.slots.adults;
    const intent = (["knowledge", "availability", "greeting", "unsupported"] as const).includes(raw.intent as never)
      ? (raw.intent as Classification["intent"]) : "knowledge";
    return { intent, slots, topics: Array.isArray(raw.topics) ? raw.topics.slice(0, 4) : [] };
  }

  async answer(message: string, history: HistoryTurn[], context: KBSection[]): Promise<GroundedAnswer> {
    const raw = await this.json<GroundedAnswer>(ANSWER_SYSTEM, answerUser(message, history, context), answerSchema, "answer");
    return {
      answer: typeof raw.answer === "string" ? raw.answer.trim() : "",
      grounded: Boolean(raw.grounded) && typeof raw.answer === "string" && raw.answer.trim().length > 0,
      sources: Array.isArray(raw.sources) ? raw.sources.filter((s) => typeof s === "string") : [],
    };
  }
}
