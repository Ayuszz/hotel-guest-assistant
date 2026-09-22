type Level = "info" | "warn" | "error";

/** Structured JSON logs, one line per event. Silent under vitest unless LOG_TESTS=1. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (process.env.VITEST && !process.env.LOG_TESTS) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
