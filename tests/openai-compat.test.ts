import { describe, expect, it, vi } from "vitest";
import { OpenAICompatProvider, parseChain } from "@/server/llm/openai-compat";
import { ChainProvider } from "@/server/llm/chain";
import { MockProvider } from "@/server/llm/mock";
import { LLMError } from "@/server/llm/provider";

const input = { message: "pool?", history: [], today: "2026-09-22", context: [] };
const turn = { intent: "knowledge", slots: { checkIn: null, checkOut: null, adults: null }, topics: ["pool"], answer: "Yes, 07:00 to 20:00.", grounded: true, sources: ["amenity:Swimming pool"] };
const okBody = (content: unknown) => JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] });
const resp = (status: number, body: string) => new Response(body, { status });

const make = (fetchImpl: typeof fetch, models = ["big", "small"]) =>
  new OpenAICompatProvider({ name: "cerebras", baseUrl: "https://api.example/v1", apiKey: "k", models, fetchImpl, attemptTimeoutMs: 200, totalBudgetMs: 2000 });

describe("OpenAICompatProvider", () => {
  it("posts a chat completion with strict JSON schema and parses the turn", async () => {
    const f = vi.fn().mockResolvedValue(resp(200, okBody(turn)));
    const t = await make(f).respond(input);
    expect(t.intent).toBe("knowledge");
    expect(t.grounded).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.example/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("big");
    expect(body.response_format.type).toBe("json_schema");
    expect(init.headers.Authorization).toBe("Bearer k");
  });

  it("falls back to json_object mode when the server rejects json_schema", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp(400, '{"message":"response_format json_schema not supported"}'))
      .mockResolvedValueOnce(resp(200, okBody(turn)));
    const t = await make(f).respond(input);
    expect(t.grounded).toBe(true);
    expect(JSON.parse(f.mock.calls[1][0 + 1].body).response_format.type).toBe("json_object");
    expect(JSON.parse(f.mock.calls[1][1].body).model).toBe("big");
  });

  it("moves to the next model on 429/503 and on a stall", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp(429, "rate limited"))
      .mockResolvedValueOnce(resp(200, okBody(turn)));
    expect((await make(f).respond(input)).grounded).toBe(true);
    expect(JSON.parse(f.mock.calls[1][1].body).model).toBe("small");

    const stall = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(resp(200, okBody(turn)));
    expect((await make(stall).respond(input)).grounded).toBe(true);
  });

  it("does not retry on 401 and surfaces an LLMError", async () => {
    const f = vi.fn().mockResolvedValue(resp(401, "bad key"));
    await expect(make(f).respond(input)).rejects.toThrow(/HTTP 401/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("treats empty or malformed content as an error (and retries on the next model)", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp(200, JSON.stringify({ choices: [{ message: { content: "not json" } }] })))
      .mockResolvedValueOnce(resp(200, okBody(turn)));
    expect((await make(f).respond(input)).grounded).toBe(true);
  });

  it("parseChain uses env values or defaults, deduped", () => {
    expect(parseChain(undefined, undefined, ["a", "b"])).toEqual(["a", "b"]);
    expect(parseChain("x", "y,x", ["a"])).toEqual(["x", "y"]);
  });
});

describe("ChainProvider", () => {
  it("falls through to the next provider when the first throws", async () => {
    const dead = { name: "dead", respond: vi.fn().mockRejectedValue(new LLMError("down")) };
    const chain = new ChainProvider([dead, new MockProvider()]);
    const t = await chain.respond({ ...input, message: "hello" });
    expect(t.intent).toBe("greeting");
    expect(chain.name).toBe("dead > mock");
  });
  it("throws the last error when every provider fails", async () => {
    const dead = { name: "dead", respond: vi.fn().mockRejectedValue(new LLMError("down")) };
    await expect(new ChainProvider([dead, dead]).respond(input)).rejects.toThrow(/down/);
  });
});
