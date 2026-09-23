# 3. Architecture

**Shape.** One Next.js 16 application. The browser runs the chat UI (behind a login wall enforced by `middleware.ts`); the same deployment serves the backend as route handlers under `/api`. Auth, conversations, messages and bookings persist in Supabase Postgres; the model providers are external free tiers reached only from the server.

```
Browser (React 19)                                  Server (Next.js route handlers, Node)
┌─────────────────────────┐                         ┌────────────────────────────────────────────┐
│ middleware.ts             session refresh + login wall (Supabase Auth, cookie-based)            │
├─────────────────────────┐   POST /api/chat        ├────────────────────────────────────────────┤
│ ChatApp (Sidebar+Chat)  │ ──────────────────────▶ │ route.ts   auth check + Zod validation       │
│  message list           │  message,               │ chat.ts    orchestration                     │
│  typing indicator       │  conversationId?         │   1. ConversationRepo loads history+slots    │
│  error bubble + retry   │  (no history — server     │   2. retrieve() KB sections (keyword)        │
│  AvailabilityForm       │   loads it by id)         │   3. ONE model call: intent+slots+answer     │
│  AvailabilityCard       │                          │   4a. availability → checkAvailability()     │
│ AuthForm, bookings page │ ◀──────────────────────  │   4b. knowledge → grounding + number guard    │
│ lib/api.ts (only caller)│  typed envelope          │   4c. greeting/unsupported → fallback         │
└─────────────────────────┘                         │ llm/  chain → cerebras → groq → gemini → mock │
                                                     └────────────────────────────────────────────┘
                                                        data/hotel.json      data/inventory.json
                                                        Supabase Postgres: conversations, messages, bookings
```

## Frontend
- `ChatApp` composes `Sidebar` (thread list, + New chat, off-canvas drawer on mobile, "My bookings" link) and `Chat` (the message list for the active thread).
- `AuthForm` renders both `/login` and `/signup`; sign-up hits `POST /api/auth/signup`, sign-in calls Supabase directly from the browser client.
- Messages are typed by role and kind: user, assistant text, availability card, clarification with an embedded date form, fallback, error with retry.
- State: `conversationId` (`null` until the server issues one), message list hydrated from `GET /api/conversations/:id/messages` on thread switch, pending flag. The client never stores or resends history — the server is the only source of truth.
- Loading: typing indicator and disabled input while a request is in flight; client-side timeout via `AbortController`.
- Failure: red bubble with the server's message or a network message; Try again re-sends the same payload.
- Bookings page (`/bookings`) lists the signed-in user's bookings from `GET /api/bookings`.
- No secrets: the browser only ever calls `/api/*` routes and reads/writes the Supabase session cookie via `@supabase/ssr`.

## Backend
- `middleware.ts`: refreshes the Supabase session cookie on every request; redirects unauthenticated requests (except `/login`, `/signup`, `/api/*`) to `/login`.
- `route.ts` files: parse JSON, check `supabase.auth.getUser()`, call the corresponding `src/server` handler, map unhandled exceptions to HTTP 500.
- `chat.ts`: validates with Zod; loads history/slots for the thread via `ConversationRepo`; if the body is a structured availability request from the form, runs the tool directly (no model); otherwise retrieves knowledge sections, calls the provider once, then routes by intent; persists both turns (with the full response envelope) back through the repo.
- `conversationRepo.ts`: `ConversationRepo` interface with two implementations — `InMemoryConversationRepo` (used by tests) and `SupabaseConversationRepo` (production, via the service-role client, every query filtered by `user_id`). Owns thread creation, ownership checks (`ConversationAccessError` → HTTP 404), history, slot memory, and title derivation.
- `auth.ts`: `handleSignup` — creates a pre-confirmed Supabase user via the admin API (no SMTP provider configured for this assignment) and signs them in.
- `bookings.ts`: `handleCreateBooking` — validates the request, inserts a `confirmed`/`paid` row with a `MOCK-XXXXXXXX` reference. No payment gateway.
- `knowledge.ts`: flattens `hotel.json` into sections with keywords; keyword retrieval with small synonym expansion.
- `availability.ts`: `checkAvailability(checkIn, checkOut, adults)`; validates dates, filters by capacity, computes per-night stock from seeded bookings, prices the stay. Pure and deterministic.
- `logger.ts`: one JSON line per request with request id, type, intent, latency.
- `src/lib/supabase/`: `client.ts` (browser), `server.ts` (server components/route handlers, cookie-bound), `admin.ts` (service-role client, `import "server-only"` guards it from ever landing in a client bundle).

## AI / model
- Interface `LLMProvider.respond({message, history, today, context}) → {intent, slots, topics, answer, grounded, sources}`. Unchanged by the auth/persistence rewrite.
- Providers: `OpenAICompatProvider` (Cerebras, Groq) using plain fetch and strict JSON schema; `GeminiProvider` via the Google SDK with a response schema; `MockProvider` for tests and offline runs. `ChainProvider` orders them by `LLM_PROVIDER`; providers without keys are skipped.
- Each provider tries a list of model ids; 404/429/5xx, timeouts (9 s per attempt) and malformed JSON move to the next model; total budget 24 s.
- Guardrails: context-only prompt with an explicit `grounded: false` exit; instruction to ignore instructions in the guest text; numeric post-check against retrieved text; availability text is templated from the tool, never written by the model.

## Data flow, one knowledge question
1. Guest types "Is breakfast included?" → POST `{conversationId, message}`, session cookie carries identity.
2. Server confirms the thread belongs to this user, loads its history from Postgres. Retrieval returns the Breakfast amenity section (and neighbours).
3. Model call returns `{intent: knowledge, answer: "...", grounded: true, sources: [amenity:Breakfast]}`.
4. Number guard passes (650 appears in context). Envelope `{type: text, message, sources}` persisted (both turns) and returned → UI bubble.

## Data flow, availability + booking
1. "Do you have rooms available?" → model returns `intent: availability` with empty slots → envelope `clarification` with `needs` → UI shows the date form.
2. Form posts `{availability: {checkIn, checkOut, adults}}` → tool runs, no model → envelope `availability` with rooms, prices, stock → UI card.
3. Guest clicks "Book & pay (mock)" on a room → `POST /api/bookings` with the room/stay fields → row inserted `status: confirmed, payment_status: paid, payment_reference: MOCK-XXXXXXXX` → card shows the confirmation inline; booking also appears on `/bookings`.

## Deployment
Vercel Hobby, single project hosting UI and API. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus at least one LLM key (`CEREBRAS_API_KEY` primary). The Supabase schema (`scripts/supabase-schema.sql`) is applied once, locally, before deploying — `SUPABASE_DB_URL` is not needed at runtime. Route `maxDuration` 30 s.
