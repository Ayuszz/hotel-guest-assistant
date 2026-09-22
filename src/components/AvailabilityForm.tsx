"use client";
import { useState } from "react";
import type { AvailabilityParams } from "@/server/types";

type Props = {
  known: Partial<AvailabilityParams>;
  disabled?: boolean;
  onSubmit: (p: AvailabilityParams) => void;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function AvailabilityForm({ known, disabled, onSubmit }: Props) {
  const [checkIn, setCheckIn] = useState(known.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(known.checkOut ?? "");
  const [adults, setAdults] = useState(known.adults ?? 2);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIn || !checkOut) return setError("Please choose both dates.");
    if (checkIn < todayIso()) return setError("Check-in cannot be in the past.");
    if (checkOut <= checkIn) return setError("Check-out must be after check-in.");
    setError(null);
    onSubmit({ checkIn, checkOut, adults });
  };

  return (
    <form onSubmit={submit} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end" data-testid="availability-form">
      <label className="text-xs text-stone-700 flex flex-col gap-1">
        Check-in
        <input type="date" required min={todayIso()} value={checkIn} disabled={disabled}
          onChange={(e) => { setCheckIn(e.target.value); if (!checkOut || checkOut <= e.target.value) setCheckOut(plusDays(e.target.value, 1)); }}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-stone-700 flex flex-col gap-1">
        Check-out
        <input type="date" required min={checkIn ? plusDays(checkIn, 1) : todayIso()} value={checkOut} disabled={disabled}
          onChange={(e) => setCheckOut(e.target.value)}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-stone-700 flex flex-col gap-1">
        Guests
        <input type="number" min={1} max={8} value={adults} disabled={disabled}
          onChange={(e) => setAdults(Number(e.target.value))}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm w-20" />
      </label>
      <button type="submit" disabled={disabled}
        className="rounded-md bg-stone-900 text-white text-sm px-3 py-1.5 h-[34px] disabled:opacity-50 col-span-2 sm:col-span-1">
        Check
      </button>
      {error && <p className="col-span-full text-xs text-red-700" role="alert">{error}</p>}
    </form>
  );
}
