# 3. Architecture

**Shape.** One Next.js 16 application. The browser runs the chat UI; the same deployment serves the backend as route handlers under `/api`. Deployed on Vercel's free tier. The model providers are external free tiers reached only from the server.

```
Browser (React 19)                       Server (Next.js route handlers, Node)
┌─────────────────────────┐   POST /api/chat   ┌───────────────────────────────────────────┐
│ Chat.tsx                │ ────────────────▶  │ route.ts   JSON parse + Zod validation     │
│  message list           │  message,          │ chat.ts    orchestration                   │
│  typing indicator       │  conversationId,   │   1. retrieve() KB sections (keyword)      │
│  error bubble + retry   │  last 10 turns     │   2. ONE model call: intent+slots+answer   │
│  AvailabilityForm       │  or {availability} │   3a. availability → checkAvailability()   │
│  AvailabilityCard       │                    │   3b. knowledge → grounding + number guard │
│ lib/api.ts (only caller)│ ◀────────────────  │   3c. greeting / unsupported → fallback    │
└─────────────────────────┘  typed envelope    │ llm/  chain → cerebras → gemini → mock     │
                                               └───────────────────────────────────────────┘
                                                  data/hotel.json        data/inventory.json
```

## Frontend
- Single screen. Messages are typed by role and kind: user, assistant text, availability card, clarification with an embedded date form, fallback, error with retry.
- State: conversation id generated in the browser, message list, pending flag. Every request carries the last 10 turns so the backend works on any serverless instance.
- Loading: typing indicator and disabled input while a request is in flight; 35 s client timeout.
- Failure: red bubble with the server's message or a network message; Try again re-sends the same payload; history is kept.
- No secrets: the browser only ever calls `/api/chat` and `/api/health`.

## Backend
- `route.ts`: parses JSON, calls `handleChat`, maps unhandled exceptions to HTTP 500.
- `chat.ts`: validates with Zod; if the body is a structured availability request from the form, runs the tool directly (no model). Otherwise retrieves knowledge sections, calls the provider once, then routes by intent.
- `knowledge.ts`: flattens `hotel.json` into sections with keywords; keyword retrieval with small synonym expansion.
- `availability.ts`: `checkAvailability(checkIn, checkOut, adults)`; validates dates, filters by capacity, computes per-night stock from seeded bookings, prices the stay. Pure and deterministic.
- `conversation.ts`: best-effort in-memory turns and slot memory per conversation id.
- `logger.ts`: one JSON line per request with request id, type, intent, latency.

## AI / model
- Interface `LLMProvider.respond({message, history, today, context}) → {intent, slots, topics, answer, grounded, sources}`.
- Providers: `OpenAICompatProvider` (Cerebras; Groq via env) using plain fetch and strict JSON schema; `GeminiProvider` via the Google SDK with a response schema; `MockProvider` for tests and offline runs. `ChainProvider` orders them by `LLM_PROVIDER`; providers without keys are skipped.
- Each provider tries a list of model ids; 404/429/5xx, timeouts (9 s per attempt) and malformed JSON move to the next model; total budget 24 s.
- Guardrails: context-only prompt with an explicit `grounded: false` exit; instruction to ignore instructions in the guest text; numeric post-check against retrieved text; availability text is templated from the tool, never written by the model.

## Data flow, one knowledge question
1. Guest types "Is breakfast included?" → POST with history.
2. Zod accepts. Retrieval returns the Breakfast amenity section (and neighbours).
3. Model call returns `{intent: knowledge, answer: "...", grounded: true, sources: [amenity:Breakfast]}`.
4. Number guard passes (650 appears in context). Envelope `{type: text, message, sources}` → UI bubble.

## Data flow, availability
1. "Do you have rooms available?" → model returns `intent: availability` with empty slots → envelope `clarification` with `needs` → UI shows the date form.
2. Form posts `{availability: {checkIn, checkOut, adults}}` → tool runs, no model → envelope `availability` with rooms, prices, stock → UI card.

## Deployment
Vercel Hobby, auto-deploys from `main`. `vercel.json` pins the Next.js preset. Env vars: `CEREBRAS_API_KEY` (primary), `GEMINI_API_KEY` (fallback). Route `maxDuration` 30 s.
