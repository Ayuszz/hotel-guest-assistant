import type { AvailabilityParams, ChatResponse, HistoryTurn } from "@/server/types";

export type { ChatResponse, HistoryTurn, AvailabilityParams };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code = "HTTP_ERROR") {
    super(message);
    this.name = "ApiError";
  }
}

export type SendArgs = {
  conversationId: string;
  message?: string;
  availability?: AvailabilityParams;
  history: HistoryTurn[];
  signal?: AbortSignal;
};

/** The only network call the frontend makes. Never talks to an LLM provider directly. */
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
  let data: ChatResponse | undefined;
  try {
    data = (await res.json()) as ChatResponse;
  } catch {
    throw new ApiError("The assistant returned an unreadable response.", res.status, "BAD_JSON");
  }
  if (!res.ok) {
    const msg = data && "message" in data ? data.message : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data?.type === "error" ? data.code : "HTTP_ERROR");
  }
  return data;
}
