import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { checkAvailability, ValidationError } from "./availability";
import { ConversationAccessError, deriveTitle, defaultConversationRepo, type ConversationRepo } from "./conversationRepo";
import { CONTACT_LINE, HOTEL_NAME, retrieve } from "./knowledge";
import { getProvider } from "./llm";
import { type LLMProvider, type ModelTurn } from "./llm/provider";
import { log } from "./logger";
import {
  AvailabilityParamsSchema,
  ChatRequestSchema,
  type AvailabilityParams,
  type AvailabilityResult,
  type ChatResponse,
} from "./types";

export type Deps = { provider?: LLMProvider; repo?: ConversationRepo; today?: Date };
export type HandlerResult = { status: number; body: ChatResponse };

const FALLBACK_TEXT = `I'm not able to answer that from the information I have about ${HOTEL_NAME}. ${CONTACT_LINE}`;
const UNAVAILABLE_TEXT = `I'm having trouble reaching my assistant service right now. Please try again in a moment, or ${CONTACT_LINE.charAt(0).toLowerCase()}${CONTACT_LINE.slice(1)}`;

const AVAILABILITY_HINT = /(availab|vacan|free room|book|reserv|any rooms|rooms? (for|on|from)|check[- ]?in .* check[- ]?out|stay (from|on))/i;

/**
 * Main entry. Pure function of (request, userId, deps); the HTTP route is a thin wrapper.
 * History and slot memory are sourced entirely from the repo (Supabase in production) — the
 * client sends only the message and, optionally, the id of an existing thread it owns.
 */
export async function handleChat(input: unknown, userId: string, deps: Deps = {}): Promise<HandlerResult> {
  const started = Date.now();
  const repo = deps.repo ?? defaultConversationRepo();
  const today = deps.today ?? new Date();

  let req;
  try {
    req = ChatRequestSchema.parse(input);
  } catch (e) {
    const msg = e instanceof ZodError ? e.issues.map((i) => i.message).join("; ") : "Invalid request";
    log("warn", "chat.invalid_request", { msg });
    return { status: 400, body: { type: "error", message: msg, code: "INVALID_REQUEST" } };
  }

  let conversationId: string;
  try {
    conversationId = await repo.ensure(req.conversationId, userId);
  } catch (e) {
    if (e instanceof ConversationAccessError) {
      return { status: 404, body: { type: "error", message: "Conversation not found.", code: "NOT_FOUND" } };
    }
    throw e;
  }

  const history = await repo.history(conversationId);
  const requestId = randomUUID().slice(0, 8);
  const done = (status: number, body: ChatResponse, extra: Record<string, unknown> = {}): HandlerResult => {
    log("info", "chat.response", { requestId, conversationId, type: body.type, status, ms: Date.now() - started, ...extra });
    return { status, body };
  };

  // Structured availability request from the date form: no LLM involved.
  if (req.availability) {
    await repo.mergeSlots(conversationId, req.availability);
    try {
      const result = checkAvailability(req.availability, { today });
      const message = describeAvailability(result);
      const body: ChatResponse = { type: "availability", conversationId, message, data: result };
      await repo.appendTurn(conversationId, { role: "user", content: describeRequest(req.availability) }, { role: "assistant", content: message, envelope: body });
      await repo.titleIfUnset(conversationId, deriveTitle(describeRequest(req.availability)));
      return done(200, body);
    } catch (e) {
      if (e instanceof ValidationError) {
        return done(400, { type: "error", conversationId, message: e.message, code: "INVALID_STAY" });
      }
      throw e;
    }
  }

  const message = req.message!;
  const provider = deps.provider ?? getProvider();

  // One model call: intent + slots + grounded answer over the retrieved context.
  // If the model is down, fall back to deterministic routing so availability still works.
  const context = retrieve(message);
  let turn: ModelTurn;
  let llmDown = false;
  try {
    turn = await provider.respond({ message, history, today: today.toISOString().slice(0, 10), context });
  } catch (e) {
    llmDown = true;
    log("error", "llm.respond_failed", { requestId, provider: provider.name, error: (e as Error).message });
    turn = { intent: AVAILABILITY_HINT.test(message) ? "availability" : "knowledge", slots: {}, topics: [], answer: "", grounded: false, sources: [] };
  }
  const cls = turn;

  const finish = async (body: ChatResponse, extra: Record<string, unknown> = {}) => {
    await repo.appendTurn(conversationId, { role: "user", content: message }, { role: "assistant", content: body.message, envelope: body });
    await repo.titleIfUnset(conversationId, deriveTitle(message));
    return done(200, body, { intent: cls.intent, ...extra });
  };

  if (cls.intent === "greeting") {
    return finish({ type: "text", conversationId, message: `Hello! I'm the ${HOTEL_NAME} assistant. Ask me about rooms, amenities, policies, or check availability for your dates.`, sources: [] });
  }

  if (cls.intent === "unsupported") {
    return finish({ type: "fallback", conversationId, message: FALLBACK_TEXT, reason: "out_of_scope" });
  }

  if (cls.intent === "availability") {
    const known = await repo.mergeSlots(conversationId, cls.slots);
    const parsed = AvailabilityParamsSchema.safeParse(known);
    if (!parsed.success) {
      const needs = (["checkIn", "checkOut", "adults"] as const).filter((k) => known[k] === undefined);
      return finish({
        type: "clarification", conversationId, needs, known,
        message: llmDown
          ? "I can check availability for you. Please pick your dates and number of guests below."
          : `Happy to check availability. Please confirm ${needsText(needs)} below.`,
      }, { llmDown });
    }
    try {
      const result = checkAvailability(parsed.data, { today });
      return finish({ type: "availability", conversationId, message: describeAvailability(result), data: result });
    } catch (e) {
      if (e instanceof ValidationError) {
        return finish({ type: "clarification", conversationId, needs: ["checkIn", "checkOut"], known, message: `${e.message} Please pick your dates below.` });
      }
      throw e;
    }
  }

  // knowledge
  if (llmDown) {
    return finish({ type: "fallback", conversationId, message: UNAVAILABLE_TEXT, reason: "llm_unavailable" });
  }
  if (context.length === 0 || !turn.grounded) {
    return finish({ type: "fallback", conversationId, message: FALLBACK_TEXT, reason: "not_in_knowledge_base" });
  }
  const unverified = unverifiedFigures(turn.answer, context.map((c) => c.text));
  if (unverified.length > 0) {
    log("warn", "chat.unverified_figures", { requestId, unverified, answer: turn.answer });
    return finish({ type: "fallback", conversationId, message: FALLBACK_TEXT, reason: "unverified_figure" }, { unverified });
  }
  return finish({ type: "text", conversationId, message: turn.answer, sources: turn.sources.filter((id) => context.some((c) => c.id === id)) });
}

/** Any number with 3+ digits in the answer must appear in the context, else the answer is rejected. */
export function unverifiedFigures(answer: string, contextTexts: string[]): string[] {
  const nums = answer.match(/\d[\d,]{2,}/g) ?? [];
  const haystack = contextTexts.join(" ").replace(/,/g, "");
  return [...new Set(nums.map((n) => n.replace(/,/g, "")))].filter((n) => !haystack.includes(n));
}

function needsText(needs: readonly string[]): string {
  const labels: Record<string, string> = { checkIn: "your check-in date", checkOut: "your check-out date", adults: "the number of guests" };
  const parts = needs.map((n) => labels[n] ?? n);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function describeRequest(p: AvailabilityParams): string {
  return `Check availability: ${p.adults} guest${p.adults === 1 ? "" : "s"}, ${fmtDate(p.checkIn)} to ${fmtDate(p.checkOut)}.`;
}

export function describeAvailability(r: AvailabilityResult): string {
  const stay = `${r.adults} guest${r.adults === 1 ? "" : "s"}, ${fmtDate(r.checkIn)} to ${fmtDate(r.checkOut)} (${r.nights} night${r.nights === 1 ? "" : "s"})`;
  const open = r.rooms.filter((x) => x.available);
  if (r.rooms.length === 0) return `We don't have a single room that sleeps ${r.adults} guests. For larger groups, ${CONTACT_LINE.charAt(0).toLowerCase()}${CONTACT_LINE.slice(1)}`;
  if (open.length === 0) return `Sorry, we're fully booked for ${stay}. Try different dates, or ${CONTACT_LINE.charAt(0).toLowerCase()}${CONTACT_LINE.slice(1)}`;
  const cheapest = open[0];
  return `Good news: ${open.length} room type${open.length === 1 ? " is" : "s are"} available for ${stay}, from ${r.currency} ${cheapest.pricePerNight.toLocaleString("en-IN")} per night (${cheapest.name}).`;
}
