import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "@/components/Chat";
import { ApiError, type ChatResponse, type StoredMessage } from "@/lib/api";

const textResponse: ChatResponse = { type: "text", conversationId: "c1", message: "Check-in is from 15:00.", sources: ["property"] };
const noop = () => {};
const noLoad = vi.fn().mockResolvedValue([] as StoredMessage[]);

describe("Chat UI", () => {
  it("shows a loading indicator while waiting, then renders the assistant reply", async () => {
    let resolve!: (r: ChatResponse) => void;
    const send = vi.fn(() => new Promise<ChatResponse>((r) => { resolve = r; }));
    render(<Chat conversationId={null} onConversationId={noop} send={send} load={noLoad} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "What time is check-in?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByTestId("user-message")).toHaveTextContent("What time is check-in?");
    expect(screen.getByRole("status", { name: /typing/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toBeDisabled();

    resolve(textResponse);
    await waitFor(() => expect(screen.getByTestId("assistant-text")).toHaveTextContent("15:00"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: "What time is check-in?", conversationId: undefined }));
  });

  it("reports the server-assigned conversationId back up after the first message", async () => {
    const send = vi.fn().mockResolvedValue(textResponse);
    const onConversationId = vi.fn();
    render(<Chat conversationId={null} onConversationId={onConversationId} send={send} load={noLoad} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "hello{enter}");
    await waitFor(() => expect(onConversationId).toHaveBeenCalledWith("c1"));
  });

  it("shows an error bubble with retry when the API fails, and keeps history", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new ApiError("Could not reach the assistant.", 0, "NETWORK"))
      .mockResolvedValueOnce(textResponse);
    render(<Chat conversationId={null} onConversationId={noop} send={send} load={noLoad} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByTestId("assistant-error")).toHaveTextContent("Could not reach"));
    expect(screen.getByTestId("user-message")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("assistant-text")).toBeInTheDocument());
    expect(screen.queryByTestId("assistant-error")).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("renders the date form on a clarification and submits structured availability", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ type: "clarification", conversationId: "c1", message: "Pick dates", needs: ["checkIn", "checkOut"], known: { adults: 2 } } satisfies ChatResponse)
      .mockResolvedValueOnce({
        type: "availability", conversationId: "c1", message: "Good news",
        data: { checkIn: "2030-01-10", checkOut: "2030-01-12", adults: 2, nights: 2, currency: "INR",
          rooms: [{ id: "deluxe-king", name: "Deluxe King", capacity: 2, pricePerNight: 6800, totalPrice: 13600, breakfastIncluded: true, available: true, roomsLeft: 5 }] },
      } satisfies ChatResponse);
    render(<Chat conversationId={null} onConversationId={noop} send={send} load={noLoad} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Do you have rooms available for a given date?" }));
    const form = await screen.findByTestId("availability-form");
    expect(form).toBeInTheDocument();

    const [checkIn, checkOut] = form.querySelectorAll('input[type="date"]');
    await user.type(checkIn, "2030-01-10");
    await user.clear(checkOut);
    await user.type(checkOut, "2030-01-12");
    await user.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => expect(screen.getByTestId("availability-card")).toBeInTheDocument());
    expect(screen.getByText("Deluxe King")).toBeInTheDocument();
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ availability: { checkIn: "2030-01-10", checkOut: "2030-01-12", adults: 2 } }));
    expect(screen.queryByTestId("availability-form")).not.toBeInTheDocument();
  });

  it("loads and renders prior turns when opening an existing conversation", async () => {
    const rows: StoredMessage[] = [
      { id: "m1", role: "user", content: "Is breakfast included?", envelope: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "m2", role: "assistant", content: "Yes, breakfast is included.", envelope: { type: "text", conversationId: "c1", message: "Yes, breakfast is included.", sources: ["policy:breakfast"] }, created_at: "2026-01-01T00:00:01Z" },
    ];
    const load = vi.fn().mockResolvedValue(rows);
    render(<Chat conversationId="c1" onConversationId={noop} send={vi.fn()} load={load} />);
    expect(load).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(screen.getByTestId("assistant-text")).toHaveTextContent("breakfast is included"));
    expect(screen.getByTestId("user-message")).toHaveTextContent("Is breakfast included?");
  });

  it("clears the pane and skips loading when switching to a brand-new thread", async () => {
    const load = vi.fn().mockResolvedValue([{ id: "m1", role: "user", content: "hi", envelope: null, created_at: "" }] satisfies StoredMessage[]);
    const { rerender } = render(<Chat conversationId="c1" onConversationId={noop} send={vi.fn()} load={load} />);
    await waitFor(() => expect(screen.getByTestId("user-message")).toBeInTheDocument());

    rerender(<Chat conversationId={null} onConversationId={noop} send={vi.fn()} load={load} />);
    await waitFor(() => expect(screen.queryByTestId("user-message")).not.toBeInTheDocument());
  });

  it("sends the same conversationId prop on a follow-up question", async () => {
    const send = vi.fn().mockResolvedValue(textResponse);
    render(<Chat conversationId="c1" onConversationId={noop} send={send} load={noLoad} />);
    const user = userEvent.setup();
    await waitFor(() => expect(noLoad).toHaveBeenCalled());
    await user.type(screen.getByLabelText("Your question"), "How much is it?{enter}");
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1" })));
  });
});
