"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, fetchBookings, type Booking } from "@/lib/api";

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function StatusBadge({ status, payment }: { status: Booking["status"]; payment: Booking["payment_status"] }) {
  const tone = status === "cancelled" ? "bg-stone-200 text-stone-600" : payment === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800";
  const label = status === "cancelled" ? "Cancelled" : payment === "paid" ? "Paid" : payment === "refunded" ? "Refunded" : "Unpaid";
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone}`}>{label}</span>;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBookings()
      .then(setBookings)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your bookings."));
  }, []);

  const total = (bookings ?? []).filter((b) => b.payment_status === "paid").reduce((sum, b) => sum + Number(b.total_price), 0);

  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="px-4 py-3 border-b border-stone-200 bg-white flex items-center gap-3">
        <Link href="/" className="text-sm text-stone-600 underline underline-offset-2">← Back to chat</Link>
        <h1 className="text-sm font-semibold ml-2">My bookings</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {error && <p role="alert" className="text-sm text-red-700 mb-4">{error}</p>}
        {!bookings && !error && <p className="text-sm text-stone-500" data-testid="bookings-loading">Loading your bookings…</p>}
        {bookings && bookings.length === 0 && (
          <p className="text-sm text-stone-500" data-testid="bookings-empty">
            No bookings yet. Ask the assistant to check availability, then book a room from the results.
          </p>
        )}
        {bookings && bookings.length > 0 && (
          <>
            <p className="text-xs text-stone-500 mb-3">
              {bookings.length} booking{bookings.length === 1 ? "" : "s"} · {bookings[0]?.currency ?? "INR"} {total.toLocaleString("en-IN")} paid
            </p>
            <ul className="space-y-3" data-testid="bookings-list">
              {bookings.map((b) => (
                <li key={b.id} className="rounded-xl border border-stone-200 bg-white p-4" data-testid="booking-item">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{b.room_name}</span>
                        <StatusBadge status={b.status} payment={b.payment_status} />
                      </div>
                      <p className="text-xs text-stone-600 mt-0.5">
                        {fmt(b.check_in)} → {fmt(b.check_out)} · {b.nights} night{b.nights === 1 ? "" : "s"} · {b.adults} guest{b.adults === 1 ? "" : "s"}
                      </p>
                      {b.payment_reference && <p className="text-[11px] text-stone-400 mt-1">Ref {b.payment_reference}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{b.currency} {Number(b.total_price).toLocaleString("en-IN")}</div>
                      <div className="text-[11px] text-stone-500">{b.currency} {Number(b.price_per_night).toLocaleString("en-IN")}/night</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
