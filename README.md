# Marigold Bay Hotel — AI Guest Assistant

A small full-stack app: a chat interface where signed-in hotel guests ask about the property, check room availability, and book (simulated payment). The frontend is Next.js; the backend is a set of Next.js route handlers that ground an LLM (Cerebras gpt-oss-120b by default, with Groq and Gemini as optional fallbacks) in a JSON knowledge base, call a deterministic availability tool, and persist auth, conversations and bookings in Supabase (Postgres).

**Docs:** [Architecture](#architecture) · [API examples](docs/api-examples.md) · [Decisions](docs/decisions.md) · [Evaluation](docs/evaluation.md) · [AI tools used](docs/ai-tools-used.md)

## Quick start

```bash
git clone https://github.com/Ayuszz/hotel-guest-assistant.git
cd hotel-guest-assistant
npm install
cp .env.example .env
```

Fill in `.env`:

1. **Supabase** (required — chat is behind a login wall): create a free project at https://supabase.com, copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API, and `SUPABASE_DB_URL` from Project Settings → Database → Connection pooling. Then apply the schema once:
   ```bash
   node scripts/migrate-supabase.mjs   # or paste scripts/supabase-schema.sql into the Supabase SQL editor
   ```
2. **LLM** (optional): add `CEREBRAS_API_KEY` (free tier, sub-second replies) or leave every `*_API_KEY` unset / set `LLM_PROVIDER=mock` to run fully offline with a deterministic mock model. Every automated test uses the mock, so the test suite needs no LLM key — it does need a real Supabase project (or the in-memory repo the tests inject directly).

```bash
npm run dev   # http://localhost:3000, redirects to /signup until you create an account
```

```bash
npm test          # unit + integration tests (vitest), mock LLM, in-memory conversation repo
npm run test:e2e  # Playwright: full browser flow, desktop + mobile, against a real Supabase project + mock LLM (builds the app first)
npm run typecheck
npm run lint
```

Node 20+ is required. Free keys: Cerebras at https://cloud.cerebras.ai, Groq at https://console.groq.com, Gemini at https://aistudio.google.com/apikey. Any one is enough, or skip them all for the mock model.

## Screenshots

| Desktop | Mobile |
| --- | --- |
| ![desktop](docs/screenshots/desktop.png) | ![mobile](docs/screenshots/mobile.png) |

These predate the auth/threads/bookings rewrite (pre-login chat view) and have not been refreshed for this submission.

## What it does

- Email/password sign-up and sign-in (Supabase Auth); every route except `/login` and `/signup` requires a session.
- Answers property, room, amenity, policy and FAQ questions from `data/hotel.json`, and only from there.
- Detects availability intent, collects check-in, check-out and guest count with an in-chat form, and runs `checkAvailability(checkIn, checkOut, adults)` over `data/inventory.json`.
- Keeps conversation context server-side: threads are listed in a sidebar, auto-titled from the first message, and switching threads reloads that thread's own history from Postgres — nothing is kept in the browser.
- Lets a guest book a room straight from the availability card with a one-click simulated "Book & pay" (no real payment gateway); bookings are listed on `/bookings` with a paid/confirmed status and a mock reference.
- Returns a fixed fallback with the front-desk contact whenever the answer is not in the data.
- Shows loading, error and retry states; works on phone and desktop.

## Architecture

```
Browser (Next.js, React 19)                       Server (Next.js route handlers, Node runtime)
┌──────────────────────────┐                       ┌───────────────────────────────────────────────┐
│ middleware.ts             │◀── session refresh ──▶│ Supabase Auth (cookie-based session)           │
│  · login wall             │                       │                                                 │
├──────────────────────────┤   POST /api/chat       ├───────────────────────────────────────────────┤
│ ChatApp (Sidebar + Chat)  │ ─────────────────────▶ │ route.ts   ── auth check + Zod validation      │
│  · thread list             │                       │ chat.ts    ── orchestration                    │
│  · message list             │                      │   1. classify intent + slots ─▶ LLM            │
│  · loading / error / retry │                       │   2a. availability ─▶ checkAvailability()      │
│  · AvailabilityForm/Card   │◀── typed envelope ──  │   2b. knowledge ─▶ retrieve() ─▶ LLM answer     │
│ AuthForm (login/signup)    │                       │   3. hallucination guard, fallback rules       │
│ bookings page              │                       │ conversationRepo.ts ── Supabase-backed threads │
│ lib/api.ts (only caller)   │                       │ auth.ts · bookings.ts · knowledge.ts           │
└──────────────────────────┘                        │ llm/{openai-compat,gemini,chain,mock}.ts        │
                                                     └───────────────────────────────────────────────┘
                                                        data/hotel.json          data/inventory.json
                                                        Supabase Postgres: conversations, messages, bookings
```

**Data flow for a question.** The browser posts the message and, if continuing a thread, its `conversationId`. The server authenticates the request (Supabase session cookie), loads that thread's history and remembered slots from Postgres (`ConversationRepo`, service-role key, filtered by `user_id`), retrieves matching knowledge-base sections by keyword, then makes **one** JSON-schema call to the model that returns intent, any dates or guest count it can extract, and, for knowledge questions, an answer written *only* from those sections with `grounded: false` when they do not cover it. Any number in the answer that is not present in the retrieved text rejects the answer. Availability requests never reach the model for the answer: the tool runs in code and the reply text is templated. Every turn is persisted (both messages plus the response envelope) so a new browser tab or serverless instance sees the same thread. If the model stalls or is overloaded, the provider tries the next model in a chain; if all fail, deterministic routing still sends availability requests to the date form and everything else to a fallback with the front-desk contact.

**Model providers.** `LLM_PROVIDER` lists providers in order (default `cerebras,groq,gemini`); each is used only if its key is set, and a provider that errors, stalls or is rate-limited hands over to the next. Inside a provider, a model chain does the same across model ids. All providers speak the same `respond()` interface and return the same sanitized JSON turn, so swapping them changes nothing else. This layer is unchanged from the pre-auth version.

**Where AI is used:** understanding the question, extracting dates and counts, phrasing the grounded answer.
**Where it is not:** retrieval, date validation, capacity filtering, pricing, availability, response shape, fallbacks, auth, persistence, payments.

**Response envelope** (`type` drives rendering; `conversationId` is now always a server-issued UUID — created on the first message of a thread, or the existing thread's id when continuing one):

| type | when | extra fields |
| --- | --- | --- |
| `text` | grounded knowledge answer | `sources[]` |
| `availability` | tool ran | `data` (nights, rooms with price and stock) |
| `clarification` | dates or guests missing or invalid | `needs[]`, `known` |
| `fallback` | not in data, out of scope, or model unavailable | `reason` |
| `error` | bad request, unauthenticated, not found, or server fault (401/400/404/500) | `code` |

## Project layout

```
data/                 hotel.json (knowledge base), inventory.json (mock stock + bookings)
scripts/               supabase-schema.sql (DDL + RLS), migrate-supabase.mjs (applies it via SUPABASE_DB_URL)
middleware.ts           session refresh + login-wall enforcement
src/app/                page.tsx (chat, server component, redirects if unauthenticated), login/, signup/, bookings/,
                        api/chat, api/auth/{signup,logout}, api/conversations[/[id]/messages], api/bookings, api/health
src/components/         ChatApp, Sidebar, Chat, AuthForm, AvailabilityForm, AvailabilityCard, TypingIndicator
src/lib/api.ts          the single frontend → backend client
src/lib/supabase/       client.ts (browser), server.ts (server components/routes), admin.ts (service-role, server-only)
src/server/             chat.ts (orchestration), auth.ts (signup), bookings.ts (create booking),
                        conversationRepo.ts (Supabase-backed thread/message/slot persistence),
                        availability.ts (tool), knowledge.ts (retrieval), logger.ts, types.ts,
                        llm/{provider,prompts,sanitize,openai-compat,gemini,chain,mock,index}.ts
tests/                  vitest: availability, knowledge, chat, auth, bookings, conversationRepo (in-memory repo), Chat UI
e2e/                    Playwright browser flow against a real Supabase project + mock LLM
docs/                   api-examples, decisions, evaluation, ai-tools-used
```

## Environment variables

| name | default | purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL, used by browser, server and middleware clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase anon/publishable key, used for session auth (RLS-scoped, not used to read app data) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | server-only key; `ConversationRepo`, auth signup, and bookings read/write with this, always filtered by `user_id` |
| `SUPABASE_DB_URL` | — | direct/pooler Postgres connection string, used only by `scripts/migrate-supabase.mjs` |
| `LLM_PROVIDER` | `cerebras,groq,gemini` | provider order; `mock` forces offline mode |
| `CEREBRAS_API_KEY` | — | enables Cerebras (recommended) |
| `CEREBRAS_MODEL` / `CEREBRAS_FALLBACK_MODELS` | `gpt-oss-120b` / `qwen-3.8-27b` | Cerebras model chain (the ids your key can access; check `GET /v1/models`) |
| `GROQ_API_KEY`, `GROQ_MODEL` | — / `llama-3.3-70b-versatile` | optional Groq |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | — / `gemini-3.1-flash-lite` / three fallbacks | optional Gemini |
| `LLM_TIMEOUT_MS` | `9000` | per-model-attempt timeout; a stall moves to the next model |
| `LLM_TOTAL_BUDGET_MS` | `24000` | stop trying further models after this much time |

## Deploying to Vercel

1. Push this repo to GitHub.
2. vercel.com → Add New Project → import the repo → keep Next.js defaults.
3. Environment Variables → add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and at least one LLM key (`CEREBRAS_API_KEY` recommended). `SUPABASE_DB_URL` is not needed at runtime — apply the schema once, locally, before deploying. Deploy.
4. Open the URL, sign up, ask "Is breakfast included?".
