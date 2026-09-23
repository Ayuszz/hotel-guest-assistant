"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Chat } from "./Chat";
import { Sidebar } from "./Sidebar";

export function ChatApp({ userEmail }: { userEmail: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex h-dvh">
      <Sidebar
        activeId={activeId}
        onSelect={(id) => { setActiveId(id); setSidebarOpen(false); }}
        onNew={() => { setActiveId(null); setSidebarOpen(false); }}
        refreshKey={refreshKey}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-4 py-3 border-b border-stone-200 bg-white flex items-center gap-3">
          <button type="button" className="sm:hidden text-stone-600 text-lg leading-none" onClick={() => setSidebarOpen(true)} aria-label="Open threads">
            ☰
          </button>
          <div className="h-9 w-9 rounded-full bg-amber-400 flex items-center justify-center text-stone-900 font-bold shrink-0" aria-hidden>M</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold leading-tight">Marigold Bay Hotel</h1>
            <p className="text-xs text-stone-500 leading-tight truncate">{userEmail}</p>
          </div>
          <button type="button" onClick={() => void signOut()} className="text-xs text-stone-500 underline underline-offset-2 shrink-0">
            Sign out
          </button>
        </header>
        <Chat
          conversationId={activeId}
          onConversationId={(id) => { setActiveId(id); setRefreshKey((k) => k + 1); }}
        />
      </main>
    </div>
  );
}
