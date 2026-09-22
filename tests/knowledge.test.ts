import { describe, expect, it } from "vitest";
import { retrieve, tokenize } from "@/server/knowledge";

describe("knowledge retrieval", () => {
  it("finds the pool amenity for a swimming question", () => {
    const top = retrieve("Does the hotel have a swimming pool?");
    expect(top[0].id).toBe("amenity:Swimming pool");
  });
  it("finds the cancellation policy", () => {
    const ids = retrieve("What is the cancellation policy?").map((s) => s.id);
    expect(ids[0]).toBe("policy:Cancellation");
  });
  it("finds breakfast for an 'is breakfast included' question", () => {
    expect(retrieve("Is breakfast included?")[0].id).toBe("amenity:Breakfast");
  });
  it("finds check-in time in the property section", () => {
    const ids = retrieve("What time is check-in?").map((s) => s.id);
    expect(ids).toContain("property");
    expect(ids).toContain("policy:Check-in and check-out");
  });
  it("surfaces rooms that sleep three for a three-guest question", () => {
    const ids = retrieve("Which room is suitable for three guests?").map((s) => s.id);
    expect(ids).toContain("room:junior-suite");
  });
  it("returns nothing for an off-topic question", () => {
    expect(retrieve("Who won the cricket world cup?")).toEqual([]);
  });
  it("tokenizes with stop words removed and plurals trimmed", () => {
    expect(tokenize("Do you have rooms with balconies?")).toEqual(["balconie"]);
  });
});
