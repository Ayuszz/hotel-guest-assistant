import type { Classification, HistoryTurn } from "../types";
import type { KBSection } from "../knowledge";

export type GroundedAnswer = {
  /** The reply text for the guest. */
  answer: string;
  /** false when the model judged the context insufficient; caller returns a fallback. */
  grounded: boolean;
  /** Section ids the model used. */
  sources: string[];
};

export interface LLMProvider {
  readonly name: string;
  classify(message: string, history: HistoryTurn[], today: string): Promise<Classification>;
  answer(message: string, history: HistoryTurn[], context: KBSection[]): Promise<GroundedAnswer>;
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
