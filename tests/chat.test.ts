import { beforeEach, describe, expect, it } from "vitest";
import { handleChat, unverifiedFigures } from "@/server/chat";
import { ConversationStore } from "@/server/conversation";
import { MockProvider } from "@/server/llm/mock";

const today = new Date("2026-09-22T10:00:00Z");
let store: ConversationStore;
beforeEach(() => { store = new ConversationStore(); });

const ask = (message: string, extra: Record<string, unknown> = {}, provider = new MockProvider()) =>
  handleChat({ conversationId: "c1", message, ...extra }, { provider, store, today });

describe("handleChat: validation", () => {
  it("rejects an empty body with 400 and a typed error", async () => {
    const r = await handleChat({}, { store, today, provider: new MockProvider() });
    expect(r.status).toBe(400);
    expect(r.body.type).toBe("error");
  });
  it("rejects a blank message", async () => {
    const r = await ask("   ");
    expect(r.status).toBe(400);
  });
  it("rejects malformed availability params", async () => {
    const r = await handleChat({ availability: { checkIn: "10/10/2026", checkOut: "2026-10-12", adults: 2 } }, { store, today, provider: new MockProvider() });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/YYYY-MM-DD/);
  });
});

describe("handleChat: knowledge questions (normal)", () => {
  it("answers check-in time from the knowledge base with sources", async () => {
    const r = await ask("What time is check-in?");
    expect(r.status).toBe(200);
    expect(r.body.type).toBe("text");
    expect(r.body.message).toMatch(/15:00/);
    if (r.body.type === "text") expect(r.body.sources.length).toBeGreaterThan(0);
  });
  it("answers the swimming pool question", async () => {
    const r = await ask("Does the hotel have a swimming pool?");
    expect(r.body.type).toBe("text");
    expect(r.body.message).toMatch(/infinity pool/i);
  });
  it("answers which room suits three guests", async () => {
    const r = await ask("Which room is suitable for three guests?");
    expect(r.body.type).toBe("text");
    expect(r.body.message).toMatch(/Junior Suite/);
  });
});

describe("handleChat: unsupported and ambiguous", () => {
  it("returns a fallback for a question outside the knowledge base", async () => {
    const r = await ask("Who won the cricket world cup?");
    expect(r.body.type).toBe("fallback");
    if (r.body.type === "fallback") expect(r.body.reason).toBe("not_in_knowledge_base");
    expect(r.body.message).toMatch(/\+91 832 555 0142/);
  });
  it("returns an out-of-scope fallback when the router says unsupported", async () => {
    const r = await ask("Tell me a joke about the weather");
    expect(r.body.type).toBe("fallback");
    if (r.body.type === "fallback") expect(r.body.reason).toBe("out_of_scope");
  });
  it("falls back when the model says the context does not answer the question", async () => {
    const p = new MockProvider({ answer: () => ({ answer: "", grounded: false, sources: [] }) });
    const r = await ask("Is it free?", {}, p);
    expect(r.body.type).toBe("fallback");
  });
  it("rejects an answer containing a figure that is not in the knowledge base (hallucination guard)", async () => {
    const p = new MockProvider({ answer: () => ({ answer: "The pool costs INR 9999 per day.", grounded: true, sources: ["amenity:Swimming pool"] }) });
    const r = await ask("How much is the pool?", {}, p);
    expect(r.body.type).toBe("fallback");
    if (r.body.type === "fallback") expect(r.body.reason).toBe("unverified_figure");
  });
});

describe("handleChat: availability (tool calling)", () => {
  it("asks for missing details when dates are absent", async () => {
    const r = await ask("Do you have rooms available?");
    expect(r.body.type).toBe("clarification");
    if (r.body.type === "clarification") expect(r.body.needs).toEqual(["checkIn", "checkOut", "adults"]);
  });
  it("calls the tool when the model extracts all slots", async () => {
    const r = await ask("Any rooms from 2026-10-10 to 2026-10-12 for 2 adults?");
    expect(r.body.type).toBe("availability");
    if (r.body.type === "availability") {
      expect(r.body.data.nights).toBe(2);
      expect(r.body.data.rooms.some((x) => x.available)).toBe(true);
    }
  });
  it("runs the tool directly for a structured form submission, no LLM involved", async () => {
    const failing = new MockProvider({ fail: "network" });
    const r = await handleChat({ conversationId: "c1", availability: { checkIn: "2026-10-10", checkOut: "2026-10-12", adults: 3 } }, { provider: failing, store, today });
    expect(r.status).toBe(200);
    expect(r.body.type).toBe("availability");
  });
  it("returns a 400 with a readable message for a past check-in from the form", async () => {
    const r = await handleChat({ availability: { checkIn: "2026-01-01", checkOut: "2026-01-03", adults: 2 } }, { provider: new MockProvider(), store, today });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/past/);
  });
  it("remembers slots across turns and only asks for what is still missing", async () => {
    await ask("I want to book for 2 adults");
    const r = await ask("Any rooms from 2026-10-10 to 2026-10-12?");
    expect(r.body.type).toBe("availability");
    if (r.body.type === "availability") expect(r.body.data.adults).toBe(2);
  });
});

describe("handleChat: conversation follow-ups", () => {
  it("passes history to the model so 'how much is it' can be resolved", async () => {
    let seenHistory = 0;
    // Simulates the model using the history to pick the room discussed in the previous turn.
    const p = new MockProvider({
      classify: (m, h) => { seenHistory = h.length; return { intent: "knowledge", slots: {}, topics: [] }; },
      answer: (m, ctx) => {
        const junior = ctx.find((c) => c.id === "room:junior-suite");
        return junior ? { answer: junior.text, grounded: true, sources: [junior.id] } : { answer: "", grounded: false, sources: [] };
      },
    });
    await ask("Which room is suitable for three guests?", {}, p);
    const r = await ask("How much is it per night?", {}, p);
    expect(seenHistory).toBe(2);
    expect(r.body.type).toBe("text");
    expect(r.body.message).toMatch(/9200/);
  });
  it("uses client-carried history when the server store is empty (serverless case)", async () => {
    let seen: string[] = [];
    const p = new MockProvider({ classify: (m, h) => { seen = h.map((t) => t.content); return { intent: "knowledge", slots: {}, topics: [] }; } });
    await handleChat({ conversationId: "fresh", message: "Is breakfast included?", history: [{ role: "user", content: "hi" }, { role: "assistant", content: "Hello!" }] }, { provider: p, store: new ConversationStore(), today });
    expect(seen).toEqual(["hi", "Hello!"]);
  });
});

describe("handleChat: model failure and fallback", () => {
  it("returns an llm_unavailable fallback when the model times out on a knowledge question", async () => {
    const r = await ask("Is breakfast included?", {}, new MockProvider({ fail: "timeout" }));
    expect(r.status).toBe(200);
    expect(r.body.type).toBe("fallback");
    if (r.body.type === "fallback") expect(r.body.reason).toBe("llm_unavailable");
  });
  it("still routes an obvious availability request to the form when the model is down", async () => {
    const r = await ask("Do you have any rooms available next weekend?", {}, new MockProvider({ fail: "network" }));
    expect(r.body.type).toBe("clarification");
  });
  it("handles malformed model JSON as a fallback rather than a crash", async () => {
    const r = await ask("What is the cancellation policy?", {}, new MockProvider({ fail: "malformed" }));
    expect(r.body.type).toBe("fallback");
  });
});

describe("unverifiedFigures", () => {
  it("flags numbers absent from context and accepts those present", () => {
    expect(unverifiedFigures("INR 4,500 per night, deposit 5000", ["INR 4500 per night", "deposit of INR 5000"])).toEqual([]);
    expect(unverifiedFigures("INR 7777 per night", ["INR 4500"])).toEqual(["7777"]);
  });
});
