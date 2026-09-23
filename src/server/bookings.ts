import { randomUUID } from "node:crypto";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const CreateBookingSchema = z.object({
  conversationId: z.string().uuid().optional(),
  roomId: z.string().min(1),
  roomName: z.string().min(1),
  checkIn: isoDate,
  checkOut: isoDate,
  nights: z.number().int().positive(),
  adults: z.number().int().min(1).max(8),
  pricePerNight: z.number().positive(),
  totalPrice: z.number().positive(),
  currency: z.string().min(1).max(8),
});
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export type Booking = {
  id: string;
  room_id: string;
  room_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  price_per_night: number;
  total_price: number;
  currency: string;
  status: "confirmed" | "cancelled";
  payment_status: "unpaid" | "paid" | "refunded";
  payment_reference: string | null;
  created_at: string;
};

export type BookingsTable = {
  insert(row: Record<string, unknown>): Promise<{ data: Booking | null; error: { message: string } | null }>;
};

export type CreateBookingResult = { status: number; body: { booking: Booking } | { type: "error"; message: string; code: string } };

/**
 * Simulated payment: no gateway, no real money. A "Book & pay" click books the room and marks it
 * paid in the same call with a mock reference. This is intentionally not a real checkout — see
 * decisions.md for why a full Stripe-style integration is out of scope for this assignment.
 */
export async function handleCreateBooking(input: unknown, userId: string, table: BookingsTable): Promise<CreateBookingResult> {
  const parsed = CreateBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, body: { type: "error", message: parsed.error.issues[0]?.message ?? "Invalid booking request.", code: "INVALID_REQUEST" } };
  }
  const b = parsed.data;
  const paymentReference = `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;

  const { data, error } = await table.insert({
    user_id: userId,
    conversation_id: b.conversationId ?? null,
    room_id: b.roomId,
    room_name: b.roomName,
    check_in: b.checkIn,
    check_out: b.checkOut,
    nights: b.nights,
    adults: b.adults,
    price_per_night: b.pricePerNight,
    total_price: b.totalPrice,
    currency: b.currency,
    status: "confirmed",
    payment_status: "paid",
    payment_reference: paymentReference,
  });

  if (error || !data) {
    return { status: 500, body: { type: "error", message: "Could not create the booking. Please try again.", code: "INTERNAL" } };
  }
  return { status: 201, body: { booking: data } };
}
