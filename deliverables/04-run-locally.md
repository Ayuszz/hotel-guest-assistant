# 4. Run the frontend and backend locally

Requirements: Node 20 or newer, npm, a free Supabase project (chat is behind a login wall, so this is not optional).

```bash
git clone https://github.com/Ayuszz/hotel-guest-assistant.git
cd hotel-guest-assistant
npm install
cp .env.example .env
```

## Set up Supabase

1. Create a free project at https://supabase.com.
2. Project Settings → API: copy the project URL and anon/publishable key into `.env` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose it).
3. Project Settings → Database → Connection pooling: copy the session-pooler connection string into `SUPABASE_DB_URL` (only used by the migration script below, not read by the app at runtime).
4. Apply the schema (idempotent, safe to re-run):
   ```bash
   node scripts/migrate-supabase.mjs
   ```
   or paste the contents of `scripts/supabase-schema.sql` into the Supabase SQL editor. This creates `conversations`, `messages` and `bookings` tables with owner-only row-level security policies.

## Set up the LLM (optional)

- With a key: set `CEREBRAS_API_KEY` (free at https://cloud.cerebras.ai) and/or `GROQ_API_KEY` / `GEMINI_API_KEY` as fallbacks.
- Without any key: leave them empty or set `LLM_PROVIDER=mock`. The app runs fully offline with a deterministic mock model; every feature still works, answers are the raw knowledge-base text.

```bash
npm run dev          # http://localhost:3000
```

Verify:

```bash
curl -s localhost:3000/api/health
# {"status":"ok","provider":"cerebras:gpt-oss-120b > gemini:gemini-3.1-flash-lite","time":"..."}
```

Then in the browser: sign up with an email/password, click a suggested question, ask a follow-up, ask "Do you have rooms available?", fill the form, see the card, click "Book & pay (mock)", check `/bookings`, open the sidebar and start a new thread.

Tests and checks:

```bash
npm test             # 85 vitest tests, offline (mock LLM, in-memory conversation repo)
npm run test:e2e     # Playwright browser flow against a real Supabase project + mock LLM
                      # (builds first; installs Chromium on first run with: npx playwright install chromium)
npm run typecheck
npm run lint
npm run build && npm start   # production build on http://localhost:3000
```
