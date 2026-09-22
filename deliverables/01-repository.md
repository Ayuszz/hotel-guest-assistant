# 1. Repository

**URL:** https://github.com/Ayuszz/hotel-guest-assistant (public, branch `main`)

```bash
git clone https://github.com/Ayuszz/hotel-guest-assistant.git
```

Frontend and backend live in one Next.js project so a single deploy serves both. They are separated by folder and tested independently.

| Part | Location | Notes |
| --- | --- | --- |
| Frontend | `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/*`, `src/lib/api.ts` | React 19 chat UI; `lib/api.ts` is the only code that talks to the backend |
| Backend | `src/app/api/chat/route.ts`, `src/app/api/health/route.ts`, `src/server/*` | Route handlers are thin; all logic is in `src/server` (orchestration, tool, retrieval, providers) |
| Knowledge base and mock inventory | `data/hotel.json`, `data/inventory.json` | Editable JSON |
| Tests | `tests/*` (Vitest), `e2e/*` (Playwright) | 60 unit/integration/UI tests, 2 browser flows on 2 devices |
| Docs | `README.md`, `docs/*`, `deliverables/*` | This folder |

Commit history shows the build order: deterministic core and tests first, then providers, then UI, then evaluation and deployment fixes.
