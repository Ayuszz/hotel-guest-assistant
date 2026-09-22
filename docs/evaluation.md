# Evaluation and test scenarios

Two layers. **Automated** (43 vitest tests + 2 Playwright flows × 2 devices) run against the deterministic mock model, so they are repeatable and need no key. **Live-model pass** runs the same scenarios manually against Gemini and records what the model actually said.

Run: `npm test` · `npm run test:e2e`

## Scenario matrix

| # | Category | Input | Expected | Automated by | Mock result | Live Gemini result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Normal question | "What time is check-in?" | Answer states 15:00, `type: text`, sources include `property` | `chat.test.ts` › answers check-in time | Pass | _pending key_ |
| 2 | Normal question | "Does the hotel have a swimming pool?" | Mentions the infinity pool and hours | `chat.test.ts` › swimming pool; `knowledge.test.ts` | Pass | _pending key_ |
| 3 | Normal question | "Which room is suitable for three guests?" | Names the Junior Suite (capacity 3) | `chat.test.ts` › three guests | Pass | _pending key_ |
| 4 | Missing information | "Do you have rooms available?" | `clarification` with `needs: [checkIn, checkOut, adults]`; UI shows the form | `chat.test.ts` › asks for missing details; `Chat.test.tsx` › renders the date form | Pass | _pending key_ |
| 5 | Ambiguous question | "Is it free?" with no context | Model reports `grounded: false` → `fallback` | `chat.test.ts` › falls back when the model says context does not answer | Pass | _pending key_ |
| 6 | Availability / tool call | "Any rooms from 2026-10-10 to 2026-10-12 for 2 adults?" | Slots extracted, tool runs, `type: availability`, 2 nights | `chat.test.ts` › calls the tool when the model extracts all slots | Pass | _pending key_ |
| 7 | Availability / tool call | Form submit 2026-10-10 → 10-12, 3 guests | Junior Suite + Family Suite listed; Standard rooms excluded by capacity; model never called | `chat.test.ts` › structured form submission; `availability.test.ts` | Pass | Pass (no model involved) |
| 8 | Incorrect / unsupported assumption | "Who won the cricket world cup?" | Empty retrieval → `fallback` `not_in_knowledge_base` with contact line | `chat.test.ts` › outside the knowledge base | Pass | _pending key_ |
| 9 | Unsupported assumption (hallucination guard) | Model answers "The pool costs INR 9999" | Number not in context → `fallback` `unverified_figure` | `chat.test.ts` › hallucination guard | Pass | n/a (guard is code) |
| 10 | Conversation follow-up | "Which room fits three?" then "How much is it per night?" | History passed to the model; answer contains 9200 | `chat.test.ts` › passes history; `Chat.test.tsx` › sends prior turns | Pass | _pending key_ |
| 11 | Follow-up slot memory | "I want to book for 2 adults" then "Any rooms 2026-10-10 to 10-12?" | Adults remembered from turn 1; availability returned | `chat.test.ts` › remembers slots across turns | Pass | _pending key_ |
| 12 | Frontend loading state | Slow response | Typing indicator visible, input disabled, then reply rendered | `Chat.test.tsx` › loading indicator | Pass | — |
| 13 | Frontend error state | API rejects (network) | Red error bubble, Try again re-sends, history kept | `Chat.test.tsx` › error bubble with retry; e2e step 4 (500 from server) | Pass | — |
| 14 | Model failure / fallback | Model times out on a knowledge question | `fallback` `llm_unavailable`, HTTP 200, no crash | `chat.test.ts` › llm_unavailable | Pass | — |
| 15 | Model failure, availability still works | Model down, "Do you have any rooms available next weekend?" | Heuristic routes to the clarification form | `chat.test.ts` › still routes an obvious availability request | Pass | — |
| 16 | Validation | Past check-in from the form; blank message; invalid JSON | HTTP 400 with readable `error` | `chat.test.ts` › validation; curl examples | Pass | — |
| 17 | End-to-end | Open app → ask → follow up → availability form → card → server 500 → retry succeeds | All steps pass in Chromium, desktop and Pixel 7 viewport | `e2e/chat.spec.ts` | Pass (4/4) | — |

## Observed results, automated run (2026-09-22)

```
vitest:     Test Files 4 passed · Tests 43 passed
playwright: 4 passed (desktop + mobile) in 12.3s
typecheck:  clean · eslint: clean · next build: success
```

## Live-model pass (Gemini 2.5 Flash)

_To be filled once a key is available. Procedure: set `GEMINI_API_KEY`, run `npm run dev`, walk scenarios 1–6, 8, 10, 11 in the UI, paste the assistant's wording and pass/fail into the table above. Also record any `unverified_figure` or `llm_unavailable` lines from the server log._

## Known gaps

- Keyword retrieval can miss paraphrases ("bathing area" for pool). Embeddings would fix this; see decisions.
- Relative dates ("next weekend") rely on the model; the form is the safety net.
- Slot memory across turns lives in one serverless instance's memory; on a different instance the guest is asked again. Acceptable for a demo.
