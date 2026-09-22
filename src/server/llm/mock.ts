import type { Classification, HistoryTurn } from "../types";
import type { KBSection } from "../knowledge";
import { LLMError, type GroundedAnswer, type LLMProvider, type ModelTurn, type RespondInput } from "./provider";

export type MockBehaviour = {
  classify?: (message: string, history: HistoryTurn[]) => Classification;
  answer?: (message: string, context: KBSection[]) => GroundedAnswer;
  /** Throw on every call, to exercise failure paths. */
  fail?: "timeout" | "malformed" | "network";
};

/**
 * Deterministic provider for tests and for running the app with no API key.
 * Heuristic routing; answers echo the top retrieved section.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";
  constructor(private behaviour: MockBehaviour = {}) {}

  private maybeFail(): void {
    if (this.behaviour.fail === "timeout") throw new LLMError("respond timed out after 1ms");
    if (this.behaviour.fail === "malformed") throw new LLMError("respond returned malformed JSON");
    if (this.behaviour.fail === "network") throw new LLMError("respond request failed: fetch failed");
  }

  classify(message: string, history: HistoryTurn[]): Classification {
    if (this.behaviour.classify) return this.behaviour.classify(message, history);
    const m = message.toLowerCase();
    if (/^(hi|hello|hey|thanks|thank you)\b/.test(m)) return { intent: "greeting", slots: {}, topics: [] };
    if (/(availab|vacan|free room|book|reserve|any rooms|rooms? (for|on|from))/.test(m)) {
      const slots: Classification["slots"] = {};
      const dates = m.match(/\d{4}-\d{2}-\d{2}/g);
      if (dates?.[0]) slots.checkIn = dates[0];
      if (dates?.[1]) slots.checkOut = dates[1];
      const adults = m.match(/(\d+)\s*(adult|guest|people|person)/);
      if (adults) slots.adults = Number(adults[1]);
      return { intent: "availability", slots, topics: ["availability"] };
    }
    if (/(weather|flight|other hotel|stock|president|joke)/.test(m)) return { intent: "unsupported", slots: {}, topics: [] };
    return { intent: "knowledge", slots: {}, topics: [] };
  }

  answer(message: string, context: KBSection[]): GroundedAnswer {
    if (this.behaviour.answer) return this.behaviour.answer(message, context);
    if (context.length === 0) return { answer: "", grounded: false, sources: [] };
    return { answer: context[0].text, grounded: true, sources: [context[0].id] };
  }

  async respond({ message, history, context }: RespondInput): Promise<ModelTurn> {
    this.maybeFail();
    const cls = this.classify(message, history);
    const ans = cls.intent === "knowledge" ? this.answer(message, context) : { answer: "", grounded: false, sources: [] };
    return { ...cls, ...ans };
  }
}
