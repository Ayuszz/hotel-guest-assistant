import type { Classification } from "../types";
import type { ModelTurn } from "./provider";

const INTENTS = ["knowledge", "availability", "greeting", "unsupported"] as const;

/** Coerce whatever the model returned into a safe ModelTurn. */
export function sanitizeTurn(raw: unknown): ModelTurn {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (r.slots && typeof r.slots === "object" ? r.slots : {}) as Record<string, unknown>;
  const slots: Classification["slots"] = {};
  if (typeof s.checkIn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.checkIn)) slots.checkIn = s.checkIn;
  if (typeof s.checkOut === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.checkOut)) slots.checkOut = s.checkOut;
  if (typeof s.adults === "number" && Number.isInteger(s.adults) && s.adults > 0) slots.adults = s.adults;
  const intent = INTENTS.includes(r.intent as never) ? (r.intent as ModelTurn["intent"]) : "knowledge";
  const answer = typeof r.answer === "string" ? r.answer.trim() : "";
  return {
    intent,
    slots,
    topics: Array.isArray(r.topics) ? r.topics.filter((t) => typeof t === "string").slice(0, 4) : [],
    answer,
    grounded: Boolean(r.grounded) && answer.length > 0,
    sources: Array.isArray(r.sources) ? r.sources.filter((x) => typeof x === "string") : [],
  };
}
