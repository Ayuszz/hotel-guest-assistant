"use client";
import { useState } from "react";
import { ApiError, createBooking, type Booking } from "@/lib/api";
import type { AvailabilityResult } from "@/server/types";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

type Props = { data: AvailabilityResult; conversationId?: string | null };

export function AvailabilityCard({ data, conversationId }: Props) {
  const money = (n: number) => `${data.currency} ${n.toLocaleString("en-IN")}`;
  const [booked, setBooked] = useState<Record<string, Booking>>({});
  const [pendingRoom, setPendingRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bookRoom = async (roomId: string, roomName: string, pricePerNight: number, totalPrice: number) => {
    setPendingRoom(roomId);
    setError(null);
    try {
      const booking = await createBooking({
        conversationId: conversationId ?? undefined,
        roomId, roomName,
        checkIn: data.checkIn, checkOut: data.checkOut,
        nights: data.nights, adults: data.adults,
        pricePerNight, totalPrice, currency: data.currency,
      });
      setBooked((prev) => ({ ...prev, [roomId]: booking }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not complete the booking.");
    } finally {
      setPendingRoom(null);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 overflow-hidden" data-testid="availability-card">
      <div className="px-4 py-2 text-xs text-stone-600 border-b border-stone-200 bg-white">
        {fmt(data.checkIn)} → {fmt(data.checkOut)} · {data.nights} night{data.nights === 1 ? "" : "s"} · {data.adults} guest{data.adults === 1 ? "" : "s"}
      </div>
      {data.rooms.length === 0 ? (
        <p className="px-4 py-3 text-sm text-stone-700">No single room sleeps this many guests.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {data.rooms.map((r) => {
            const bookingForRoom = booked[r.id];
            return (
              <li key={r.id} className={`px-4 py-3 flex items-start justify-between gap-3 ${r.available ? "" : "opacity-60"}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.name}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${r.available ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}
                    >
                      {r.available ? (r.roomsLeft <= 2 ? `Only ${r.roomsLeft} left` : "Available") : "Sold out"}
                    </span>
                  </div>
                  <div className="text-xs text-stone-600 mt-0.5">
                    Sleeps {r.capacity} · {r.breakfastIncluded ? "Breakfast included" : "Breakfast extra"}
                  </div>
                  {bookingForRoom && (
                    <p className="text-xs text-emerald-700 mt-1" data-testid="booking-confirmation">
                      Booked &amp; paid · ref {bookingForRoom.payment_reference}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{money(r.pricePerNight)}</div>
                  <div className="text-[11px] text-stone-500 mb-1.5">per night · {money(r.totalPrice)} total</div>
                  {r.available && !bookingForRoom && (
                    <button
                      type="button"
                      onClick={() => void bookRoom(r.id, r.name, r.pricePerNight, r.totalPrice)}
                      disabled={pendingRoom === r.id}
                      className="rounded-md bg-stone-900 text-white text-xs font-medium px-2.5 py-1.5 disabled:opacity-50"
                    >
                      {pendingRoom === r.id ? "Booking…" : "Book & pay (mock)"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="px-4 py-2 text-xs text-red-700" role="alert">{error}</p>}
      <div className="px-4 py-2 text-[11px] text-stone-500 bg-white border-t border-stone-200">
        Indicative rates. Payment above is simulated for this demo — no card is charged. To reserve for real, call +91 832 555 0142 or email stay@marigoldbay.example.
      </div>
    </div>
  );
}
