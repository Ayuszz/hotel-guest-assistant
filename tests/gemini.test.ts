import { describe, expect, it, vi } from "vitest";
import { GeminiProvider, parseModelChain, sanitizeTurn } from "@/server/llm/gemini";
import { LLMError } from "@/server/llm/provider";
import type { GenerateContentResponse } from "@google/genai";

const ok = (text: string) => ({ text }) as unknown as GenerateContentResponse;
const apiError = (code: number, status: string, message: string) =>
  new Error(JSON.stringify({ error: { code, message, status } }));
const input = { message: "pool?", history: [], today: "2026-09-22", context: [] };
const good = '{"intent":"knowledge","slots":{},"topics":["pool"],"answer":"Yes, 07:00 to 20:00.","grounded":true,"sources":["amenity:Swimming pool"]}';

describe("GeminiProvider model chain", () => {
  it("parses the primary + comma-separated fallbacks without duplicates", () => {
    expect(parseModelChain("a", "b, c,a")).toEqual(["a", "b", "c"]);
    expect(parseModelChain()).toEqual(["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-3.6-flash"]);
  });

  it("falls back to the next model on 503 high demand", async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(apiError(503, "UNAVAILABLE", "This model is currently experiencing high demand."))
      .mockResolvedValueOnce(ok(good));
    const p = new GeminiProvider("k", ["primary", "backup"], generate);
    const t = await p.respond(input);
    expect(t.intent).toBe("knowledge");
    expect(t.grounded).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].model).toBe("backup");
  });

  it("falls back when the primary model has been retired (404) or rate-limited (429)", async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(apiError(404, "NOT_FOUND", "This model is no longer available to new users."))
      .mockRejectedValueOnce(apiError(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota"))
      .mockResolvedValueOnce(ok(good));
    const p = new GeminiProvider("k", ["old", "busy", "new"], generate);
    expect((await p.respond(input)).grounded).toBe(true);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("treats a stalled model (timeout) as retryable", async () => {
    process.env.LLM_TIMEOUT_MS = "50";
    vi.resetModules();
    const { GeminiProvider: GP } = await import("@/server/llm/gemini");
    delete process.env.LLM_TIMEOUT_MS;
    const generate = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(ok(good));
    const p = new GP("k", ["slow", "fast"], generate);
    const t = await p.respond(input);
    expect(t.grounded).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("does not retry on non-retryable errors (e.g. 400 bad key)", async () => {
    const generate = vi.fn().mockRejectedValue(apiError(400, "INVALID_ARGUMENT", "API key not valid"));
    const p = new GeminiProvider("k", ["a", "b"], generate);
    await expect(p.respond(input)).rejects.toBeInstanceOf(LLMError);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("throws LLMError when every model in the chain fails", async () => {
    const generate = vi.fn().mockRejectedValue(apiError(503, "UNAVAILABLE", "high demand"));
    const p = new GeminiProvider("k", ["a", "b"], generate);
    await expect(p.respond(input)).rejects.toThrow(/request failed/);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("treats malformed JSON as an LLMError", async () => {
    const bad = new GeminiProvider("k", ["a"], vi.fn().mockResolvedValue(ok("not json")));
    await expect(bad.respond(input)).rejects.toThrow(/malformed JSON/);
  });
});

describe("sanitizeTurn", () => {
  it("coerces junk into a safe turn", () => {
    expect(sanitizeTurn({ intent: "banana", slots: { adults: -2, checkIn: "10/10/2026" }, topics: "x", answer: "  ", grounded: true, sources: [1] }))
      .toEqual({ intent: "knowledge", slots: {}, topics: [], answer: "", grounded: false, sources: [] });
  });
  it("keeps valid slots and marks grounded only with a non-empty answer", () => {
    const t = sanitizeTurn({ intent: "availability", slots: { checkIn: "2026-10-10", checkOut: "2026-10-12", adults: 2 }, topics: ["stay"], answer: "", grounded: true, sources: [] });
    expect(t.slots).toEqual({ checkIn: "2026-10-10", checkOut: "2026-10-12", adults: 2 });
    expect(t.grounded).toBe(false);
  });
});
