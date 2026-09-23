# 1. Repository

**URL:** https://github.com/Ayuszz/hotel-guest-assistant (public, branch `main`)

```bash
git clone https://github.com/Ayuszz/hotel-guest-assistant.git
```

Frontend and backend live in one Next.js project so a single deploy serves both. They are separated by folder and tested independently.

| Part | Location | Notes |
| --- | --- | --- |
| Frontend | `src/app/page.tsx`, `src/app/{login,signup,bookings}/*`, `src/app/layout.tsx`, `src/components/*`, `src/lib/api.ts` | React 19 chat UI, auth pages, bookings page; `lib/api.ts` is the only code that talks to the backend |
| Auth + persistence | `middleware.ts`, `src/lib/supabase/*`, `src/server/{auth,conversationRepo}.ts`, `src/app/api/auth/*`, `src/app/api/conversations/*` | Supabase email/password auth behind a login wall; conversations and messages persisted per user in Postgres |
| Bookings | `src/server/bookings.ts`, `src/app/api/bookings/route.ts` | Simulated "book & pay" — no real payment gateway |
| Backend (chat/AI) | `src/app/api/chat/route.ts`, `src/app/api/health/route.ts`, `src/server/{chat,availability,knowledge,logger,types}.ts`, `src/server/llm/*` | Route handlers are thin; all logic is in `src/server` (orchestration, tool, retrieval, providers) |
| Knowledge base and mock inventory | `data/hotel.json`, `data/inventory.json` | Editable JSON |
| DB schema | `scripts/supabase-schema.sql`, `scripts/migrate-supabase.mjs` | Conversations, messages, bookings tables + RLS policies |
| Tests | `tests/*` (Vitest), `e2e/*` (Playwright) | 85 unit/integration/UI tests, e2e run against a real Supabase project with a mocked LLM, 12 tests across desktop + mobile |
| Docs | `README.md`, `docs/*`, `deliverables/*` | This folder |

Commit history shows the build order: deterministic core and tests first, then providers, then UI, then evaluation and deployment fixes.
