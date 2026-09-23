import { beforeEach, describe, expect, it } from "vitest";
import { ConversationAccessError, InMemoryConversationRepo } from "@/server/conversationRepo";

let repo: InMemoryConversationRepo;
beforeEach(() => { repo = new InMemoryConversationRepo(); });

describe("ConversationRepo: ownership", () => {
  it("creates a new conversation when no id is given", async () => {
    const id = await repo.ensure(undefined, "u1");
    expect(id).toBeTruthy();
    expect(await repo.history(id)).toEqual([]);
  });

  it("throws for an id that was never created", async () => {
    await expect(repo.ensure("00000000-0000-0000-0000-000000000000", "u1")).rejects.toBeInstanceOf(ConversationAccessError);
  });

  it("throws when a different user requests someone else's conversation", async () => {
    const id = await repo.ensure(undefined, "u1");
    await expect(repo.ensure(id, "u2")).rejects.toBeInstanceOf(ConversationAccessError);
  });

  it("returns the same id for its owner on a later call", async () => {
    const id = await repo.ensure(undefined, "u1");
    await expect(repo.ensure(id, "u1")).resolves.toBe(id);
  });
});

describe("ConversationRepo: history and slots", () => {
  it("caps history at the last 20 turns", async () => {
    const id = await repo.ensure(undefined, "u1");
    for (let i = 0; i < 15; i++) {
      await repo.appendTurn(id, { role: "user", content: `q${i}` }, { role: "assistant", content: `a${i}` });
    }
    const history = await repo.history(id);
    expect(history.length).toBe(20);
    expect(history[0]).toEqual({ role: "user", content: "q5" });
  });

  it("merges partial slots without clobbering previously known ones", async () => {
    const id = await repo.ensure(undefined, "u1");
    await repo.mergeSlots(id, { adults: 2 });
    const merged = await repo.mergeSlots(id, { checkIn: "2026-10-10" });
    expect(merged).toEqual({ adults: 2, checkIn: "2026-10-10" });
  });

  it("ignores undefined/null values when merging slots", async () => {
    const id = await repo.ensure(undefined, "u1");
    await repo.mergeSlots(id, { adults: 2 });
    const merged = await repo.mergeSlots(id, { adults: undefined });
    expect(merged.adults).toBe(2);
  });
});

describe("ConversationRepo: title", () => {
  it("defaults to 'New chat' before any message", async () => {
    const id = await repo.ensure(undefined, "u1");
    expect(await repo.title(id)).toBe("New chat");
  });

  it("sets the title once from the first turn and does not overwrite it later", async () => {
    const id = await repo.ensure(undefined, "u1");
    await repo.titleIfUnset(id, "What time is check-in?");
    await repo.titleIfUnset(id, "Is breakfast included?");
    expect(await repo.title(id)).toBe("What time is check-in?");
  });
});
