import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "@/components/Chat";
import { ApiError, type ChatResponse } from "@/lib/api";

const textResponse: ChatResponse = { type: "text", conversationId: "c", message: "Check-in is from 15:00.", sources: ["property"] };

describe("Chat UI", () => {
  it("shows a loading indicator while waiting, then renders the assistant reply", async () => {
    let resolve!: (r: ChatResponse) => void;
    const send = vi.fn(() => new Promise<ChatResponse>((r) => { resolve = r; }));
    render(<Chat send={send} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "What time is check-in?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByTestId("user-message")).toHaveTextContent("What time is check-in?");
    expect(screen.getByRole("status", { name: /typing/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toBeDisabled();

    resolve(textResponse);
    await waitFor(() => expect(screen.getByTestId("assistant-text")).toHaveTextContent("15:00"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: "What time is check-in?" }));
  });

  it("shows an error bubble with retry when the API fails, and keeps history", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new ApiError("Could not reach the assistant.", 0, "NETWORK"))
      .mockResolvedValueOnce(textResponse);
    render(<Chat send={send} />);
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
      .mockResolvedValueOnce({ type: "clarification", conversationId: "c", message: "Pick dates", needs: ["checkIn", "checkOut"], known: { adults: 2 } } satisfies ChatResponse)
      .mockResolvedValueOnce({
        type: "availability", conversationId: "c", message: "Good news",
        data: { checkIn: "2030-01-10", checkOut: "2030-01-12", adults: 2, nights: 2, currency: "INR",
          rooms: [{ id: "deluxe-king", name: "Deluxe King", capacity: 2, pricePerNight: 6800, totalPrice: 13600, breakfastIncluded: true, available: true, roomsLeft: 5 }] },
      } satisfies ChatResponse);
    render(<Chat send={send} />);
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

  it("sends prior turns as history on follow-up questions", async () => {
    const send = vi.fn().mockResolvedValue(textResponse);
    render(<Chat send={send} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your question"), "Which room fits three?{enter}");
    await waitFor(() => expect(screen.getByTestId("assistant-text")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Your question"), "How much is it?{enter}");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const second = send.mock.calls[1][0];
    expect(second.history).toEqual([
      { role: "user", content: "Which room fits three?" },
      { role: "assistant", content: "Check-in is from 15:00." },
    ]);
  });
});
