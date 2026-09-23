import type { AvailabilityParams, ChatResponse } from "@/server/types";

export type { ChatResponse, AvailabilityParams };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code = "HTTP_ERROR") {
    super(message);
    this.name = "ApiError";
  }
}

export type SendArgs = {
  conversationId?: string;
  message?: string;
  availability?: AvailabilityParams;
  signal?: AbortSignal;
};

async function parseJsonResponse<T>(res: Response, unreadableMessage: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(unreadableMessage, res.status, "BAD_JSON");
  }
}

/** The only network call the frontend makes for a chat turn. Never talks to an LLM provider directly. */
export async function sendChat(args: SendArgs, fetchImpl: typeof fetch = fetch): Promise<ChatResponse> {
  const { signal, ...body } = args;
  let res: Response;
  try {
    res = await fetchImpl("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ApiError("The request took too long. Please try again.", 0, "TIMEOUT");
    throw new ApiError("Could not reach the assistant. Check your connection and try again.", 0, "NETWORK");
  }
  const data = await parseJsonResponse<ChatResponse & { message?: string; code?: string }>(res, "The assistant returned an unreadable response.");
  if (!res.ok) {
    const msg = "message" in data ? data.message : `Request failed (${res.status})`;
    throw new ApiError(msg ?? `Request failed (${res.status})`, res.status, data.type === "error" ? data.code : "HTTP_ERROR");
  }
  return data;
}

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  envelope: ChatResponse | null;
  created_at: string;
};

/** Loads a thread's full history from the backend. Nothing is kept client-side between sessions. */
export async function fetchMessages(conversationId: string, fetchImpl: typeof fetch = fetch): Promise<StoredMessage[]> {
  const res = await fetchImpl(`/api/conversations/${conversationId}/messages`);
  if (!res.ok) throw new ApiError("Could not load this conversation.", res.status, "LOAD_FAILED");
  const data = await parseJsonResponse<{ messages: StoredMessage[] }>(res, "Could not read this conversation.");
  return data.messages;
}

export type ConversationSummary = { id: string; title: string; updated_at: string };

export async function fetchConversations(fetchImpl: typeof fetch = fetch): Promise<ConversationSummary[]> {
  const res = await fetchImpl("/api/conversations");
  if (!res.ok) throw new ApiError("Could not load your conversations.", res.status, "LOAD_FAILED");
  const data = await parseJsonResponse<{ conversations: ConversationSummary[] }>(res, "Could not read your conversations.");
  return data.conversations;
}

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

export type CreateBookingArgs = {
  conversationId?: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
};

/** Simulated booking + payment: no real gateway, no real money. See docs/decisions.md. */
export async function createBooking(args: CreateBookingArgs, fetchImpl: typeof fetch = fetch): Promise<Booking> {
  const res = await fetchImpl("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await parseJsonResponse<{ booking?: Booking; message?: string; code?: string }>(res, "The booking response was unreadable.");
  if (!res.ok || !data.booking) {
    throw new ApiError(data.message ?? "Could not complete the booking.", res.status, data.code ?? "BOOKING_FAILED");
  }
  return data.booking;
}

export async function fetchBookings(fetchImpl: typeof fetch = fetch): Promise<Booking[]> {
  const res = await fetchImpl("/api/bookings");
  if (!res.ok) throw new ApiError("Could not load your bookings.", res.status, "LOAD_FAILED");
  const data = await parseJsonResponse<{ bookings: Booking[] }>(res, "Could not read your bookings.");
  return data.bookings;
}
