export function TypingIndicator() {
  return (
    <div className="flex justify-start" role="status" aria-live="polite" aria-label="Assistant is typing">
      <div className="rounded-2xl rounded-bl-sm bg-white border border-stone-200 px-4 py-3 shadow-sm flex gap-1.5 items-center">
        <span className="dot h-2 w-2 rounded-full bg-stone-400 inline-block" />
        <span className="dot h-2 w-2 rounded-full bg-stone-400 inline-block" />
        <span className="dot h-2 w-2 rounded-full bg-stone-400 inline-block" />
      </div>
    </div>
  );
}
