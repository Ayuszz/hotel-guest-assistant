"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, sendChat, type ChatResponse, type HistoryTurn } from "@/lib/api";
import type { AvailabilityParams, AvailabilityResult } from "@/server/types";
import { AvailabilityCard } from "./AvailabilityCard";
import { AvailabilityForm } from "./AvailabilityForm";
import { TypingIndicator } from "./TypingIndicator";

export type UiMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "text" | "fallback"; text: string }
  | { id: string; role: "assistant"; kind: "availability"; text: string; data: AvailabilityResult }
  | { id: string; role: "assistant"; kind: "clarification"; text: string; known: Partial<AvailabilityParams>; resolved?: boolean }
  | { id: string; role: "assistant"; kind: "error"; text: string; retry: () => void };

const SUGGESTIONS = [
  "What time is check-in?",
  "Does the hotel have a swimming pool?",
  "Which room is suitable for three guests?",
  "Is breakfast included?",
  "What is the cancellation policy?",
  "Do you have rooms available for a given date?",
];

const REQUEST_TIMEOUT_MS = 35_000;
const HISTORY_LIMIT = 10;
let counter = 0;
const nextId = () => `${Date.now()}-${counter++}`;

export function Chat({ send = sendChat }: { send?: typeof sendChat }) {
  const [conversationId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()),
  );
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el && typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const historyFor = (msgs: UiMessage[]): HistoryTurn[] =>
    msgs
      .filter((m) => m.role === "user" || (m.kind !== "error"))
      .map((m): HistoryTurn => ({ role: m.role, content: m.text }))
      .slice(-HISTORY_LIMIT);

  const push = (m: UiMessage) => setMessages((prev) => [...prev, m]);

  const toUi = (res: ChatResponse): UiMessage => {
    const id = nextId();
    switch (res.type) {
      case "text": return { id, role: "assistant", kind: "text", text: res.message };
      case "fallback": return { id, role: "assistant", kind: "fallback", text: res.message };
      case "availability": return { id, role: "assistant", kind: "availability", text: res.message, data: res.data };
      case "clarification": return { id, role: "assistant", kind: "clarification", text: res.message, known: res.known };
      case "error": return { id, role: "assistant", kind: "error", text: res.message, retry: () => {} };
    }
  };

  const perform = async (payload: { message?: string; availability?: AvailabilityParams }, echo: string) => {
    if (pending) return;
    const userMsg: UiMessage = { id: nextId(), role: "user", text: echo };
    const base = messages;
    setMessages((prev) => [...prev.map((m) => (m.role === "assistant" && m.kind === "clarification" ? { ...m, resolved: true } : m)), userMsg]);
    setPending(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await send({ conversationId, ...payload, history: historyFor(base), signal: ctrl.signal });
      push(toUi(res));
    } catch (e) {
      const text = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      push({ id: nextId(), role: "assistant", kind: "error", text, retry: () => {
        setMessages((prev) => prev.filter((m) => !(m.role === "assistant" && m.kind === "error")).slice(0, -1));
        void perform(payload, echo);
      } });
    } finally {
      clearTimeout(timer);
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const submitText = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    void perform({ message: text }, text);
  };

  const submitAvailability = (p: AvailabilityParams) => {
    const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    void perform({ availability: p }, `Check availability: ${p.adults} guest${p.adults === 1 ? "" : "s"}, ${fmt(p.checkIn)} to ${fmt(p.checkOut)}`);
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="message-list">
        {messages.length === 0 && (
          <div className="max-w-md mx-auto text-center pt-6">
            <p className="text-stone-700 text-sm mb-4">Hi! Ask me anything about Marigold Bay Hotel, or check if we have rooms for your dates.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void perform({ message: s }, s)}
                  className="text-xs rounded-full border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-100 text-stone-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => <Bubble key={m.id} m={m} pending={pending} onAvailability={submitAvailability} />)}
        {pending && <TypingIndicator />}
      </div>
      <form onSubmit={submitText} className="border-t border-stone-200 bg-white px-3 py-3 flex gap-2 items-center sticky bottom-0" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} disabled={pending}
          placeholder={pending ? "Waiting for the assistant…" : "Ask about rooms, amenities, policies…"}
          aria-label="Your question" maxLength={1000} autoFocus
          className="flex-1 rounded-full border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-stone-500 disabled:bg-stone-100" />
        <button type="submit" disabled={pending || !input.trim()} aria-label="Send"
          className="rounded-full bg-stone-900 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({ m, pending, onAvailability }: { m: UiMessage; pending: boolean; onAvailability: (p: AvailabilityParams) => void }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl rounded-br-sm bg-stone-900 text-white px-4 py-2.5 text-sm whitespace-pre-wrap" data-testid="user-message">{m.text}</div>
      </div>
    );
  }
  const tone =
    m.kind === "error" ? "border-red-200 bg-red-50 text-red-900"
    : m.kind === "fallback" ? "border-amber-200 bg-amber-50 text-stone-800"
    : "border-stone-200 bg-white text-stone-900";
  return (
    <div className="flex justify-start">
      <div className={`max-w-[92%] sm:max-w-[78%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm shadow-sm ${tone}`} data-testid={`assistant-${m.kind}`}>
        <p className="whitespace-pre-wrap">{m.text}</p>
        {m.kind === "availability" && <AvailabilityCard data={m.data} />}
        {m.kind === "clarification" && !m.resolved && <AvailabilityForm known={m.known} disabled={pending} onSubmit={onAvailability} />}
        {m.kind === "error" && (
          <button type="button" onClick={m.retry} disabled={pending} className="mt-2 text-xs font-medium underline underline-offset-2">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
