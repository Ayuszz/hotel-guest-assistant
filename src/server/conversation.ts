import type { AvailabilityParams, HistoryTurn } from "./types";

export type ConversationState = {
  id: string;
  turns: HistoryTurn[];
  slots: Partial<AvailabilityParams>;
  updatedAt: number;
};

const MAX_TURNS = 20;
const TTL_MS = 60 * 60 * 1000;

/**
 * Best-effort in-memory store. On serverless hosts each instance has its own
 * memory, so the client also resends recent history; this store only adds
 * slot memory (dates, guests) when the same instance serves the follow-up.
 */
export class ConversationStore {
  private map = new Map<string, ConversationState>();

  get(id: string): ConversationState {
    this.sweep();
    let s = this.map.get(id);
    if (!s) {
      s = { id, turns: [], slots: {}, updatedAt: Date.now() };
      this.map.set(id, s);
    }
    return s;
  }

  /** Merge client-carried history with what we hold, dedupe by content, cap length. */
  mergeHistory(id: string, clientHistory: HistoryTurn[]): HistoryTurn[] {
    const s = this.get(id);
    const merged = s.turns.length >= clientHistory.length ? s.turns : clientHistory;
    s.turns = merged.slice(-MAX_TURNS);
    return s.turns;
  }

  append(id: string, ...turns: HistoryTurn[]): void {
    const s = this.get(id);
    s.turns = [...s.turns, ...turns].slice(-MAX_TURNS);
    s.updatedAt = Date.now();
  }

  rememberSlots(id: string, slots: Partial<AvailabilityParams>): Partial<AvailabilityParams> {
    const s = this.get(id);
    for (const [k, v] of Object.entries(slots)) {
      if (v !== undefined && v !== null) (s.slots as Record<string, unknown>)[k] = v;
    }
    s.updatedAt = Date.now();
    return s.slots;
  }

  clear(): void {
    this.map.clear();
  }

  private sweep(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of this.map) if (v.updatedAt < cutoff) this.map.delete(k);
  }
}

export const conversationStore = new ConversationStore();
