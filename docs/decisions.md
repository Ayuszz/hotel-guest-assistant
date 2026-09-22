# Product, UX, engineering and AI decisions

## What customer problem are we solving?

Guests researching a stay have small, urgent questions (check-in time, pool, breakfast, cancellation) and one bigger one (are rooms free for my dates). Today they scan PDFs, email, or phone. Each unanswered question is a lost booking; each answered one costs front-desk time. The assistant gives instant, accurate answers from the hotel's own data and turns the availability question into a structured check, so the guest gets to "yes, there is a room" in under a minute without a human.

## What does the guest journey look like?

1. Lands on the hotel site, sees the assistant with six suggested questions.
2. Asks something specific; gets a 1 to 3 sentence answer with the exact figure or time.
3. Refines ("and for three people?") without repeating context.
4. Asks about availability; the assistant asks for dates and guests in-chat with a small form.
5. Sees a card of room types, prices per night and total, and what is sold out.
6. Hands off: the card ends with the phone and email to reserve. Booking itself is out of scope.

## Why is the frontend designed this way?

- **Chat, not a form-first wizard.** Guests arrive with a question in their head. Chat matches that; the availability form appears only when needed, inside the chat, so there is one flow.
- **A date form instead of parsing dates from text.** Free-text dates are the most common failure ("3rd to 5th", "next weekend", "Oct 3-5" in which year?). The model only needs to detect *that* the guest wants availability; the form guarantees valid ISO dates. If the model does extract complete dates, we use them and skip the form.
- **Result card, not prose.** Prices, totals and sold-out states are easier to scan in a table. The card is rendered from structured data, so a model can never misstate a number there.
- **Visible states.** Typing indicator, disabled input while pending, amber fallback bubbles, red error bubbles with a Try again button that re-sends the same payload and keeps history.
- **Suggested questions** double as onboarding and as a manual test surface for the reviewer.
- **Mobile first**: single column, sticky input with safe-area padding, tested at Pixel 7 and desktop widths in Playwright.

## Which parts use AI and which stay deterministic?

| AI (LLM) | Deterministic code |
| --- | --- |
| Classify intent (knowledge / availability / greeting / unsupported) | Keyword retrieval over the knowledge base |
| Extract dates and guest count when stated | Date validation (format, real date, not past, order, ≤ 30 nights) |
| Phrase a grounded answer from retrieved sections | Capacity filter, per-night stock, pricing, totals |
| Judge whether the context answers the question (`grounded`) | Response envelope, fallback text, contact details |
| | Hallucination guard on numbers |
| | Availability reply text (templated) |

Rule of thumb: if a wrong answer would cost the hotel money or trust (price, availability, policy figures), it is computed or checked in code.

## What can go wrong with the AI response?

- Inventing an amenity or policy that is not in the data.
- Quoting a plausible but wrong price or time.
- Answering from general hotel knowledge instead of this hotel.
- Mis-resolving a relative date ("next Friday") or the year.
- Following instructions embedded in the guest's message.
- Returning prose where JSON was expected, or timing out.
- Being confidently unhelpful on an ambiguous question ("is it free?").

## How do we prevent hallucinations or unsupported answers?

1. **Retrieval-scoped context.** The answer prompt contains only matching knowledge-base sections and forbids outside knowledge.
2. **Explicit abstention channel.** The model must return `grounded: false` when the context is insufficient; the server then sends the fixed fallback. An empty retrieval skips the model entirely.
3. **Numeric post-check.** Any number with three or more digits in the answer must appear in the retrieved text, or the answer is replaced by the fallback and logged (`unverified_figure`).
4. **Structured output.** Both model calls use a JSON response schema, temperature 0.2.
5. **Tool results are never paraphrased by the model.** Availability text is templated from the tool output.
6. **Prompt-injection note** in the system prompt, and the model has no tools or side effects to abuse.
7. **Source ids** are returned and filtered to the sections actually provided, giving a debugging trail.

## What happens when the model, the API call, or another dependency fails?

| Failure | Behaviour |
| --- | --- |
| Model timeout, 429/503, malformed JSON from a provider | Next model in that provider, then the next provider (Cerebras → Groq → Gemini), each within a total time budget |
| Every provider down | Heuristic routing: obvious availability phrasing → clarification form (still fully functional, no model needed); otherwise `fallback` with reason `llm_unavailable` and the contact line |
| Bad request | HTTP 400 with `type: "error"` and a readable message |
| Unhandled server exception | HTTP 500 `code: INTERNAL`; the frontend shows a retryable error bubble |
| Browser cannot reach the API or it takes > 35 s | Client-side timeout via AbortController; error bubble with Try again; history preserved |
| Form-based availability | Never touches the model, so it works even when the LLM is down |

Every request logs one JSON line with request id, conversation id, response type, intent, and latency.

## How would we measure whether the feature is useful?

- **Resolution rate**: share of conversations ending in a `text` or `availability` answer with no fallback.
- **Fallback rate by reason**: `not_in_knowledge_base` tells us what to add to the data; `llm_unavailable` tells us about reliability.
- **Availability funnel**: availability intents → form submitted → card shown → contact link clicked.
- **Turns to answer** and **p95 latency**.
- **Explicit feedback**: thumbs up/down per answer (not built yet).
- **Offline eval**: the scenario suite in `evaluation.md`, re-run on every prompt or model change, with a live-model pass recorded.
- Business signal: fewer front-desk emails about the questions the assistant covers.

## What would we improve before production?

1. Real availability from the property management system, with rate plans and holds.
2. Streaming responses and a smaller router model for latency.
3. Persist conversations (Redis or Postgres) with retention policy and PII handling.
4. Rate limiting and abuse protection on `/api/chat`; per-day cost caps on the model.
5. Embedding-based retrieval once the knowledge base outgrows keyword matching; a content admin UI for hotel staff.
6. Eval harness in CI against the live model with pass thresholds, plus human review of sampled conversations.
7. Multilingual support and accessibility audit.
8. Analytics events for the funnel above; feedback buttons.
9. Handoff to a human channel (WhatsApp, email form) when the fallback fires twice in a row.

## Engineering choices, briefly

| Choice | Why | Alternative rejected |
| --- | --- | --- |
| Next.js route handlers for the backend | One deploy, one language, free hosting on Vercel with no cold-sleep; still a separate `src/server` module with its own tests | Separate Express/Fastify service: free hosts sleep 30 to 60 s, hurting the demo |
| Cerebras Llama 3.3 70B primary, Groq and Gemini as optional fallbacks | All free tiers with JSON output. Gemini free tier was slow (10 to 20 s) and overloaded during evaluation; Cerebras answers in about a second. A provider chain plus per-provider model chain keeps the demo alive when any one is down | Anthropic/OpenAI: paid |
| Provider interface + mock | Tests need no key; app runs offline; a new provider is one file implementing `respond()` | Mocking `fetch` per test: brittle |
| Client-carried history | Correct on serverless; the server store is a bonus | Server-only memory: breaks across instances |
| Zod validation | Typed request schema with readable errors | Manual checks |
| JSON knowledge base | Small, reviewable by hotel staff, versioned in git | Database: extra setup for reviewers |
| Vitest + Playwright | One test runner for server and UI; real browser for the demo path on desktop and mobile | Jest: slower TS setup |
