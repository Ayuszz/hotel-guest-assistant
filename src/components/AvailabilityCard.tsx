import type { AvailabilityResult } from "@/server/types";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function AvailabilityCard({ data }: { data: AvailabilityResult }) {
  const money = (n: number) => `${data.currency} ${n.toLocaleString("en-IN")}`;
  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 overflow-hidden" data-testid="availability-card">
      <div className="px-4 py-2 text-xs text-stone-600 border-b border-stone-200 bg-white">
        {fmt(data.checkIn)} → {fmt(data.checkOut)} · {data.nights} night{data.nights === 1 ? "" : "s"} · {data.adults} guest{data.adults === 1 ? "" : "s"}
      </div>
      {data.rooms.length === 0 ? (
        <p className="px-4 py-3 text-sm text-stone-700">No single room sleeps this many guests.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {data.rooms.map((r) => (
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
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">{money(r.pricePerNight)}</div>
                <div className="text-[11px] text-stone-500">per night · {money(r.totalPrice)} total</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-2 text-[11px] text-stone-500 bg-white border-t border-stone-200">
        Indicative rates. To reserve, call +91 832 555 0142 or email stay@marigoldbay.example.
      </div>
    </div>
  );
}
