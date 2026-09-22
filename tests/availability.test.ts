import { describe, expect, it } from "vitest";
import { checkAvailability, nightsBetween, validateStay, ValidationError } from "@/server/availability";

const today = new Date("2026-09-22T10:00:00Z");

describe("checkAvailability (deterministic tool)", () => {
  it("returns only rooms with enough capacity, sorted available-first then by price", () => {
    const r = checkAvailability({ checkIn: "2026-10-10", checkOut: "2026-10-12", adults: 3 }, { today });
    expect(r.nights).toBe(2);
    expect(r.rooms.map((x) => x.id)).toEqual(["junior-suite", "family-suite"]);
    expect(r.rooms.every((x) => x.capacity >= 3)).toBe(true);
    expect(r.rooms[0].totalPrice).toBe(9200 * 2);
  });

  it("marks a room type unavailable when any night in the range is fully booked", () => {
    const r = checkAvailability({ checkIn: "2026-10-02", checkOut: "2026-10-04", adults: 2 }, { today });
    const std = r.rooms.find((x) => x.id === "standard-double")!;
    const deluxe = r.rooms.find((x) => x.id === "deluxe-king")!;
    expect(std.available).toBe(false);
    expect(deluxe.available).toBe(true);
    expect(deluxe.roomsLeft).toBe(1);
  });

  it("reports fully booked when every eligible room type is taken", () => {
    const r = checkAvailability({ checkIn: "2026-11-14", checkOut: "2026-11-15", adults: 4 }, { today });
    expect(r.rooms).toHaveLength(1);
    expect(r.rooms[0].available).toBe(false);
  });

  it("returns no rooms for a party larger than the biggest room", () => {
    const r = checkAvailability({ checkIn: "2026-10-10", checkOut: "2026-10-11", adults: 6 }, { today });
    expect(r.rooms).toEqual([]);
  });
});

describe("validateStay", () => {
  const base = { checkIn: "2026-10-10", checkOut: "2026-10-12", adults: 2 };
  it("accepts a valid future stay", () => expect(() => validateStay(base, today)).not.toThrow());
  it("rejects past check-in", () =>
    expect(() => validateStay({ ...base, checkIn: "2026-09-01", checkOut: "2026-09-03" }, today)).toThrow(/past/));
  it("rejects check-out before or equal to check-in", () => {
    expect(() => validateStay({ ...base, checkOut: "2026-10-10" }, today)).toThrow(ValidationError);
    expect(() => validateStay({ ...base, checkOut: "2026-10-09" }, today)).toThrow(/at least one day/);
  });
  it("rejects impossible calendar dates", () =>
    expect(() => validateStay({ ...base, checkIn: "2026-02-30" }, today)).toThrow(/real calendar date/));
  it("rejects stays longer than 30 nights", () =>
    expect(() => validateStay({ ...base, checkOut: "2026-11-15" }, today)).toThrow(/30 nights/));
  it("rejects guest counts outside 1..8", () => {
    expect(() => validateStay({ ...base, adults: 0 }, today)).toThrow(/between 1 and 8/);
    expect(() => validateStay({ ...base, adults: 9 }, today)).toThrow(/between 1 and 8/);
  });
  it("counts nights correctly across a month boundary", () => expect(nightsBetween("2026-10-30", "2026-11-02")).toBe(3));
});
