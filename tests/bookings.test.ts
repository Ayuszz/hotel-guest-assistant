import { describe, expect, it, vi } from "vitest";
import { handleCreateBooking, type Booking, type BookingsTable } from "@/server/bookings";

const validInput = {
  roomId: "junior-suite",
  roomName: "Junior Suite",
  checkIn: "2026-10-10",
  checkOut: "2026-10-12",
  nights: 2,
  adults: 3,
  pricePerNight: 9200,
  totalPrice: 18400,
  currency: "INR",
};

function fakeTable(row?: Partial<Booking>): BookingsTable {
  return {
    insert: vi.fn().mockResolvedValue({
      data: row === null ? null : { id: "b1", status: "confirmed", payment_status: "paid", payment_reference: "MOCK-1234", ...validInput, ...row } as Booking,
      error: row === null ? { message: "insert failed" } : null,
    }),
  };
}

describe("handleCreateBooking: validation", () => {
  it("rejects a missing room id", async () => {
    const rest: Partial<typeof validInput> = { ...validInput };
    delete rest.roomId;
    const r = await handleCreateBooking(rest, "u1", fakeTable());
    expect(r.status).toBe(400);
  });
  it("rejects a malformed date", async () => {
    const r = await handleCreateBooking({ ...validInput, checkIn: "10/10/2026" }, "u1", fakeTable());
    expect(r.status).toBe(400);
  });
  it("rejects zero or negative nights", async () => {
    const r = await handleCreateBooking({ ...validInput, nights: 0 }, "u1", fakeTable());
    expect(r.status).toBe(400);
  });
});

describe("handleCreateBooking: success", () => {
  it("books and marks paid in one step, with a mock reference", async () => {
    const table = fakeTable();
    const r = await handleCreateBooking(validInput, "u1", table);
    expect(r.status).toBe(201);
    expect(r.body).toHaveProperty("booking");
    if ("booking" in r.body) {
      expect(r.body.booking.status).toBe("confirmed");
      expect(r.body.booking.payment_status).toBe("paid");
      expect(r.body.booking.payment_reference).toMatch(/^MOCK-/);
    }
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", room_id: "junior-suite", payment_status: "paid", status: "confirmed" }));
  });

  it("carries the conversation id through when given", async () => {
    const table = fakeTable();
    await handleCreateBooking({ ...validInput, conversationId: "22222222-2222-4222-8222-222222222222" }, "u1", table);
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: "22222222-2222-4222-8222-222222222222" }));
  });
});

describe("handleCreateBooking: db failure", () => {
  it("returns 500 when the insert fails", async () => {
    const r = await handleCreateBooking(validInput, "u1", fakeTable(null as unknown as Partial<Booking>));
    expect(r.status).toBe(500);
  });
});
