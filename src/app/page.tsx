import { Chat } from "@/components/Chat";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center">
      <div className="w-full max-w-2xl flex-1 flex flex-col sm:my-4 sm:rounded-2xl sm:border sm:border-stone-200 bg-white sm:shadow-sm overflow-hidden h-dvh sm:h-[calc(100dvh-2rem)]">
        <header className="px-4 py-3 border-b border-stone-200 bg-white flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-amber-400 flex items-center justify-center text-stone-900 font-bold" aria-hidden>M</div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Marigold Bay Hotel</h1>
            <p className="text-xs text-stone-500 leading-tight">Guest assistant · typically replies in seconds</p>
          </div>
        </header>
        <Chat />
      </div>
    </main>
  );
}
