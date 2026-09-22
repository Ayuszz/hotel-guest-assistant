import type { Classification, HistoryTurn } from "../types";
import type { KBSection } from "../knowledge";

export type GroundedAnswer = {
  /** The reply text for the guest. Empty when not grounded or when intent is not knowledge. */
  answer: string;
  /** false when the model judged the context insufficient; caller returns a fallback. */
  grounded: boolean;
  /** Section ids the model used. */
  sources: string[];
};

/** One model round-trip: routing + slot extraction + grounded answer in a single response. */
export type ModelTurn = Classification & GroundedAnswer;

export type RespondInput = {
  message: string;
  history: HistoryTurn[];
  /** ISO date, so relative dates can be resolved. */
  today: string;
  /** Knowledge-base sections retrieved for the message; the only facts the model may use. */
  context: KBSection[];
};

export interface LLMProvider {
  readonly name: string;
  respond(input: RespondInput): Promise<ModelTurn>;
}

export class LLMError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LLMError";
  }
}

/** Reject after `ms`. Used to bound every provider call. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new LLMError(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
