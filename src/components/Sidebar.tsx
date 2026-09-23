"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchConversations, type ConversationSummary } from "@/lib/api";

type Props = {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ activeId, onSelect, onNew, refreshKey, open, onClose }: Props) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await fetchConversations());
    } catch {
      // Sidebar list is a convenience; a failed load just leaves it empty.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/refresh, sets state only inside the async callback
    void load();
  }, [load, refreshKey]);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={onClose} aria-hidden data-testid="sidebar-backdrop" />}
      <div
        className={`fixed sm:static inset-y-0 left-0 z-50 w-72 sm:w-64 shrink-0 flex flex-col border-r border-stone-200 bg-stone-50 transition-transform sm:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        data-testid="sidebar"
      >
        <div className="p-3">
          <button type="button" onClick={onNew} className="w-full rounded-lg bg-stone-900 text-white text-sm font-medium py-2">
            + New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1" data-testid="thread-list">
          {loading && <p className="text-xs text-stone-400 px-2">Loading…</p>}
          {!loading && items.length === 0 && <p className="text-xs text-stone-400 px-2">No conversations yet.</p>}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              data-testid="thread-item"
              className={`w-full text-left rounded-lg px-3 py-2 text-sm truncate ${c.id === activeId ? "bg-stone-200 font-medium" : "hover:bg-stone-100 text-stone-700"}`}
            >
              {c.title}
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-stone-200">
          <Link href="/bookings" className="block w-full rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
            My bookings
          </Link>
        </div>
      </div>
    </>
  );
}
