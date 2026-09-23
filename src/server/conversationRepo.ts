import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AvailabilityParams, ChatResponse, HistoryTurn } from "./types";

export type StoredTurn = { role: "user" | "assistant"; content: string; envelope?: ChatResponse };

export class ConversationAccessError extends Error {}

const MAX_HISTORY_TURNS = 20;

/**
 * Durable, per-user conversation state. Replaces the old in-memory store: on serverless every
 * request may land on a different instance, and slot memory (dates, guest count) was silently
 * lost between turns unless the same instance happened to serve both. The DB is now the only
 * source of truth for history and slots; the client no longer carries or resends either.
 */
export interface ConversationRepo {
  /** Returns the conversation id, creating a new row when none is given. Throws if `id` is given but not owned by `userId`. */
  ensure(conversationId: string | undefined, userId: string): Promise<string>;
  history(conversationId: string): Promise<HistoryTurn[]>;
  slots(conversationId: string): Promise<Partial<AvailabilityParams>>;
  mergeSlots(conversationId: string, slots: Partial<AvailabilityParams>): Promise<Partial<AvailabilityParams>>;
  appendTurn(conversationId: string, user: StoredTurn, assistant: StoredTurn): Promise<void>;
  titleIfUnset(conversationId: string, title: string): Promise<void>;
  title(conversationId: string): Promise<string>;
}

export class InMemoryConversationRepo implements ConversationRepo {
  private map = new Map<string, { userId: string; turns: HistoryTurn[]; slots: Partial<AvailabilityParams>; title: string }>();

  async ensure(conversationId: string | undefined, userId: string): Promise<string> {
    if (conversationId) {
      const s = this.map.get(conversationId);
      if (!s || s.userId !== userId) throw new ConversationAccessError("Conversation not found.");
      return conversationId;
    }
    const id = randomUUID();
    this.map.set(id, { userId, turns: [], slots: {}, title: "New chat" });
    return id;
  }

  async history(conversationId: string): Promise<HistoryTurn[]> {
    return this.map.get(conversationId)?.turns.slice(-MAX_HISTORY_TURNS) ?? [];
  }

  async slots(conversationId: string): Promise<Partial<AvailabilityParams>> {
    return { ...(this.map.get(conversationId)?.slots ?? {}) };
  }

  async mergeSlots(conversationId: string, slots: Partial<AvailabilityParams>): Promise<Partial<AvailabilityParams>> {
    const s = this.map.get(conversationId);
    if (!s) throw new ConversationAccessError("Conversation not found.");
    for (const [k, v] of Object.entries(slots)) if (v !== undefined && v !== null) (s.slots as Record<string, unknown>)[k] = v;
    return { ...s.slots };
  }

  async appendTurn(conversationId: string, user: StoredTurn, assistant: StoredTurn): Promise<void> {
    const s = this.map.get(conversationId);
    if (!s) throw new ConversationAccessError("Conversation not found.");
    s.turns = [...s.turns, { role: user.role, content: user.content }, { role: assistant.role, content: assistant.content }].slice(-MAX_HISTORY_TURNS);
  }

  async titleIfUnset(conversationId: string, title: string): Promise<void> {
    const s = this.map.get(conversationId);
    if (s && s.title === "New chat") s.title = title;
  }

  async title(conversationId: string): Promise<string> {
    return this.map.get(conversationId)?.title ?? "New chat";
  }
}

export class SupabaseConversationRepo implements ConversationRepo {
  constructor(private db: SupabaseClient) {}

  async ensure(conversationId: string | undefined, userId: string): Promise<string> {
    if (conversationId) {
      const { data, error } = await this.db
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new ConversationAccessError("Conversation not found.");
      return data.id as string;
    }
    const { data, error } = await this.db.from("conversations").insert({ user_id: userId }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async history(conversationId: string): Promise<HistoryTurn[]> {
    const { data, error } = await this.db
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_TURNS);
    if (error) throw new Error(error.message);
    return (data ?? []).reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content as string }));
  }

  async slots(conversationId: string): Promise<Partial<AvailabilityParams>> {
    const { data, error } = await this.db.from("conversations").select("slots").eq("id", conversationId).single();
    if (error) throw new Error(error.message);
    return (data?.slots ?? {}) as Partial<AvailabilityParams>;
  }

  async mergeSlots(conversationId: string, slots: Partial<AvailabilityParams>): Promise<Partial<AvailabilityParams>> {
    const current = await this.slots(conversationId);
    const merged: Partial<AvailabilityParams> = { ...current };
    for (const [k, v] of Object.entries(slots)) if (v !== undefined && v !== null) (merged as Record<string, unknown>)[k] = v;
    const { error } = await this.db.from("conversations").update({ slots: merged }).eq("id", conversationId);
    if (error) throw new Error(error.message);
    return merged;
  }

  async appendTurn(conversationId: string, user: StoredTurn, assistant: StoredTurn): Promise<void> {
    const { error } = await this.db.from("messages").insert([
      { conversation_id: conversationId, role: user.role, content: user.content, envelope: user.envelope ?? null },
      { conversation_id: conversationId, role: assistant.role, content: assistant.content, envelope: assistant.envelope ?? null },
    ]);
    if (error) throw new Error(error.message);
    // Touch updated_at so the sidebar can order by most-recently-active thread.
    await this.db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  async titleIfUnset(conversationId: string, title: string): Promise<void> {
    await this.db.from("conversations").update({ title }).eq("id", conversationId).eq("title", "New chat");
  }

  async title(conversationId: string): Promise<string> {
    const { data, error } = await this.db.from("conversations").select("title").eq("id", conversationId).single();
    if (error) throw new Error(error.message);
    return (data?.title as string) ?? "New chat";
  }
}

let cached: ConversationRepo | undefined;

export function defaultConversationRepo(): ConversationRepo {
  if (!cached) cached = new SupabaseConversationRepo(createAdminClient());
  return cached;
}

/** Turns a raw message/description into a short thread title. */
export function deriveTitle(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  return collapsed.length <= 60 ? collapsed : `${collapsed.slice(0, 57)}…`;
}
