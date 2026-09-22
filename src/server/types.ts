import { z } from "zod";

/** A single turn of conversation carried by the client (serverless-safe). */
export const HistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
export type HistoryTurn = z.infer<typeof HistoryTurnSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Structured availability request, sent when the guest submits the date form. */
export const AvailabilityParamsSchema = z.object({
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(8),
});
export type AvailabilityParams = z.infer<typeof AvailabilityParamsSchema>;

export const ChatRequestSchema = z
  .object({
    conversationId: z.string().min(1).max(100).optional(),
    message: z.string().trim().min(1, "Message is required").max(1000).optional(),
    history: z.array(HistoryTurnSchema).max(20).default([]),
    availability: AvailabilityParamsSchema.optional(),
  })
  .refine((r) => r.message || r.availability, {
    message: "Either message or availability is required",
  });
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type RoomAvailability = {
  id: string;
  name: string;
  capacity: number;
  pricePerNight: number;
  totalPrice: number;
  breakfastIncluded: boolean;
  available: boolean;
  roomsLeft: number;
};

export type AvailabilityResult = {
  checkIn: string;
  checkOut: string;
  adults: number;
  nights: number;
  currency: string;
  rooms: RoomAvailability[];
};

export type Intent = "knowledge" | "availability" | "greeting" | "unsupported";

export type Classification = {
  intent: Intent;
  /** Slots the model could extract from the text; partial is expected. */
  slots: Partial<AvailabilityParams>;
  /** Short topic keywords for retrieval, e.g. ["breakfast", "price"]. */
  topics: string[];
};

/** Response envelope. `type` drives how the frontend renders the turn. */
export type ChatResponse =
  | { type: "text"; conversationId: string; message: string; sources: string[] }
  | { type: "availability"; conversationId: string; message: string; data: AvailabilityResult }
  | {
      type: "clarification";
      conversationId: string;
      message: string;
      needs: Array<keyof AvailabilityParams>;
      known: Partial<AvailabilityParams>;
    }
  | { type: "fallback"; conversationId: string; message: string; reason: string }
  | { type: "error"; conversationId?: string; message: string; code: string };
